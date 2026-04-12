import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { AleoNetworkClient } from '@provablehq/sdk';
import {
  runWithdrawal,
  runBorrow,
  runWithdrawalUsdc,
  runBorrowUsdc,
  runWithdrawalUsad,
  runBorrowUsad,
} from './processWithdrawal.js';
import { logTestnetStatus } from './checkTestnet.js';
import {
  updateVaultTx,
  setVaultStatus,
  insertTransactionRecord,
  getFlashSessionById,
  getFlashSessionByIdempotencyKey,
  insertFlashSession,
  updateFlashSession,
  listFlashSessionsByWallet,
  getPendingFlashFundingSessions,
  claimFlashSessionForFunding,
} from './supabase.js';
import { startVaultWatcher } from './vaultWatcher.js';
import { startAleoPricePoller } from './aleoPricePoller.js';
import { startAccrueScheduler } from './processAccrueScheduler.js';
import {
  runSetFlashParams,
  runSetFlashStrategyAllowed,
  runFlashOpen,
} from './processFlash.js';

const app = express();
const PORT = process.env.PORT || 4000;
const ALEO_RPC_URL = process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1';

const CREDITS_PROGRAM_ID = 'credits.aleo';
const USDC_TOKEN_PROGRAM_ID = process.env.USDC_TOKEN_PROGRAM_ID || 'test_usdcx_stablecoin.aleo';
const USAD_TOKEN_PROGRAM_ID = process.env.USAD_TOKEN_PROGRAM_ID || 'test_usad_stablecoin.aleo';

const DECIMALS_6 = 1_000_000n; // stablecoins/base units in this project
const FLASH_SESSION_TIMEOUT_MS = Number(process.env.FLASH_SESSION_TIMEOUT_MS || '3600000');
const FLASH_WATCHER_INTERVAL_MS = Math.max(15_000, Number(process.env.FLASH_WATCHER_INTERVAL_MS) || 30_000);
const FLASH_WATCHER_BATCH_LIMIT = Math.min(50, Math.max(1, Number(process.env.FLASH_WATCHER_BATCH_LIMIT) || 10));
const inProgressFlashFunding = new Set();

let vaultBalancesCache = {
  ts: 0,
  value: null,
};
/** When cache is cold, concurrent GETs share one `getVaultPublicBalances()` (avoids RPC stampede). */
let vaultBalancesRefreshInFlight = null;

function parseLeoUint(raw) {
  if (raw == null) return 0n;
  const s = String(raw);
  const m = s.match(/(\d[\d_]*)/);
  if (!m) return 0n;
  try {
    return BigInt(m[1].replace(/_/g, ''));
  } catch {
    return 0n;
  }
}

function toFixedFromMicro(raw, decimals = 6) {
  const div = BigInt(10) ** BigInt(decimals);
  const intPart = raw / div;
  const fracPart = raw % div;
  const frac = fracPart.toString().padStart(decimals, '0');
  // trim trailing zeros for nicer UI strings
  const trimmed = frac.replace(/0+$/, '');
  return trimmed.length ? `${intPart.toString()}.${trimmed}` : intPart.toString();
}

async function pickLikelyBalanceMappingName(networkClient, programId) {
  const mappingNames = await networkClient.getProgramMappingNames(programId);
  const norm = (x) => String(x || '').toLowerCase();

  const candidates = ['account', 'accounts', 'balance', 'balances'];
  for (const c of candidates) {
    const hit = (mappingNames || []).find((m) => norm(m) === c || norm(m).includes(c));
    if (hit) return String(hit);
  }

  // Fallback: first mapping name if present.
  if (mappingNames && mappingNames.length > 0) return String(mappingNames[0]);
  return null;
}

async function getVaultPublicBalances() {
  const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
  if (!VAULT_ADDRESS) throw new Error('VAULT_ADDRESS missing in backend/.env');

  const networkClient = new AleoNetworkClient(ALEO_RPC_URL);

  const readBalance = async (programId, mappingName) => {
    if (!mappingName) return 0n;
    // SDK method name is `getProgramMappingValue(programId, mappingName, key)`
    const raw = await networkClient.getProgramMappingValue(programId, mappingName, VAULT_ADDRESS);
    return parseLeoUint(raw);
  };

  const [creditsMap, usdcxMap, usadMap] = await Promise.all([
    pickLikelyBalanceMappingName(networkClient, CREDITS_PROGRAM_ID),
    pickLikelyBalanceMappingName(networkClient, USDC_TOKEN_PROGRAM_ID),
    pickLikelyBalanceMappingName(networkClient, USAD_TOKEN_PROGRAM_ID),
  ]);

  const [creditsRaw, usdcxRaw, usadRaw] = await Promise.all([
    readBalance(CREDITS_PROGRAM_ID, creditsMap),
    readBalance(USDC_TOKEN_PROGRAM_ID, usdcxMap),
    readBalance(USAD_TOKEN_PROGRAM_ID, usadMap),
  ]);

  return {
    vaultAddress: VAULT_ADDRESS,
    tokenPrograms: {
      credits: CREDITS_PROGRAM_ID,
      usdcx: USDC_TOKEN_PROGRAM_ID,
      usad: USAD_TOKEN_PROGRAM_ID,
    },
    mappingNames: {
      credits: creditsMap,
      usdcx: usdcxMap,
      usad: usadMap,
    },
    balances: {
      aleoCreditsMicro: creditsRaw.toString(), // u64 microcredits
      usdcxBaseUnits: usdcxRaw.toString(), // u128 base units (6 decimals)
      usadBaseUnits: usadRaw.toString(), // u128 base units (6 decimals)
    },
    human: {
      aleo: toFixedFromMicro(creditsRaw, 6),
      usdcx: toFixedFromMicro(usdcxRaw, 6),
      usad: toFixedFromMicro(usadRaw, 6),
    },
  };
}

// In-process queue for vault operations: one at a time to avoid RPC overload and vault key contention.
// Set VAULT_QUEUE_CONCURRENCY to 2 or 3 if your RPC supports limited parallelism (default 1).
const VAULT_QUEUE_CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.VAULT_QUEUE_CONCURRENCY) || 1));
const vaultQueue = [];
let vaultQueueRunning = 0;

function runVaultTask(fn) {
  return new Promise((resolve, reject) => {
    vaultQueue.push({ fn, resolve, reject });
    processVaultQueue();
  });
}

function processVaultQueue() {
  while (vaultQueueRunning < VAULT_QUEUE_CONCURRENCY && vaultQueue.length > 0) {
    const entry = vaultQueue.shift();
    vaultQueueRunning += 1;
    Promise.resolve(entry.fn())
      .then((result) => entry.resolve(result))
      .catch((err) => entry.reject(err))
      .finally(() => {
        vaultQueueRunning -= 1;
        processVaultQueue();
      });
  }
}

// Allow frontend origin(s) to call this backend. Comma-separated for multiple (e.g. production + local).
const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:3003';
const allowedOrigins = corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (allowedOrigins.length === 1 && allowedOrigins[0] === '*') return cb(null, true);
    cb(null, false);
  },
};
app.use(cors(corsOptions));

app.use(express.json());

let proofWasm = null;
async function getProofWasm() {
  if (proofWasm) return proofWasm;
  const wasm = await import('@provablehq/wasm');
  const Poseidon4 = wasm?.Poseidon4;
  const Field = wasm?.Field;
  const Address = wasm?.Address;
  if (!Poseidon4 || !Field) {
    throw new Error('Poseidon4/Field missing in @provablehq/wasm');
  }
  proofWasm = { Poseidon4, Field, Address };
  return proofWasm;
}

const USDC_FREEZELIST_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USDCX_FREEZELIST_PROGRAM_ID || process.env.USDCX_FREEZELIST_PROGRAM_ID || 'test_usdcx_freezelist.aleo';

async function getFreezeMapping(mapping, key) {
  const candidates = [
    // NullPay/frontend-compatible endpoint for mapping reads.
    `https://api.provable.com/v2/testnet/program/${USDC_FREEZELIST_PROGRAM_ID}/mapping/${mapping}/${key}`,
    // Fallback to configured RPC-style URL if available.
    `${(process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1').replace(/\/$/, '')}/program/${USDC_FREEZELIST_PROGRAM_ID}/mapping/${mapping}/${key}`,
  ];

  let lastStatus = 0;
  for (const url of candidates) {
    const res = await fetch(url);
    if (res.ok) {
      const val = await res.json();
      return val ? String(val).replace(/["']/g, '') : null;
    }
    lastStatus = res.status;
  }

  throw new Error(`Mapping fetch failed (${mapping}/${key}) HTTP ${lastStatus}`);
}

async function buildUsdcProofPair() {
  const [root, lastIndexRaw, index0] = await Promise.all([
    getFreezeMapping('freeze_list_root', '1u8'),
    getFreezeMapping('freeze_list_last_index', 'true'),
    getFreezeMapping('freeze_list_index', '0u32'),
  ]);

  const count = Number.parseInt(String(lastIndexRaw || '0').replace('u32', ''), 10);
  const freezeCount = Number.isFinite(count) ? count + 1 : 0;

  const { Poseidon4, Field, Address } = await getProofWasm();
  const hasher = new Poseidon4();
  const zeroField = Field.fromString('0field');
  const normalizeField = (v) => {
    if (v == null) return null;
    const s = String(v).trim().replace(/["']/g, '');
    return s.endsWith('field') ? s : `${s}field`;
  };
  const hashPair = (leftField, rightField) => {
    try {
      return hasher.hash([leftField, rightField]).toString();
    } catch {
      // Some wasm builds expect Poseidon4 arity exactly 4.
      return hasher.hash([leftField, rightField, zeroField, zeroField]).toString();
    }
  };

  const emptyHashes = [];
  let currentEmpty = '0field';
  for (let i = 0; i < 16; i++) {
    emptyHashes.push(currentEmpty);
    const f = Field.fromString(currentEmpty);
    currentEmpty = hashPair(f, f);
  }

  let occupiedField = index0 || undefined;
  if (occupiedField && Address && occupiedField.startsWith('aleo1')) {
    try {
      const addr = Address.from_string(occupiedField);
      const grp = addr.toGroup();
      occupiedField = grp.toXCoordinate().toString();
    } catch {
      // Keep original if conversion fails.
    }
  }
  occupiedField = normalizeField(occupiedField) || undefined;

  const targetIndex = 1;
  let currentHash = '0field';
  let currentIndex = targetIndex;
  const siblings = [];
  for (let level = 0; level < 16; level++) {
    const isLeft = currentIndex % 2 === 0;
    const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

    let siblingHash = emptyHashes[level];
    if (level === 0 && siblingIndex === 0 && occupiedField) {
      siblingHash = occupiedField;
    }
    siblings.push(siblingHash);

    const fCurrent = Field.fromString(normalizeField(currentHash));
    const fSibling = Field.fromString(normalizeField(siblingHash));
    currentHash = isLeft ? hashPair(fCurrent, fSibling) : hashPair(fSibling, fCurrent);
    currentIndex = Math.floor(currentIndex / 2);
  }

  const proof = `{ siblings: [${siblings.join(', ')}], leaf_index: ${targetIndex}u32 }`;
  return {
    proofs: `[${proof}, ${proof}]`,
    freezeList: { root, count: freezeCount, index0 },
  };
}

app.get('/usdc-proofs', async (_req, res) => {
  try {
    const result = await buildUsdcProofPair();
    return res.json({ ok: true, source: 'backend-nullpay', ...result });
  } catch (err) {
    console.error('❌ /usdc-proofs failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to generate USDC proofs' });
  }
});

app.post('/withdraw', async (req, res) => {
  try {
    const { userAddress, amountCredits, finalTxId } = req.body || {};
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userAddress' });
    }
    const amount = Number(amountCredits);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountCredits' });
    }
    if (!finalTxId || typeof finalTxId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid finalTxId' });
    }

    console.log('📥 Queuing withdrawal from frontend:', { userAddress, amountCredits: amount, finalTxId });
    const { rowsUpdated } = await setVaultStatus(userAddress, finalTxId, 'withdraw', 'vault_processing');
    if (rowsUpdated > 0) {
      runVaultTask(() => runWithdrawal(userAddress, amount))
        .then((transactionId) => {
          return updateVaultTx(userAddress, finalTxId, 'withdraw', transactionId);
        })
        .catch((err) => {
          console.error('❌ Vault withdraw task failed:', err);
          setVaultStatus(userAddress, finalTxId, 'withdraw', 'vault_pending');
        });
    }

    return res.json({ ok: true, queued: true });
  } catch (err) {
    console.error('❌ /withdraw handler failed:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

app.post('/borrow', async (req, res) => {
  try {
    const { userAddress, amountCredits, finalTxId } = req.body || {};
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userAddress' });
    }
    const amount = Number(amountCredits);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountCredits' });
    }
    if (!finalTxId || typeof finalTxId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid finalTxId' });
    }

    console.log('📥 Queuing borrow from frontend:', { userAddress, amountCredits: amount, finalTxId });
    const { rowsUpdated } = await setVaultStatus(userAddress, finalTxId, 'borrow', 'vault_processing');
    if (rowsUpdated > 0) {
      runVaultTask(() => runBorrow(userAddress, amount))
        .then((transactionId) => {
          return updateVaultTx(userAddress, finalTxId, 'borrow', transactionId);
        })
        .catch((err) => {
          console.error('❌ Vault borrow task failed:', err);
          setVaultStatus(userAddress, finalTxId, 'borrow', 'vault_pending');
        });
    }

    return res.json({ ok: true, queued: true });
  } catch (err) {
    console.error('❌ /borrow handler failed:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

app.post('/withdraw-usdc', async (req, res) => {
  try {
    const { userAddress, amountUsdc, finalTxId } = req.body || {};
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userAddress' });
    }
    const amount = Number(amountUsdc);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountUsdc (u64 human, e.g. 1 = 1 USDC)' });
    }
    if (!finalTxId || typeof finalTxId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid finalTxId' });
    }

    console.log('📥 Queuing USDC withdrawal from frontend:', { userAddress, amountUsdc: amount, finalTxId });
    const { rowsUpdated } = await setVaultStatus(userAddress, finalTxId, 'withdraw', 'vault_processing');
    if (rowsUpdated > 0) {
      runVaultTask(() => runWithdrawalUsdc(userAddress, amount))
        .then((transactionId) => {
          return updateVaultTx(userAddress, finalTxId, 'withdraw', transactionId);
        })
        .catch((err) => {
          console.error('❌ Vault withdraw-usdc task failed:', err);
          setVaultStatus(userAddress, finalTxId, 'withdraw', 'vault_pending');
        });
    }

    return res.json({ ok: true, queued: true });
  } catch (err) {
    console.error('❌ /withdraw-usdc handler failed:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

app.post('/withdraw-usad', async (req, res) => {
  try {
    const { userAddress, amountUsad, finalTxId } = req.body || {};
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userAddress' });
    }
    const amount = Number(amountUsad);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountUsad (u64 human, e.g. 1 = 1 USAD)' });
    }
    if (!finalTxId || typeof finalTxId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid finalTxId' });
    }

    console.log('📥 Queuing USAD withdrawal from frontend:', { userAddress, amountUsad: amount, finalTxId });
    const { rowsUpdated } = await setVaultStatus(userAddress, finalTxId, 'withdraw', 'vault_processing');
    if (rowsUpdated > 0) {
      runVaultTask(() => runWithdrawalUsad(userAddress, amount))
        .then((transactionId) => updateVaultTx(userAddress, finalTxId, 'withdraw', transactionId))
        .catch((err) => {
          console.error('❌ Vault withdraw-usad task failed:', err);
          setVaultStatus(userAddress, finalTxId, 'withdraw', 'vault_pending');
        });
    }

    return res.json({ ok: true, queued: true });
  } catch (err) {
    console.error('❌ /withdraw-usad handler failed:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

app.post('/borrow-usdc', async (req, res) => {
  try {
    const { userAddress, amountUsdc, finalTxId } = req.body || {};
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userAddress' });
    }
    const amount = Number(amountUsdc);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountUsdc (u64 human, e.g. 1 = 1 USDC)' });
    }
    if (!finalTxId || typeof finalTxId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid finalTxId' });
    }

    console.log('📥 Queuing USDC borrow from frontend:', { userAddress, amountUsdc: amount, finalTxId });
    const { rowsUpdated } = await setVaultStatus(userAddress, finalTxId, 'borrow', 'vault_processing');
    if (rowsUpdated > 0) {
      runVaultTask(() => runBorrowUsdc(userAddress, amount))
        .then((transactionId) => {
          return updateVaultTx(userAddress, finalTxId, 'borrow', transactionId);
        })
        .catch((err) => {
          console.error('❌ Vault borrow-usdc task failed:', err);
          setVaultStatus(userAddress, finalTxId, 'borrow', 'vault_pending');
        });
    }

    return res.json({ ok: true, queued: true });
  } catch (err) {
    console.error('❌ /borrow-usdc handler failed:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

app.post('/borrow-usad', async (req, res) => {
  try {
    const { userAddress, amountUsad, finalTxId } = req.body || {};
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userAddress' });
    }
    const amount = Number(amountUsad);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountUsad (u64 human, e.g. 1 = 1 USAD)' });
    }
    if (!finalTxId || typeof finalTxId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid finalTxId' });
    }

    console.log('📥 Queuing USAD borrow from frontend:', { userAddress, amountUsad: amount, finalTxId });
    const { rowsUpdated } = await setVaultStatus(userAddress, finalTxId, 'borrow', 'vault_processing');
    if (rowsUpdated > 0) {
      runVaultTask(() => runBorrowUsad(userAddress, amount))
        .then((transactionId) => updateVaultTx(userAddress, finalTxId, 'borrow', transactionId))
        .catch((err) => {
          console.error('❌ Vault borrow-usad task failed:', err);
          setVaultStatus(userAddress, finalTxId, 'borrow', 'vault_pending');
        });
    }

    return res.json({ ok: true, queued: true });
  } catch (err) {
    console.error('❌ /borrow-usad handler failed:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

// Secure transaction record insert: only callers with RECORD_TRANSACTION_SECRET can add rows (e.g. your Next.js server). Prevents anyone from posting fake withdraw/borrow rows.
function normalizeSecret(s) {
  if (s == null || typeof s !== 'string') return '';
  const t = s.trim().replace(/^["']|["']$/g, '');
  return t.trim();
}
const RECORD_TRANSACTION_SECRET = normalizeSecret(process.env.RECORD_TRANSACTION_SECRET);

/** Same secret as POST /record-transaction — used by Next.js proxies for flash session mutations. */
function assertRecordTxSecretForJson(req, res) {
  if (!RECORD_TRANSACTION_SECRET) return true;
  const raw = req.headers['x-record-transaction-secret'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const provided = (typeof raw === 'string' ? raw : String(raw)).trim();
  if (provided !== RECORD_TRANSACTION_SECRET) {
    console.warn('[backend] 401: x-record-transaction-secret mismatch (flash / record-tx)');
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.post('/record-transaction', async (req, res) => {
  if (RECORD_TRANSACTION_SECRET) {
    const raw = req.headers['x-record-transaction-secret'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const provided = (typeof raw === 'string' ? raw : String(raw)).trim();
    if (provided !== RECORD_TRANSACTION_SECRET) {
      console.warn('[record-transaction] 401: secret mismatch or missing header');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  try {
    const { wallet_address, tx_id, type, asset, amount, program_id, repay_amount } = req.body || {};
    if (!wallet_address || typeof wallet_address !== 'string' || !wallet_address.trim()) {
      return res.status(400).json({ error: 'Missing or invalid wallet_address' });
    }
    if (!tx_id || typeof tx_id !== 'string' || !tx_id.trim()) {
      return res.status(400).json({ error: 'Missing or invalid tx_id' });
    }
    const validTypes = [
      'deposit',
      'withdraw',
      'borrow',
      'repay',
      'open_position',
      'self_liquidate_payout',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error:
          'Invalid type. Must be one of: deposit, withdraw, borrow, repay, open_position, self_liquidate_payout (flash uses flash_sessions, not transaction_history)',
      });
    }
    const validAssets = ['aleo', 'usdcx', 'usad'];
    if (!validAssets.includes(asset)) {
      return res.status(400).json({ error: 'Invalid asset. Must be aleo, usdcx, or usad' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return res.status(400).json({ error: 'Missing or invalid amount' });
    }
    const repayAmountNum =
      repay_amount == null || repay_amount === '' ? null : Number(repay_amount);
    if (repayAmountNum != null && (!Number.isFinite(repayAmountNum) || repayAmountNum < 0)) {
      return res.status(400).json({ error: 'Invalid repay_amount' });
    }
    const { data, error } = await insertTransactionRecord({
      wallet_address: wallet_address.trim(),
      tx_id: tx_id.trim(),
      type,
      asset,
      amount: amountNum,
      repay_amount: repayAmountNum,
      program_id: program_id ? String(program_id).trim() : null,
    });
    if (error) {
      console.error('[record-transaction] insert error:', error);
      return res.status(500).json({ error: error.message || 'Failed to save transaction' });
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('❌ /record-transaction failed:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// Public endpoint: backend vault wallet balances (credits.aleo + stablecoin public mappings)
// This lets the frontend show "wallet balances" without decrypting private token records.
app.get('/vault-balances', async (_req, res) => {
  try {
    const now = Date.now();
    const ttlMs = Number(process.env.VAULT_BALANCES_CACHE_TTL_MS || '15000'); // 15s default
    if (vaultBalancesCache.value && now - vaultBalancesCache.ts < ttlMs) {
      return res.json({ ok: true, cached: true, ...vaultBalancesCache.value });
    }

    if (!vaultBalancesRefreshInFlight) {
      vaultBalancesRefreshInFlight = (async () => {
        const value = await getVaultPublicBalances();
        vaultBalancesCache = { ts: Date.now(), value };
        return value;
      })().finally(() => {
        vaultBalancesRefreshInFlight = null;
      });
    }
    const value = await vaultBalancesRefreshInFlight;
    return res.json({ ok: true, cached: false, ...value });
  } catch (err) {
    console.error('❌ /vault-balances failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch vault balances' });
  }
});

// Flash admin + strategy endpoints (v1).
app.post('/flash/set-params', async (req, res) => {
  try {
    const { asset_id, enabled, premium_bps, max_amount_micro } = req.body || {};
    const out = await runSetFlashParams({
      assetIdField: String(asset_id || '').trim(),
      enabled: !!enabled,
      premiumBps: premium_bps,
      maxAmountMicro: max_amount_micro,
    });
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error('❌ /flash/set-params failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to set flash params' });
  }
});

app.post('/flash/set-strategy', async (req, res) => {
  try {
    const { strategy_id, allowed } = req.body || {};
    const out = await runSetFlashStrategyAllowed({
      strategyId: String(strategy_id || '').trim(),
      allowed: !!allowed,
    });
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error('❌ /flash/set-strategy failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to set flash strategy flag' });
  }
});

app.post('/flash/open', async (req, res) => {
  try {
    const { asset_id, principal_micro, min_profit_micro, strategy_id } = req.body || {};
    const out = await runFlashOpen({
      assetIdField: String(asset_id || '').trim(),
      principalMicro: principal_micro,
      minProfitMicro: min_profit_micro ?? 0,
      strategyId: String(strategy_id || '').trim(),
    });
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error('❌ /flash/open failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to open flash session' });
  }
});

// Flash session orchestration APIs (DB-backed): open -> fund -> settle.
app.post('/flash/open-session', async (req, res) => {
  try {
    const { user_address, strategy_wallet, asset_id, principal_micro, min_profit_micro, strategy_id, idempotency_key } = req.body || {};
    const userAddress = String(user_address || '').trim();
    const strategyWallet = String(strategy_wallet || '').trim();
    const assetIdField = String(asset_id || '').trim();
    const strategyId = String(strategy_id || '').trim();
    const principalMicro = Number(principal_micro);
    const minProfitMicro = Number(min_profit_micro ?? 0);
    const idempotencyKey = String(idempotency_key || req.headers['x-idempotency-key'] || '').trim();

    if (!userAddress) return res.status(400).json({ ok: false, error: 'user_address is required' });
    if (!['0field', '1field', '2field'].includes(assetIdField)) return res.status(400).json({ ok: false, error: 'asset_id must be 0field|1field|2field' });
    if (!Number.isFinite(principalMicro) || principalMicro <= 0) return res.status(400).json({ ok: false, error: 'principal_micro must be > 0' });
    if (!Number.isFinite(minProfitMicro) || minProfitMicro < 0) return res.status(400).json({ ok: false, error: 'min_profit_micro must be >= 0' });
    if (!strategyId.endsWith('field')) return res.status(400).json({ ok: false, error: 'strategy_id must be a field literal' });

    if (idempotencyKey) {
      const existing = await getFlashSessionByIdempotencyKey(idempotencyKey);
      if (existing) return res.json({ ok: true, reused: true, session: existing });
    }

    const openResult = await runFlashOpen({
      assetIdField,
      principalMicro,
      minProfitMicro,
      strategyId,
    });

    const expiresAt = new Date(Date.now() + FLASH_SESSION_TIMEOUT_MS).toISOString();
    const { data, error } = await insertFlashSession({
      status: 'opened',
      user_address: userAddress,
      strategy_wallet: openResult.signer || strategyWallet || userAddress,
      asset_id: assetIdField,
      principal_micro: Math.round(principalMicro),
      min_profit_micro: Math.round(minProfitMicro),
      strategy_id_field: strategyId,
      flash_open_tx_id: openResult.txId,
      idempotency_key: idempotencyKey || null,
      expires_at: expiresAt,
    });
    if (error) {
      console.error('❌ /flash/open-session insert failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Failed to persist flash session' });
    }
    return res.json({ ok: true, session: data, open: openResult });
  } catch (err) {
    console.error('❌ /flash/open-session failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to open flash session' });
  }
});

app.post('/flash/record-open', async (req, res) => {
  if (!assertRecordTxSecretForJson(req, res)) return;
  try {
    const { user_address, strategy_wallet, asset_id, principal_micro, min_profit_micro, strategy_id, flash_open_tx_id, idempotency_key } = req.body || {};
    const userAddress = String(user_address || '').trim();
    const strategyWallet = String(strategy_wallet || '').trim();
    const assetIdField = String(asset_id || '').trim();
    const strategyId = String(strategy_id || '').trim();
    const openTx = String(flash_open_tx_id || '').trim();
    const principalMicro = Number(principal_micro);
    const minProfitMicro = Number(min_profit_micro ?? 0);
    const idempotencyKey = String(idempotency_key || req.headers['x-idempotency-key'] || '').trim();

    if (!userAddress || !strategyWallet) return res.status(400).json({ ok: false, error: 'user_address and strategy_wallet are required' });
    if (!['0field', '1field', '2field'].includes(assetIdField)) return res.status(400).json({ ok: false, error: 'asset_id must be 0field|1field|2field' });
    if (!Number.isFinite(principalMicro) || principalMicro <= 0) return res.status(400).json({ ok: false, error: 'principal_micro must be > 0' });
    if (!Number.isFinite(minProfitMicro) || minProfitMicro < 0) return res.status(400).json({ ok: false, error: 'min_profit_micro must be >= 0' });
    if (!strategyId.endsWith('field')) return res.status(400).json({ ok: false, error: 'strategy_id must be field literal' });
    if (!openTx) return res.status(400).json({ ok: false, error: 'flash_open_tx_id is required' });

    if (idempotencyKey) {
      const existing = await getFlashSessionByIdempotencyKey(idempotencyKey);
      if (existing) return res.json({ ok: true, reused: true, session: existing });
    }
    const expiresAt = new Date(Date.now() + FLASH_SESSION_TIMEOUT_MS).toISOString();
    const { data, error } = await insertFlashSession({
      status: 'opened',
      user_address: userAddress,
      strategy_wallet: strategyWallet,
      asset_id: assetIdField,
      principal_micro: Math.round(principalMicro),
      min_profit_micro: Math.round(minProfitMicro),
      strategy_id_field: strategyId,
      flash_open_tx_id: openTx,
      idempotency_key: idempotencyKey || null,
      expires_at: expiresAt,
    });
    if (error) return res.status(500).json({ ok: false, error: error.message || 'Failed to persist session' });
    return res.json({ ok: true, session: data });
  } catch (err) {
    console.error('❌ /flash/record-open failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to record flash open' });
  }
});

app.get('/flash/sessions', async (req, res) => {
  if (!assertRecordTxSecretForJson(req, res)) return;
  try {
    const wallet = String(req.query.wallet || '').trim();
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.round(limitRaw))) : 50;
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet query param is required' });
    const sessions = await listFlashSessionsByWallet(wallet, limit);
    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('❌ /flash/sessions failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to load flash sessions' });
  }
});

app.post('/flash/fund-session', async (req, res) => {
  try {
    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: 'session_id is required' });
    const session = await getFlashSessionById(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
    if (!['opened', 'funding_pending'].includes(String(session.status || ''))) {
      return res.status(400).json({ ok: false, error: `Invalid status for funding: ${session.status}` });
    }

    const assetId = String(session.asset_id || '0field').trim();
    if (!['0field', '1field', '2field'].includes(assetId)) {
      return res.status(400).json({ ok: false, error: `Unsupported flash asset_id: ${assetId}` });
    }

    await updateFlashSession(sessionId, { status: 'funding_pending' });
    const amountHuman = Number(session.principal_micro) / 1_000_000;
    const toAddr = String(session.strategy_wallet);
    const vaultTxId = await runVaultTask(async () => {
      if (assetId === '0field') return runWithdrawal(toAddr, amountHuman);
      if (assetId === '1field') return runWithdrawalUsdc(toAddr, amountHuman);
      return runWithdrawalUsad(toAddr, amountHuman);
    });
    const { data, error } = await updateFlashSession(sessionId, {
      status: 'funded',
      vault_fund_tx_id: vaultTxId,
    });
    if (error) return res.status(500).json({ ok: false, error: error.message || 'Failed to update funded session' });
    return res.json({ ok: true, session: data, vault_fund_tx_id: vaultTxId });
  } catch (err) {
    console.error('❌ /flash/fund-session failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to fund flash session' });
  }
});

app.post('/flash/mark-settle-pending', async (req, res) => {
  if (!assertRecordTxSecretForJson(req, res)) return;
  try {
    const sessionId = String(req.body?.session_id || '').trim();
    const settleTxId = String(req.body?.flash_settle_tx_id || '').trim();
    if (!sessionId || !settleTxId) return res.status(400).json({ ok: false, error: 'session_id and flash_settle_tx_id are required' });
    const session = await getFlashSessionById(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
    if (!['funded', 'settle_pending'].includes(String(session.status || ''))) {
      return res.status(400).json({ ok: false, error: `Invalid status for settle-pending: ${session.status}` });
    }
    const { data, error } = await updateFlashSession(sessionId, {
      status: 'settle_pending',
      flash_settle_tx_id: settleTxId,
    });
    if (error) return res.status(500).json({ ok: false, error: error.message || 'Failed to update session' });
    return res.json({ ok: true, session: data });
  } catch (err) {
    console.error('❌ /flash/mark-settle-pending failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to mark settle pending' });
  }
});

app.post('/flash/complete-session', async (req, res) => {
  if (!assertRecordTxSecretForJson(req, res)) return;
  try {
    const sessionId = String(req.body?.session_id || '').trim();
    const settleTxId = String(req.body?.flash_settle_tx_id || '').trim();
    const actualRepayMicro = req.body?.actual_repay_micro == null ? null : Number(req.body.actual_repay_micro);
    const profitMicro = req.body?.profit_micro == null ? null : Number(req.body.profit_micro);
    if (!sessionId) return res.status(400).json({ ok: false, error: 'session_id is required' });
    const session = await getFlashSessionById(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
    if (!['funded', 'settle_pending'].includes(String(session.status || ''))) {
      return res.status(400).json({ ok: false, error: `Invalid status for complete: ${session.status}` });
    }
    const patch = {
      status: 'settled',
      flash_settle_tx_id: settleTxId || session.flash_settle_tx_id || null,
      actual_repay_micro: Number.isFinite(actualRepayMicro) ? Math.round(actualRepayMicro) : null,
      profit_micro: Number.isFinite(profitMicro) ? Math.round(profitMicro) : null,
    };
    const { data, error } = await updateFlashSession(sessionId, patch);
    if (error) return res.status(500).json({ ok: false, error: error.message || 'Failed to complete session' });
    return res.json({ ok: true, session: data });
  } catch (err) {
    console.error('❌ /flash/complete-session failed:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to complete flash session' });
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Vault backend (withdraw + borrow) listening on http://localhost:${PORT}`);
  console.log(`   Vault queue: concurrency ${VAULT_QUEUE_CONCURRENCY} (set VAULT_QUEUE_CONCURRENCY in .env to change)`);
  await logTestnetStatus();
  if (process.env.VAULT_WATCHER_ENABLED !== 'false') {
    startVaultWatcher(runVaultTask);
  } else {
    console.log('   Vault watcher: disabled (VAULT_WATCHER_ENABLED=false)');
  }
  startAleoPricePoller();
  if ((process.env.ACCRUE_SCHEDULER_ENABLED || '').trim().toLowerCase() === 'true') {
    startAccrueScheduler()
      .then(() => {
        console.log('   Accrue scheduler: enabled (ACCRUE_SCHEDULER_ENABLED=true)');
      })
      .catch((err) => {
        console.error('❌ Accrue scheduler failed to start:', err?.message || err);
      });
  } else {
    console.log('   Accrue scheduler: disabled (set ACCRUE_SCHEDULER_ENABLED=true to enable)');
  }

  if ((process.env.FLASH_SESSION_WATCHER_ENABLED || 'true').trim().toLowerCase() === 'true') {
    console.log(`   Flash session watcher: enabled (${FLASH_WATCHER_INTERVAL_MS}ms, limit ${FLASH_WATCHER_BATCH_LIMIT})`);
    const runFlashFundingCycle = async () => {
      const rows = await getPendingFlashFundingSessions(FLASH_WATCHER_BATCH_LIMIT);
      if (!rows.length) return;
      for (const row of rows) {
        const id = String(row.id || '');
        if (!id || inProgressFlashFunding.has(id)) continue;
        const assetId = String(row.asset_id || '0field').trim();
        if (!['0field', '1field', '2field'].includes(assetId)) continue;
        const now = Date.now();
        if (row.expires_at && new Date(row.expires_at).getTime() < now) {
          await updateFlashSession(id, { status: 'expired', error_message: 'Session expired before funding.' });
          continue;
        }
        const claim = await claimFlashSessionForFunding(id);
        if (!claim.rowsUpdated) continue;
        inProgressFlashFunding.add(id);
        const amountHuman = Number(row.principal_micro) / 1_000_000;
        const toAddr = String(row.strategy_wallet);
        runVaultTask(async () => {
          if (assetId === '0field') return runWithdrawal(toAddr, amountHuman);
          if (assetId === '1field') return runWithdrawalUsdc(toAddr, amountHuman);
          return runWithdrawalUsad(toAddr, amountHuman);
        })
          .then((vaultTxId) => updateFlashSession(id, { status: 'funded', vault_fund_tx_id: vaultTxId, error_message: null }))
          .catch(async (e) => {
            await updateFlashSession(id, {
              status: 'opened',
              error_message: e?.message || 'Vault funding failed',
            });
          })
          .finally(() => {
            inProgressFlashFunding.delete(id);
          });
      }
    };
    setInterval(() => {
      runFlashFundingCycle().catch((e) => console.error('Flash watcher cycle failed:', e?.message || e));
    }, FLASH_WATCHER_INTERVAL_MS);
    runFlashFundingCycle().catch((e) => console.error('Flash watcher start cycle failed:', e?.message || e));
  } else {
    console.log('   Flash session watcher: disabled (FLASH_SESSION_WATCHER_ENABLED=false)');
  }
});

