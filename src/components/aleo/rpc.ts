import { JSONRPCClient } from 'json-rpc-2.0';
import {
  BOUNTY_PROGRAM_ID,
  USDC_POOL_PROGRAM_ID,
  USDC_TOKEN_PROGRAM_ID,
  USAD_POOL_PROGRAM_ID,
  USAD_TOKEN_PROGRAM_ID,
  CURRENT_NETWORK,
  CURRENT_RPC_URL,
} from '@/types';
import { Network } from '@provablehq/aleo-types';
import { frontendLogger, safeJsonStringify } from '@/utils/logger';
import { DEBUG_PRIVACY, privacyLog, privacyWarn } from '@/utils/privacyLog';
import { TREASURY_ADDRESS, getTreasuryRequestMessage } from '@/config/treasury';

// Note: @aleohq/wasm is not imported directly due to WASM build issues in Next.js
// We'll use dynamic import when needed, or fall back to contract call method

// For clarity, alias the lending pool program IDs.
export const LENDING_POOL_PROGRAM_ID = BOUNTY_PROGRAM_ID;
export const USDC_LENDING_POOL_PROGRAM_ID = USDC_POOL_PROGRAM_ID;
export const USAD_LENDING_POOL_PROGRAM_ID = USAD_POOL_PROGRAM_ID;
export const CREDITS_PROGRAM_ID = 'credits.aleo';

/**
 * Debug function to diagnose what records are available in the wallet
 * Call this from the browser console: window.debugRecords(requestRecords)
 */
export async function debugAllRecords(
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  publicKey?: string
): Promise<any> {
  if (!requestRecords) {
    return { error: 'requestRecords not available. Make sure wallet is connected.' };
  }

  privacyLog('🔍 === WALLET RECORDS DIAGNOSIS ===');
  
  const results: any = {
    timestamp: new Date().toISOString(),
    publicKey: publicKey?.substring(0, 20) + '...',
    approaches: {},
  };

  let creditsRecordsResult: any = [];
  let lendingPoolRecordsResult: any = [];
  let allRecordsResult: any = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Approach 1: Get all records (empty string)
  try {
    privacyLog('📋 Fetching ALL records (empty string)...');
    const allRecords = await requestRecords('', false);
    allRecordsResult = allRecords || [];
    results.approaches.allRecords = {
      success: true,
      count: allRecords?.length || 0,
      records: allRecords || [],
    };
    privacyLog('✅ All records:', allRecords?.length || 0);
    if (allRecords && Array.isArray(allRecords)) {
      allRecords.forEach((r: any, i: number) => {
        privacyLog(`  [${i}] Program: ${r.program_id || r.programId || 'unknown'}, Keys: ${Object.keys(r).join(', ')}`);
      });
    }
  } catch (e: any) {
    const errMsg = `Failed to fetch all records: ${e.message}`;
    privacyWarn('⚠️', errMsg);
    errors.push(errMsg);
    results.approaches.allRecords = { success: false, error: e.message };
  }

  // Approach 3: Get lending pool records
  try {
    privacyLog('📋 Fetching LENDING POOL records...');
    const lendingRecords = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
    lendingPoolRecordsResult = lendingRecords || [];
    results.approaches.lendingRecords = {
      success: true,
      count: lendingRecords?.length || 0,
      records: lendingRecords || [],
    };
    privacyLog('✅ Lending pool records:', lendingRecords?.length || 0);
    if (lendingRecords && Array.isArray(lendingRecords)) {
      lendingRecords.forEach((r: any, i: number) => {
        privacyLog(`  [${i}]:`, JSON.stringify(r, null, 2).substring(0, 300));
      });
    }
  } catch (e: any) {
    const errMsg = `Failed to fetch lending pool records: ${e.message}`;
    privacyWarn('⚠️', errMsg);
    errors.push(errMsg);
    results.approaches.lendingRecords = { success: false, error: e.message };
  }

  privacyLog('🔍 === DIAGNOSIS COMPLETE ===');
  privacyLog('📊 Summary:', results);

  if (DEBUG_PRIVACY) {
    frontendLogger.storeRecordDiagnostic(
      publicKey,
      creditsRecordsResult,
      lendingPoolRecordsResult,
      allRecordsResult,
      errors,
      warnings,
    );
  }

  if (!DEBUG_PRIVACY) {
    const sanitized: Record<string, unknown> = {
      timestamp: results.timestamp,
      publicKey: results.publicKey,
      note: 'Full record payloads omitted. Set NEXT_PUBLIC_DEBUG_PRIVACY=true for details.',
      approaches: {} as Record<string, unknown>,
      errors,
      warnings,
    };
    for (const key of Object.keys(results.approaches || {})) {
      const a = (results.approaches as any)[key];
      if (a && typeof a === 'object') {
        (sanitized.approaches as Record<string, unknown>)[key] = {
          success: (a as any).success,
          count: (a as any).count,
          error: (a as any).error,
        };
      }
    }
    return sanitized;
  }

  return results;
}

// Default fee for lending pool functions (in credits, will be converted to microcredits).
// If you see fee-related errors in Leo Wallet, you can increase this.
const DEFAULT_LENDING_FEE = 0.2; // 0.2 credits = 200,000 microcredits

/** Testnet explorer base for transaction IDs (at1…). */
export const ALEO_TESTNET_TX_EXPLORER = 'https://testnet.explorer.provable.com/transaction';

/** Log a clickable diagnosis line for an Aleo tx id (browser console). */
export function logAleoTxExplorer(context: string, txId: string | undefined | null): void {
  if (!txId || typeof txId !== 'string') {
    console.warn(`[${context}] No transaction id to log.`);
    return;
  }
  console.info(`[${context}] Explorer (testnet): ${ALEO_TESTNET_TX_EXPLORER}/${txId}`);
}

type MerkleProofBuildResult = { literal: string; source: string };

// Flag to disable credits record check (for testing purposes)
// When true, skips validation and creates a mock record if none found
const DISABLE_CREDITS_CHECK = false; // Set to false to re-enable checks

// Create the JSON-RPC client
export const client = getClient(CURRENT_RPC_URL);


// returns a string for address-based mappings
export async function fetchMappingValueString(
  mappingName: string,
  key: number
): Promise<string> {
  try {
    const result = await client.request('getMappingValue', {
      programId: LENDING_POOL_PROGRAM_ID,
      mappingName,
      key: `${key}.public`,
    });
    return result.value; // The address is stored as string in 'result.value'
  } catch (error) {
    console.error(`Failed to fetch mapping ${mappingName} with key ${key}:`, error);
    throw error;
  }
}

export async function fetchMappingValueRaw(
  mappingName: string,
  key: string
): Promise<string> {
  try {

    const keyString = `${key}u64`;

    const result = await client.request("getMappingValue", {
      program_id: LENDING_POOL_PROGRAM_ID,
      mapping_name: mappingName,
      key: keyString,
    });

    if (!result) {
      throw new Error(
        `No result returned for mapping "${mappingName}" and key "${keyString}"`
      );
    }

    return result;
  } catch (error) {
    console.error(`Failed to fetch mapping "${mappingName}" with key "${key}":`, error);
    throw error;
  }
}


export async function fetchBountyStatusAndReward(bountyId: string) {
  try {
 
    const keyU64 = `${bountyId}u64`;


    const statusResult = await client.request('getMappingValue', {
      program_id: LENDING_POOL_PROGRAM_ID,
      mapping_name: 'bounty_status',
      key: keyU64,
    });

    const rewardResult = await client.request('getMappingValue', {
      program_id: LENDING_POOL_PROGRAM_ID,
      // In the Leo program this is stored as `bounty_payment`
      mapping_name: 'bounty_payment',
      key: keyU64,
    });

    return {
      status: statusResult?.value ?? statusResult ?? null,
      reward: rewardResult?.value ?? rewardResult ?? null,
    };
  } catch (error) {
    console.error('Error fetching bounty status/reward from chain:', error);
    throw new Error('Failed to fetch chain data');
  }
}

export async function readBountyMappings(bountyId: string) {
  // Fetch raw strings for all mappings
  const creator = await fetchMappingValueRaw('bounty_creator', bountyId);
  const payment = await fetchMappingValueRaw('bounty_payment', bountyId);
  const status = await fetchMappingValueRaw('bounty_status', bountyId);

  return {
    creator,  
    payment,  
    status,   
  };
}

export async function readProposalMappings(bountyId: number, proposalId: number) {
  // Ensure safe arithmetic using BigInt
  const compositeProposalId = (BigInt(bountyId) * BigInt(1_000_000) + BigInt(proposalId)).toString();

  console.log("Fetching data for Composite Proposal ID:", compositeProposalId);

  try {
    // Fetch all mappings related to the proposal
    const proposalBountyId = await fetchMappingValueRaw("proposal_bounty_id", compositeProposalId);
    const proposalProposer = await fetchMappingValueRaw("proposal_proposer", compositeProposalId);
    const proposalStatus = await fetchMappingValueRaw("proposal_status", compositeProposalId);

    return {
      proposalBountyId,
      proposalProposer,
      proposalStatus,
    };
  } catch (error) {
    console.error("Error fetching proposal mappings:", error);
    throw error;
  }
}



/**
 * Utility to fetch program transactions
 */
export async function getProgramTransactions(
  functionName: string,
  page = 0,
  maxTransactions = 100
) {
  return client.request('aleoTransactionsForProgram', {
    programId: LENDING_POOL_PROGRAM_ID,
    functionName,
    page,
    maxTransactions,
  });
}

/**
 * Transfer credits publicly between two accounts.
 */
export async function transferPublic(
  recipient: string,
  amount: string
): Promise<string> {
  const inputs = [
    `${recipient}.public`, // Recipient's public address
    `${amount}u64`,    // Amount to transfer
  ];

  const result = await client.request('executeTransition', {
    programId: CREDITS_PROGRAM_ID,
    functionName: 'transfer_public',
    inputs,
  });

  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }
  return result.transactionId;
}

/**
 * Transfer credits privately between two accounts.
 *
 * This function calls the on-chain "transfer_private" transition,
 * which exactly expects three inputs in the following order:
 *  - r0: Sender's credits record (credits.record)
 *  - r1: Recipient's address with a ".private" suffix (address.private)
 *  - r2: Transfer amount with a "u64.private" suffix (u64.private)
 *
 * It returns two credits records:
 *  - The first output is the recipient's updated credits record.
 *  - The second output is the sender's updated credits record.
 */
export async function transferPrivate(
  senderRecord: string,
  recipient: string,
  amount: string
): Promise<{ recipientRecord: string; senderRecord: string }> {
  // Exactly matching the expected input types:
  const inputs = [
    `${senderRecord}`,         // r0: credits.record
    `${recipient}.private`,    // r1: address.private
    `${amount}u64.private`,     // r2: u64.private
  ];

  const result = await client.request('executeTransition', {
    programId: CREDITS_PROGRAM_ID,
    functionName: 'transfer_private',
    inputs,
  });

  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }

  // The Aleo program returns:
  //   result.outputs[0] -> recipient's updated credits record (r4)
  //   result.outputs[1] -> sender's updated credits record (r5)
  return {
    recipientRecord: result.outputs[0],
    senderRecord: result.outputs[1],
  };
}

/**
 * Call the `main` transition of the `sample.aleo` program.
 *
 * Leo:
 *   transition main(public a: u32, b: u32) -> u32
 */
// ----------------- Lending Pool helpers (xyra_lending_v8: private LendingPosition) -----------------

const LENDING_INDEX_SCALE_ORACLE = BigInt('1000000000000');
/** Matches Leo `PRICE_SCALE` / `initialize` default `asset_price` when a mapping read fails (never use index scale here). */
const LENDING_PRICE_SCALE_ORACLE = BigInt(1_000_000);
/** Matches Leo `as u64` on public amounts and intermediates. */
const LENDING_U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);
/** Matches `finalize_self_liquidate_debt` / `Mapping::get_or_use(asset_liq_bonus, _, 500u64)`. */
const LENDING_LIQ_BONUS_DEFAULT_BPS = BigInt(500);

/** Raw JSON-RPC result for debugging (some nodes nest `value`, others return the literal on `result`). */
function unwrapMappingRpcPayload(res: unknown): unknown {
  if (res == null || typeof res !== 'object') return res;
  const o = res as Record<string, unknown>;
  if ('value' in o && o.value !== undefined) return o.value;
  if ('result' in o && o.result !== undefined) return o.result;
  return res;
}

async function readMappingU64(programId: string, mapping: string, key: string): Promise<bigint | null> {
  try {
    const res = await client.request('getMappingValue', {
      program_id: programId,
      mapping_name: mapping,
      key,
    });
    const raw = unwrapMappingRpcPayload(res);
    if (raw == null) return null;
    const str = String(raw).replace(/u64$/i, '').trim();
    if (!str) return null;
    return BigInt(str);
  } catch {
    return null;
  }
}

export type AssetAdminParams = {
  ltv: bigint | null;
  liqThreshold: bigint | null;
  liqBonus: bigint | null;
  baseRate: bigint | null;
  slopeRate: bigint | null;
  reserveFactor: bigint | null;
};

/** Read current admin-configurable per-asset parameters from on-chain mappings. */
export async function getAssetAdminParams(
  assetKey: '0field' | '1field' | '2field',
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<AssetAdminParams> {
  const [ltv, liqThreshold, liqBonus, baseRate, slopeRate, reserveFactor] = await Promise.all([
    readMappingU64(poolProgramId, 'asset_ltv', assetKey),
    readMappingU64(poolProgramId, 'asset_liq_threshold', assetKey),
    readMappingU64(poolProgramId, 'asset_liq_bonus', assetKey),
    readMappingU64(poolProgramId, 'asset_base_rate', assetKey),
    readMappingU64(poolProgramId, 'asset_slope_rate', assetKey),
    readMappingU64(poolProgramId, 'asset_reserve_factor', assetKey),
  ]);
  return { ltv, liqThreshold, liqBonus, baseRate, slopeRate, reserveFactor };
}

/** Read current accrued protocol fees for an asset (`protocol_fees[asset]`). */
export async function getProtocolFeesForAsset(
  assetKey: '0field' | '1field' | '2field',
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<bigint | null> {
  return readMappingU64(poolProgramId, 'protocol_fees', assetKey);
}

/** Legacy shape; `assert_withdraw_*` mappings and `set_withdraw_assert` were removed from the lending program. */
export type WithdrawAssertFlags = {
  programId: string;
  wdr09Stored: boolean | null;
  wdr10Stored: boolean | null;
  fwdStored: boolean | null;
  wdr09Effective: boolean;
  wdr10Effective: boolean;
  fwdEffective: boolean;
};

/** No on-chain mappings to read — returns inert flags for older dashboard code. */
export async function fetchWithdrawAssertFlags(programId: string): Promise<WithdrawAssertFlags> {
  return {
    programId,
    wdr09Stored: null,
    wdr10Stored: null,
    fwdStored: null,
    wdr09Effective: false,
    wdr10Effective: false,
    fwdEffective: false,
  };
}

/** No-op: withdraw assert toggles removed from program. */
export async function logWithdrawAssertFlags(programId: string, label?: string): Promise<WithdrawAssertFlags> {
  const f = await fetchWithdrawAssertFlags(programId);
  const tag = label ?? programId;
  console.info(`[withdraw asserts] (removed from program) ${tag}`, f);
  return f;
}

/**
 * Idle liquidity tracked in the lending program (`available_liquidity` mapping).
 * Native ALEO withdraws are capped by this counter — not by `total_deposited - total_borrowed` and
 * not by the backend vault wallet balance (those can diverge).
 */
export async function fetchAvailableLiquidityMicro(
  programId: string,
  assetKey: string,
): Promise<bigint | null> {
  return readMappingU64(programId, 'available_liquidity', assetKey);
}

/** Fresh enough for UI caps; backend also caches `/vault-balances` (see VAULT_BALANCES_CACHE_TTL_MS). */
const VAULT_HUMAN_CACHE_TTL_MS = 20_000;
let vaultHumanCache: { t: number; value: { aleo: number; usdcx: number; usad: number } | null } | null =
  null;

/** Coalesce concurrent callers into one HTTP request (e.g. 3× withdraw-out × N position candidates). */
let vaultHumanInFlight: Promise<{ aleo: number; usdcx: number; usad: number } | null> | null = null;

async function executeVaultHumanFetch(): Promise<{ aleo: number; usdcx: number; usad: number } | null> {
  let out: { aleo: number; usdcx: number; usad: number } | null = null;
  try {
    const base =
      typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL
        ? String(process.env.NEXT_PUBLIC_BACKEND_URL).trim()
        : '';
    if (base) {
      const resp = await fetch(`${base.replace(/\/$/, '')}/vault-balances`);
      if (resp.ok) {
        const j = await resp.json();
        const aleo = Number(j?.human?.aleo ?? 0);
        const usdcx = Number(j?.human?.usdcx ?? 0);
        const usad = Number(j?.human?.usad ?? 0);
        out = {
          aleo: Number.isFinite(aleo) ? aleo : 0,
          usdcx: Number.isFinite(usdcx) ? usdcx : 0,
          usad: Number.isFinite(usad) ? usad : 0,
        };
      }
    }
  } catch {
    out = null;
  }
  vaultHumanCache = { t: Date.now(), value: out };
  return out;
}

/**
 * Human balances from `GET {NEXT_PUBLIC_BACKEND_URL}/vault-balances` (same source as dashboard vault checks).
 * TTL cache + in-flight deduplication so parallel cap math does not N-fold the same request.
 */
export async function fetchVaultHumanBalancesFromBackend(): Promise<{
  aleo: number;
  usdcx: number;
  usad: number;
} | null> {
  const now = Date.now();
  if (vaultHumanCache && now - vaultHumanCache.t < VAULT_HUMAN_CACHE_TTL_MS) {
    return vaultHumanCache.value;
  }
  if (vaultHumanInFlight) {
    return vaultHumanInFlight;
  }
  vaultHumanInFlight = executeVaultHumanFetch().finally(() => {
    vaultHumanInFlight = null;
  });
  return vaultHumanInFlight;
}

function humanToMicroU64(h: number): bigint {
  if (!Number.isFinite(h) || h <= 0) return BigInt(0);
  const r = Math.round(h * 1_000_000);
  if (r <= 0) return BigInt(0);
  const cap = Number(LENDING_U64_MAX);
  return BigInt(r > cap ? cap : r);
}

export type LendingPositionScaled = {
  scaledSupNative: bigint;
  scaledSupUsdcx: bigint;
  scaledSupUsad: bigint;
  scaledBorNative: bigint;
  scaledBorUsdcx: bigint;
  scaledBorUsad: bigint;
};

export type LendingOraclePublic = {
  supIdxAleo: bigint;
  supIdxUsdcx: bigint;
  supIdxUsad: bigint;
  borIdxAleo: bigint;
  borIdxUsdcx: bigint;
  borIdxUsad: bigint;
  priceAleo: bigint;
  priceUsdcx: bigint;
  priceUsad: bigint;
  ltvAleo: bigint;
  ltvUsdcx: bigint;
  ltvUsad: bigint;
};

function parseU64FromLeoFragment(s: string): bigint | null {
  const m = String(s).match(/(\d[\d_]*)u64/i);
  if (!m) return null;
  try {
    return BigInt(m[1].replace(/_/g, ''));
  } catch {
    return null;
  }
}

export function parseLendingPositionScaledFromPlaintext(plain: string): LendingPositionScaled | null {
  if (!plain || typeof plain !== 'string') return null;
  const g = (name: string) => {
    const re = new RegExp(`${name}:\\s*(\\d[\\d_]*)u64`, 'i');
    const m = plain.match(re);
    return m ? parseU64FromLeoFragment(`${m[1]}u64`) : null;
  };
  const scaledSupNative = g('scaled_sup_native');
  const scaledSupUsdcx = g('scaled_sup_usdcx');
  const scaledSupUsad = g('scaled_sup_usad');
  const scaledBorNative = g('scaled_bor_native');
  const scaledBorUsdcx = g('scaled_bor_usdcx');
  const scaledBorUsad = g('scaled_bor_usad');
  if (
    scaledSupNative == null ||
    scaledSupUsdcx == null ||
    scaledSupUsad == null ||
    scaledBorNative == null ||
    scaledBorUsdcx == null ||
    scaledBorUsad == null
  ) {
    return null;
  }
  return {
    scaledSupNative,
    scaledSupUsdcx,
    scaledSupUsad,
    scaledBorNative,
    scaledBorUsdcx,
    scaledBorUsad,
  };
}

export function parseLendingPositionScaledFromRecord(record: any): LendingPositionScaled | null {
  if (record == null) return null;
        if (typeof record === 'string') {
    return parseLendingPositionScaledFromPlaintext(record);
  }
  if (record.data && typeof record.data === 'object') {
    const d = record.data;
    const read = (k: string) => {
      const v = d[k];
      if (v == null) return null;
      const s = String(v);
      return parseU64FromLeoFragment(s.includes('u64') ? s : `${s}u64`);
    };
    const scaledSupNative = read('scaled_sup_native');
    const scaledSupUsdcx = read('scaled_sup_usdcx');
    const scaledSupUsad = read('scaled_sup_usad');
    const scaledBorNative = read('scaled_bor_native');
    const scaledBorUsdcx = read('scaled_bor_usdcx');
    const scaledBorUsad = read('scaled_bor_usad');
    if (
      scaledSupNative != null &&
      scaledSupUsdcx != null &&
      scaledSupUsad != null &&
      scaledBorNative != null &&
      scaledBorUsdcx != null &&
      scaledBorUsad != null
    ) {
      return {
        scaledSupNative,
        scaledSupUsdcx,
        scaledSupUsad,
        scaledBorNative,
        scaledBorUsdcx,
        scaledBorUsad,
      };
    }
  }
  if (record.plaintext && typeof record.plaintext === 'string') {
    return parseLendingPositionScaledFromPlaintext(record.plaintext);
  }
  return null;
}

function isLendingPositionLike(record: any): boolean {
  if (typeof record === 'string') {
    return record.includes('scaled_sup_native') || record.includes('LendingPosition');
  }
  const n = (record?.recordName || record?.type || '').toString();
  if (n.includes('LendingPosition')) return true;
  return parseLendingPositionScaledFromRecord(record) != null;
}

async function resolveRecordPlaintext(
  record: any,
  decrypt?: (c: string) => Promise<string>,
): Promise<string | null> {
  if (typeof record === 'string') return record;
  if (record?.plaintext && typeof record.plaintext === 'string') return record.plaintext;
  const ct = record?.recordCiphertext || record?.ciphertext;
  if (ct && decrypt) {
    try {
      const p = await decrypt(ct);
      if (p) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Index of `ref` in `records` (same array `requestRecords(programId)` uses), for `executeTransaction.recordIndices`.
 */
function findWalletRecordIndexInList(records: any[] | undefined, ref: any): number {
  if (!records?.length || ref == null) return -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i] === ref) return i;
  }
  const ct = ref?.recordCiphertext || ref?.record_ciphertext || ref?.ciphertext;
  if (ct) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if ((r?.recordCiphertext || r?.record_ciphertext || r?.ciphertext) === ct) return i;
    }
  }
  return -1;
}

/** Re-resolve `recordIndices` against a fresh `requestRecords` snapshot (ordering can shift between calls). */
async function refreshLendingPositionRecordIndex(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  poolProgramId: string,
  walletRecord: any,
  fallbackIdx: number,
): Promise<{ records: any[]; recordIdx: number }> {
  const records = await requestRecords(poolProgramId, false);
  let recordIdx = findWalletRecordIndexInList(records, walletRecord);
  if (recordIdx < 0) recordIdx = fallbackIdx;
  return { records, recordIdx };
}

/** Block height from a wallet record (lending, credits, token, etc.). */
function getWalletRecordBlockHeight(rec: any): number | null {
  if (rec == null) return null;
  const v =
    rec.height ??
    rec.block_height ??
    rec.blockHeight ??
    rec.block ??
    (rec.data && typeof rec.data === 'object' && (rec.data as any).height) ??
    (rec.data && typeof rec.data === 'object' && (rec.data as any).block_height);
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type LendingPositionRecordCandidate = {
  input: string | any;
  scaled: LendingPositionScaled;
  idx: number;
  score: bigint;
  borScore: bigint;
  walletRecord: any;
};

/**
 * All funded (or empty-only) `LendingPosition` candidates for selection / aggregation.
 */
export async function listFundedLendingPositionCandidates(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  programId: string,
  decrypt?: (cipherText: string) => Promise<string>,
  recordsSnapshot?: any[],
): Promise<LendingPositionRecordCandidate[]> {
  const records = recordsSnapshot ?? (await requestRecords(programId, false));
  if (!records?.length) return [];

  const cands: LendingPositionRecordCandidate[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r?.spent) continue;
    if (!isLendingPositionLike(r)) continue;
    const plain = await resolveRecordPlaintext(r, decrypt);
    let scaled: LendingPositionScaled | null = null;
    if (plain) scaled = parseLendingPositionScaledFromPlaintext(plain);
    if (!scaled) scaled = parseLendingPositionScaledFromRecord(r);
    if (!scaled) continue;
    const input = plain ?? r;
    const score =
      scaled.scaledSupNative + scaled.scaledSupUsdcx + scaled.scaledSupUsad;
    const borScore =
      scaled.scaledBorNative + scaled.scaledBorUsdcx + scaled.scaledBorUsad;
    cands.push({ input, scaled, idx: i, score, borScore, walletRecord: r });
  }

  if (cands.length === 0) return [];

  const hasFunded = cands.some((c) => c.score > BigInt(0) || c.borScore > BigInt(0));
  const pool = hasFunded
    ? cands.filter((c) => c.score > BigInt(0) || c.borScore > BigInt(0))
    : cands;
  return pool;
}

/**
 * Latest `LendingPosition` from the wallet for `programId`, or `null` (call `open_lending_account` first).
 *
 * @param recordsSnapshot — If provided, use this array instead of calling `requestRecords` again.
 *   **Pass the same snapshot** you will use when resolving `recordIndices` for `executeTransaction`, or
 *   wallet ordering can disagree with `recordIndex` and proofs will reject on-chain.
 */
export async function getLatestLendingPositionRecordInput(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  programId: string,
  decrypt?: (cipherText: string) => Promise<string>,
  recordsSnapshot?: any[],
): Promise<{
  input: string | any;
  scaled: LendingPositionScaled;
  recordIndex: number;
  /** Raw wallet record for `findWalletRecordIndexInList` (same array as snapshot / requestRecords). */
  walletRecord: any;
} | null> {
  const pool = await listFundedLendingPositionCandidates(
    requestRecords,
    programId,
    decrypt,
    recordsSnapshot,
  );
  if (pool.length === 0) return null;

  // Prefer max scaled supply. On equal supply, prefer **newer** block height when known.
  // When height ties or is missing: prefer **lower** scaled borrow total — after a repay/borrow the canonical
  // head is debt-free (or lower debt). Old unspent duplicates often still carry the pre-repay borrow; picking
  // them makes withdraw/repay fail health asserts while the UI looks clean on the latest note.
  const pickBetter = (a: LendingPositionRecordCandidate, b: LendingPositionRecordCandidate): LendingPositionRecordCandidate => {
    if (a.score !== b.score) return a.score > b.score ? a : b;
    const ha = getWalletRecordBlockHeight(a.walletRecord);
    const hb = getWalletRecordBlockHeight(b.walletRecord);
    if (ha != null && hb != null && ha !== hb) return ha > hb ? a : b;
    if (ha != null && hb == null) return a;
    if (hb != null && ha == null) return b;
    if (a.borScore !== b.borScore) return a.borScore < b.borScore ? a : b;
    return a.idx > b.idx ? a : b;
  };
  let best = pool[0];
  for (let j = 1; j < pool.length; j++) {
    best = pickBetter(best, pool[j]);
  }
  let input: string | any = best.input;
  if (typeof input !== 'string' || !String(input).trim()) {
    const p = await resolveRecordPlaintext(best.walletRecord, decrypt);
    if (p) input = p;
  }
  return {
    input,
    scaled: best.scaled,
    recordIndex: best.idx,
    walletRecord: best.walletRecord,
  };
}

export async function parseLatestLendingPositionScaled(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  programId: string,
  decrypt?: (cipherText: string) => Promise<string>,
  /** Same snapshot as `lendingWithdrawUsdc` / caps so selection matches tx submission. */
  recordsSnapshot?: any[],
): Promise<LendingPositionScaled | null> {
  const r = await getLatestLendingPositionRecordInput(requestRecords, programId, decrypt, recordsSnapshot);
  return r?.scaled ?? null;
}

/** On-chain indices, prices, and LTVs (matches pool `finalize_*` public inputs). */
export async function fetchLendingOraclePublic(programId: string): Promise<LendingOraclePublic> {
  const zIdx = (x: bigint | null) => x ?? LENDING_INDEX_SCALE_ORACLE;
  const zPrice = (x: bigint | null) => x ?? LENDING_PRICE_SCALE_ORACLE;
  const [
    supA,
    supU,
    supD,
    borA,
    borU,
    borD,
    pA,
    pU,
    pD,
    ltvA,
    ltvU,
    ltvD,
  ] = await Promise.all([
    readMappingU64(programId, 'supply_index', '0field'),
    readMappingU64(programId, 'supply_index', '1field'),
    readMappingU64(programId, 'supply_index', '2field'),
    readMappingU64(programId, 'borrow_index', '0field'),
    readMappingU64(programId, 'borrow_index', '1field'),
    readMappingU64(programId, 'borrow_index', '2field'),
    readMappingU64(programId, 'asset_price', '0field'),
    readMappingU64(programId, 'asset_price', '1field'),
    readMappingU64(programId, 'asset_price', '2field'),
    readMappingU64(programId, 'asset_ltv', '0field'),
    readMappingU64(programId, 'asset_ltv', '1field'),
    readMappingU64(programId, 'asset_ltv', '2field'),
  ]);
  return {
    supIdxAleo: zIdx(supA),
    supIdxUsdcx: zIdx(supU),
    supIdxUsad: zIdx(supD),
    borIdxAleo: zIdx(borA),
    borIdxUsdcx: zIdx(borU),
    borIdxUsad: zIdx(borD),
    priceAleo: zPrice(pA),
    priceUsdcx: zPrice(pU),
    priceUsad: zPrice(pD),
    ltvAleo: ltvA ?? BigInt(7500),
    ltvUsdcx: ltvU ?? BigInt(8500),
    ltvUsad: ltvD ?? BigInt(8500),
  };
}

function oracleToBorrowWithdrawPublicInputs(o: LendingOraclePublic): string[] {
  const u = (n: bigint) => `${n.toString()}u64`;
  return [
    u(o.supIdxAleo),
    u(o.supIdxUsdcx),
    u(o.supIdxUsad),
    u(o.borIdxAleo),
    u(o.borIdxUsdcx),
    u(o.borIdxUsad),
    u(o.priceAleo),
    u(o.priceUsdcx),
    u(o.priceUsad),
    u(o.ltvAleo),
    u(o.ltvUsdcx),
    u(o.ltvUsad),
  ];
}

/** 12 oracle/LTV u64s for `withdraw` private args (wallet expects plain Leo literals, no `.private` suffix). */
function oracleToWithdrawOraclePrivateInputs(o: LendingOraclePublic): string[] {
  const u = (n: bigint) => `${n.toString()}u64`;
  return [
    u(o.supIdxAleo),
    u(o.supIdxUsdcx),
    u(o.supIdxUsad),
    u(o.borIdxAleo),
    u(o.borIdxUsdcx),
    u(o.borIdxUsad),
    u(o.priceAleo),
    u(o.priceUsdcx),
    u(o.priceUsad),
    u(o.ltvAleo),
    u(o.ltvUsdcx),
    u(o.ltvUsad),
  ];
}

/**
 * Unified `withdraw`: LendingPosition + private `amount`, `out_asset`, and private oracle (12× u64).
 * IMPORTANT: keep plain literals here (`123u64`, `1field`) — wallet infers private/public from ABI.
 */
function lendingWithdrawProgramInputs(
  positionInput: unknown,
  amountMicro: bigint,
  outAssetField: '0field' | '1field' | '2field',
  oracle: LendingOraclePublic,
): unknown[] {
  return [
    positionInput,
    `${amountMicro.toString()}u64`,
    outAssetField,
    ...oracleToWithdrawOraclePrivateInputs(oracle),
  ];
}

/** Unified `borrow`: position + **private** `amount`, `borrow_asset`; then **public** oracle. */
function lendingBorrowProgramInputs(
  positionInput: unknown,
  amountMicro: bigint,
  borrowAssetField: '0field' | '1field' | '2field',
  oracle: LendingOraclePublic,
): unknown[] {
  return [
    positionInput,
    `${amountMicro.toString()}u64`,
    borrowAssetField,
    ...oracleToBorrowWithdrawPublicInputs(oracle),
  ];
}

function oracleToRepayPublicInputs(o: LendingOraclePublic): string[] {
  const u = (n: bigint) => `${n.toString()}u64`;
  return [
    u(o.borIdxAleo),
    u(o.borIdxUsdcx),
    u(o.borIdxUsad),
    u(o.priceAleo),
    u(o.priceUsdcx),
    u(o.priceUsad),
  ];
}

export function formatU64TripleStruct(a: bigint, b: bigint, c: bigint): string {
  return `{ x0: ${a}u64, x1: ${b}u64, x2: ${c}u64 }`;
}

export async function lendingOpenLendingAccount(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  programId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  const result = await executeTransaction({
    program: programId,
    function: 'open_lending_account',
    inputs: [],
    fee: DEFAULT_LENDING_FEE * 1_000_000,
    privateFee: false,
  });
  const txId = result?.transactionId;
  if (!txId) throw new Error('open_lending_account: no transactionId');
  return txId;
}

/**
 * Get total spendable private Aleo balance (credits.aleo records) in credits.
 * Sums microcredits from all unspent credits.aleo records; uses decrypt for private records.
 * Returns 0 if no records or on error.
 */
export async function getPrivateCreditsBalance(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<number> {
  try {
    const records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) return 0;
    const getMicrocredits = (r: any): number => {
      try {
        if (r.data?.microcredits) {
          return parseInt(String(r.data.microcredits).replace(/\D/g, ''), 10) || 0;
        }
        if (r.plaintext) {
          const m = String(r.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          return m ? parseInt(m[1].replace(/_/g, ''), 10) : 0;
        }
      } catch {
        return 0;
      }
      return 0;
    };
    let totalMicro = 0;
    for (const r of records as any[]) {
      if (r.spent) continue;
      let micro = getMicrocredits(r);
      if (micro === 0 && (r.recordCiphertext || r.ciphertext) && decrypt) {
        try {
          const plain = await decrypt(r.recordCiphertext || r.ciphertext);
          if (plain) {
            const m = plain.match(/microcredits:\s*([\d_]+)u64/);
            micro = m ? parseInt(m[1].replace(/_/g, ''), 10) : 0;
          }
        } catch {
          // skip
        }
      }
      totalMicro += micro;
    }
    return totalMicro / 1_000_000;
  } catch {
    return 0;
  }
}

/**
 * Deposit into the lending pool using a real `credits.aleo::credits` record.
 * `deposit_with_credits(position, pay_record, amount.private, sup_idx.public)`.
 */
export async function lendingDeposit(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  privacyLog('========================================');
  privacyLog('💰 LENDING DEPOSIT (credits) CALLED');
  privacyLog('========================================');
  privacyLog('📥 Input Parameters:', {
    amount,
    network: CURRENT_NETWORK,
    programId: poolProgramId,
  });

  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable.');
  }
  if (amount <= 0) {
    throw new Error('Deposit amount must be greater than 0');
  }

  try {
    // Convert amount (credits) to microcredits. We allow decimals (up to 6 places),
    // rounding to the nearest micro credit. Pool expects micro-ALEO as its `amount`.
    const amountMicro = Math.round(amount * 1_000_000);
    const requiredMicro = amountMicro;

    const poolRecords = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      poolRecords,
    );
    if (!pos) {
      throw new Error(
        'No LendingPosition record found. Submit open_lending_account once, then deposit.',
      );
    }
    let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
    if (posIdx < 0) posIdx = pos.recordIndex;

    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const supIdxStr = `${oracle.supIdxAleo.toString()}u64`;

    privacyLog('🔍 Fetching credits.aleo records for deposit...', {
      CREDITS_PROGRAM_ID,
      requiredMicro,
    });

    let records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) records = [];

    privacyLog(`📋 Found ${records.length} credits.aleo records`);

    // Helper similar to NullPay: extract microcredits from data or plaintext
    const getMicrocredits = (record: any): number => {
      try {
        if (record.data && record.data.microcredits) {
          return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
        }
        if (record.plaintext) {
          const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          if (match && match[1]) {
            return parseInt(match[1].replace(/_/g, ''), 10);
          }
        }
      } catch {
        // ignore
      }
      return 0;
    };

    const processRecord = async (r: any): Promise<number> => {
      let val = getMicrocredits(r);
      if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
        try {
          const decrypted = await decrypt(r.recordCiphertext);
          if (decrypted) {
            r.plaintext = decrypted;
            val = getMicrocredits(r);
          }
        } catch (e) {
          privacyWarn('⚠️ Failed to decrypt credits record for deposit:', e);
        }
      }
      return val;
    };

    let payRecord: any | null = null;
    let payRecordIndex = -1;
    for (let ri = 0; ri < records.length; ri++) {
      const r = records[ri];
      if (r.spent) continue;
      const val = await processRecord(r);
      const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
      if (isSpendable && val >= requiredMicro) {
        payRecord = r;
        payRecordIndex = ri;
        break;
      }
    }

    if (!payRecord) {
      throw new Error(
        `No credits.aleo record found with enough microcredits for amount ${amount}. ` +
          `Make sure you have at least ${amount} private credits in one record.`,
      );
    }

    privacyLog('✅ Selected credits.aleo record for deposit:', {
      preview: JSON.stringify(payRecord).slice(0, 200),
    });

    // Build Leo-compatible record input (plaintext or ciphertext), like NullPay.
    let recordInput: string | any = payRecord.plaintext;

    if (!recordInput) {
      privacyWarn('⚠️ Credits record missing plaintext. Attempting to reconstruct...');
      const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
      const micro = getMicrocredits(payRecord);
      const owner = payRecord.owner;

      if (nonce && micro > 0 && owner) {
        recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
        privacyLog('✅ Reconstructed credits plaintext for deposit:', recordInput);
      } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
        recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
        privacyLog('✅ Using credits ciphertext for deposit input.');
      } else {
        privacyWarn('⚠️ Could not reconstruct credits record; passing raw object (last resort).');
        recordInput = payRecord;
      }
    }

    const amountInput = `${amountMicro}u64`;

    const { recordIdx: posIdxFresh } = await refreshLendingPositionRecordIndex(
      requestRecords,
      poolProgramId,
      pos.walletRecord,
      posIdx,
    );
    const creditsFresh = await requestRecords(CREDITS_PROGRAM_ID, false);
    const payIdxFresh = findWalletRecordIndexInList(creditsFresh, payRecord);
    const payIdxFinal = payIdxFresh >= 0 ? payIdxFresh : payRecordIndex;

    const oracleAtSubmit = await fetchLendingOraclePublic(poolProgramId);
    const supIdxStrAtSubmit = `${oracleAtSubmit.supIdxAleo.toString()}u64`;

    const inputs: any[] = [pos.input, recordInput, amountInput, supIdxStrAtSubmit];

    privacyLog('🔍 Calling executeTransaction for deposit_with_credits...', {
      program: poolProgramId,
      function: 'deposit_with_credits',
      inputsPreview: {
        input0: 'LendingPosition',
        input1_len: typeof recordInput === 'string' ? recordInput.length : 'object',
        input2: amountInput,
        input3: supIdxStrAtSubmit,
        supIdxRefreshed: supIdxStrAtSubmit !== supIdxStr,
      },
    });

    const result = await executeTransaction({
      program: poolProgramId,
      function: 'deposit_with_credits',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: payIdxFinal >= 0 ? [posIdxFresh, payIdxFinal] : [posIdxFresh, 0],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Deposit failed: No temporary transactionId returned from wallet.');
    }

    privacyLog('Temporary Transaction ID (deposit_with_credits):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING DEPOSIT (credits) FAILED:', error?.message ?? error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Deposit transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Deposit transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Borrow ALEO from the pool (xyra_lending_v8: `borrow` + public oracle + LendingPosition).
 */
export async function lendingBorrow(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable.');
  }
  if (amount <= 0) {
    throw new Error('Borrow amount must be greater than 0');
  }

  try {
    const records = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      records,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before borrowing.');
    }
    let recordIdx = findWalletRecordIndexInList(records, pos.walletRecord);
    if (recordIdx < 0) recordIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const amountMicro = BigInt(Math.round(amount * 1_000_000));
    const inputs = lendingBorrowProgramInputs(pos.input, amountMicro, '0field', oracle);

    privacyLog('🔍 Calling executeTransaction for borrow (public fee)...');
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'borrow',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [recordIdx],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Borrow failed: No temporary transactionId returned from wallet.');
    }

    privacyLog('Temporary Transaction ID (borrow):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING BORROW FUNCTION FAILED:', error?.message ?? error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Borrow transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Borrow transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

/** On-chain `position_note_schema` value after Sprint 2 `mint_position_migration_note`. */
export const POSITION_NOTE_SCHEMA_ON_CHAIN_V2 = 2;

/**
 * Read lending pool mapping `position_note_schema` at `BHP256::hash_to_field(caller)`.
 * `0` / missing = legacy-only; `2` = v2 PositionNote minted (see Sprint 2 migration).
 */
export async function getPositionNoteSchemaFromChain(
  programId: string,
  userAddress: string,
): Promise<number | null> {
  const userKey = await computeUserKeyFieldFromAddress(userAddress);
  if (!userKey) return null;
  try {
    const res = await client.request('getMappingValue', {
      program_id: programId,
      mapping_name: 'position_note_schema',
      key: userKey,
    });
    const raw = res?.value ?? res ?? null;
    if (raw == null) return 0;
    const str = String(raw).replace(/u64$/i, '').trim();
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Removed in xyra_lending_v8 (no `mint_position_migration_note`).
 */
export async function lendingMintPositionMigrationNote(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  void executeTransaction;
  throw new Error('mint_position_migration_note is not part of xyra_lending_v8.');
}

/**
 * Repay with credits (xyra_lending_v8: `repay_with_credits` + public oracle).
 */
export async function lendingRepay(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable for repay.');
  }
  if (amount <= 0) {
    throw new Error('Repay amount must be greater than 0');
  }

  try {
    const poolRecords = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      poolRecords,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before repaying.');
    }
    let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
    if (posIdx < 0) posIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);

    // Convert amount (credits) to microcredits. We allow decimals (up to 6 places),
    // rounding to the nearest micro credit. Pool expects micro-ALEO as its `amount`.
    const amountMicro = Math.round(amount * 1_000_000);
    const requiredMicro = amountMicro;

    privacyLog('🔍 Fetching credits.aleo records for repay...', {
      CREDITS_PROGRAM_ID,
      requiredMicro,
    });

    let records = await requestRecords(CREDITS_PROGRAM_ID, false);
    if (!records || !Array.isArray(records)) records = [];

    privacyLog(`📋 Found ${records.length} credits.aleo records (for repay)`);

    const getMicrocredits = (record: any): number => {
      try {
        if (record.data && record.data.microcredits) {
          return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
        }
        if (record.plaintext) {
          const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
          if (match && match[1]) {
            return parseInt(match[1].replace(/_/g, ''), 10);
          }
        }
      } catch {
        // ignore
      }
      return 0;
    };

    const processRecord = async (r: any): Promise<number> => {
      let val = getMicrocredits(r);
      if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
        try {
          const decrypted = await decrypt(r.recordCiphertext);
          if (decrypted) {
            r.plaintext = decrypted;
            val = getMicrocredits(r);
          }
        } catch (e) {
          privacyWarn('⚠️ Failed to decrypt credits record for repay:', e);
        }
      }
      return val;
    };

    let payRecord: any | null = null;
    let payRecordIndex = -1;
    for (let ri = 0; ri < records.length; ri++) {
      const r = records[ri];
      if (r.spent) continue;
      const val = await processRecord(r);
      const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
      if (isSpendable && val >= requiredMicro) {
        payRecord = r;
        payRecordIndex = ri;
        break;
      }
    }

    if (!payRecord) {
      throw new Error(
        `No credits.aleo record found with enough microcredits for repay amount ${amount}. ` +
          `Make sure you have at least ${amount} private credits in one record.`,
      );
    }

    privacyLog('✅ Selected credits.aleo record for repay:', {
      preview: JSON.stringify(payRecord).slice(0, 200),
    });

    // Build Leo-compatible record input (plaintext or ciphertext), like NullPay / deposit.
    let recordInput: string | any = payRecord.plaintext;

    if (!recordInput) {
      privacyWarn('⚠️ Credits record missing plaintext (repay). Attempting to reconstruct...');
      const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
      const micro = getMicrocredits(payRecord);
      const owner = payRecord.owner;

      if (nonce && micro > 0 && owner) {
        recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
        privacyLog('✅ Reconstructed credits plaintext for repay:', recordInput);
      } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
        recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
        privacyLog('✅ Using credits ciphertext for repay input.');
      } else {
        privacyWarn('⚠️ Could not reconstruct credits record; passing raw object (last resort).');
        recordInput = payRecord;
      }
    }

    const amountInput = `${amountMicro}u64`;
    const inputs: any[] = [pos.input, recordInput, amountInput, ...oracleToRepayPublicInputs(oracle)];

    privacyLog('🔍 Calling executeTransaction for repay_with_credits...', {
      program: poolProgramId,
      function: 'repay_with_credits',
      inputsPreview: {
        input0: 'LendingPosition',
        input1_len: typeof recordInput === 'string' ? recordInput.length : 'object',
        input2: amountInput,
      },
    });

    const result = await executeTransaction({
      program: poolProgramId,
      function: 'repay_with_credits',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices:
        payRecordIndex >= 0 ? [posIdx, payRecordIndex] : [posIdx, 0],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Repay failed: No temporary transactionId returned from wallet.');
    }

    privacyLog('Temporary Transaction ID (repay_with_credits):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING REPAY (credits) FAILED:', error?.message ?? error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Repay transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Repay transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Self close path: `self_liquidate_and_payout` (owner repay + collateral payout accounting).
 */
export async function lendingSelfLiquidateDebtCredits(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  repayAmount: number,
  seizeAsset: '0field' | '1field' | '2field',
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or requestRecords unavailable for liquidation.');
  }
  if (repayAmount <= 0) {
    throw new Error('Repay amount must be greater than 0.');
  }

  const poolRecords = await requestRecords(poolProgramId, false);
  const pos = await getLatestLendingPositionRecordInput(
    requestRecords,
    poolProgramId,
    decrypt,
    poolRecords,
  );
  if (!pos) {
    throw new Error('No LendingPosition record. Open a lending account first.');
  }
  let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
  if (posIdx < 0) posIdx = pos.recordIndex;

  const repayMicro = Math.round(repayAmount * 1_000_000);

  let records = await requestRecords(CREDITS_PROGRAM_ID, false);
  if (!records || !Array.isArray(records)) records = [];

  const getMicrocredits = (record: any): number => {
    try {
      if (record.data && record.data.microcredits) {
        return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
      }
      if (record.plaintext) {
        const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
        if (match && match[1]) return parseInt(match[1].replace(/_/g, ''), 10);
      }
    } catch {
      // ignore parse failures
    }
    return 0;
  };

  const processRecord = async (r: any): Promise<number> => {
    let val = getMicrocredits(r);
    if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
      try {
        const decrypted = await decrypt(r.recordCiphertext);
        if (decrypted) {
          r.plaintext = decrypted;
          val = getMicrocredits(r);
        }
      } catch {
        // ignore decrypt failures
      }
    }
    return val;
  };

  let payRecord: any | null = null;
  let payRecordIndex = -1;
  for (let ri = 0; ri < records.length; ri++) {
    const r = records[ri];
    if (r.spent) continue;
    const val = await processRecord(r);
    const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
    if (isSpendable && val >= repayMicro) {
      payRecord = r;
      payRecordIndex = ri;
      break;
    }
  }
  if (!payRecord) {
    throw new Error(`No credits record has enough balance for ${repayAmount.toFixed(6)} ALEO liquidation repay.`);
  }

  let recordInput: string | any = payRecord.plaintext;
  if (!recordInput) {
    const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
    const micro = getMicrocredits(payRecord);
    const owner = payRecord.owner;
    if (nonce && micro > 0 && owner) {
      recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
    } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
      recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
    } else {
      recordInput = payRecord;
    }
  }

  const oracle = await fetchLendingOraclePublic(poolProgramId);
  // Mirror on-chain `max_close_aleo` check to surface a clear error before wallet submission.
  const realBorAleoMicro = Number(
    (BigInt(pos.scaled.scaledBorNative) * oracle.borIdxAleo) / BigInt(1_000_000_000_000),
  );
  const maxCloseAleoMicro = Math.floor(realBorAleoMicro * 0.5);
  if (repayMicro > maxCloseAleoMicro) {
    throw new Error(
      `Repay exceeds close-factor cap: max ${(maxCloseAleoMicro / 1_000_000).toFixed(6)} ALEO for current debt ${(realBorAleoMicro / 1_000_000).toFixed(6)} ALEO.`,
    );
  }
  const [tA, tU, tD] = await Promise.all([
    readMappingU64(poolProgramId, 'asset_liq_threshold', '0field'),
    readMappingU64(poolProgramId, 'asset_liq_threshold', '1field'),
    readMappingU64(poolProgramId, 'asset_liq_threshold', '2field'),
  ]);
  const bonus = await readMappingU64(poolProgramId, 'asset_liq_bonus', seizeAsset);

  const inputs = [
    pos.input,
    recordInput,
    `${repayMicro}u64`,
    seizeAsset,
    formatU64TripleStruct(oracle.supIdxAleo, oracle.supIdxUsdcx, oracle.supIdxUsad),
    formatU64TripleStruct(oracle.borIdxAleo, oracle.borIdxUsdcx, oracle.borIdxUsad),
    formatU64TripleStruct(oracle.priceAleo, oracle.priceUsdcx, oracle.priceUsad),
    formatU64TripleStruct(tA ?? BigInt(0), tU ?? BigInt(0), tD ?? BigInt(0)),
    `${(bonus ?? LENDING_LIQ_BONUS_DEFAULT_BPS).toString()}u64`,
  ];
  // Privacy hardening: avoid logging transaction payload/record previews.
  const result = await executeTransaction({
    program: poolProgramId,
    function: 'self_liquidate_and_payout',
    inputs,
    fee: DEFAULT_LENDING_FEE * 1_000_000,
    privateFee: false,
    recordIndices:
      payRecordIndex >= 0 ? [posIdx, payRecordIndex] : [posIdx, 0],
  });
  const tempId = result?.transactionId;
  if (!tempId) throw new Error('Liquidation failed: No transactionId returned.');
  return tempId;
}

/**
 * Largest single `credits.aleo` record balance (microcredits). Self-liquidation spends one credits record per tx.
 */
export async function getCreditsMaxSingleRecordMicroAleo(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
): Promise<number> {
  let records = await requestRecords(CREDITS_PROGRAM_ID, false);
  if (!records || !Array.isArray(records)) records = [];

  const getMicrocredits = (record: any): number => {
    try {
      if (record.data && record.data.microcredits) {
        return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
      }
      if (record.plaintext) {
        const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
        if (match && match[1]) return parseInt(match[1].replace(/_/g, ''), 10);
      }
    } catch {
      // ignore
    }
    return 0;
  };

  const processRecord = async (r: any): Promise<number> => {
    let val = getMicrocredits(r);
    if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
      try {
        const decrypted = await decrypt(r.recordCiphertext);
        if (decrypted) {
          r.plaintext = decrypted;
          val = getMicrocredits(r);
        }
      } catch {
        // ignore
      }
    }
    return val;
  };

  let max = 0;
  for (let ri = 0; ri < records.length; ri++) {
    const r = records[ri];
    if (r.spent) continue;
    const val = await processRecord(r);
    const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
    if (isSpendable && val > max) max = val;
  }
  return max;
}

/** @deprecated Use `lendingSelfLiquidateDebtCredits`. */
export async function lendingLiquidateAleoDebt(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  borrowerAddress: string,
  repayAmount: number,
  seizeAsset: '0field' | '1field' | '2field',
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
): Promise<string> {
  if (publicKey && borrowerAddress.trim() !== publicKey.trim()) {
    throw new Error(
      'Third-party liquidation is not supported on this pool version (positions are private). ' +
        'Only self-liquidation is available.',
    );
  }
  return lendingSelfLiquidateDebtCredits(
    executeTransaction,
    repayAmount,
    seizeAsset,
    publicKey,
    requestRecords,
    decrypt,
  );
}

/** Same as pool flash premium default (0.05% = 5 bps). */
export const ALEO_FLASH_PREMIUM_BPS = 5;
export const BPS_DENOMINATOR = 10_000;

/** Ceil(principal_micro * BPS / DENOM) — matches `flash_loan_with_credits` on-chain. */
export function aleoFlashFeeMicro(principalMicro: number): number {
  return Math.floor(
    (principalMicro * ALEO_FLASH_PREMIUM_BPS + BPS_DENOMINATOR - 1) / BPS_DENOMINATOR,
  );
}

function isFieldLiteral(v: string): boolean {
  return /^\d+field$/.test(String(v || '').trim());
}

export type FlashLendingAssetId = '0field' | '1field' | '2field';

function isFlashLendingAssetId(v: string): v is FlashLendingAssetId {
  return v === '0field' || v === '1field' || v === '2field';
}

/**
 * Open flash session (`flash_open`) for caller.
 * Inputs:
 *  - asset_id: private field (0field/1field/2field)
 *  - principal: private u64 (micro)
 *  - min_profit: private u64 (micro)
 *  - strategy_id: private field
 *
 * ABI has no record inputs — do not pass lending `recordIndices`.
 */
export async function lendingFlashOpen(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  principalAleo: number,
  minProfitAleo: number,
  strategyIdField: string,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
  assetId: FlashLendingAssetId = '0field',
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or requestRecords unavailable.');
  }
  if (!isFlashLendingAssetId(String(assetId || '').trim())) {
    throw new Error("Invalid flash asset_id. Use '0field' (ALEO), '1field' (USDCx), or '2field' (USAD).");
  }
  if (!isFieldLiteral(strategyIdField)) {
    throw new Error("Invalid strategy id. Must be Leo field literal (example: '1field').");
  }
  if (!Number.isFinite(principalAleo) || principalAleo <= 0) {
    throw new Error('Principal must be greater than 0.');
  }
  if (!Number.isFinite(minProfitAleo) || minProfitAleo < 0) {
    throw new Error('Min profit must be >= 0.');
  }
  const principalMicro = Math.round(principalAleo * 1_000_000);
  const minProfitMicro = Math.round(minProfitAleo * 1_000_000);
  if (principalMicro <= 0) throw new Error('Principal too small after micro conversion.');
  if (principalMicro > Number.MAX_SAFE_INTEGER || minProfitMicro > Number.MAX_SAFE_INTEGER) {
    throw new Error('Principal/min-profit exceeds JS safe integer.');
  }

  const result = await executeTransaction({
    program: poolProgramId,
    function: 'flash_open',
    inputs: [assetId, `${principalMicro}u64`, `${minProfitMicro}u64`, strategyIdField],
    fee: DEFAULT_LENDING_FEE * 1_000_000,
    privateFee: false,
    recordIndices: [],
  });
  const txId = result?.transactionId;
  if (!txId) throw new Error('flash_open failed: no transactionId returned.');
  return txId;
}

/**
 * Settle flash session by repaying credits (`flash_settle_with_credits`).
 */
export async function lendingFlashSettleWithCredits(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  repayAleo: number,
  strategyIdField: string,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access unavailable for settle.');
  }
  if (!isFieldLiteral(strategyIdField)) {
    throw new Error("Invalid strategy id. Must be Leo field literal (example: '1field').");
  }
  if (!Number.isFinite(repayAleo) || repayAleo <= 0) {
    throw new Error('Repay amount must be > 0.');
  }

  const amountMicro = Math.round(repayAleo * 1_000_000);
  if (amountMicro <= 0) throw new Error('Repay amount too small after micro conversion.');

  let records = await requestRecords(CREDITS_PROGRAM_ID, false);
  if (!records || !Array.isArray(records)) records = [];
  const getMicrocredits = (record: any): number => {
    try {
      if (record.data?.microcredits) {
        return parseInt(String(record.data.microcredits).replace('u64', ''), 10);
      }
      if (record.plaintext) {
        const match = String(record.plaintext).match(/microcredits:\s*([\d_]+)u64/);
        if (match && match[1]) return parseInt(match[1].replace(/_/g, ''), 10);
      }
    } catch {
      // ignore
    }
    return 0;
  };
  const processRecord = async (r: any): Promise<number> => {
    let val = getMicrocredits(r);
    if (val === 0 && r.recordCiphertext && !r.plaintext && decrypt) {
      try {
        const decrypted = await decrypt(r.recordCiphertext);
        if (decrypted) {
          r.plaintext = decrypted;
          val = getMicrocredits(r);
        }
      } catch {
        // ignore
      }
    }
    return val;
  };

  let payRecord: any | null = null;
  let payRecordIndex = -1;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.spent) continue;
    const val = await processRecord(r);
    const isSpendable = !!(r.plaintext || r.nonce || r._nonce || r.data?._nonce || r.ciphertext);
    if (isSpendable && val >= amountMicro) {
      payRecord = r;
      payRecordIndex = i;
      break;
    }
  }
  if (!payRecord) {
    throw new Error(
      `No credits.aleo record found with enough microcredits for settle amount ${repayAleo}.`,
    );
  }
  let recordInput: string | any = payRecord.plaintext;
  if (!recordInput) {
    const nonce = payRecord.nonce || payRecord._nonce || payRecord.data?._nonce;
    const micro = getMicrocredits(payRecord);
    const owner = payRecord.owner;
    if (nonce && micro > 0 && owner) {
      recordInput = `{ owner: ${owner}.private, microcredits: ${micro}u64.private, _nonce: ${nonce}.public }`;
    } else if (payRecord.ciphertext || payRecord.recordCiphertext) {
      recordInput = payRecord.ciphertext || payRecord.recordCiphertext;
    } else {
      recordInput = payRecord;
    }
  }

  const result = await executeTransaction({
    program: poolProgramId,
    function: 'flash_settle_with_credits',
    inputs: [recordInput, `${amountMicro}u64`, strategyIdField],
    fee: DEFAULT_LENDING_FEE * 1_000_000,
    privateFee: false,
    recordIndices: payRecordIndex >= 0 ? [payRecordIndex] : [0],
  });
  const txId = result?.transactionId;
  if (!txId) throw new Error('flash_settle_with_credits failed: no transactionId returned.');
  return txId;
}

/**
 * Settle flash with USDCx (`flash_settle_with_usdcx`): Token + Merkle proofs, same profit gate as credits path.
 */
export async function lendingFlashSettleWithUsdcx(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  repayUsdc: number,
  strategyIdField: string,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
  tokenRecord?: any | null,
  proofs?: [string, string] | string,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access unavailable for settle.');
  }
  if (!isFieldLiteral(strategyIdField)) {
    throw new Error("Invalid strategy id. Must be Leo field literal (example: '1field').");
  }
  if (!Number.isFinite(repayUsdc) || repayUsdc <= 0) {
    throw new Error('Repay amount must be > 0.');
  }
  const amountMicro = Math.round(repayUsdc * 1_000_000);
  if (amountMicro <= 0) throw new Error('Repay amount too small after micro conversion.');

  let payRecord = tokenRecord ?? null;
  if (!payRecord) {
    payRecord = await getSuitableUsdcTokenRecord(requestRecords, amountMicro, publicKey, decrypt);
  }
  if (!payRecord) {
    throw new Error(
      'No USDCx Token record covers this repay amount. Consolidate records or reduce repay.',
    );
  }

  // Match working USDC deposit/repay path: prefer plaintext Token.record (decrypt when needed),
  // then fallback to ciphertext/object only if plaintext is unavailable.
  if (!payRecord?.plaintext && decrypt) {
    const cipher = getUsdcRecordCipher(payRecord);
    if (cipher) {
      try {
        const plain = await decrypt(cipher);
        if (plain && typeof plain === 'string' && plain.trim()) {
          payRecord.plaintext = plain;
        }
      } catch {
        // keep fallback behavior below
      }
    }
  }
  const tokenInput = getUsdcTokenInputForTransition(payRecord);
  if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
    throw new Error(
      'USDC Token record has no ciphertext or plaintext. Ensure the record is from test_usdcx_stablecoin.aleo.',
    );
  }
  const proofBundle = await getUsdcMerkleProofsInput(payRecord, proofs);
  const proofsLiteral = proofBundle.literal;
  const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;

  const tokenRecords = await requestRecords(USDC_TOKEN_PROGRAM, false);
  const tokenIdx = findWalletRecordIndexInList(tokenRecords, payRecord);

  try {
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'flash_settle_with_usdcx',
      inputs: [tokenInput, `${amountMicro}u64`, strategyIdField, proofsLiteral],
      fee: feeMicro,
      privateFee: false,
      recordIndices: tokenIdx >= 0 ? [tokenIdx] : [0],
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('flash_settle_with_usdcx failed: no transactionId returned.');
    return txId;
  } catch (error: any) {
    console.error('[USDC flash settle] Raw error:', error?.message ?? error, error);
    return handleUsdcTxError(error, 'USDC flash settle');
  }
}

/**
 * Settle flash with USAD (`flash_settle_with_usad`): Token + Merkle proofs, same profit gate as credits path.
 */
export async function lendingFlashSettleWithUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  repayUsad: number,
  strategyIdField: string,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
  tokenRecord?: any | null,
  proofs?: [string, string] | string,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access unavailable for settle.');
  }
  if (!isFieldLiteral(strategyIdField)) {
    throw new Error("Invalid strategy id. Must be Leo field literal (example: '1field').");
  }
  if (!Number.isFinite(repayUsad) || repayUsad <= 0) {
    throw new Error('Repay amount must be > 0.');
  }
  const amountMicro = Math.round(repayUsad * 1_000_000);
  if (amountMicro <= 0) throw new Error('Repay amount too small after micro conversion.');

  let payRecord = tokenRecord ?? null;
  if (!payRecord) {
    payRecord = await getSuitableUsadTokenRecord(requestRecords, amountMicro, publicKey, decrypt);
  }
  if (!payRecord) {
    throw new Error(
      'No USAD Token record covers this repay amount. Consolidate records or reduce repay.',
    );
  }

  // Match working USAD deposit/repay path: prefer plaintext Token.record (decrypt when needed).
  if (!payRecord?.plaintext && decrypt) {
    const cipher = getUsdcRecordCipher(payRecord);
    if (cipher) {
      try {
        const plain = await decrypt(cipher);
        if (plain && typeof plain === 'string' && plain.trim()) {
          payRecord.plaintext = plain;
        }
      } catch {
        // keep fallback behavior below
      }
    }
  }
  const tokenInput = getUsadTokenInputForTransition(payRecord);
  if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
    throw new Error(
      'USAD Token record has no ciphertext or plaintext. Ensure the record is from test_usad_stablecoin.aleo.',
    );
  }
  const proofBundle = await getUsadMerkleProofsInput(payRecord, proofs, publicKey);
  const proofsLiteral = proofBundle.literal;
  const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;

  const tokenRecords = await requestRecords(USAD_TOKEN_PROGRAM, false);
  const tokenIdx = findWalletRecordIndexInList(tokenRecords, payRecord);

  try {
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'flash_settle_with_usad',
      inputs: [tokenInput, `${amountMicro}u64`, strategyIdField, proofsLiteral],
      fee: feeMicro,
      privateFee: false,
      recordIndices: tokenIdx >= 0 ? [tokenIdx] : [0],
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('flash_settle_with_usad failed: no transactionId returned.');
    return txId;
  } catch (error: any) {
    console.error('[USAD flash settle] Raw error:', error?.message ?? error);
    return handleUsadTxError(error, 'USAD flash settle');
  }
}

/**
 * Withdraw ALEO (xyra_lending_v8: `withdraw` with `out_asset` `0field` + LendingPosition + public oracle).
 */
export async function lendingWithdraw(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  amountMicroOverride?: bigint,
  poolProgramId: string = LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  if (!publicKey || !requestRecords) {
    throw new Error('Wallet not connected or record access (requestRecords) unavailable.');
  }
  if (amount <= 0) {
    throw new Error('Withdraw amount must be greater than 0');
  }

  try {
    const records = await requestRecords(poolProgramId, false);
    const pos = await getBestLendingPositionRecordForWithdrawOut(
      requestRecords,
      poolProgramId,
      decrypt,
      0,
      records,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before withdrawing.');
    }
    let recordIdx = findWalletRecordIndexInList(records, pos.walletRecord);
    if (recordIdx < 0) recordIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const amountMicro =
      amountMicroOverride != null
        ? amountMicroOverride
        : BigInt(Math.floor(Math.max(0, Number(amount)) * 1_000_000));
    if (amountMicro <= BigInt(0)) {
      throw new Error('Withdraw amount must be greater than 0');
    }
    if (amountMicro > LENDING_U64_MAX) {
      throw new Error('Withdraw amount exceeds u64.');
    }
    const bh = getWalletRecordBlockHeight(pos.walletRecord);
    const posInputKind = typeof pos.input === 'string' ? 'plaintext' : 'object';
    privacyLog(
      '[ALEO withdraw] diagnostics',
      JSON.stringify(
        {
          poolProgramId,
          amountMicro: amountMicro.toString(),
          recordIdx,
          posInputKind,
          recordBlockHeight: bh,
          maxWithdrawMicroAleoPortfolio: pos.caps?.maxWithdrawMicroAleoPortfolio?.toString(),
          maxWithdrawMicroAleo: pos.caps?.maxWithdrawMicroAleo?.toString(),
          scaledSup: {
            aleo: pos.scaled.scaledSupNative.toString(),
            usdcx: pos.scaled.scaledSupUsdcx.toString(),
            usad: pos.scaled.scaledSupUsad.toString(),
          },
          scaledBor: {
            aleo: pos.scaled.scaledBorNative.toString(),
            usdcx: pos.scaled.scaledBorUsdcx.toString(),
            usad: pos.scaled.scaledBorUsad.toString(),
          },
          oracleSup: [oracle.supIdxAleo, oracle.supIdxUsdcx, oracle.supIdxUsad].map((x) => x.toString()),
          oraclePrice: [oracle.priceAleo, oracle.priceUsdcx, oracle.priceUsad].map((x) => x.toString()),
        },
        null,
        0,
      ),
    );
    await logLendingWithdrawAuditIfEnabled(
      poolProgramId,
      'withdraw ALEO out',
      pos.scaled,
      oracle,
      amountMicro,
      '0field',
    );
    const { recordIdx: spendIdx } = await refreshLendingPositionRecordIndex(
      requestRecords,
      poolProgramId,
      pos.walletRecord,
      recordIdx,
    );
    const inputs = lendingWithdrawProgramInputs(pos.input, amountMicro, '0field', oracle);

    privacyLog('🔍 Calling executeTransaction for withdraw (public fee)...');
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'withdraw',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [spendIdx],
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Withdraw failed: No temporary transactionId returned from wallet.');
    }

    privacyLog('Temporary Transaction ID (withdraw):', tempId);
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING WITHDRAW FUNCTION FAILED:', error?.message ?? error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Withdraw transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Withdraw transaction failed: ${error?.message || 'Unknown error'}`);
  }
}

// --- USDC Pool (`NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID`, or same as main lending pool when unset) ---
// Contract: deposit(token, amount, proofs), repay(token, amount, proofs),
//           withdraw(public amount), borrow(public amount).
// - deposit/repay: 3 inputs — token, amount (micro-USDC), proofs. Block height is read on-chain.
// - withdraw/borrow: 1 input — amount (micro-USDC). Backend sends USDCx from vault to user.
// Amount in program is micro-USDC (1 USDC = 1_000_000). RPC accepts human USDC and converts to micro for transitions.
const USDC_TOKEN_PROGRAM = USDC_TOKEN_PROGRAM_ID;
const USDC_FREEZELIST_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USDCX_FREEZELIST_PROGRAM_ID || 'test_usdcx_freezelist.aleo';

// --- USAD Pool (lending_pool_usad_v17.aleo) ---
const USAD_TOKEN_PROGRAM = USAD_TOKEN_PROGRAM_ID;
const USAD_FREEZELIST_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USADX_FREEZELIST_PROGRAM_ID || 'test_usad_freezelist.aleo';

/**
 * Static Merkle proof pair for USDCx deposit/repay fallback.
 * Sourced from `programusdc/inputs/deposit_proofs.in`.
 */
const DEFAULT_USDC_MERKLE_PROOFS =
  '[{ siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }, { siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }]';

/**
 * Single-line Leo literal for wallets (test_transfer_usdcx v3/v4, lending pools with stablecoin MerkleProof).
 * Rejects accidental paste of .aleo IR — that produces errors like:
 * "Failed to parse string ... Remaining invalid string is: \"input r2 as [test_usdcx_stablecoin.aleo/MerkleProof; 2u32]..."
 */
function normalizeMerkleProofLiteralForWallet(s: string, label: string): string {
  const t = String(s).trim().replace(/\s+/g, ' ');
  if (t.length > 12_000) {
    throw new Error(
      `${label}: Merkle proof string is too long (${t.length} chars). Expected a compact Leo literal (two MerkleProof structs).`,
    );
  }
  const looksLikeProgramIr =
    (t.includes('input r0 as') || t.includes('input r2 as') || t.includes('function deposit')) &&
    (t.includes('finalize ') || t.includes('program ') || t.includes('constructor'));
  if (looksLikeProgramIr) {
    throw new Error(
      `${label}: The proof field contains Aleo program text, not a Merkle proof. ` +
        'Pass only a Leo literal like [{ siblings: [0field,...], leaf_index: 1u32 }, { ... }]. ' +
        'Do not paste build/main.aleo or deployment IR into the proof input.',
    );
  }
  if (!t.startsWith('[') || !t.includes('siblings') || !t.includes('leaf_index')) {
    throw new Error(
      `${label}: Merkle proof must be a Leo array of two structs with siblings and leaf_index.`,
    );
  }
  return t;
}

function encodeUsdcProofPair(proofs: any): string | null {
  if (typeof proofs === 'string') {
    const s = proofs.trim();
    if (s.startsWith('[') && s.includes('siblings')) return s;
    return null;
  }
  if (!Array.isArray(proofs) || proofs.length < 2) return null;
  const raw = [proofs[0], proofs[1]].map((p) => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));
  if (!raw[0] || !raw[1] || !raw[0].includes('siblings') || !raw[1].includes('siblings')) return null;
  return `[${raw[0]}, ${raw[1]}]`;
}

async function getFreezeListIndex0(): Promise<string | null> {
  try {
    // NullPay method: use AleoNetworkClient for freeze_list_index mapping.
    const { AleoNetworkClient } = await import('@provablehq/sdk');
    const client = new AleoNetworkClient('https://api.provable.com/v1');
    const mappingValue = await client.getProgramMappingValue(
      USDC_FREEZELIST_PROGRAM_ID,
      'freeze_list_index',
      '0u32',
    );
    return mappingValue ? String(mappingValue).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getFreezeListRoot(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USDC_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_root/1u8`,
    );
    if (!response.ok) return null;
    const value = await response.json();
    return value ? String(value).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getFreezeListCount(): Promise<number> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USDC_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_last_index/true`,
    );
    if (!response.ok) return 0;
    const value = await response.json();
    const parsed = parseInt(String(value).replace('u32', '').replace(/["']/g, ''), 10);
    return Number.isFinite(parsed) ? parsed + 1 : 0;
  } catch {
    return 0;
  }
}

async function generateFreezeListProof(targetIndex: number = 1, occupiedLeafValue?: string): Promise<string> {
  try {
    // NullPay method: direct import from @provablehq/wasm.
    const { Poseidon4, Field } = await import('@provablehq/wasm');

    const hasher = new Poseidon4();

    // Precompute empty hashes for each level.
    const emptyHashes: string[] = [];
    let currentEmpty = '0field';
    for (let i = 0; i < 16; i++) {
      emptyHashes.push(currentEmpty);
      const f = Field.fromString(currentEmpty);
      const nextHashField = hasher.hash([f, f]);
      currentEmpty = nextHashField.toString();
    }

    let currentHash = '0field';
    let currentIndex = targetIndex;
    const siblings: string[] = [];

    const normalizeFieldLiteral = (v: string): string => {
      const t = String(v).trim();
      // Expect Leo field literals like "123field". If we get a bare number, append "field".
      return t.endsWith('field') ? t : `${t}field`;
    };

    for (let level = 0; level < 16; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      let siblingHash = emptyHashes[level];
      if (level === 0 && siblingIndex === 0 && occupiedLeafValue) {
        siblingHash = occupiedLeafValue;
      }
      siblings.push(normalizeFieldLiteral(siblingHash));

      const fCurrent = Field.fromString(currentHash);
      const fSibling = Field.fromString(normalizeFieldLiteral(siblingHash));
      const input = isLeft ? [fCurrent, fSibling] : [fSibling, fCurrent];
      const nextHashField = hasher.hash(input);
      currentHash = nextHashField.toString();
      currentIndex = Math.floor(currentIndex / 2);
    }

    return `{ siblings: [${siblings.join(', ')}], leaf_index: ${targetIndex}u32 }`;
  } catch (e: any) {
    privacyWarn('Merkle Proof Generation Warning (using fallback):', e?.message || e);
    const s = Array(16).fill('0field').join(', ');
    return `{ siblings: [${s}], leaf_index: ${targetIndex}u32 }`;
  }
}

async function generateNullPayStyleUsdcProofPair(): Promise<string> {
  // Match NullPay flow: fetch freeze-list state before generating proofs.
  const [root, count, index0] = await Promise.all([
    getFreezeListRoot(),
    getFreezeListCount(),
    getFreezeListIndex0(),
  ]);
  let index0Field: string | undefined = undefined;
  if (index0) {
    try {
      const { Address } = await import('@provablehq/wasm');
      const addr = Address.from_string(index0);
      const grp = addr.toGroup();
      index0Field = grp.toXCoordinate().toString();
    } catch (e: any) {
      privacyWarn('[USDC proofs] Failed to convert freeze_list_index[0] address to field:', e?.message || e);
    }
  }
  privacyLog(
    `[USDC proofs] Freeze-list state -> root: ${root ?? 'null'}, count: ${count}, index[0]: ${index0 ?? 'null'}, index0Field: ${index0Field ?? 'null'}`,
  );
  const proof = await generateFreezeListProof(1, index0Field);
  return `[${proof}, ${proof}]`;
}

async function getUsdcMerkleProofsInput(
  tokenRecord: any,
  proofs?: [string, string] | string
): Promise<MerkleProofBuildResult> {
  const mk = (s: string, source: string): MerkleProofBuildResult => ({
    literal: normalizeMerkleProofLiteralForWallet(s, '[USDC proofs]'),
    source,
  });

  // 1) Prefer explicit proofs passed to function.
  const explicit = encodeUsdcProofPair(proofs);
  if (explicit) return mk(explicit, 'explicit-arg');

  // 2) Try common proof fields from wallet/token record payload.
  const candidates = [
    tokenRecord?.proofs,
    tokenRecord?.merkleProofs,
    tokenRecord?.merkle_proofs,
    tokenRecord?.proof,
    tokenRecord?.data?.proofs,
    tokenRecord?.data?.merkleProofs,
    tokenRecord?.data?.merkle_proofs,
    tokenRecord?.data?.proof,
  ];
  for (const c of candidates) {
    const encoded = encodeUsdcProofPair(c);
    if (encoded) return mk(encoded, 'record-field');
  }

  // 3) Last-chance parse when record payload itself is JSON string containing proofs.
  if (typeof tokenRecord === 'string' && tokenRecord.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(tokenRecord);
      const fromParsed = await getUsdcMerkleProofsInput(parsed, proofs);
      return { ...fromParsed, source: `parsed-token-string:${fromParsed.source}` };
    } catch {
      // ignore and fall through
    }
  }

  // 4) NullPay-style fallback: derive proofs from freeze-list tree in browser.
  try {
    const generated = await generateNullPayStyleUsdcProofPair();
    privacyLog(
      '[USDC proofs] Wallet record had no proofs; using NullPay-style generated freeze-list proof pair.',
    );
    return mk(generated, 'generated-nullpay');
  } catch (fallbackErr: any) {
    privacyWarn(
      '[USDC proofs] Dynamic fallback generation failed, using static deposit_proofs.in pair:',
      fallbackErr?.message || fallbackErr,
    );
    return mk(DEFAULT_USDC_MERKLE_PROOFS, 'static-default');
  }
}

/**
 * Static Merkle proof pair for USAD deposit/repay fallback.
 *
 * We follow the same NullPay-style "empty sibling" proof shape used for USDC,
 * but with leaf_index=1u32 (empty side of a tree where index 0 is occupied).
 */
const DEFAULT_USAD_MERKLE_PROOFS =
  '[{ siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }, { siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field], leaf_index: 1u32 }]';

function encodeUsadProofPair(proofs: any): string | null {
  const toFieldLiteral = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const t = v.trim().replace(/^["']|["']$/g, '');
      if (!t) return null;
      if (t.endsWith('field')) return t;
      if (/^\d+$/.test(t)) return `${t}field`;
      return null;
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
      return `${v}field`;
    }
    if (typeof v === 'object') {
      if ('value' in v) return toFieldLiteral((v as any).value);
      if ('field' in v) return toFieldLiteral((v as any).field);
    }
    return null;
  };

  const toU32Literal = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const t = v.trim().replace(/^["']|["']$/g, '');
      if (!t) return null;
      if (t.endsWith('u32')) return t;
      if (/^\d+$/.test(t)) return `${t}u32`;
      return null;
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
      return `${v}u32`;
    }
    if (typeof v === 'object' && 'value' in v) return toU32Literal((v as any).value);
    return null;
  };

  const proofToLeo = (p: any): string | null => {
    if (p == null) return null;
    if (typeof p === 'string') {
      const s = p.trim();
      // Accept already-serialized Leo proof literals.
      if (s.startsWith('{') && s.includes('siblings') && s.includes('leaf_index')) return s;
      // Some wallets might return JSON-stringified objects.
      if (s.startsWith('{') && s.includes('siblings')) {
        try {
          const parsed = JSON.parse(s);
          return proofToLeo(parsed);
        } catch {
          return null;
        }
      }
      return null;
    }
    if (typeof p === 'object') {
      const siblingsRaw = (p as any).siblings ?? (p as any).sibling ?? null;
      const leafRaw = (p as any).leaf_index ?? (p as any).leafIndex ?? null;
      if (!Array.isArray(siblingsRaw) || siblingsRaw.length !== 16) return null;
      const siblings = siblingsRaw.map(toFieldLiteral);
      if (siblings.some((x) => x == null)) return null;
      const leaf = toU32Literal(leafRaw);
      if (!leaf) return null;
      return `{ siblings: [${(siblings as string[]).join(', ')}], leaf_index: ${leaf} }`;
    }
    return null;
  };

  if (typeof proofs === 'string') {
    const s = proofs.trim();
    // If it's already a Leo array literal like: [{...}, {...}]
    if (s.startsWith('[') && s.includes('siblings') && s.includes('leaf_index')) return s;
    // Try parsing JSON array/string.
    try {
      const parsed = JSON.parse(s);
      return encodeUsadProofPair(parsed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(proofs) || proofs.length < 2) return null;
  const p0 = proofToLeo(proofs[0]);
  const p1 = proofToLeo(proofs[1]);
  if (!p0 || !p1) return null;
  return `[${p0}, ${p1}]`;
}

async function getUsadFreezeListIndex0(): Promise<string | null> {
  try {
    // NullPay method: use AleoNetworkClient for freeze_list_index mapping.
    const { AleoNetworkClient } = await import('@provablehq/sdk');
    const client = new AleoNetworkClient('https://api.provable.com/v1');
    const mappingValue = await client.getProgramMappingValue(
      USAD_FREEZELIST_PROGRAM_ID,
      'freeze_list_index',
      '0u32',
    );
    return mappingValue ? String(mappingValue).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getUsadFreezeListRoot(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USAD_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_root/1u8`,
    );
    if (!response.ok) return null;
    const value = await response.json();
    return value ? String(value).replace(/["']/g, '') : null;
  } catch {
    return null;
  }
}

async function getUsadFreezeListCount(): Promise<number> {
  try {
    const response = await fetch(
      `https://api.provable.com/v2/testnet/program/${USAD_FREEZELIST_PROGRAM_ID}/mapping/freeze_list_last_index/true`,
    );
    if (!response.ok) return 0;
    const value = await response.json();
    const parsed = parseInt(String(value).replace('u32', '').replace(/["']/g, ''), 10);
    return Number.isFinite(parsed) ? parsed + 1 : 0;
  } catch {
    return 0;
  }
}

async function generateNullPayStyleUsadProofPair(): Promise<string> {
  const [root, count, index0] = await Promise.all([
    getUsadFreezeListRoot(),
    getUsadFreezeListCount(),
    getUsadFreezeListIndex0(),
  ]);

  let index0Field: string | undefined = undefined;
  if (index0) {
    try {
      const { Address } = await import('@provablehq/wasm');
      const addr = Address.from_string(index0);
      const grp = addr.toGroup();
      index0Field = grp.toXCoordinate().toString();
    } catch (e: any) {
      privacyWarn('[USAD proofs] Failed to convert freeze_list_index[0] address to field:', e?.message || e);
    }
  }

  privacyLog(
    `[USAD proofs] Freeze-list state -> root: ${root ?? 'null'}, count: ${count}, index[0]: ${index0 ?? 'null'}, index0Field: ${index0Field ?? 'null'}`,
  );

  const proof = await generateFreezeListProof(1, index0Field);
  return `[${proof}, ${proof}]`;
}

/** Default freeze leaf when the on-chain list is empty (Veiled Markets / Sealance convention). */
const USAD_FREEZE_DEFAULT_ZERO_ADDRESS =
  'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

/**
 * Depth for SealanceMerkleTree — must match stablecoin `MerkleProof` sibling count ([field; 16] => depth 16).
 */
const USAD_SEALANCE_TREE_DEPTH = 16;

/**
 * Load all addresses currently in the USAD freeze list (mapping `freeze_list_index`).
 * Falls back to the canonical zero address when empty (same as Veiled Markets default list).
 */
async function fetchUsadFreezeListAddresses(): Promise<string[]> {
  const count = await getUsadFreezeListCount();
  if (count <= 0) {
    return [USAD_FREEZE_DEFAULT_ZERO_ADDRESS];
  }
  try {
    const { AleoNetworkClient } = await import('@provablehq/sdk');
    const client = new AleoNetworkClient('https://api.provable.com/v1');
    const addresses: string[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const mappingValue = await client.getProgramMappingValue(
          USAD_FREEZELIST_PROGRAM_ID,
          'freeze_list_index',
          `${i}u32`,
        );
        const raw = mappingValue ? String(mappingValue).replace(/["']/g, '').trim() : '';
        if (raw.startsWith('aleo1')) {
          addresses.push(raw);
        }
      } catch {
        /* skip missing slot */
      }
    }
    return addresses.length > 0 ? addresses : [USAD_FREEZE_DEFAULT_ZERO_ADDRESS];
  } catch (e: any) {
    privacyWarn('[USAD proofs] fetchUsadFreezeListAddresses failed:', e?.message || e);
    return [USAD_FREEZE_DEFAULT_ZERO_ADDRESS];
  }
}

/**
 * Veiled Markets–style non-inclusion proofs: @provablehq/sdk `SealanceMerkleTree` over the live freeze list,
 * bounded to `ownerAddress`. Matches token program verification when the tree layout is Sealance-compatible.
 */
async function generateSealanceUsadProofPair(ownerAddress: string): Promise<string> {
  const { SealanceMerkleTree } = await import('@provablehq/sdk');
  const sealance = new SealanceMerkleTree();
  const freezeListAddresses = await fetchUsadFreezeListAddresses();
  const leaves = sealance.generateLeaves(freezeListAddresses, USAD_SEALANCE_TREE_DEPTH);
  const tree = sealance.buildTree(leaves);
  const [leftIdx, rightIdx] = sealance.getLeafIndices(tree, ownerAddress);
  const leftProof = sealance.getSiblingPath(tree, leftIdx, USAD_SEALANCE_TREE_DEPTH);
  const rightProof = sealance.getSiblingPath(tree, rightIdx, USAD_SEALANCE_TREE_DEPTH);
  const formatted = sealance.formatMerkleProof([leftProof, rightProof]);
  privacyLog(
    `[USAD proofs] SealanceMerkleTree pair for ${ownerAddress.slice(0, 12)}… (freeze entries: ${freezeListAddresses.length})`,
  );
  return formatted;
}

/** Parse `owner: aleo1…` from decrypted Token plaintext when caller did not pass wallet address. */
function extractAleoOwnerFromUsadTokenRecord(tokenRecord: any): string | null {
  const pt = tokenRecord?.plaintext ?? tokenRecord?.data?.plaintext;
  if (typeof pt !== 'string') return null;
  const m = pt.match(/owner\s*:\s*(aleo1[a-z0-9]+)/);
  return m ? m[1] : null;
}

async function getUsadMerkleProofsInput(
  tokenRecord: any,
  proofs?: [string, string] | string,
  ownerAddress?: string | null,
): Promise<MerkleProofBuildResult> {
  const mk = (s: string, source: string): MerkleProofBuildResult => ({
    literal: normalizeMerkleProofLiteralForWallet(s, '[USAD proofs]'),
    source,
  });

  // 1) Prefer explicit proofs passed to function.
  const explicit = encodeUsadProofPair(proofs);
  if (explicit) return mk(explicit, 'explicit-arg');

  // 2) Try common proof fields from wallet/token record payload.
  const candidates = [
    tokenRecord?.proofs,
    tokenRecord?.merkleProofs,
    tokenRecord?.merkle_proofs,
    tokenRecord?.proof,
    tokenRecord?.data?.proofs,
    tokenRecord?.data?.merkleProofs,
    tokenRecord?.data?.merkle_proofs,
    tokenRecord?.data?.proof,
  ];
  for (const c of candidates) {
    const encoded = encodeUsadProofPair(c);
    if (encoded) return mk(encoded, 'record-field');
  }

  // 3) Last-chance parse when record payload itself is JSON string containing proofs.
  if (typeof tokenRecord === 'string' && tokenRecord.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(tokenRecord);
      const fromParsed = await getUsadMerkleProofsInput(parsed, proofs, ownerAddress);
      return { ...fromParsed, source: `parsed-token-string:${fromParsed.source}` };
    } catch {
      // fall through
    }
  }

  // 4) Veiled Markets / Sealance: non-inclusion proofs for this wallet over the live freeze list.
  const resolvedOwner =
    (ownerAddress && String(ownerAddress).trim()) || extractAleoOwnerFromUsadTokenRecord(tokenRecord);
  if (resolvedOwner) {
    try {
      const generated = await generateSealanceUsadProofPair(resolvedOwner);
      privacyLog('[USAD proofs] Using SealanceMerkleTree (Veiled Markets–style) proof pair.');
      return mk(generated, 'sealance-generated');
    } catch (sealanceErr: any) {
      privacyWarn(
        '[USAD proofs] SealanceMerkleTree failed, trying NullPay-style fallback:',
        sealanceErr?.message || sealanceErr,
      );
    }
  } else {
    privacyWarn(
      '[USAD proofs] No wallet address for Sealance proofs; pass owner address or ensure Token plaintext has owner. Trying NullPay-style fallback.',
    );
  }

  // 5) NullPay-style fallback: simplified Poseidon tree (browser).
  try {
    const generated = await generateNullPayStyleUsadProofPair();
    privacyLog('[USAD proofs] Wallet record had no proofs; using NullPay-style generated proof pair.');
    return mk(generated, 'generated-nullpay');
  } catch (fallbackErr: any) {
    privacyWarn(
      '[USAD proofs] Dynamic fallback generation failed, using static deposit_proofs.in pair:',
      fallbackErr?.message || fallbackErr,
    );
    return mk(DEFAULT_USAD_MERKLE_PROOFS, 'static-default');
  }
}

/**
 * USAD private record format (from chain/wallet):
 * { programName, recordName: "Token", recordCiphertext, spent, owner, commitment, tag, ... }
 *
 * For USAD, we expect the same Token record shape as USDCx, only bound to a different token program.
 */
function isUsadTokenRecord(rec: any): boolean {
  const programId = (rec?.program_id ?? rec?.programId ?? rec?.programName ?? '').toString();
  const recordName = (rec?.recordName ?? rec?.record_name ?? rec?.data?.recordName ?? '').toString();
  const isToken = recordName === 'Token' || (!recordName && (rec?.recordCiphertext ?? rec?.record_ciphertext));
  return (programId === USAD_TOKEN_PROGRAM || programId.includes('test_usad_stablecoin')) && (isToken || !!rec?.recordCiphertext);
}

/**
 * Build the token record value for transition input #0 (deposit/repay).
 * Prefer plaintext so the wallet can parse it as test_usad_stablecoin.aleo/Token.record.
 */
function getUsadTokenInputForTransition(record: any): string | any {
  if (record?.plaintext && typeof record.plaintext === 'string') {
    const pt = record.plaintext.trim();
    if (pt) return pt;
  }
  // Fallback to ciphertext-only, using the same generic ciphertext extractor used for USDC.
  const cipher = getUsdcRecordCipher(record);
  if (cipher) return cipher;
  if (record && typeof record === 'object') return record;
  return '';
}

/**
 * USDCx private record format (from chain/wallet):
 * { programName, recordName: "Token", recordCiphertext, spent, owner, commitment, tag, ... }
 * Amount is inside recordCiphertext (encrypted); we accept unspent Token records and pass to program.
 */
function isUsdcTokenRecord(rec: any): boolean {
  const programId = (rec?.program_id ?? rec?.programId ?? rec?.programName ?? '').toString();
  const recordName = (rec?.recordName ?? rec?.record_name ?? rec?.data?.recordName ?? '').toString();
  const isToken = recordName === 'Token' || (!recordName && (rec?.recordCiphertext ?? rec?.record_ciphertext));
  return (programId === USDC_TOKEN_PROGRAM || programId.includes('test_usdcx_stablecoin')) && (isToken || !!rec?.recordCiphertext);
}

/**
 * Returns the raw record ciphertext for use as transition input.
 * Wallets typically expect the canonical Aleo record form (ciphertext string, e.g. "record1q..."),
 * not JSON. Use this for deposit/repay input #0 to avoid "Failed to parse input #0 (Token.record)".
 */
export function getUsdcRecordCipher(record: any): string {
  if (record == null) return '';
  if (typeof record === 'string') {
    const t = record.trim();
    if (t.startsWith('record1')) return t;
    if (t.startsWith('{')) {
      try {
        const o = JSON.parse(t);
        return getUsdcRecordCipher(o);
      } catch {
        return '';
      }
    }
    return t;
  }
  const ciphertext = record.recordCiphertext ?? record.record_ciphertext ?? record.ciphertext;
  return typeof ciphertext === 'string' ? ciphertext.trim() : '';
}

/**
 * Build the token record value for transition input #0 (deposit/repay).
 * Prefer plaintext so the wallet can parse it as test_usdcx_stablecoin.aleo/Token.record (NullPay pattern).
 * Ciphertext often fails with "Failed to parse input #0 (Token.record)".
 */
function getUsdcTokenInputForTransition(record: any): string | any {
  if (record?.plaintext && typeof record.plaintext === 'string') {
    const pt = record.plaintext.trim();
    if (pt) return pt;
  }
  const cipher = getUsdcRecordCipher(record);
  if (cipher) return cipher;
  if (record && typeof record === 'object') return record;
  return '';
}

/**
 * Format USDC Token record for transition input #0.
 * Prefer getUsdcRecordCipher(record) so the wallet receives raw ciphertext (canonical Token.record form).
 * This helper can return JSON for wallets that expect it; currently we use ciphertext-only to fix parse errors.
 */
export function formatUsdcRecordForInput(record: any): string {
  return getUsdcRecordCipher(record);
}

/**
 * Parse amount from a record field (string like "100u128.private" or number).
 */
function parseUsdcAmount(amt: unknown): bigint | null {
  if (amt === undefined || amt === null) return null;
  if (typeof amt === 'number') return BigInt(amt);
  if (typeof amt === 'string') {
    const match = amt.match(/^(\d+)/);
    return match ? BigInt(match[1]) : null;
  }
  return null;
}

/** Parse amount from Token record plaintext string (e.g. "amount: 0u128.private" or "amount: 100u128"). */
export function parseUsdcAmountFromPlaintext(plaintext: string): bigint | null {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const match = plaintext.match(/amount:\s*(\d+)u128/);
  return match ? BigInt(match[1]) : null;
}

/**
 * Resolve Token record balance in micro-units (u128 on-chain). Used so we never pick a record that
 * cannot cover `transfer_private_to_public` (would fail with u128 underflow, e.g. 7500 - 10000).
 */
async function getTokenRecordAmountMicroUsdc(
  rec: any,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<bigint | null> {
  const amt =
    rec?.data?.amount ??
    rec?.amount ??
    rec?.data?.amount_ ??
    (rec?.data && typeof rec.data === 'object' && (rec.data as any).amount);
  let val = parseUsdcAmount(amt);
  if (val !== null) return val;
  if (rec?.plaintext && typeof rec.plaintext === 'string') {
    val = parseUsdcAmountFromPlaintext(rec.plaintext);
    if (val !== null) return val;
  }
  const cipher = rec?.recordCiphertext ?? rec?.record_ciphertext ?? rec?.ciphertext;
  if (cipher && decrypt) {
    try {
      const plain = await decrypt(cipher);
      if (plain) return parseUsdcAmountFromPlaintext(plain);
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Get total private USDC balance (test_usdcx_stablecoin.aleo Token records) in human USDC.
 * Sums amount from all unspent Token records; uses decrypt for encrypted records.
 * Returns 0 if no records or on error.
 */
export async function getPrivateUsdcBalance(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<number> {
  try {
    const records = await requestRecords(USDC_TOKEN_PROGRAM, false);
    if (!records || !Array.isArray(records)) return 0;
    let totalMicro = BigInt(0);
    for (const rec of records as any[]) {
      if (rec?.spent === true || rec?.data?.spent === true) continue;
      if (!isUsdcTokenRecord(rec)) continue;
      let val: bigint | null = parseUsdcAmount(
        rec?.data?.amount ?? rec?.amount ?? (rec?.data && (rec.data as any).amount)
      );
      if (val === null && (rec.plaintext || (rec.recordCiphertext ?? rec.record_ciphertext)) && decrypt) {
        try {
          const plain = rec.plaintext || await decrypt(rec.recordCiphertext || rec.record_ciphertext);
          if (plain) val = parseUsdcAmountFromPlaintext(plain);
        } catch {
          // skip
        }
      }
      if (val != null && val > BigInt(0)) totalMicro += val;
    }
    return Number(totalMicro) / 1_000_000;
  } catch {
    return 0;
  }
}

/**
 * Get total private USAD balance (test_usad_stablecoin.aleo Token records) in human USAD.
 * Mirrors getPrivateUsdcBalance but queries the USAD token program.
 */
export async function getPrivateUsadBalance(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<number> {
  try {
    const records = await requestRecords(USAD_TOKEN_PROGRAM, false);
    if (!records || !Array.isArray(records)) return 0;
    let totalMicro = BigInt(0);
    for (const rec of records as any[]) {
      if (rec?.spent === true || rec?.data?.spent === true) continue;
      if (!isUsadTokenRecord(rec)) continue;
      let val: bigint | null = parseUsdcAmount(
        rec?.data?.amount ?? rec?.amount ?? (rec?.data && (rec.data as any).amount),
      );
      if (
        val === null &&
        (rec.plaintext || (rec.recordCiphertext ?? rec.record_ciphertext)) &&
        decrypt
      ) {
        try {
          const plain =
            rec.plaintext || (await decrypt(rec.recordCiphertext || rec.record_ciphertext));
          if (plain) val = parseUsdcAmountFromPlaintext(plain);
        } catch {
          // skip
        }
      }
      if (val != null && val > BigInt(0)) totalMicro += val;
    }
    return Number(totalMicro) / 1_000_000;
  } catch {
    return 0;
  }
}

/** Get latest block height from chain (for USDC pool: prefer records from latest block). */
export async function getLatestBlockHeight(): Promise<number> {
  const toNum = (v: any): number => {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'bigint') {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof v === 'object' && v !== null) {
      const n = v.result ?? v.height ?? v.block_height ?? v.value;
      return toNum(n);
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const logPrefix = '[getLatestBlockHeight]';

  try {
    const h = await client.request('latest/height', {});
    const n = toNum(h);
    if (n > 0) {
      if (typeof window !== 'undefined') {
        console.debug(`${logPrefix} OK via JSON-RPC client`, { raw: h, height: n, url: CURRENT_RPC_URL });
      }
      return n;
    }
    console.warn(`${logPrefix} client returned non-positive height`, { raw: h, parsed: n, url: CURRENT_RPC_URL });
  } catch (e: any) {
    console.warn(`${logPrefix} latest/height (client) failed`, {
      message: e?.message ?? String(e),
      url: CURRENT_RPC_URL,
    });
    try {
      const h = await client.request('getLatestBlockHeight', {});
      const n = toNum(h);
      if (n > 0) {
        console.debug(`${logPrefix} OK via getLatestBlockHeight`, { raw: h, height: n });
        return n;
      }
    } catch (e2: any) {
      console.warn(`${logPrefix} getLatestBlockHeight failed`, { message: e2?.message ?? String(e2) });
    }
  }

  // Direct fetch: same endpoint as the JSON-RPC client (avoids rare client parsing quirks; clearer errors in DevTools).
  try {
    const res = await fetch(CURRENT_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'height-fallback',
        method: 'latest/height',
        params: {},
      }),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.error(`${logPrefix} fetch: non-JSON body`, { status: res.status, text: text.slice(0, 200) });
      return 0;
    }
    if (!res.ok) {
      console.error(`${logPrefix} fetch: HTTP error`, { status: res.status, body: json });
      return 0;
    }
    if (json.error) {
      console.error(`${logPrefix} fetch: JSON-RPC error`, json.error);
      return 0;
    }
    const n = toNum(json.result);
    if (n > 0) {
      console.debug(`${logPrefix} OK via fetch fallback`, { height: n, url: CURRENT_RPC_URL });
    } else {
      console.warn(`${logPrefix} fetch: unexpected result`, { result: json.result, full: json });
    }
    return n;
  } catch (e: any) {
    console.error(`${logPrefix} fetch fallback failed (CORS or network?)`, {
      message: e?.message ?? String(e),
      url: CURRENT_RPC_URL,
    });
    return 0;
  }
}

/** @deprecated use getWalletRecordBlockHeight — kept for USDC token helpers */
function getUsdcRecordBlockHeight(rec: any): number | null {
  return getWalletRecordBlockHeight(rec);
}

/**
 * Fetch a USDCx Token record from the wallet with balance >= amount.
 * Supports chain format: { programName, recordName: "Token", recordCiphertext, spent, ... } (amount in ciphertext).
 * Returns the record object; use formatUsdcRecordForInput(record) for the transition input if needed.
 *
 * **One record must cover the full deposit/repay**: the stablecoin debits a single Token record. If your
 * balance is split across multiple records, consolidate (e.g. private transfer to self) first.
 * Pass `decrypt` so encrypted amounts can be verified; without it, records without plaintext may be skipped.
 */
export async function getSuitableUsdcTokenRecord(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  amount: number,
  _publicKey: string,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<any | null> {
  const amountU128 = BigInt(amount);
  const logPrefix = '[getSuitableUsdcTokenRecord]';

  privacyLog(`${logPrefix} Requesting records for program: ${USDC_TOKEN_PROGRAM}, amount required: ${amount} (micro units u64)`);

  let records: any[];
  try {
    records = await requestRecords(USDC_TOKEN_PROGRAM, false);
  } catch (e: any) {
    console.error(`${logPrefix} requestRecords threw:`, e?.message ?? e);
    throw e;
  }

  privacyLog(`${logPrefix} requestRecords("${USDC_TOKEN_PROGRAM}", false) returned:`, {
    isArray: Array.isArray(records),
    length: records?.length ?? 0,
  });

  if (!records || !Array.isArray(records)) {
    privacyWarn(`${logPrefix} No records array (got ${records})`);
    return null;
  }

  if (records.length === 0) {
    privacyWarn(`${logPrefix} Zero records for "${USDC_TOKEN_PROGRAM}". Trying requestRecords("", false) to see all programs...`);
    try {
      const allRecords = await requestRecords('', false);
      const allArr = Array.isArray(allRecords) ? allRecords : [];
      const programKey = (r: any) => r?.program_id ?? r?.programId ?? r?.programName ?? '?';
      privacyLog(`${logPrefix} requestRecords("") returned ${allArr.length} total records. Program IDs:`, allArr.map(programKey));
      const usdcFromAll = allArr.filter((r: any) => {
        const id = (r?.program_id ?? r?.programId ?? r?.programName ?? '').toString();
        return id === USDC_TOKEN_PROGRAM || id.includes('test_usdcx_stablecoin');
      });
      privacyLog(`${logPrefix} Of those, ${usdcFromAll.length} are ${USDC_TOKEN_PROGRAM}`);
      if (usdcFromAll.length > 0) {
        privacyLog(`${logPrefix} Use program "${USDC_TOKEN_PROGRAM}" in wallet record permissions / reconnect with that program.`);
      }
    } catch (e2: any) {
      privacyWarn(`${logPrefix} requestRecords("") failed:`, e2?.message ?? e2);
    }
    return null;
  }

  // USDC pool: prefer unspent records from the latest block — fetch latest height and sort by block height (latest first)
  let latestBlockHeight = 0;
  try {
    latestBlockHeight = await getLatestBlockHeight();
    if (latestBlockHeight > 0) {
      privacyLog(`${logPrefix} Latest block height: ${latestBlockHeight}; sorting records by block height (latest first).`);
    }
  } catch (e: any) {
    privacyWarn(`${logPrefix} Could not fetch latest block height:`, e?.message ?? e);
  }
  const sortedRecords = [...records].sort((a, b) => {
    const ha = getUsdcRecordBlockHeight(a) ?? 0;
    const hb = getUsdcRecordBlockHeight(b) ?? 0;
    return hb - ha; // descending: latest block first
  });
  if (latestBlockHeight > 0 && sortedRecords.length > 0) {
    const firstHeight = getUsdcRecordBlockHeight(sortedRecords[0]);
    if (firstHeight != null) {
      privacyLog(`${logPrefix} First record after sort has block height: ${firstHeight}`);
    }
  }

  privacyLog(`${logPrefix} Inspecting ${sortedRecords.length} record(s)...`);

  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    const spent = rec?.spent === true || rec?.data?.spent === true;
    const isToken = isUsdcTokenRecord(rec);
    const recHeight = getUsdcRecordBlockHeight(rec);
    privacyLog(`${logPrefix} Record[${i}]:`, {
      keys: rec ? Object.keys(rec) : [],
      program_id: rec?.program_id ?? rec?.programId ?? rec?.programName,
      recordName: rec?.recordName ?? rec?.record_name,
      block_height: recHeight,
      spent,
      isUsdcToken: isToken,
      hasRecordCiphertext: !!(rec?.recordCiphertext ?? rec?.record_ciphertext),
      dataKeys: rec?.data ? Object.keys(rec.data) : [],
      amount: rec?.data?.amount ?? rec?.amount,
      owner: rec?.data?.owner ?? rec?.owner,
    });

    if (spent) {
      privacyLog(`${logPrefix} Record[${i}] skipped (spent)`);
      continue;
    }

    if (!isToken) {
      privacyLog(`${logPrefix} Record[${i}] skipped (not a USDCx Token record)`);
      continue;
    }

    const val = await getTokenRecordAmountMicroUsdc(rec, decrypt);

    if (val === null) {
      privacyLog(
        `${logPrefix} Record[${i}] skipped (could not read amount; connect wallet decrypt or ensure record exposes plaintext)`,
      );
      continue;
    }
      if (val === BigInt(0)) {
      privacyLog(`${logPrefix} Record[${i}] skipped (amount is 0)`);
        continue;
      }
    privacyLog(`${logPrefix} Record[${i}] amount: ${String(val)} micro (need >= ${String(amountU128)}): ${val >= amountU128}`);
      if (val >= amountU128) {
      privacyLog(`${logPrefix} Using record[${i}] for deposit/repay`);
        return rec;
      }
  }

  privacyWarn(
    `${logPrefix} No single Token record holds >= ${String(amountU128)} micro. ` +
      'Total balance may be split across records — consolidate into one record (private transfer to yourself) then retry.',
  );
  return null;
}

/**
 * Fetch a USAD Token record from the wallet with balance >= amount.
 * Mirrors getSuitableUsdcTokenRecord, but queries `test_usad_stablecoin.aleo` records.
 *
 * IMPORTANT: `amount` is in micro units (u64) matching the USAD Token record amount type.
 * One record must cover the full amount — pass `decrypt` to verify encrypted balances.
 */
export async function getSuitableUsadTokenRecord(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  amount: number,
  _publicKey: string,
  decrypt?: (cipherText: string) => Promise<string>
): Promise<any | null> {
  const amountU128 = BigInt(amount);
  const logPrefix = '[getSuitableUsadTokenRecord]';

  privacyLog(
    `${logPrefix} Requesting records for program: ${USAD_TOKEN_PROGRAM}, amount required: ${amount} (micro units u64)`,
  );

  let records: any[];
  try {
    records = await requestRecords(USAD_TOKEN_PROGRAM, false);
  } catch (e: any) {
    console.error(`${logPrefix} requestRecords threw:`, e?.message ?? e);
    throw e;
  }

  privacyLog(`${logPrefix} requestRecords("${USAD_TOKEN_PROGRAM}", false) returned:`, {
    isArray: Array.isArray(records),
    length: records?.length ?? 0,
  });

  if (!records || !Array.isArray(records)) {
    privacyWarn(`${logPrefix} No records array (got ${records})`);
    return null;
  }

  if (records.length === 0) {
    privacyWarn(`${logPrefix} Zero records for "${USAD_TOKEN_PROGRAM}". Trying requestRecords("", false) to see all programs...`);
    try {
      const allRecords = await requestRecords('', false);
      const allArr = Array.isArray(allRecords) ? allRecords : [];
      const programKey = (r: any) => r?.program_id ?? r?.programId ?? r?.programName ?? '?';
      privacyLog(`${logPrefix} requestRecords("") returned ${allArr.length} total records. Program IDs:`, allArr.map(programKey));
      const usadFromAll = allArr.filter((r: any) => {
        const id = (r?.program_id ?? r?.programId ?? r?.programName ?? '').toString();
        return id === USAD_TOKEN_PROGRAM || id.includes('test_usad_stablecoin');
      });
      privacyLog(`${logPrefix} Of those, ${usadFromAll.length} are ${USAD_TOKEN_PROGRAM}`);
      if (usadFromAll.length > 0) {
        privacyLog(`${logPrefix} Use program "${USAD_TOKEN_PROGRAM}" in wallet record permissions / reconnect with that program.`);
      }
    } catch (e2: any) {
      privacyWarn(`${logPrefix} requestRecords("") failed:`, e2?.message ?? e2);
    }
    return null;
  }

  let latestBlockHeight = 0;
  try {
    latestBlockHeight = await getLatestBlockHeight();
    if (latestBlockHeight > 0) {
      privacyLog(`${logPrefix} Latest block height: ${latestBlockHeight}; sorting records by block height (latest first).`);
    }
  } catch (e: any) {
    privacyWarn(`${logPrefix} Could not fetch latest block height:`, e?.message ?? e);
  }

  const sortedRecords = [...records].sort((a, b) => {
    const ha = getUsdcRecordBlockHeight(a) ?? 0;
    const hb = getUsdcRecordBlockHeight(b) ?? 0;
    return hb - ha;
  });

  privacyLog(`${logPrefix} Inspecting ${sortedRecords.length} record(s)...`);

  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    const spent = rec?.spent === true || rec?.data?.spent === true;
    const isToken = isUsadTokenRecord(rec);
    const recHeight = getUsdcRecordBlockHeight(rec);
    privacyLog(`${logPrefix} Record[${i}]:`, {
      program_id: rec?.program_id ?? rec?.programId ?? rec?.programName,
      recordName: rec?.recordName ?? rec?.record_name,
      block_height: recHeight,
      spent,
      isUsadToken: isToken,
      hasRecordCiphertext: !!(rec?.recordCiphertext ?? rec?.record_ciphertext),
      amount: rec?.data?.amount ?? rec?.amount,
    });

    if (spent) {
      privacyLog(`${logPrefix} Record[${i}] skipped (spent)`);
      continue;
    }

    if (!isToken) {
      privacyLog(`${logPrefix} Record[${i}] skipped (not a USAD Token record)`);
      continue;
    }

    const val = await getTokenRecordAmountMicroUsdc(rec, decrypt);

    if (val === null) {
      privacyLog(
        `${logPrefix} Record[${i}] skipped (could not read amount; connect wallet decrypt or ensure record exposes plaintext)`,
      );
      continue;
    }
    if (val === BigInt(0)) {
      privacyLog(`${logPrefix} Record[${i}] skipped (amount is 0)`);
      continue;
    }
    privacyLog(`${logPrefix} Record[${i}] amount: ${String(val)} micro (need >= ${String(amountU128)}): ${val >= amountU128}`);
    if (val >= amountU128) {
      privacyLog(`${logPrefix} Using record[${i}] for deposit/repay`);
      return rec;
    }
  }

  privacyWarn(
    `${logPrefix} No single USAD Token record holds >= ${String(amountU128)} micro. ` +
      'If balance is split across records, consolidate (private transfer to self). Ensure private USAD and wallet record access.',
  );
  return null;
}

function handleUsdcTxError(error: any, action: string): string {
  const rawMsg = String(error?.message || error || '').toLowerCase();
  const isCancelled =
    rawMsg.includes('operation was cancelled by the user') ||
    rawMsg.includes('operation was canceled by the user') ||
    rawMsg.includes('user cancelled') ||
    rawMsg.includes('user canceled') ||
    rawMsg.includes('user rejected') ||
    rawMsg.includes('rejected by user') ||
    rawMsg.includes('transaction cancelled by user');
  if (isCancelled) return '__CANCELLED__';
  if (rawMsg.includes('proving failed') || rawMsg.includes('proving error')) {
    throw new Error(
      `${action} failed: Proving failed. The USDCx token program requires valid Merkle proofs for your record. ` +
        'Placeholder proofs cannot be used on-chain. Obtain valid proofs from your wallet (if it supports USDCx private transfer) or from Provable/token issuer. ' +
        'See programusdc/inputs/README_DEPOSIT_EXAMPLE.md for details.'
    );
  }
  if (rawMsg.includes('integer subtraction') || rawMsg.includes('underflow')) {
    throw new Error(
      `${action} failed: The chosen private USDCx Token record does not hold enough for this transfer. ` +
        'If your balance is split across multiple records, consolidate into one (private transfer to yourself) or reduce the amount.',
    );
  }
  if (
    rawMsg.includes('finalize') ||
    (rawMsg.includes('assert') && (rawMsg.includes('fail') || rawMsg.includes('abort'))) ||
    rawMsg.includes('real_debt')
  ) {
    throw new Error(
      `${action} failed (on-chain): assertion or finalize rejected. For **repay**, try a slightly smaller amount — ` +
        `accrued interest can make on-chain debt higher than the UI. Also verify Merkle proofs and that ` +
        `NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID matches your deployed pool. Original: ${error?.message || 'unknown'}`,
    );
  }
  throw new Error(`${action} failed: ${error?.message || 'Unknown error'}`);
}

function handleUsadTxError(error: any, action: string): string {
  const rawMsg = String(error?.message || error || '').toLowerCase();
  const isCancelled =
    rawMsg.includes('operation was cancelled by the user') ||
    rawMsg.includes('operation was canceled by the user') ||
    rawMsg.includes('user cancelled') ||
    rawMsg.includes('user canceled') ||
    rawMsg.includes('user rejected') ||
    rawMsg.includes('rejected by user') ||
    rawMsg.includes('transaction cancelled by user');
  if (isCancelled) return '__CANCELLED__';

  if (rawMsg.includes('proving failed') || rawMsg.includes('proving error')) {
    throw new Error(
      `${action} failed: Proving failed. The USAD token program requires valid Merkle proofs for your record. ` +
        'Placeholder proofs cannot be used on-chain. Obtain valid proofs from your wallet or from the token issuer.',
    );
  }
  if (rawMsg.includes('integer subtraction') || rawMsg.includes('underflow')) {
    throw new Error(
      `${action} failed: The chosen private USAD Token record does not hold enough for this transfer. ` +
        'Consolidate balance into one record or reduce the amount.',
    );
  }
  if (
    rawMsg.includes('finalize') ||
    (rawMsg.includes('assert') && (rawMsg.includes('fail') || rawMsg.includes('abort'))) ||
    rawMsg.includes('real_debt')
  ) {
    throw new Error(
      `${action} failed (on-chain): assertion or finalize rejected. For **repay**, try a smaller amount (interest accrual). ` +
        `Check NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID. Original: ${error?.message || 'unknown'}`,
    );
  }
  throw new Error(`${action} failed: ${error?.message || 'Unknown error'}`);
}

/**
 * USAD deposit (v8: `deposit_usad` — position, token, amount, proofs, sup_idx).
 *
 * @param ownerAddress - Connected wallet `aleo1…` address. Used to build Sealance / Veiled Markets–style
 *   Merkle non-inclusion proofs when the wallet does not attach proofs to the record.
 */
export async function lendingDepositUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string,
  ownerAddress?: string | null,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USAD_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Deposit amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USAD Token record is required. Please ensure you have USAD in your wallet.');
  if (!requestRecords) throw new Error('requestRecords is required for LendingPosition.');
  try {
    const poolRecords = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      poolRecords,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before depositing.');
    }
    let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
    if (posIdx < 0) posIdx = pos.recordIndex;

    const tokenInput = getUsadTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USAD Token record has no ciphertext or plaintext. Ensure the record is from test_usad_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsadMerkleProofsInput(tokenRecord, proofs, ownerAddress);
    const proofsLiteral = proofBundle.literal;

    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;
    privacyLog('[USAD deposit] ========== pool tx diagnostics ==========');
    privacyLog(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: poolProgramId,
          envPoolProgram: process.env.NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USAD_TOKEN_PROGRAM,
          function: 'deposit_usad',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 100) : typeof tokenInput,
        },
        null,
        2,
      ),
    );

    const { recordIdx: posIdxFresh } = await refreshLendingPositionRecordIndex(
      requestRecords,
      poolProgramId,
      pos.walletRecord,
      posIdx,
    );
    const tokenRecords = await requestRecords(USAD_TOKEN_PROGRAM, false);
    const tokenIdxFresh = findWalletRecordIndexInList(tokenRecords, tokenRecord);

    const oracleAtSubmit = await fetchLendingOraclePublic(poolProgramId);
    const supIdxStrAtSubmit = `${oracleAtSubmit.supIdxUsad.toString()}u64`;

    const inputs: (string | any)[] = [
      pos.input,
      tokenInput,
      amountStr,
      proofsLiteral,
      supIdxStrAtSubmit,
    ];

    privacyLog('[USAD deposit] sup_idx at submit:', supIdxStrAtSubmit);

    const result = await executeTransaction({
      program: poolProgramId,
      function: 'deposit_usad',
      inputs,
      fee: feeMicro,
      privateFee: false,
      recordIndices:
        tokenIdxFresh >= 0 ? [posIdxFresh, tokenIdxFresh] : [posIdxFresh, 0],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Deposit failed: No transactionId returned.');
    logAleoTxExplorer('USAD deposit', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USAD deposit] Raw error:', error?.message ?? error);
    return handleUsadTxError(error, 'USAD deposit');
  }
}

/**
 * USAD repay (v8: position, token, amount, proofs, borrow indices, prices).
 *
 * @param ownerAddress - Connected wallet address for Sealance / Veiled-style Merkle proofs (see deposit).
 */
export async function lendingRepayUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string,
  ownerAddress?: string | null,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USAD_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Repay amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USAD Token record is required for repay.');
  if (!requestRecords) throw new Error('requestRecords is required for LendingPosition.');
  try {
    const poolRecords = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      poolRecords,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before repaying.');
    }
    let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
    if (posIdx < 0) posIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);

    const tokenInput = getUsadTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USAD Token record has no ciphertext or plaintext. Ensure the record is from test_usad_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsadMerkleProofsInput(tokenRecord, proofs, ownerAddress);
    const proofsLiteral = proofBundle.literal;

    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;
    privacyLog('[USAD repay] ========== pool tx diagnostics ==========');
    privacyLog(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: poolProgramId,
          envPoolProgram: process.env.NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USAD_TOKEN_PROGRAM,
          function: 'repay_usad',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          ownerForProofs: ownerAddress ? `${String(ownerAddress).slice(0, 16)}…` : null,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 100) : typeof tokenInput,
          hints: [
            'Cross-asset repay: finalize_repay_any applies payment USD to all debts in order (ALEO→USDCx→USAD); excess payment stays as pool liquidity. UI can lag interest — try a slightly smaller amount if rejected.',
            'Invalid Merkle proofs for test_usad_stablecoin transfer_private_to_public will reject.',
            'NEXT_PUBLIC_* pool program id must match the deployed pool you initialized.',
          ],
        },
        null,
        2,
      ),
    );

    const inputs: (string | any)[] = [
      pos.input,
      tokenInput,
      amountStr,
      proofsLiteral,
      ...oracleToRepayPublicInputs(oracle),
    ];

    const tokenRecords = await requestRecords(USAD_TOKEN_PROGRAM, false);
    const tokenIdx = findWalletRecordIndexInList(tokenRecords, tokenRecord);

    const result = await executeTransaction({
      program: poolProgramId,
      function: 'repay_usad',
      inputs,
      fee: feeMicro,
      privateFee: false,
      recordIndices:
        tokenIdx >= 0 ? [posIdx, tokenIdx] : [posIdx, 0],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Repay failed: No transactionId returned.');
    logAleoTxExplorer('USAD repay', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USAD repay] Raw error:', error?.message ?? error);
    return handleUsadTxError(error, 'USAD repay');
  }
}

/**
 * USAD withdraw (v8: LendingPosition + oracle).
 */
export async function lendingWithdrawUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USAD_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) throw new Error('Wallet not connected or requestRecords unavailable.');
  if (amount <= 0) throw new Error('Withdraw amount must be greater than 0');
  try {
    const records = await requestRecords(poolProgramId, false);
    const pos = await getBestLendingPositionRecordForWithdrawOut(
      requestRecords,
      poolProgramId,
      decrypt,
      2,
      records,
    );
    if (!pos) throw new Error('No LendingPosition record. Call open_lending_account first.');
    let recordIdx = findWalletRecordIndexInList(records, pos.walletRecord);
    if (recordIdx < 0) recordIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const reqMicro = BigInt(Math.floor(Math.max(0, Number(amount)) * 1_000_000));
    let amountMicro = reqMicro;
    const caps = pos.caps;
    if (caps?.maxWithdrawMicroUsad != null) {
      let cap = caps.maxWithdrawMicroUsad;
      const WD_SLACK_MICRO = BigInt(100);
      if (cap > WD_SLACK_MICRO) cap -= WD_SLACK_MICRO;
      if (reqMicro > cap) amountMicro = cap;
    }
    if (amountMicro <= BigInt(0)) throw new Error('Withdraw amount must be greater than 0');
    if (amountMicro > LENDING_U64_MAX) throw new Error('Withdraw amount exceeds u64.');
    const bh = getWalletRecordBlockHeight(pos.walletRecord);
    const posInputKind = typeof pos.input === 'string' ? 'plaintext' : 'object';
    privacyLog(
      '[USAD withdraw] diagnostics',
      JSON.stringify(
        {
          poolProgramId,
          reqMicro: reqMicro.toString(),
          amountMicro: amountMicro.toString(),
          capApplied: reqMicro !== amountMicro,
          recordIdx,
          posInputKind,
          recordBlockHeight: bh,
          scaledSup: {
            aleo: pos.scaled.scaledSupNative.toString(),
            usdcx: pos.scaled.scaledSupUsdcx.toString(),
            usad: pos.scaled.scaledSupUsad.toString(),
          },
          scaledBor: {
            aleo: pos.scaled.scaledBorNative.toString(),
            usdcx: pos.scaled.scaledBorUsdcx.toString(),
            usad: pos.scaled.scaledBorUsad.toString(),
          },
          oracleSup: [oracle.supIdxAleo, oracle.supIdxUsdcx, oracle.supIdxUsad].map((x) => x.toString()),
          oraclePrice: [oracle.priceAleo, oracle.priceUsdcx, oracle.priceUsad].map((x) => x.toString()),
          oracleLtv: [oracle.ltvAleo, oracle.ltvUsdcx, oracle.ltvUsad].map((x) => x.toString()),
        },
        null,
        0,
      ),
    );
    await logLendingWithdrawAuditIfEnabled(
      poolProgramId,
      'withdraw USAD out',
      pos.scaled,
      oracle,
      amountMicro,
      '2field',
    );
    const { recordIdx: spendIdx } = await refreshLendingPositionRecordIndex(
      requestRecords,
      poolProgramId,
      pos.walletRecord,
      recordIdx,
    );
    const inputs = lendingWithdrawProgramInputs(pos.input, amountMicro, '2field', oracle);
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'withdraw',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [spendIdx],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Withdraw failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsadTxError(error, 'USAD withdraw');
  }
}

/**
 * USAD borrow (v8: LendingPosition + oracle).
 */
export async function lendingBorrowUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USAD_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) throw new Error('Wallet not connected or requestRecords unavailable.');
  if (amount <= 0) throw new Error('Borrow amount must be greater than 0');
  try {
    const records = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      records,
    );
    if (!pos) throw new Error('No LendingPosition record. Call open_lending_account first.');
    let recordIdx = findWalletRecordIndexInList(records, pos.walletRecord);
    if (recordIdx < 0) recordIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const amountMicro = BigInt(Math.round(amount * 1_000_000));
    const inputs = lendingBorrowProgramInputs(pos.input, amountMicro, '2field', oracle);
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'borrow',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [recordIdx],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Borrow failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsadTxError(error, 'USAD borrow');
  }
}

/**
 * USDC deposit (v8: position, token, amount, proofs, sup_idx).
 * Amount in human USDC; converted to micro-USDC for the program.
 */
export async function lendingDepositUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USDC_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Deposit amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USDC Token record is required. Please ensure you have USDCx in your wallet.');
  if (!requestRecords) throw new Error('requestRecords is required for LendingPosition.');
  try {
    const poolRecords = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      poolRecords,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before depositing.');
    }
    let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
    if (posIdx < 0) posIdx = pos.recordIndex;

    const tokenInput = getUsdcTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USDC Token record has no ciphertext or plaintext. Ensure the record is from test_usdcx_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsdcMerkleProofsInput(tokenRecord, proofs);
    const proofsLiteral = proofBundle.literal;
    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;

    privacyLog('[USDC deposit] ========== pool tx diagnostics ==========');
    privacyLog(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: poolProgramId,
          envPoolProgram: process.env.NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USDC_TOKEN_PROGRAM,
          function: 'deposit_usdcx',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 120) : typeof tokenInput,
        },
        null,
        2,
      ),
    );

    const { recordIdx: posIdxFresh } = await refreshLendingPositionRecordIndex(
      requestRecords,
      poolProgramId,
      pos.walletRecord,
      posIdx,
    );
    const tokenRecords = await requestRecords(USDC_TOKEN_PROGRAM, false);
    const tokenIdxFresh = findWalletRecordIndexInList(tokenRecords, tokenRecord);

    const oracleAtSubmit = await fetchLendingOraclePublic(poolProgramId);
    const supIdxStrAtSubmit = `${oracleAtSubmit.supIdxUsdcx.toString()}u64`;

    const inputs: (string | any)[] = [
      pos.input,
      tokenInput,
      amountStr,
      proofsLiteral,
      supIdxStrAtSubmit,
    ];

    privacyLog('[USDC deposit] input2 proofs preview:', proofsLiteral.slice(0, 220));
    privacyLog('[USDC deposit] sup_idx at submit:', supIdxStrAtSubmit);

    const result = await executeTransaction({
      program: poolProgramId,
      function: 'deposit_usdcx',
      inputs,
      fee: feeMicro,
      privateFee: false,
      recordIndices:
        tokenIdxFresh >= 0 ? [posIdxFresh, tokenIdxFresh] : [posIdxFresh, 0],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Deposit failed: No transactionId returned.');
    logAleoTxExplorer('USDC deposit', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USDC deposit] Raw error:', error?.message ?? error);
    return handleUsdcTxError(error, 'USDC deposit');
  }
}

/**
 * USDC repay (v8: position, token, amount, proofs, oracle).
 * Amount in human USDC; converted to micro-USDC for the program.
 */
export async function lendingRepayUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  tokenRecord: any,
  proofs?: [string, string] | string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USDC_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (amount <= 0) throw new Error('Repay amount must be greater than 0');
  if (tokenRecord == null) throw new Error('A USDC Token record is required for repay.');
  if (!requestRecords) throw new Error('requestRecords is required for LendingPosition.');
  try {
    const poolRecords = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      poolRecords,
    );
    if (!pos) {
      throw new Error('No LendingPosition record. Call open_lending_account before repaying.');
    }
    let posIdx = findWalletRecordIndexInList(poolRecords, pos.walletRecord);
    if (posIdx < 0) posIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);

    const tokenInput = getUsdcTokenInputForTransition(tokenRecord);
    if (tokenInput === '' || (typeof tokenInput === 'string' && !String(tokenInput).trim())) {
      throw new Error('USDC Token record has no ciphertext or plaintext. Ensure the record is from test_usdcx_stablecoin.aleo and try again.');
    }
    const amountMicro = Math.round(amount * 1_000_000);
    const amountStr = `${amountMicro}u64`;
    const proofBundle = await getUsdcMerkleProofsInput(tokenRecord, proofs);
    const proofsLiteral = proofBundle.literal;
    const feeMicro = DEFAULT_LENDING_FEE * 1_000_000;

    privacyLog('[USDC repay] ========== pool tx diagnostics ==========');
    privacyLog(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          poolProgram: poolProgramId,
          envPoolProgram: process.env.NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          tokenProgram: USDC_TOKEN_PROGRAM,
          function: 'repay_usdcx',
          amountHuman: amount,
          amountMicro,
          feeMicrocredits: feeMicro,
          merkleProofSource: proofBundle.source,
          tokenInputPreview:
            typeof tokenInput === 'string' ? tokenInput.slice(0, 120) : typeof tokenInput,
          hints: [
            'finalize_repay asserts amount <= on-chain accrued debt; UI can lag — try a slightly smaller repay.',
            'Invalid Merkle proofs for test_usdcx_stablecoin transfer_private_to_public will reject.',
            'Pool program in NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID must match deployed pool.',
          ],
        },
        null,
        2,
      ),
    );

    const inputs: (string | any)[] = [
      pos.input,
      tokenInput,
      amountStr,
      proofsLiteral,
      ...oracleToRepayPublicInputs(oracle),
    ];

    privacyLog('[USDC repay] input2 proofs preview:', proofsLiteral.slice(0, 220));

    const tokenRecords = await requestRecords(USDC_TOKEN_PROGRAM, false);
    const tokenIdx = findWalletRecordIndexInList(tokenRecords, tokenRecord);

    const result = await executeTransaction({
      program: poolProgramId,
      function: 'repay_usdcx',
      inputs,
      fee: feeMicro,
      privateFee: false,
      recordIndices:
        tokenIdx >= 0 ? [posIdx, tokenIdx] : [posIdx, 0],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Repay failed: No transactionId returned.');
    logAleoTxExplorer('USDC repay', tempId);
    return tempId;
  } catch (error: any) {
    console.error('[USDC repay] Raw error:', error?.message ?? error);
    return handleUsdcTxError(error, 'USDC repay');
  }
}

export async function lendingWithdrawUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USDC_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) throw new Error('Wallet not connected or requestRecords unavailable.');
  if (amount <= 0) throw new Error('Withdraw amount must be greater than 0');
  try {
    const records = await requestRecords(poolProgramId, false);
    const pos = await getBestLendingPositionRecordForWithdrawOut(
      requestRecords,
      poolProgramId,
      decrypt,
      1,
      records,
    );
    if (!pos) throw new Error('No LendingPosition record. Call open_lending_account first.');
    let recordIdx = findWalletRecordIndexInList(records, pos.walletRecord);
    if (recordIdx < 0) recordIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const reqMicro = BigInt(Math.floor(Math.max(0, Number(amount)) * 1_000_000));
    let amountMicro = reqMicro;
    const caps = pos.caps;
    if (caps?.maxWithdrawMicroUsdcx != null) {
      let cap = caps.maxWithdrawMicroUsdcx;
      const USDC_WD_SLACK_MICRO = BigInt(100);
      if (cap > USDC_WD_SLACK_MICRO) cap -= USDC_WD_SLACK_MICRO;
      if (reqMicro > cap) amountMicro = cap;
    }
    if (amountMicro <= BigInt(0)) throw new Error('Withdraw amount must be greater than 0');
    if (amountMicro > LENDING_U64_MAX) throw new Error('Withdraw amount exceeds u64.');
    const bh = getWalletRecordBlockHeight(pos.walletRecord);
    const posInputKind = typeof pos.input === 'string' ? 'plaintext' : 'object';
    privacyLog(
      '[USDC withdraw] diagnostics',
      JSON.stringify(
        {
          poolProgramId,
          reqMicro: reqMicro.toString(),
          amountMicro: amountMicro.toString(),
          capApplied: reqMicro !== amountMicro,
          recordIdx,
          posInputKind,
          recordBlockHeight: bh,
          scaledSup: {
            aleo: pos.scaled.scaledSupNative.toString(),
            usdcx: pos.scaled.scaledSupUsdcx.toString(),
            usad: pos.scaled.scaledSupUsad.toString(),
          },
          scaledBor: {
            aleo: pos.scaled.scaledBorNative.toString(),
            usdcx: pos.scaled.scaledBorUsdcx.toString(),
            usad: pos.scaled.scaledBorUsad.toString(),
          },
          oracleSup: [oracle.supIdxAleo, oracle.supIdxUsdcx, oracle.supIdxUsad].map((x) => x.toString()),
          oraclePrice: [oracle.priceAleo, oracle.priceUsdcx, oracle.priceUsad].map((x) => x.toString()),
          oracleLtv: [oracle.ltvAleo, oracle.ltvUsdcx, oracle.ltvUsad].map((x) => x.toString()),
        },
        null,
        0,
      ),
    );
    await logLendingWithdrawAuditIfEnabled(
      poolProgramId,
      'withdraw USDCx out',
      pos.scaled,
      oracle,
      amountMicro,
      '1field',
    );
    const { recordIdx: spendIdx } = await refreshLendingPositionRecordIndex(
      requestRecords,
      poolProgramId,
      pos.walletRecord,
      recordIdx,
    );
    const inputs = lendingWithdrawProgramInputs(pos.input, amountMicro, '1field', oracle);
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'withdraw',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [spendIdx],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Withdraw failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsdcTxError(error, 'USDC withdraw');
  }
}

export async function lendingBorrowUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
  amount: number,
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  poolProgramId: string = USDC_LENDING_POOL_PROGRAM_ID,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  if (!publicKey || !requestRecords) throw new Error('Wallet not connected or requestRecords unavailable.');
  if (amount <= 0) throw new Error('Borrow amount must be greater than 0');
  try {
    const records = await requestRecords(poolProgramId, false);
    const pos = await getLatestLendingPositionRecordInput(
      requestRecords,
      poolProgramId,
      decrypt,
      records,
    );
    if (!pos) throw new Error('No LendingPosition record. Call open_lending_account first.');
    let recordIdx = findWalletRecordIndexInList(records, pos.walletRecord);
    if (recordIdx < 0) recordIdx = pos.recordIndex;
    const oracle = await fetchLendingOraclePublic(poolProgramId);
    const amountMicro = BigInt(Math.round(amount * 1_000_000));
    const inputs = lendingBorrowProgramInputs(pos.input, amountMicro, '1field', oracle);
    const result = await executeTransaction({
      program: poolProgramId,
      function: 'borrow',
      inputs,
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
      recordIndices: [recordIdx],
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('Borrow failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    return handleUsdcTxError(error, 'USDC borrow');
  }
}

/**
 * Admin-only: initialize ALEO lending pool once.
 */
export async function lendingInitializeAleoPool(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  try {
    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'initialize',
      inputs: [],
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('Initialize ALEO pool failed: No transactionId returned.');
    return txId;
  } catch (error: any) {
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');
    if (isCancelled) return '__CANCELLED__';
    throw new Error(`Initialize ALEO pool failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Admin-only: initialize USDC lending pool once.
 */
export async function lendingInitializeUsdcPool(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  try {
    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'initialize',
      inputs: [],
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('Initialize USDC pool failed: No transactionId returned.');
    return txId;
  } catch (error: any) {
    return handleUsdcTxError(error, 'Initialize USDC pool');
  }
}

/**
 * Admin-only: initialize USAD lending pool once.
 */
export async function lendingInitializeUsadPool(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  try {
    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'initialize',
      inputs: [],
      fee: DEFAULT_LENDING_FEE * 1_000_000,
      privateFee: false,
    });
    const txId = result?.transactionId;
    if (!txId) throw new Error('Initialize USAD pool failed: No transactionId returned.');
    return txId;
  } catch (error: any) {
    return handleUsadTxError(error, 'Initialize USAD pool');
  }
}

/**
 * Accrue interest on the Aleo pool (v86) using wallet adapter.
 * accrue_interest() — updates liquidity_index and borrow_index using on-chain block.height.
 * Anyone can call; indices are also updated automatically on every deposit, borrow, repay, withdraw.
 */
export async function lendingAccrueInterest(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  privacyLog('========================================');
  privacyLog('📈 LENDING ACCRUE INTEREST FUNCTION CALLED (Aleo pool)');
  privacyLog('========================================');
  privacyLog('📥 Input Parameters:', {
    network: CURRENT_NETWORK,
    programId: LENDING_POOL_PROGRAM_ID,
  });

  if (!executeTransaction) {
    throw new Error('executeTransaction is not available from the connected wallet.');
  }
  const fee = DEFAULT_LENDING_FEE * 1_000_000;

  try {
    const inputs: string[] = ['0field'];
    privacyLog('💰 Transaction Configuration:', {
      inputs,
      fee: `${fee} microcredits`,
    });

    privacyLog('🔍 Calling executeTransaction for accrue_interest (public fee)...');
    const result = await executeTransaction({
      program: LENDING_POOL_PROGRAM_ID,
      function: 'accrue_interest',
      inputs,
      fee,
      privateFee: false,
    });

    const tempId: string | undefined = result?.transactionId;
    if (!tempId) {
      throw new Error('Accrue interest failed: No temporary transactionId returned from wallet.');
    }

    privacyLog('Temporary Transaction ID (accrue_interest):', tempId);
    privacyLog('========================================\n');
    return tempId;
  } catch (error: any) {
    console.error('❌ LENDING ACCRUE INTEREST FUNCTION FAILED:', error?.message ?? error);

    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('operation was canceled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user canceled') ||
      rawMsg.includes('user rejected') ||
      rawMsg.includes('rejected by user') ||
      rawMsg.includes('transaction cancelled by user');

    if (isCancelled) {
      console.warn('💡 Accrue interest transaction cancelled by user (handled gracefully).');
      return '__CANCELLED__';
    }

    throw new Error(`Accrue interest transaction failed: ${error?.message || 'Unknown wallet error'}`);
  }
}

/**
 * Accrue interest on the USDC pool (`USDC_LENDING_POOL_PROGRAM_ID`). Same signature as Aleo pool.
 */
export async function lendingAccrueInterestUsdc(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  const fee = DEFAULT_LENDING_FEE * 1_000_000;
  try {
    const result = await executeTransaction({
      program: USDC_LENDING_POOL_PROGRAM_ID,
      function: 'accrue_interest',
      inputs: ['1field'],
      fee,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('USDC accrue interest failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('user cancelled') || rawMsg.includes('user rejected');
    if (isCancelled) return '__CANCELLED__';
    throw new Error(`USDC accrue interest failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Accrue interest on the USAD pool (lending_pool_usad_v17.aleo). Same signature as Aleo pool.
 */
export async function lendingAccrueInterestUsad(
  executeTransaction: ((tx: any) => Promise<any>) | undefined,
): Promise<string> {
  if (!executeTransaction) throw new Error('executeTransaction is not available.');
  const fee = DEFAULT_LENDING_FEE * 1_000_000;
  try {
    const result = await executeTransaction({
      program: USAD_LENDING_POOL_PROGRAM_ID,
      function: 'accrue_interest',
      inputs: ['2field'],
      fee,
      privateFee: false,
    });
    const tempId = result?.transactionId;
    if (!tempId) throw new Error('USAD accrue interest failed: No transactionId returned.');
    return tempId;
  } catch (error: any) {
    const rawMsg = String(error?.message || error || '').toLowerCase();
    const isCancelled =
      rawMsg.includes('operation was cancelled by the user') ||
      rawMsg.includes('user cancelled') ||
      rawMsg.includes('user rejected');
    if (isCancelled) return '__CANCELLED__';
    throw new Error(`USAD accrue interest failed: ${error?.message || 'Unknown wallet error'}`);
  }
}

/**
 * Read global pool state from mappings for a given program.
 * Keys are always GLOBAL_KEY = 0u8 in the Leo program.
 * v85 (lending_pool_v85.aleo) also has liquidity_index and borrow_index for interest/APY.
 */
export async function getLendingPoolStateForProgram(programId: string, assetKey: string = '0field'): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  try {
    const requestWithErrorHandling = async (mappingName: string, key: string) => {
      try {
        return await Promise.resolve(client.request('getMappingValue', {
          program_id: programId,
          mapping_name: mappingName,
          key,
        }));
      } catch (err: any) {
        console.warn(
          `getLendingPoolStateForProgram(${programId}): Failed to fetch ${mappingName} (key=${key}):`,
          err?.message,
        );
        return null;
      }
    };

    const extract = (res: any): string | null => {
      if (res == null) return null;
      const raw = res.value ?? res ?? null;
      if (raw == null) return null;
      const str = String(raw);
      return str.replace(/u64$/i, '');
    };

    // -----------------------------
    // v91+ (current main.leo) schema
    // key type: field (single-asset key = 0field)
    // mappings: total_deposited, total_borrowed, supply_index, borrow_index, ...
    // -----------------------------
    const keyField = assetKey;
    const [depositedV91, borrowedV91, supplyIdxV91, borrowIdxV91] = await Promise.all([
      requestWithErrorHandling('total_deposited', keyField),
      requestWithErrorHandling('total_borrowed', keyField),
      requestWithErrorHandling('supply_index', keyField),
      requestWithErrorHandling('borrow_index', keyField),
    ]);

    const depositedStr = extract(depositedV91);
    const borrowedStr = extract(borrowedV91);
    const supplyIdxStr = extract(supplyIdxV91);
    const borrowIdxStr = extract(borrowIdxV91);

    // If v91 mappings exist, use them.
    if (depositedStr != null || borrowedStr != null || supplyIdxStr != null || borrowIdxStr != null) {
      return {
        totalSupplied: depositedStr,
        totalBorrowed: borrowedStr,
        // v91 program does not store utilization/interest indices separately.
        utilizationIndex: null,
        // Keep legacy fields populated for UI components that still display them.
        interestIndex: supplyIdxStr,
        liquidityIndex: supplyIdxStr,
        borrowIndex: borrowIdxStr,
      };
    }

    // -----------------------------
    // v86 fallback schema (older pools)
    // key type: u8 (GLOBAL_KEY = 0u8)
    // mappings: total_supplied, utilization_index, liquidity_index, borrow_index, ...
    // -----------------------------
    const keyU8 = '0u8';
    const [supplied, borrowed, utilization, interest, liquidityIdx, borrowIdx] = await Promise.all([
      requestWithErrorHandling('total_supplied', keyU8),
      requestWithErrorHandling('total_borrowed', keyU8),
      requestWithErrorHandling('utilization_index', keyU8),
      requestWithErrorHandling('interest_index', keyU8),
      requestWithErrorHandling('liquidity_index', keyU8),
      requestWithErrorHandling('borrow_index', keyU8),
    ]);

    return {
      totalSupplied: extract(supplied),
      totalBorrowed: extract(borrowed),
      utilizationIndex: extract(utilization),
      interestIndex: extract(interest),
      liquidityIndex: extract(liquidityIdx),
      borrowIndex: extract(borrowIdx),
    };
  } catch (error: any) {
    console.error('getLendingPoolStateForProgram: Error fetching pool state:', error);
    return {
      totalSupplied: null,
      totalBorrowed: null,
      utilizationIndex: null,
      interestIndex: null,
      liquidityIndex: null,
      borrowIndex: null,
    };
  }
}

/**
 * Read V2 oracle price mapping for an asset key (e.g. 0field/1field/2field).
 * Returns price in program PRICE_SCALE units (1e6 => $1.000000).
 */
export async function getAssetPriceForProgram(
  programId: string,
  assetKey: string,
): Promise<number | null> {
  try {
    const res = await client.request('getMappingValue', {
      program_id: programId,
      mapping_name: 'asset_price',
      key: assetKey,
    });
    const raw = res?.value ?? res ?? null;
    if (raw == null) return null;
    const s = String(raw).trim();
    const m = s.match(/(\d[\d_]*)/);
    const num = m ? Number(m[1].replace(/_/g, '')) : Number.NaN;
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

/**
 * Read global pool state for the Aleo pool (lending_pool_v86.aleo).
 */
export async function getLendingPoolState(): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  return getLendingPoolStateForProgram(LENDING_POOL_PROGRAM_ID, '0field');
}

/**
 * Read global pool state for the USDC pool (`USDC_LENDING_POOL_PROGRAM_ID`).
 */
export async function getUsdcLendingPoolState(): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  return getLendingPoolStateForProgram(USDC_LENDING_POOL_PROGRAM_ID, '1field');
}

/**
 * Read global pool state for the USAD pool.
 */
export async function getUsadLendingPoolState(): Promise<{
  totalSupplied: string | null;
  totalBorrowed: string | null;
  utilizationIndex: string | null;
  interestIndex: string | null;
  liquidityIndex: string | null;
  borrowIndex: string | null;
}> {
  return getLendingPoolStateForProgram(USAD_LENDING_POOL_PROGRAM_ID, '2field');
}

function parseMappingU64Response(res: unknown): number | null {
  if (res == null) return null;
  const raw = (res as { value?: unknown })?.value ?? res;
  if (raw == null) return null;
  const str = String(raw);
  const m = str.match(/(\d[\d_]*)/);
  if (!m) return null;
  const n = Number(m[1].replace(/_/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Read `supply_apy` / `borrow_apy` mappings written by `finalize_accrue` (xyra_lending_v6.aleo).
 * Values are annual APR in basis points (SCALE=10_000): 200 => 2% => fraction 0.02.
 */
export async function getPoolApyFractionsFromChain(
  programId: string,
  assetKey: string,
): Promise<{ supplyAPY: number; borrowAPY: number } | null> {
  try {
    const [sRes, bRes] = await Promise.all([
      client.request('getMappingValue', {
        program_id: programId,
        mapping_name: 'supply_apy',
        key: assetKey,
      }),
      client.request('getMappingValue', {
        program_id: programId,
        mapping_name: 'borrow_apy',
        key: assetKey,
      }),
    ]);
    const sBps = parseMappingU64Response(sRes);
    const bBps = parseMappingU64Response(bRes);
    if (sBps == null && bBps == null) return null;
    const BPS = 10_000;
    return {
      supplyAPY: sBps != null ? sBps / BPS : 0,
      borrowAPY: bBps != null ? bBps / BPS : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Prefer on-chain APY from mappings; fall back to utilization formula when mappings are missing
 * or still zero while the pool has deposits (before first accrue).
 */
export function resolvePoolApyDisplay(
  totalSupplied: number,
  totalBorrowed: number,
  chain: { supplyAPY: number; borrowAPY: number } | null,
): { supplyAPY: number; borrowAPY: number } {
  const computed = computeAleoPoolAPY(totalSupplied, totalBorrowed);
  if (chain == null) return computed;
  const bothZero = chain.borrowAPY < 1e-12 && chain.supplyAPY < 1e-12;
  if (bothZero && totalSupplied > 0) return computed;
  // Some pools can briefly expose stale `supply_apy=0` while `borrow_apy` is already non-zero.
  // In that case, keep borrow from chain but derive supply from utilization for display.
  const shouldBackfillSupplyFromComputed =
    totalSupplied > 0 &&
    totalBorrowed > 0 &&
    chain.borrowAPY > 1e-12 &&
    chain.supplyAPY < 1e-12;
  return {
    supplyAPY: shouldBackfillSupplyFromComputed ? computed.supplyAPY : chain.supplyAPY,
    borrowAPY: chain.borrowAPY,
  };
}

// --- v91 interest/APY constants (match program lending_pool_v91.aleo) ---
// Leo program:
//   const SCALE:        u64 = 10_000u64;   // basis points denominator
//   const BASE_RATE:    u64 = 200u64;      // 2% base borrow rate (annual, bps)
//   const SLOPE_RATE:   u64 = 400u64;      // +4% borrow per 100% utilization (annual, bps)
//   const RESERVE_FACTOR: u64 = 1_000u64;  // 10% of interest to protocol
//
// On-chain, borrow APY (in bps) is:
//   borrow_apy_bps = BASE_RATE + SLOPE_RATE * util
// where util in [0,1]. Supply APY in bps is:
//   supply_apy_bps = borrow_apy_bps * util * (1 - RESERVE_FACTOR / SCALE).
//
// We expose APY to the UI as fractions (e.g. 0.02 = 2%).
const SCALE_ALEO = 10_000; // basis points denominator
const BASE_RATE_BPS_ALEO = 200; // 2% base borrow APR
const SLOPE_RATE_BPS_ALEO = 400; // +4% per 100% util
const RESERVE_FACTOR_BPS_ALEO = 1_000; // 10% reserve cut

/**
 * Compute supply and borrow APY (fractions) from pool state using the v91 model.
 * Inputs:
 *   - totalSupplied/totalBorrowed: principal balances (micro-credits); only the ratio matters.
 * Returns:
 *   - borrowAPY: annualized borrow rate as fraction (e.g. 0.02 = 2%).
 *   - supplyAPY: annualized supply rate as fraction.
 */
export function computeAleoPoolAPY(
  totalSupplied: number | string,
  totalBorrowed: number | string,
): { supplyAPY: number; borrowAPY: number } {
  const ts = Number(totalSupplied) || 0;
  const tb = Number(totalBorrowed) || 0;
  if (ts <= 0) {
    return { supplyAPY: 0, borrowAPY: 0 };
  }
  const utilRaw = tb / ts; // 0..1
  const util = Math.max(0, Math.min(1, utilRaw));

  // Borrow APY in fraction: (BASE_RATE + SLOPE_RATE * util) / SCALE
  const borrowAPY =
    (BASE_RATE_BPS_ALEO + SLOPE_RATE_BPS_ALEO * util) / SCALE_ALEO;

  // Supply APY = borrowAPY * util * (1 - reserve_factor)
  const reserveCut = RESERVE_FACTOR_BPS_ALEO / SCALE_ALEO;
  const supplyAPY = borrowAPY * util * (1 - reserveCut);

  return { supplyAPY, borrowAPY };
}

/** Same rate model as Aleo pool (v86); USDC pool uses identical constants. */
export const computeUsdcPoolAPY = computeAleoPoolAPY;

/** Same rate model as Aleo pool (v86); USAD pool uses identical constants. */
export const computeUsadPoolAPY = computeAleoPoolAPY;

// These caches are module-level and can survive HMR in development.
// Version them so changes to key-derivation logic don't leave stale entries.
/** Bump when user_key / position_key derivation changes (clears wasm hash caches). */
const USER_FIELD_HASH_SCHEME_VERSION = 'v5';
const userFieldHashCache = new Map<string, string>();
const lendingPositionKeyCache = new Map<string, string>();

function normalizeFieldLiteral(fieldStr: string): string {
  const t = String(fieldStr).trim();
  return t.endsWith('field') ? t : `${t}field`;
}

/** Default `@provablehq/wasm` entry is testnet; align with `CURRENT_NETWORK` when you switch to mainnet builds. */
async function loadProvableWasm(): Promise<typeof import('@provablehq/wasm')> {
  if (CURRENT_NETWORK === Network.MAINNET) {
    // Subpath exists at runtime (package exports); TS moduleResolution: node may not resolve it.
    // @ts-expect-error -- provable wasm mainnet entry
    return import('@provablehq/wasm/mainnet.js');
  }
  return import('@provablehq/wasm');
}

/** How Leo/snarkVM feeds the field sum into BHP256 for `compute_position_key`. */
export type PositionKeySumBitsMode = 'sumPlaintextBitsLe' | 'sumFieldBitsLe';

/**
 * Leo: `compute_position_key` uses `user_key + asset_id` as field sum, then `BHP256::hash_to_field(...)`.
 * SnarkVM may use either the **field element** bit layout or the **plaintext** layout of that sum; deployments differ.
 */
export async function computePositionKeyFromUserKeyFieldStrMode(
  userKeyFieldStr: string,
  assetIdField: string,
  sumBitsMode: PositionKeySumBitsMode,
): Promise<string | null> {
  try {
    const { BHP256, Field } = await loadProvableWasm();
    const bhp = new BHP256();
    const userKey = Field.fromString(normalizeFieldLiteral(userKeyFieldStr));
    const assetF = Field.fromString(normalizeFieldLiteral(assetIdField));
    const sum = userKey.add(assetF);
    const bits =
      sumBitsMode === 'sumFieldBitsLe' ? sum.toBitsLe() : sum.toPlaintext().toBitsLe();
    return bhp.hash(bits).toString();
  } catch (e) {
    console.warn('computePositionKeyFromUserKeyFieldStrMode failed:', e);
    return null;
  }
}

/**
 * Leo: `compute_position_key` uses `user_key + asset_id` as field sum, then `BHP256::hash_to_field(...)`.
 * Default: **plaintext** bits of the sum (matches most current Leo lowering).
 */
export async function computePositionKeyFromUserKeyFieldStr(
  userKeyFieldStr: string,
  assetIdField: string,
): Promise<string | null> {
  return computePositionKeyFromUserKeyFieldStrMode(userKeyFieldStr, assetIdField, 'sumPlaintextBitsLe');
}

/** One row from `probeUserKeyVariantsForAleoSupply` extended grid (user_key × sum→pos_key modes). */
export type UserKeyPosKeyGridRow = {
  label: string;
  userKey: string;
  posKey: string | null;
  supply: MappingReadDebug;
};

/**
 * Compare which `user_key` derivation matches on-chain `user_scaled_supply` for ALEO (0field).
 * Leo `BHP256::hash_to_field(caller)` may use the address **plaintext** bit layout vs raw `Address` bits.
 * When the two legacy paths miss but pool totals are non-zero, see **`grid`** for extra `user_key` /
 * `sumFieldBitsLe` combinations (matches some snarkVM lowerings).
 */
export async function probeUserKeyVariantsForAleoSupply(
  programId: string,
  address: string,
): Promise<{
  addressBitsLe: { userKey: string; posKey: string | null; supply: MappingReadDebug };
  plaintextBitsLe: { userKey: string; posKey: string | null; supply: MappingReadDebug } | null;
  /** Global pool `total_deposited` for ALEO — if non-null, this program has on-chain supply state. */
  poolTotalDepositedAleo: MappingReadDebug;
  /**
   * Cross-product of user_key sources × position-key sum-bit modes. First row with `supply.parsedU64 > 0`
   * is the one to align `computeUserKeyFieldFromAddress` / `computePositionKeyFromUserKeyFieldStrMode` with.
   */
  grid: UserKeyPosKeyGridRow[];
  /** First grid row with non-zero parsed supply, if any. */
  gridFirstMatch: UserKeyPosKeyGridRow | null;
  note: string;
}> {
  await loadProvableWasm();
  const { BHP256, Address } = await loadProvableWasm();
  const addr = Address.from_string(address.trim());
  const bhp = new BHP256();

  const ukAddrBits = bhp.hash(addr.toBitsLe()).toString();
  const posAddr = await computePositionKeyFromUserKeyFieldStr(ukAddrBits, '0field');
  const supAddr = posAddr
    ? await getMappingValueDebug(programId, 'user_scaled_supply', posAddr)
    : ({
        mapping: 'user_scaled_supply',
        key: '(null pos)',
        ok: false,
        raw: null,
        parsedU64: null,
        rpcError: 'null position key',
      } satisfies MappingReadDebug);

  let plaintextBitsLe: {
    userKey: string;
    posKey: string | null;
    supply: MappingReadDebug;
  } | null = null;
  try {
    const pt = addr.toPlaintext();
    const ukPt = bhp.hash(pt.toBitsLe()).toString();
    const posPt = await computePositionKeyFromUserKeyFieldStr(ukPt, '0field');
    const supPt = posPt
      ? await getMappingValueDebug(programId, 'user_scaled_supply', posPt)
      : ({
          mapping: 'user_scaled_supply',
          key: '(null pos)',
          ok: false,
          raw: null,
          parsedU64: null,
          rpcError: 'null position key',
        } satisfies MappingReadDebug);
    plaintextBitsLe = { userKey: ukPt, posKey: posPt, supply: supPt };
  } catch (e: unknown) {
    console.warn('[probeUserKeyVariantsForAleoSupply] plaintext path failed:', e);
  }

  const poolTotalDepositedAleo = await getMappingValueDebug(programId, 'total_deposited', '0field');
  const poolMicro = poolTotalDepositedAleo.parsedU64 ?? BigInt(0);

  const grid: UserKeyPosKeyGridRow[] = [];
  const sumModes: PositionKeySumBitsMode[] = ['sumPlaintextBitsLe', 'sumFieldBitsLe'];
  type UkFn = () => string;
  const userKeySources: { label: string; uk: UkFn }[] = [
    { label: 'uk_addressToBitsLe', uk: () => bhp.hash(addr.toBitsLe()).toString() },
    { label: 'uk_plaintextToBitsLe', uk: () => bhp.hash(addr.toPlaintext().toBitsLe()).toString() },
    {
      label: 'uk_plaintextToBitsRawLe',
      uk: () => bhp.hash(addr.toPlaintext().toBitsRawLe()).toString(),
    },
  ];
  for (const { label: ukLabel, uk } of userKeySources) {
    let userKeyStr: string;
    try {
      userKeyStr = uk();
    } catch {
      continue;
    }
    for (const sumMode of sumModes) {
      const posKey = await computePositionKeyFromUserKeyFieldStrMode(userKeyStr, '0field', sumMode);
      const supply = posKey
        ? await getMappingValueDebug(programId, 'user_scaled_supply', posKey)
        : ({
            mapping: 'user_scaled_supply',
            key: '(null pos)',
            ok: false,
            raw: null,
            parsedU64: null,
            rpcError: 'null position key',
          } satisfies MappingReadDebug);
      grid.push({
        label: `${ukLabel}+${sumMode}`,
        userKey: userKeyStr,
        posKey,
        supply,
      });
    }
  }

  const gridFirstMatch =
    grid.find((r) => (r.supply.parsedU64 ?? BigInt(0)) > BigInt(0)) ?? null;

  const a = supAddr.parsedU64 ?? BigInt(0);
  const b = plaintextBitsLe?.supply.parsedU64 ?? BigInt(0);
  let note = '';
  if (gridFirstMatch) {
    note =
      gridFirstMatch.label === 'uk_plaintextToBitsLe+sumPlaintextBitsLe'
        ? 'On-chain supply matches **uk_plaintextToBitsLe+sumPlaintextBitsLe** — same as `computeUserKeyFieldFromAddress` (plaintext address bits) + `computePositionKeyFromUserKeyFieldStr` (sum plaintext bits).'
        : `**grid** found non-zero \`user_scaled_supply\` at \`${gridFirstMatch.label}\` — align \`computeUserKeyFieldFromAddress\` / \`computePositionKeyFromUserKeyFieldStrMode\` with that label.`;
  } else if (a > BigInt(0) && b === BigInt(0)) {
    note =
      'On-chain supply matches **address.toBitsLe()** user_key only (legacy) — prefer `computeUserKeyFieldFromAddress` (plaintext bits).';
  } else if (b > BigInt(0) && a === BigInt(0)) {
    note =
      'On-chain supply matches **address.toPlaintext().toBitsLe()** user_key (`computeUserKeyFieldFromAddress`).';
  } else if (a > BigInt(0) && b > BigInt(0)) {
    note = 'Both legacy variants non-zero (unexpected); compare keys.';
  } else if (poolMicro > BigInt(0)) {
    note =
      'Pool `total_deposited` (ALEO) is non-zero but **no** grid row has `user_scaled_supply` for this address. Either deployed bytecode differs from your Leo source (compare program id / deployment tx), or liquidity was accounted without per-user scaled rows (unexpected for this program).';
  } else {
    note =
      'No user supply at either key and pool `total_deposited` (ALEO) is also empty/zero — confirm program id matches the deployment your txs targeted, or try another RPC / wait for indexer.';
  }

  return {
    addressBitsLe: { userKey: ukAddrBits, posKey: posAddr, supply: supAddr },
    plaintextBitsLe,
    poolTotalDepositedAleo,
    grid,
    gridFirstMatch,
    note,
  };
}

/**
 * Leo: `user_key = BHP256::hash_to_field(caller)` for `caller: address`.
 * SnarkVM hashes the **plaintext** bit layout of the address (`address.toPlaintext().toBitsLe()`),
 * not `address.toBitsLe()` (see `probeUserKeyVariantsForAleoSupply` grid `uk_plaintextToBitsLe+sumPlaintextBitsLe`).
 */
export async function computeUserKeyFieldFromAddress(address: string): Promise<string | null> {
  try {
    const cacheKey = `${USER_FIELD_HASH_SCHEME_VERSION}:${address}`;
    if (userFieldHashCache.has(cacheKey)) {
      return userFieldHashCache.get(cacheKey) ?? null;
    }
    const { BHP256, Address } = await loadProvableWasm();
    const bhp = new BHP256();
    const addr = Address.from_string(address);
    const userKeyField = bhp.hash(addr.toPlaintext().toBitsLe());
    const s = userKeyField.toString();
    userFieldHashCache.set(cacheKey, s);
    return s;
  } catch (e) {
    console.warn('computeUserKeyFieldFromAddress failed:', e);
    return null;
  }
}

/**
 * Leo: compute_position_key(user_key, asset_id) = BHP256::hash_to_field(user_key + asset_id).
 * assetIdField: ALEO 0field, USDCx 1field, USAD 2field (xyra_lending_v3).
 */
export async function computeLendingPositionMappingKey(
  address: string,
  assetIdField: string,
): Promise<string | null> {
  try {
    const cacheKey = `${USER_FIELD_HASH_SCHEME_VERSION}:${address}:${assetIdField}`;
    if (lendingPositionKeyCache.has(cacheKey)) {
      return lendingPositionKeyCache.get(cacheKey) ?? null;
    }
    const userKeyStr = await computeUserKeyFieldFromAddress(address);
    if (!userKeyStr) return null;
    const out = await computePositionKeyFromUserKeyFieldStr(userKeyStr, assetIdField);
    if (!out) return null;
    lendingPositionKeyCache.set(cacheKey, out);
    return out;
  } catch (e) {
    console.warn('computeLendingPositionMappingKey failed:', e);
    return null;
  }
}

/**
 * Effective supply / borrow for one asset leg from private `LendingPosition` scaled amounts × on-chain indices.
 *
 * @param assetIdField `0field` (ALEO), `1field` (USDCx), `2field` (USAD).
 * @param scaled Parsed `LendingPosition` counters; if null, returns null (no public mapping fallback in v8).
 */
export async function getAleoPoolUserEffectivePosition(
  programId: string,
  _userAddress: string,
  assetIdField: string = '0field',
  scaled: LendingPositionScaled | null,
): Promise<{ effectiveSupplyBalance: number; effectiveBorrowDebt: number } | null> {
  if (!scaled) return null;
  try {
    const assetKey = normalizeFieldLiteral(assetIdField);
    let ss: bigint;
    let sb: bigint;
    if (assetKey === '0field') {
      ss = scaled.scaledSupNative;
      sb = scaled.scaledBorNative;
    } else if (assetKey === '1field') {
      ss = scaled.scaledSupUsdcx;
      sb = scaled.scaledBorUsdcx;
    } else {
      ss = scaled.scaledSupUsad;
      sb = scaled.scaledBorUsad;
    }

    const keyU8 = '0u8';
    const [supplyIndexAsset, borrowIndexAsset] = await Promise.all([
      getMappingU64Big(programId, 'supply_index', assetKey),
      getMappingU64Big(programId, 'borrow_index', assetKey),
    ]);

    const INDEX_SCALE_ALEO = BigInt('1000000000000');

    let li = supplyIndexAsset;
    if (li == null) {
      li =
        (await getMappingU64Big(programId, 'supply_index', '0field')) ??
        (await (async () => {
          try {
            const res = await client.request('getMappingValue', {
              program_id: programId,
              mapping_name: 'liquidity_index',
              key: keyU8,
            });
            const raw = res?.value ?? res ?? null;
            if (raw == null) return null;
            return BigInt(String(raw).replace(/u64$/i, '').trim());
          } catch {
            return null;
          }
        })());
    }
    let bi = borrowIndexAsset;
    if (bi == null) {
      bi = (await getMappingU64Big(programId, 'borrow_index', '0field')) ?? INDEX_SCALE_ALEO;
    }
    li = li ?? INDEX_SCALE_ALEO;
    bi = bi ?? INDEX_SCALE_ALEO;
    const effectiveSupplyBalance = Number((ss * li) / INDEX_SCALE_ALEO);
    const effectiveBorrowDebt = Number((sb * bi) / INDEX_SCALE_ALEO);
    return { effectiveSupplyBalance, effectiveBorrowDebt };
  } catch {
    return null;
  }
}

/** Matches `xyra_lending_v4.aleo` / `weighted_collateral_usd` + `finalize_borrow` (INDEX_SCALE, PRICE_SCALE, SCALE). */
const LENDING_INDEX_SCALE = BigInt('1000000000000');
const LENDING_PRICE_SCALE = BigInt('1000000');
const LENDING_LTV_SCALE = BigInt('10000');
/** Matches `WITHDRAW_XA_REMAINDER_MAX` in lending `withdraw` (USD remainder after 3-leg burn; v6 uses 3). */
const LENDING_WITHDRAW_REMAINDER_MAX_USD = BigInt(3);

/**
 * Floor 6-decimal token micro-units to a display precision (e.g. 2 → steps of 0.01 token = 10_000 micro).
 * Use for withdraw MAX / inputs so UI matches borrow/repay-style 2 dp and stays at or below chain-safe amounts.
 */
const TOKEN_MICRO_POW10: readonly bigint[] = [
  BigInt(1),
  BigInt(10),
  BigInt(100),
  BigInt(1_000),
  BigInt(10_000),
  BigInt(100_000),
  BigInt(1_000_000),
];

export function floorTokenMicroToDisplayDecimals(micro: bigint, displayDecimals: number): bigint {
  if (micro <= BigInt(0)) return BigInt(0);
  const d = Math.min(6, Math.max(0, Math.floor(displayDecimals)));
  const drop = 6 - d;
  if (drop <= 0) return micro;
  const step = TOKEN_MICRO_POW10[drop] ?? BigInt(1);
  return (micro / step) * step;
}

function toU64Leo(x: bigint): bigint {
  if (x <= BigInt(0)) return BigInt(0);
  return x > LENDING_U64_MAX ? LENDING_U64_MAX : x;
}

/** u128::MAX — same bound as Leo for `(real_sup * price) * ltv` before single division. */
const LENDING_U128_MAX = BigInt('340282366920938463463374607431768211455');

function weightedCollateralUsdMicro(realSup: bigint, price: bigint, ltv: bigint): bigint {
  const rp = realSup * price;
  const den = LENDING_PRICE_SCALE * LENDING_LTV_SCALE;
  const rpTimesLOk = ltv === BigInt(0) || rp <= LENDING_U128_MAX / ltv;
  return rpTimesLOk ? (rp * ltv) / den : ((rp / LENDING_PRICE_SCALE) * ltv) / LENDING_LTV_SCALE;
}

/** Requires `NEXT_PUBLIC_DEBUG_PRIVACY=true` and `NEXT_PUBLIC_XYRA_WITHDRAW_DEBUG=true` — logs `[xyra withdraw audit]` before each withdraw tx. */
const XYRA_WITHDRAW_AUDIT_DEBUG =
  DEBUG_PRIVACY &&
  typeof process !== 'undefined' &&
  (process.env.NEXT_PUBLIC_XYRA_WITHDRAW_DEBUG === 'true' ||
    process.env.NEXT_PUBLIC_XYRA_WITHDRAW_DEBUG === '1');

export type LendingWithdrawTransitionAudit = {
  ok: boolean;
  /** First Leo `assert` that would fail in `withdraw` (transition), or null if all pass. */
  failReason: string | null;
  checks: {
    amountPositive: boolean;
    withdrawUsdPositive: boolean;
    withdrawLteTotalSupplyUsd: boolean;
    scaledOutPositive: boolean;
    remAfterUsadLteMax: boolean;
    healthAfterWithdraw: boolean;
  };
  numerics: Record<string, string>;
};

/**
 * When `supIdx > INDEX`, `floor(burn * INDEX / supIdx)` can be 0 for small positive `burn` (cross-asset ladder dust).
 * Bump burn to the minimum raw that yields ≥1 scaled unit: `ceil(supIdx / INDEX)`, capped by `realSup` — must match `main.leo` `withdraw`.
 */
function bumpBurnForScaledWithdrawLeg(burn: bigint, realSup: bigint, supIdx: bigint): bigint {
  if (burn <= BigInt(0)) return burn;
  const scaledProbe = toU64Leo((burn * LENDING_INDEX_SCALE) / supIdx);
  if (scaledProbe > BigInt(0)) return toU64Leo(burn);
  const ceilMin = (supIdx + LENDING_INDEX_SCALE - BigInt(1)) / LENDING_INDEX_SCALE;
  let bumped = burn > ceilMin ? burn : ceilMin;
  if (bumped > realSup) bumped = realSup;
  return toU64Leo(bumped);
}

/** Mirrors `xyra_lending_v*.aleo` `withdraw` transition (floor burn ladder, index-dust bump, `rem <= 3`, LTV health). */
export function simulateLendingWithdrawTransitionAudit(
  scaled: LendingPositionScaled,
  oracle: LendingOraclePublic,
  amountMicro: bigint,
  outAssetField: '0field' | '1field' | '2field',
): LendingWithdrawTransitionAudit {
  const mulDiv = (a: bigint, b: bigint, den: bigint) => (a * b) / den;

  const supA = oracle.supIdxAleo;
  const supU = oracle.supIdxUsdcx;
  const supD = oracle.supIdxUsad;
  const borA = oracle.borIdxAleo;
  const borU = oracle.borIdxUsdcx;
  const borD = oracle.borIdxUsad;
  const pA = oracle.priceAleo;
  const pU = oracle.priceUsdcx;
  const pD = oracle.priceUsad;
  const lA = oracle.ltvAleo;
  const lU = oracle.ltvUsdcx;
  const lD = oracle.ltvUsad;

  const priceOut = outAssetField === '0field' ? pA : outAssetField === '1field' ? pU : pD;

  const realSupA = toU64Leo(mulDiv(scaled.scaledSupNative, supA, LENDING_INDEX_SCALE));
  const realSupU = toU64Leo(mulDiv(scaled.scaledSupUsdcx, supU, LENDING_INDEX_SCALE));
  const realSupD = toU64Leo(mulDiv(scaled.scaledSupUsad, supD, LENDING_INDEX_SCALE));

  const supUsdA = toU64Leo(mulDiv(realSupA, pA, LENDING_PRICE_SCALE));
  const supUsdU = toU64Leo(mulDiv(realSupU, pU, LENDING_PRICE_SCALE));
  const supUsdD = toU64Leo(mulDiv(realSupD, pD, LENDING_PRICE_SCALE));

  const totalSupplyUsd = supUsdA + supUsdU + supUsdD;
  const withdrawUsd = toU64Leo(mulDiv(amountMicro, priceOut, LENDING_PRICE_SCALE));

  const amountPositive = amountMicro > BigInt(0);
  const withdrawUsdPositive = withdrawUsd > BigInt(0);
  const withdrawLteTotalSupplyUsd = withdrawUsd <= totalSupplyUsd;

  const targetAleoUsd = withdrawUsd > supUsdA ? supUsdA : withdrawUsd;
  const burnAleoRaw = toU64Leo(mulDiv(targetAleoUsd, LENDING_PRICE_SCALE, pA));
  const burnAleoPre = burnAleoRaw > realSupA ? realSupA : burnAleoRaw;
  const burnAleo = bumpBurnForScaledWithdrawLeg(burnAleoPre, realSupA, supA);
  const burnAleoUsd = toU64Leo(mulDiv(burnAleo, pA, LENDING_PRICE_SCALE));
  const remAfterAleo = withdrawUsd > burnAleoUsd ? withdrawUsd - burnAleoUsd : BigInt(0);

  const targetUsdcUsd = remAfterAleo > supUsdU ? supUsdU : remAfterAleo;
  const burnUsdcRaw = toU64Leo(mulDiv(targetUsdcUsd, LENDING_PRICE_SCALE, pU));
  const burnUsdcPre = burnUsdcRaw > realSupU ? realSupU : burnUsdcRaw;
  const burnUsdc = bumpBurnForScaledWithdrawLeg(burnUsdcPre, realSupU, supU);
  const burnUsdcUsd = toU64Leo(mulDiv(burnUsdc, pU, LENDING_PRICE_SCALE));
  const remAfterUsdc = remAfterAleo > burnUsdcUsd ? remAfterAleo - burnUsdcUsd : BigInt(0);

  const targetUsadUsd = remAfterUsdc > supUsdD ? supUsdD : remAfterUsdc;
  const burnUsadRaw = toU64Leo(mulDiv(targetUsadUsd, LENDING_PRICE_SCALE, pD));
  const burnUsadPre = burnUsadRaw > realSupD ? realSupD : burnUsadRaw;
  const burnUsad = bumpBurnForScaledWithdrawLeg(burnUsadPre, realSupD, supD);
  const burnUsadUsd = toU64Leo(mulDiv(burnUsad, pD, LENDING_PRICE_SCALE));
  const remAfterUsad = remAfterUsdc > burnUsadUsd ? remAfterUsdc - burnUsadUsd : BigInt(0);

  const remAfterUsadLteMax = remAfterUsad <= LENDING_WITHDRAW_REMAINDER_MAX_USD;

  const realAfterA = realSupA > burnAleo ? realSupA - burnAleo : BigInt(0);
  const realAfterU = realSupU > burnUsdc ? realSupU - burnUsdc : BigInt(0);
  const realAfterD = realSupD > burnUsad ? realSupD - burnUsad : BigInt(0);

  const wA = weightedCollateralUsdMicro(realAfterA, pA, lA);
  const wU = weightedCollateralUsdMicro(realAfterU, pU, lU);
  const wD = weightedCollateralUsdMicro(realAfterD, pD, lD);
  const totalCollAfter = wA + wU + wD;

  const realBorA = toU64Leo(mulDiv(scaled.scaledBorNative, borA, LENDING_INDEX_SCALE));
  const realBorU = toU64Leo(mulDiv(scaled.scaledBorUsdcx, borU, LENDING_INDEX_SCALE));
  const realBorD = toU64Leo(mulDiv(scaled.scaledBorUsad, borD, LENDING_INDEX_SCALE));

  const debtA = toU64Leo(mulDiv(realBorA, pA, LENDING_PRICE_SCALE));
  const debtU = toU64Leo(mulDiv(realBorU, pU, LENDING_PRICE_SCALE));
  const debtD = toU64Leo(mulDiv(realBorD, pD, LENDING_PRICE_SCALE));
  const totalDebt = debtA + debtU + debtD;

  const healthAfterWithdraw = totalDebt === BigInt(0) || totalDebt <= totalCollAfter;

  const scaledOutAleo = toU64Leo(mulDiv(burnAleo, LENDING_INDEX_SCALE, supA));
  const scaledOutUsdc = toU64Leo(mulDiv(burnUsdc, LENDING_INDEX_SCALE, supU));
  const scaledOutUsad = toU64Leo(mulDiv(burnUsad, LENDING_INDEX_SCALE, supD));
  const scaledOutPositive =
    (burnAleo === BigInt(0) || scaledOutAleo > BigInt(0)) &&
    (burnUsdc === BigInt(0) || scaledOutUsdc > BigInt(0)) &&
    (burnUsad === BigInt(0) || scaledOutUsad > BigInt(0));

  let failReason: string | null = null;
  if (!amountPositive) failReason = 'amount <= 0';
  else if (!withdrawUsdPositive) failReason = 'withdraw_usd == 0 (amount * price / PRICE_SCALE truncated)';
  else if (!withdrawLteTotalSupplyUsd) failReason = 'withdraw_usd > total_supply_usd';
  else if (!scaledOutPositive) {
    failReason =
      'burn > 0 but scaled_out == 0 after index-dust bump (supply too small vs index; increase withdraw or close dust leg)';
  } else if (!remAfterUsadLteMax) {
    failReason = `rem_after_usad (${remAfterUsad}) > ${LENDING_WITHDRAW_REMAINDER_MAX_USD} (cross-asset rounding)`;
  } else if (!healthAfterWithdraw) {
    failReason = 'total_debt_usd > weighted_collateral_after (health / LTV)';
  }

  const ok =
    amountPositive &&
    withdrawUsdPositive &&
    withdrawLteTotalSupplyUsd &&
    scaledOutPositive &&
    remAfterUsadLteMax &&
    healthAfterWithdraw;

  return {
    ok,
    failReason,
    checks: {
      amountPositive,
      withdrawUsdPositive,
      withdrawLteTotalSupplyUsd,
      scaledOutPositive,
      remAfterUsadLteMax,
      healthAfterWithdraw,
    },
    numerics: {
      amountMicro: amountMicro.toString(),
      outAssetField,
      priceOut: priceOut.toString(),
      withdrawUsd: withdrawUsd.toString(),
      totalSupplyUsd: totalSupplyUsd.toString(),
      remAfterUsad: remAfterUsad.toString(),
      burnAleo: burnAleo.toString(),
      burnUsdcx: burnUsdc.toString(),
      burnUsad: burnUsad.toString(),
      totalDebtUsd: totalDebt.toString(),
      weightedCollateralAfterUsd: totalCollAfter.toString(),
      realSupAleo: realSupA.toString(),
      realSupUsdcx: realSupU.toString(),
      realSupUsad: realSupD.toString(),
    },
  };
}

export type LendingWithdrawFinalizePreview = {
  /** Raw `available_liquidity[out]` before finalize (null = mapping empty). */
  availableLiquidityPayout: string | null;
  /** After Leo saturating subtract: `prev > amount ? prev - amount : 0`. */
  payoutAfterSaturatingSub: string;
  /** `true` when pool counter is below payout amount (finalize still applies; operational insolvency). */
  liquidityDeficit: boolean;
};

/** Reads on-chain `available_liquidity` for the payout asset (diagnostic; finalize uses saturating subtract, vault pays out). */
export async function previewLendingWithdrawFinalizeLiquidity(
  programId: string,
  outAssetField: '0field' | '1field' | '2field',
  amountMicro: bigint,
): Promise<LendingWithdrawFinalizePreview> {
  const prev = await readMappingU64(programId, 'available_liquidity', outAssetField);
  if (prev == null) {
    return {
      availableLiquidityPayout: null,
      payoutAfterSaturatingSub: '0',
      liquidityDeficit: amountMicro > BigInt(0),
    };
  }
  const next = prev > amountMicro ? prev - amountMicro : BigInt(0);
  return {
    availableLiquidityPayout: prev.toString(),
    payoutAfterSaturatingSub: next.toString(),
    liquidityDeficit: prev < amountMicro,
  };
}

/** Fresh oracle + transition simulation + payout liquidity (call right before `executeTransaction`). */
export async function auditLendingWithdrawPreSubmit(
  programId: string,
  scaled: LendingPositionScaled,
  amountMicro: bigint,
  outField: '0field' | '1field' | '2field',
): Promise<{
  sim: LendingWithdrawTransitionAudit;
  liquidity: LendingWithdrawFinalizePreview;
  oracle: LendingOraclePublic;
}> {
  const oracle = await fetchLendingOraclePublic(programId);
  const sim = simulateLendingWithdrawTransitionAudit(scaled, oracle, amountMicro, outField);
  const liquidity = await previewLendingWithdrawFinalizeLiquidity(programId, outField, amountMicro);
  return { sim, liquidity, oracle };
}

async function logLendingWithdrawAuditIfEnabled(
  poolProgramId: string,
  label: string,
  scaled: LendingPositionScaled,
  oracle: LendingOraclePublic,
  amountMicro: bigint,
  outField: '0field' | '1field' | '2field',
): Promise<void> {
  if (!XYRA_WITHDRAW_AUDIT_DEBUG) return;
  const sim = simulateLendingWithdrawTransitionAudit(scaled, oracle, amountMicro, outField);
  const liquidity = await previewLendingWithdrawFinalizeLiquidity(poolProgramId, outField, amountMicro);
  privacyLog(
    '[xyra withdraw audit]',
    JSON.stringify(
      {
        label,
        poolProgramId,
        transitionOk: sim.ok,
        failReason: sim.failReason,
        checks: sim.checks,
        numerics: sim.numerics,
        finalizeLiquidity: liquidity,
      },
      null,
      2,
    ),
  );
}

async function getMappingU64Big(programId: string, mappingName: string, key: string): Promise<bigint | null> {
      try {
        const res = await client.request('getMappingValue', {
          program_id: programId,
          mapping_name: mappingName,
          key,
        });
        const raw = res?.value ?? res ?? null;
        if (raw == null) return null;
    const str = String(raw).replace(/u64$/i, '').trim();
    if (!str) return null;
    return BigInt(str);
      } catch {
        return null;
      }
}

export type MappingReadDebug = {
  mapping: string;
  key: string;
  ok: boolean;
  /** Raw payload after unwrap (often `12345u64` string). `null` = no mapping entry at this key. */
  raw: unknown;
  parsedU64: bigint | null;
  rpcError?: string;
  /** Full object returned by `client.request('getMappingValue', …)` (shape varies by node). */
  rpcEnvelope?: unknown;
};

/**
 * Single mapping read with full visibility — use when `user_scaled_*` looks wrong vs wallet records.
 * Run from DevTools after dynamic import (see `probeLendingPositionMappings`).
 */
export async function getMappingValueDebug(
  programId: string,
  mappingName: string,
  key: string,
): Promise<MappingReadDebug> {
  try {
    const res = await client.request('getMappingValue', {
      program_id: programId,
      mapping_name: mappingName,
      key,
    });
    const raw = unwrapMappingRpcPayload(res);
    const base = {
      mapping: mappingName,
      key,
      ok: true as const,
      rpcEnvelope: res,
    };
    if (raw == null) {
      return { ...base, raw: null, parsedU64: null };
    }
    const str = String(raw).replace(/u64$/i, '').trim();
    if (!str) {
      return { ...base, raw, parsedU64: null };
    }
    let parsedU64: bigint | null = null;
    try {
      parsedU64 = BigInt(str);
    } catch {
      parsedU64 = null;
    }
    return { ...base, raw, parsedU64 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      mapping: mappingName,
      key,
      ok: false,
      raw: null,
      parsedU64: null,
      rpcError: msg,
    };
  }
}

export type LendingMappingProbeResult = {
  rpcUrl: string;
  programId: string;
  address: string;
  userKeyField: string | null;
  positionKeys: { assetId: string; posKey: string | null }[];
  /** Per-asset `user_scaled_supply` at `posKey` */
  userScaledSupply: MappingReadDebug[];
  userScaledBorrow: MappingReadDebug[];
  /** Sanity: global pool totals (field keys `0field` / `1field` / `2field`) */
  totalDeposited: MappingReadDebug[];
  supplyIndex: MappingReadDebug[];
  caps: Awaited<ReturnType<typeof getCrossCollateralBorrowCapsFromChain>>;
  /** Which `user_key` hash matches `user_scaled_supply` for ALEO (address bits vs plaintext bits). */
  userKeyVariantProbe: Awaited<ReturnType<typeof probeUserKeyVariantsForAleoSupply>> | null;
  notes: string[];
};

/**
 * End-to-end check: wasm-derived position keys + mapping reads + caps helper.
 * Browser console (dev, `npm run dev`): `@/` imports do not resolve in the raw console. Use:
 * ```ts
 * await window.__xyraBorrowDebug.probeMyMappings('aleo1...')
 * // or
 * await window.__xyraBorrowDebug.probeLendingPositionMappings(window.__xyraBorrowDebug.LENDING_POOL_PROGRAM_ID, 'aleo1...')
 * ```
 * If `userScaledSupply` is null but `totalDeposited` works, keys likely don’t match Leo `compute_position_key`.
 */
export async function probeLendingPositionMappings(
  programId: string,
  userAddress: string,
): Promise<LendingMappingProbeResult> {
  const notes: string[] = [];
  const trimmed = userAddress?.trim();
  if (!trimmed?.startsWith('aleo1')) {
    notes.push('Address must be a bech32 aleo1… string.');
    return {
      rpcUrl: CURRENT_RPC_URL,
      programId,
      address: String(userAddress),
      userKeyField: null,
      positionKeys: [],
      userScaledSupply: [],
      userScaledBorrow: [],
      totalDeposited: [],
      supplyIndex: [],
      caps: null,
      userKeyVariantProbe: null,
      notes,
    };
  }

  const userKeyField = await computeUserKeyFieldFromAddress(trimmed);
  if (!userKeyField) notes.push('computeUserKeyFieldFromAddress returned null (wasm / BHP).');

  const assetIds = ['0field', '1field', '2field'] as const;
  const positionKeys: { assetId: string; posKey: string | null }[] = [];
  for (const a of assetIds) {
    const pk = await computeLendingPositionMappingKey(trimmed, a);
    positionKeys.push({ assetId: a, posKey: pk });
    if (!pk) notes.push(`computeLendingPositionMappingKey failed for ${a}`);
  }

  const userScaledSupply: MappingReadDebug[] = [];
  const userScaledBorrow: MappingReadDebug[] = [];
  for (const { assetId, posKey } of positionKeys) {
    if (!posKey) {
      userScaledSupply.push({
        mapping: 'user_scaled_supply',
        key: '(null)',
        ok: false,
        raw: null,
        parsedU64: null,
        rpcError: 'missing position key',
      });
      continue;
    }
    userScaledSupply.push(await getMappingValueDebug(programId, 'user_scaled_supply', posKey));
    userScaledBorrow.push(await getMappingValueDebug(programId, 'user_scaled_borrow', posKey));
  }

  const totalDeposited: MappingReadDebug[] = [];
  const supplyIndex: MappingReadDebug[] = [];
  for (const a of assetIds) {
    totalDeposited.push(await getMappingValueDebug(programId, 'total_deposited', a));
    supplyIndex.push(await getMappingValueDebug(programId, 'supply_index', a));
  }

  let caps: Awaited<ReturnType<typeof getCrossCollateralBorrowCapsFromChain>> = null;
  try {
    caps = await getCrossCollateralBorrowCapsFromChain(programId, null);
    notes.push('v8: per-user caps need wallet LendingPosition — caps above are null without scaled record.');
  } catch (e: unknown) {
    notes.push(`getCrossCollateralBorrowCapsFromChain threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (caps && caps.realSupplyMicroAleo === BigInt(0) && caps.realSupplyMicroUsdcx === BigInt(0) && caps.realSupplyMicroUsad === BigInt(0)) {
    notes.push(
      'All realSupply* are 0 on chain reads. If wallet records show deposits, verify key derivation matches deployed Leo (BHP256::hash_to_field(address) and hash_to_field(user_key + asset_id)).',
    );
  }

  let userKeyVariantProbe: Awaited<ReturnType<typeof probeUserKeyVariantsForAleoSupply>> | null = null;
  try {
    userKeyVariantProbe = await probeUserKeyVariantsForAleoSupply(programId, trimmed);
    notes.push(userKeyVariantProbe.note);
  } catch (e: unknown) {
    notes.push(`probeUserKeyVariantsForAleoSupply: ${e instanceof Error ? e.message : String(e)}`);
  }

  privacyLog('[probeLendingPositionMappings]', {
    rpcUrl: CURRENT_RPC_URL,
    programId,
    address: trimmed,
    userKeyField,
    positionKeys,
    userScaledSupply,
    userScaledBorrow,
    totalDeposited,
    supplyIndex,
    capsSummary: caps
      ? {
          realSupplyMicroAleo: caps.realSupplyMicroAleo.toString(),
          realSupplyMicroUsdcx: caps.realSupplyMicroUsdcx.toString(),
          realSupplyMicroUsad: caps.realSupplyMicroUsad.toString(),
          totalDebtUsd: caps.totalDebtUsd.toString(),
        }
      : null,
    userKeyVariantProbe,
    notes,
  });

  return {
    rpcUrl: CURRENT_RPC_URL,
    programId,
    address: trimmed,
    userKeyField,
    positionKeys,
    userScaledSupply,
    userScaledBorrow,
    totalDeposited,
    supplyIndex,
    caps,
    userKeyVariantProbe,
    notes,
  };
}

export type LiquidationPreview = {
  ok: boolean;
  reason?: string;
  liquidatable: boolean;
  totalDebtUsd: number;
  thresholdCollateralUsd: number;
  aleoDebt: number;
  maxCloseAleo: number;
  repayAleo: number;
  seizeAsset: '0field' | '1field' | '2field';
  /** Borrower real supply in the selected seize asset (micro-units as float). */
  collateralSeizeAsset: number;
  seizeAmount: number;
  seizeUsd: number;
  liqBonusBps: number;
};

/** Self-liquidation preview (v8: uses private `LendingPosition` — no third-party borrower lookup). */
export async function getLiquidationPreviewAleo(
  programId: string,
  repayAleo: number,
  seizeAsset: '0field' | '1field' | '2field',
  scaled: LendingPositionScaled | null,
): Promise<LiquidationPreview> {
  const zero: LiquidationPreview = {
    ok: false,
    reason: 'Preview unavailable.',
    liquidatable: false,
    totalDebtUsd: 0,
    thresholdCollateralUsd: 0,
    aleoDebt: 0,
    maxCloseAleo: 0,
    repayAleo: 0,
    seizeAsset,
    collateralSeizeAsset: 0,
    seizeAmount: 0,
    seizeUsd: 0,
    liqBonusBps: 0,
  };

  if (!scaled) {
    return { ...zero, reason: 'No LendingPosition in wallet — open an account or refresh records.' };
  }
  // Keep health/liquidatable preview available even before user enters repay amount.
  // Submit guards in UI still enforce repay > 0 for transaction creation.
  const repayInputAleo = Number.isFinite(repayAleo) && repayAleo > 0 ? repayAleo : 0;

  try {
    const readU64 = async (mappingName: string, key: string): Promise<number> => {
      try {
        const res = await client.request('getMappingValue', {
          program_id: programId,
          mapping_name: mappingName,
          key,
        });
        return parseMappingU64Response(res) ?? 0;
      } catch {
        return 0;
      }
    };

    const sA = Number(scaled.scaledSupNative);
    const sU = Number(scaled.scaledSupUsdcx);
    const sD = Number(scaled.scaledSupUsad);
    const bA = Number(scaled.scaledBorNative);
    const bU = Number(scaled.scaledBorUsdcx);
    const bD = Number(scaled.scaledBorUsad);

    const [iSA, iSU, iSD, iBA, iBU, iBD, pA, pU, pD, tA, tU, tD, bonus] = await Promise.all([
      readU64('supply_index', '0field'),
      readU64('supply_index', '1field'),
      readU64('supply_index', '2field'),
      readU64('borrow_index', '0field'),
      readU64('borrow_index', '1field'),
      readU64('borrow_index', '2field'),
      readU64('asset_price', '0field'),
      readU64('asset_price', '1field'),
      readU64('asset_price', '2field'),
      readU64('asset_liq_threshold', '0field'),
      readU64('asset_liq_threshold', '1field'),
      readU64('asset_liq_threshold', '2field'),
      readU64('asset_liq_bonus', seizeAsset),
    ]);

    const INDEX_SCALE = 1_000_000_000_000;
    const PRICE_SCALE = 1_000_000;
    const BPS = 10_000;
    const CLOSE_FACTOR_BPS = 5_000;

    const realSupA = (sA * iSA) / INDEX_SCALE;
    const realSupU = (sU * iSU) / INDEX_SCALE;
    const realSupD = (sD * iSD) / INDEX_SCALE;
    const realBorA = (bA * iBA) / INDEX_SCALE;
    const realBorU = (bU * iBU) / INDEX_SCALE;
    const realBorD = (bD * iBD) / INDEX_SCALE;

    // `real*` are micro-token units. `weighted/debt` return micro-USD.
    const weighted = (realMicro: number, priceMicroUsd: number, thrBps: number) =>
      (realMicro * priceMicroUsd * thrBps) / (PRICE_SCALE * BPS);
    const debt = (realMicro: number, priceMicroUsd: number) => (realMicro * priceMicroUsd) / PRICE_SCALE;

    const thresholdCollateralUsdMicro =
      weighted(realSupA, pA, tA) + weighted(realSupU, pU, tU) + weighted(realSupD, pD, tD);
    const totalDebtUsdMicro = debt(realBorA, pA) + debt(realBorU, pU) + debt(realBorD, pD);
    const liquidatable = totalDebtUsdMicro > thresholdCollateralUsdMicro;

    const aleoDebtMicro = realBorA;
    const maxCloseAleoMicro = Math.max(0, Math.min(aleoDebtMicro, (aleoDebtMicro * CLOSE_FACTOR_BPS) / BPS));
    const repayInputMicro = Math.round(repayInputAleo * 1_000_000);
    const repayMicro = Math.max(0, Math.min(repayInputMicro, maxCloseAleoMicro));
    const repayAleoClamped = repayMicro / 1_000_000;
    const repayUsdMicro = (repayMicro * pA) / PRICE_SCALE;
    const seizeUsdMicro = (repayUsdMicro * (BPS + bonus)) / BPS;
    const seizePrice = seizeAsset === '0field' ? pA : seizeAsset === '1field' ? pU : pD;
    const seizeAmountMicro = seizePrice > 0 ? (seizeUsdMicro * PRICE_SCALE) / seizePrice : 0;
    const collateralSeizeAssetMicro =
      seizeAsset === '0field' ? realSupA : seizeAsset === '1field' ? realSupU : realSupD;

    return {
      ok: true,
      liquidatable,
      totalDebtUsd: totalDebtUsdMicro / 1_000_000,
      thresholdCollateralUsd: thresholdCollateralUsdMicro / 1_000_000,
      aleoDebt: aleoDebtMicro / 1_000_000,
      maxCloseAleo: maxCloseAleoMicro / 1_000_000,
      repayAleo: repayAleoClamped,
      seizeAsset,
      collateralSeizeAsset: collateralSeizeAssetMicro / 1_000_000,
      seizeAmount: seizeAmountMicro / 1_000_000,
      seizeUsd: seizeUsdMicro / 1_000_000,
      liqBonusBps: bonus,
    };
  } catch (e: any) {
    return { ...zero, reason: e?.message || 'Failed to compute preview.' };
  }
}

/** Flash self-liquidation UI: max repay (close factor ∩ largest credits record) and seize-asset options with collateral. */
export type SelfLiquidationUiLimits = {
  ok: boolean;
  reason?: string;
  maxCloseAleo: number;
  maxCreditsSingleRecordAleo: number;
  effectiveMaxRepayAleo: number;
  seizeOptions: Array<'0field' | '1field' | '2field'>;
  aleoDebt: number;
  realSupAleo: number;
  realSupUsdcx: number;
  realSupUsad: number;
};

export async function getSelfLiquidationUiLimits(
  programId: string,
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
): Promise<SelfLiquidationUiLimits> {
  const empty: SelfLiquidationUiLimits = {
    ok: false,
    reason: 'Unavailable.',
    maxCloseAleo: 0,
    maxCreditsSingleRecordAleo: 0,
    effectiveMaxRepayAleo: 0,
    seizeOptions: [],
    aleoDebt: 0,
    realSupAleo: 0,
    realSupUsdcx: 0,
    realSupUsad: 0,
  };

  try {
    const scaled = await parseLatestLendingPositionScaled(requestRecords, programId, decrypt);
    if (!scaled) {
      return { ...empty, reason: 'No LendingPosition in wallet — open an account or refresh records.' };
    }

    const readU64 = async (mappingName: string, key: string): Promise<number> => {
      try {
        const res = await client.request('getMappingValue', {
          program_id: programId,
          mapping_name: mappingName,
          key,
        });
        return parseMappingU64Response(res) ?? 0;
      } catch {
        return 0;
      }
    };

    const sA = Number(scaled.scaledSupNative);
    const sU = Number(scaled.scaledSupUsdcx);
    const sD = Number(scaled.scaledSupUsad);
    const bA = Number(scaled.scaledBorNative);

    const [iSA, iSU, iSD, iBA] = await Promise.all([
      readU64('supply_index', '0field'),
      readU64('supply_index', '1field'),
      readU64('supply_index', '2field'),
      readU64('borrow_index', '0field'),
    ]);

    const INDEX_SCALE = 1_000_000_000_000;
    const BPS = 10_000;
    const CLOSE_FACTOR_BPS = 5_000;

    const realSupA = (sA * iSA) / INDEX_SCALE; // micro token
    const realSupU = (sU * iSU) / INDEX_SCALE; // micro token
    const realSupD = (sD * iSD) / INDEX_SCALE; // micro token
    const realBorA = (bA * iBA) / INDEX_SCALE; // micro token

    const seizeOptions: Array<'0field' | '1field' | '2field'> = [];
    if (Math.round(realSupA) > 0) seizeOptions.push('0field');
    if (Math.round(realSupU) > 0) seizeOptions.push('1field');
    if (Math.round(realSupD) > 0) seizeOptions.push('2field');

    const aleoDebtMicro = realBorA;
    const maxCloseAleoMicro = Math.max(0, Math.min(aleoDebtMicro, (aleoDebtMicro * CLOSE_FACTOR_BPS) / BPS));

    const maxMicro = await getCreditsMaxSingleRecordMicroAleo(requestRecords, decrypt);
    const maxCreditsSingleRecordAleo = maxMicro / 1_000_000;
    const maxCloseAleo = maxCloseAleoMicro / 1_000_000;
    const effectiveMaxRepayAleo = Math.max(0, Math.min(maxCloseAleo, maxCreditsSingleRecordAleo));

    return {
      ok: true,
      maxCloseAleo,
      maxCreditsSingleRecordAleo,
      effectiveMaxRepayAleo,
      seizeOptions,
      aleoDebt: aleoDebtMicro / 1_000_000,
      realSupAleo: realSupA / 1_000_000,
      realSupUsdcx: realSupU / 1_000_000,
      realSupUsad: realSupD / 1_000_000,
    };
  } catch (e: any) {
    return { ...empty, reason: e?.message || 'Failed to load self-liquidation limits.' };
  }
}

/**
 * Replicates `finalize_borrow` collateral/debt USD totals and max borrow per asset (micro units)
 * so the UI cannot exceed `assert(total_debt + new_borrow_usd <= total_collateral)`.
 */
export type CrossCollateralChainCaps = {
  /** LTV-weighted collateral USD (micro); same as `finalize_borrow` numerator. */
  totalCollateralUsd: bigint;
  totalDebtUsd: bigint;
  headroomUsd: bigint;
  maxBorrowMicroAleo: bigint;
  maxBorrowMicroUsdcx: bigint;
  maxBorrowMicroUsad: bigint;
  /** Effective token amounts (micro units) from scaled position × indices — use for UI rows when set. */
  realSupplyMicroAleo: bigint;
  realSupplyMicroUsdcx: bigint;
  realSupplyMicroUsad: bigint;
  realBorrowMicroAleo: bigint;
  realBorrowMicroUsdcx: bigint;
  realBorrowMicroUsad: bigint;
};

export async function getCrossCollateralBorrowCapsFromChain(
  programId: string,
  scaled: LendingPositionScaled | null,
): Promise<CrossCollateralChainCaps | null> {
  if (!scaled) return null;

  const z = (x: bigint | null) => x ?? BigInt(0);

  const ssA = scaled.scaledSupNative;
  const ssU = scaled.scaledSupUsdcx;
  const ssD = scaled.scaledSupUsad;
  const sbA = scaled.scaledBorNative;
  const sbU = scaled.scaledBorUsdcx;
  const sbD = scaled.scaledBorUsad;

  const [
    supA,
    supU,
    supD,
    borA,
    borU,
    borD,
    pA,
    pU,
    pD,
    ltvA,
    ltvU,
    ltvD,
  ] = await Promise.all([
    getMappingU64Big(programId, 'supply_index', '0field'),
    getMappingU64Big(programId, 'supply_index', '1field'),
    getMappingU64Big(programId, 'supply_index', '2field'),
    getMappingU64Big(programId, 'borrow_index', '0field'),
    getMappingU64Big(programId, 'borrow_index', '1field'),
    getMappingU64Big(programId, 'borrow_index', '2field'),
    getMappingU64Big(programId, 'asset_price', '0field'),
    getMappingU64Big(programId, 'asset_price', '1field'),
    getMappingU64Big(programId, 'asset_price', '2field'),
    getMappingU64Big(programId, 'asset_ltv', '0field'),
    getMappingU64Big(programId, 'asset_ltv', '1field'),
    getMappingU64Big(programId, 'asset_ltv', '2field'),
  ]);

  const supIdxA = supA ?? LENDING_INDEX_SCALE;
  const supIdxU = supU ?? LENDING_INDEX_SCALE;
  const supIdxD = supD ?? LENDING_INDEX_SCALE;
  const borIdxA = borA ?? LENDING_INDEX_SCALE;
  const borIdxU = borU ?? LENDING_INDEX_SCALE;
  const borIdxD = borD ?? LENDING_INDEX_SCALE;

  const priceA = pA ?? LENDING_PRICE_SCALE;
  const priceU = pU ?? LENDING_PRICE_SCALE;
  const priceD = pD ?? LENDING_PRICE_SCALE;

  const ltvAB = ltvA ?? BigInt(7500);
  const ltvUB = ltvU ?? BigInt(8500);
  const ltvDB = ltvD ?? BigInt(8500);

  const realSupA = (z(ssA) * supIdxA) / LENDING_INDEX_SCALE;
  const realSupU = (z(ssU) * supIdxU) / LENDING_INDEX_SCALE;
  const realSupD = (z(ssD) * supIdxD) / LENDING_INDEX_SCALE;
  const realBorA = (z(sbA) * borIdxA) / LENDING_INDEX_SCALE;
  const realBorU = (z(sbU) * borIdxU) / LENDING_INDEX_SCALE;
  const realBorD = (z(sbD) * borIdxD) / LENDING_INDEX_SCALE;

  // finalize_borrow: weighted_* (weighted_collateral_usd) and debt_* (same order as Leo).
  const weightedA = weightedCollateralUsdMicro(realSupA, priceA, ltvAB);
  const weightedU = weightedCollateralUsdMicro(realSupU, priceU, ltvUB);
  const weightedD = weightedCollateralUsdMicro(realSupD, priceD, ltvDB);
  const totalCollateralUsd = weightedA + weightedU + weightedD;

  const debtA = (realBorA * priceA) / LENDING_PRICE_SCALE;
  const debtU = (realBorU * priceU) / LENDING_PRICE_SCALE;
  const debtD = (realBorD * priceD) / LENDING_PRICE_SCALE;
  const totalDebtUsd = debtA + debtU + debtD;
  const anyScaledBorrow = sbA + sbU + sbD > BigInt(0);
  const debtUsdForHealth =
    totalDebtUsd > BigInt(0) ? totalDebtUsd : anyScaledBorrow ? BigInt(1) : BigInt(0);

  let headroomUsd = totalCollateralUsd - debtUsdForHealth;
  if (headroomUsd < BigInt(0)) headroomUsd = BigInt(0);

  const maxMicroForPrice = (head: bigint, price: bigint): bigint => {
    if (head <= BigInt(0) || price <= BigInt(0)) return BigInt(0);
    return (head * LENDING_PRICE_SCALE + LENDING_PRICE_SCALE - BigInt(1)) / price;
  };

  let maxBorrowMicroAleo = maxMicroForPrice(headroomUsd, priceA);
  let maxBorrowMicroUsdcx = maxMicroForPrice(headroomUsd, priceU);
  let maxBorrowMicroUsad = maxMicroForPrice(headroomUsd, priceD);

  const vaultHum = await fetchVaultHumanBalancesFromBackend();
  if (vaultHum) {
    const vA = humanToMicroU64(vaultHum.aleo);
    const vU = humanToMicroU64(vaultHum.usdcx);
    const vD = humanToMicroU64(vaultHum.usad);
    maxBorrowMicroAleo = maxBorrowMicroAleo < vA ? maxBorrowMicroAleo : vA;
    maxBorrowMicroUsdcx = maxBorrowMicroUsdcx < vU ? maxBorrowMicroUsdcx : vU;
    maxBorrowMicroUsad = maxBorrowMicroUsad < vD ? maxBorrowMicroUsad : vD;
  }

  return {
    totalCollateralUsd,
    totalDebtUsd,
    headroomUsd,
    maxBorrowMicroAleo,
    maxBorrowMicroUsdcx,
    maxBorrowMicroUsad,
    realSupplyMicroAleo: realSupA,
    realSupplyMicroUsdcx: realSupU,
    realSupplyMicroUsad: realSupD,
    realBorrowMicroAleo: realBorA,
    realBorrowMicroUsdcx: realBorU,
    realBorrowMicroUsad: realBorD,
  };
}

export type CrossCollateralWithdrawCaps = {
  maxWithdrawMicroAleo: bigint;
  maxWithdrawMicroUsdcx: bigint;
  maxWithdrawMicroUsad: bigint;
  /**
   * ALEO withdraw from position/health only (binary search), before treasury / mapping payout clamp.
   */
  maxWithdrawMicroAleoPortfolio: bigint;
  /** `available_liquidity` mapping for native ALEO (`0field`); null if RPC read failed (diagnostics only when vault fetch works). */
  availableLiquidityMicroAleo: bigint | null;
};

/**
 * Replicates unified `withdraw` (`0field` ALEO / `1field` USDCx / `2field` USAD) on-chain:
 * same oracle as `fetchLendingOraclePublic` (the tx path), and u64 truncation on intermediates
 * (`real_sup_*`, `sup_*_usd_before`, `withdraw_usd`, burn legs, debt USD, weighted collateral after).
 *
 * **Portfolio USD cap (cross-asset):** `canWithdraw` requires `withdraw_usd <= supUsdA + supUsdU + supUsdD` for this note.
 * The ladder walks ALEO → USDCx → USAD; the user does **not** need supply in the payout asset—only enough **total**
 * raw-supply USD across the three (plus health / rem<=3 / index-dust bump matching `main.leo`).
 *
 * **Payout caps (frontend):** `min(portfolio binary search, treasury)` per asset when `/vault-balances` loads.
 * Withdraw: transition burn ladder matches Leo (floor + index-dust bump + rem<=3); finalize decrements **`available_liquidity[payout]` only**
 * (saturating). Cross-asset does **not** require on-chain idle stables if treasury funds the payout.
 *
 * **Why UI max can be below displayed supply (normal):** (1) **Debt** — health after withdraw. (2) **One note per tx**.
 * (3) **Vault** — `min(..., vaultHum.*)` caps payout to operational liquidity.
 */
export async function getCrossCollateralWithdrawCapsFromChain(
  programId: string,
  scaled: LendingPositionScaled | null,
): Promise<CrossCollateralWithdrawCaps | null> {
  if (!scaled) return null;

  const z = (x: bigint | null) => x ?? BigInt(0);

  const ssA = scaled.scaledSupNative;
  const ssU = scaled.scaledSupUsdcx;
  const ssD = scaled.scaledSupUsad;
  const sbA = scaled.scaledBorNative;
  const sbU = scaled.scaledBorUsdcx;
  const sbD = scaled.scaledBorUsad;

  const o = await fetchLendingOraclePublic(programId);
  const supIdxA = o.supIdxAleo;
  const supIdxU = o.supIdxUsdcx;
  const supIdxD = o.supIdxUsad;
  const borIdxA = o.borIdxAleo;
  const borIdxU = o.borIdxUsdcx;
  const borIdxD = o.borIdxUsad;
  const priceA = o.priceAleo;
  const priceU = o.priceUsdcx;
  const priceD = o.priceUsad;
  const ltvAB = o.ltvAleo;
  const ltvUB = o.ltvUsdcx;
  const ltvDB = o.ltvUsad;

  const realSup = [
    toU64Leo((z(ssA) * supIdxA) / LENDING_INDEX_SCALE),
    toU64Leo((z(ssU) * supIdxU) / LENDING_INDEX_SCALE),
    toU64Leo((z(ssD) * supIdxD) / LENDING_INDEX_SCALE),
  ];
  const realBor = [
    toU64Leo((z(sbA) * borIdxA) / LENDING_INDEX_SCALE),
    toU64Leo((z(sbU) * borIdxU) / LENDING_INDEX_SCALE),
    toU64Leo((z(sbD) * borIdxD) / LENDING_INDEX_SCALE),
  ];

  const prices = [priceA, priceU, priceD];
  const ltvs = [ltvAB, ltvUB, ltvDB];

  const debtUsd0 = toU64Leo((realBor[0] * prices[0]) / LENDING_PRICE_SCALE);
  const debtUsd1 = toU64Leo((realBor[1] * prices[1]) / LENDING_PRICE_SCALE);
  const debtUsd2 = toU64Leo((realBor[2] * prices[2]) / LENDING_PRICE_SCALE);
  const totalDebtUsd = debtUsd0 + debtUsd1 + debtUsd2;
  /** Leo still enforces health if scaled borrow > 0 but u64 USD debt sums truncate to 0. */
  const anyScaledBorrow = sbA + sbU + sbD > BigInt(0);
  const debtUsdForHealth =
    totalDebtUsd > BigInt(0) ? totalDebtUsd : anyScaledBorrow ? BigInt(1) : BigInt(0);

  const supUsdBefore = [
    toU64Leo((realSup[0] * prices[0]) / LENDING_PRICE_SCALE),
    toU64Leo((realSup[1] * prices[1]) / LENDING_PRICE_SCALE),
    toU64Leo((realSup[2] * prices[2]) / LENDING_PRICE_SCALE),
  ];
  const totalSupplyUsdBefore = supUsdBefore[0] + supUsdBefore[1] + supUsdBefore[2];
  const supIdxByLeg: [bigint, bigint, bigint] = [supIdxA, supIdxU, supIdxD];

  const MAX_U64 = LENDING_U64_MAX;

  const canWithdraw = (amountOutMicro: bigint, outIdx: 0 | 1 | 2): boolean => {
    if (amountOutMicro <= BigInt(0)) return false;
    const priceOut = prices[outIdx];
    if (priceOut <= BigInt(0)) return false;

    const withdrawUsd = toU64Leo((amountOutMicro * priceOut) / LENDING_PRICE_SCALE);
    if (withdrawUsd <= BigInt(0)) return false;
    /// Same as Leo WDR-08: cap by **sum** of position raw-supply USD (cross-asset), not payout-asset supply alone.
    if (withdrawUsd > totalSupplyUsdBefore) return false;

    let rem = withdrawUsd;
    const burnAmt: bigint[] = [BigInt(0), BigInt(0), BigInt(0)];
    for (const idx of [0, 1, 2] as const) {
      const targetUsd = rem > supUsdBefore[idx] ? supUsdBefore[idx] : rem;
      const p = prices[idx];
      /// **Must match `main.leo` `withdraw`:** floor `target_usd * PRICE_SCALE / price`, not ceil — ceil made
      /// caps optimistic so txs passed the UI but reverted on `rem_after_usad <= WITHDRAW_XA_REMAINDER_MAX` (e.g. USDC-only → ALEO out).
      const burnAmtRaw = toU64Leo((targetUsd * LENDING_PRICE_SCALE) / p);
      const burnPre = burnAmtRaw > realSup[idx] ? realSup[idx] : burnAmtRaw;
      const burnAmtIdx = bumpBurnForScaledWithdrawLeg(burnPre, realSup[idx], supIdxByLeg[idx]);
      const burnUsd = toU64Leo((burnAmtIdx * prices[idx]) / LENDING_PRICE_SCALE);
      rem = rem > burnUsd ? rem - burnUsd : BigInt(0);
      burnAmt[idx] = burnAmtIdx;
    }

    const scaledOutPositive =
      (burnAmt[0] === BigInt(0) || toU64Leo((burnAmt[0] * LENDING_INDEX_SCALE) / supIdxA) > BigInt(0)) &&
      (burnAmt[1] === BigInt(0) || toU64Leo((burnAmt[1] * LENDING_INDEX_SCALE) / supIdxU) > BigInt(0)) &&
      (burnAmt[2] === BigInt(0) || toU64Leo((burnAmt[2] * LENDING_INDEX_SCALE) / supIdxD) > BigInt(0));
    if (!scaledOutPositive) return false;

    if (rem > LENDING_WITHDRAW_REMAINDER_MAX_USD) return false;

    const realSupAfter = [
      realSup[0] > burnAmt[0] ? realSup[0] - burnAmt[0] : BigInt(0),
      realSup[1] > burnAmt[1] ? realSup[1] - burnAmt[1] : BigInt(0),
      realSup[2] > burnAmt[2] ? realSup[2] - burnAmt[2] : BigInt(0),
    ];

    const weightedAfter = [
      toU64Leo(weightedCollateralUsdMicro(realSupAfter[0], prices[0], ltvs[0])),
      toU64Leo(weightedCollateralUsdMicro(realSupAfter[1], prices[1], ltvs[1])),
      toU64Leo(weightedCollateralUsdMicro(realSupAfter[2], prices[2], ltvs[2])),
    ];
    const totalCollateralAfter = weightedAfter[0] + weightedAfter[1] + weightedAfter[2];

    return debtUsdForHealth === BigInt(0) || debtUsdForHealth <= totalCollateralAfter;
  };

  const maxAmtForOut = (outIdx: 0 | 1 | 2): bigint => {
    const priceOut = prices[outIdx];
    if (priceOut <= BigInt(0)) return BigInt(0);

    let high = toU64Leo((totalSupplyUsdBefore * LENDING_PRICE_SCALE) / priceOut);
    if (high > MAX_U64) high = MAX_U64;

    let low = BigInt(0);
    while (low < high) {
      const mid = (low + high + BigInt(1)) / BigInt(2);
      if (canWithdraw(mid, outIdx)) low = mid;
      else high = mid - BigInt(1);
    }
    return low;
  };

  const maxMicroAleoPortfolio = maxAmtForOut(0);
  const maxMicroUsdcx = maxAmtForOut(1);
  const maxMicroUsad = maxAmtForOut(2);

  const [availAleo, vaultHum] = await Promise.all([
    readMappingU64(programId, 'available_liquidity', '0field'),
    fetchVaultHumanBalancesFromBackend(),
  ]);
  const minU64 = (a: bigint, b: bigint): bigint => (a < b ? a : b);

  /**
   * Native ALEO finalize credits `available_liquidity[ALEO]` from burns + prior idle slot; do not clamp UI MAX by mapping alone.
   */
  let maxWithdrawMicroAleo = maxMicroAleoPortfolio;
  let maxWithdrawMicroUsdcx = maxMicroUsdcx;
  let maxWithdrawMicroUsad = maxMicroUsad;
  if (vaultHum) {
    const vA = humanToMicroU64(vaultHum.aleo);
    const vU = humanToMicroU64(vaultHum.usdcx);
    const vD = humanToMicroU64(vaultHum.usad);
    maxWithdrawMicroAleo = minU64(maxWithdrawMicroAleo, vA);
    maxWithdrawMicroUsdcx = minU64(maxWithdrawMicroUsdcx, vU);
    maxWithdrawMicroUsad = minU64(maxWithdrawMicroUsad, vD);
  }

  return {
    maxWithdrawMicroAleo,
    maxWithdrawMicroUsdcx,
    maxWithdrawMicroUsad,
    maxWithdrawMicroAleoPortfolio: maxMicroAleoPortfolio,
    availableLiquidityMicroAleo: availAleo,
  };
}

/**
 * Withdraw UI caps: **one tx = one `LendingPosition` note**. For each payout asset we take the same note
 * `getBestLendingPositionRecordForWithdrawOut` would choose (min borrow tier, then max cap). Merging `max()`
 * across *different* notes inflated MAX vs the note actually spent (USAD reject while USDCx looked fine).
 */
export async function getAggregatedCrossCollateralWithdrawCapsFromWallet(
  programId: string,
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  recordsSnapshot?: any[],
): Promise<CrossCollateralWithdrawCaps | null> {
  const snap =
    recordsSnapshot != null ? recordsSnapshot : await requestRecords(programId, false);
  const [r0, r1, r2] = await Promise.all([
    getBestLendingPositionRecordForWithdrawOut(requestRecords, programId, decrypt, 0, snap),
    getBestLendingPositionRecordForWithdrawOut(requestRecords, programId, decrypt, 1, snap),
    getBestLendingPositionRecordForWithdrawOut(requestRecords, programId, decrypt, 2, snap),
  ]);
  if (!r0 && !r1 && !r2) return null;

  let availAleo: bigint | null = null;
  try {
    availAleo = await readMappingU64(programId, 'available_liquidity', '0field');
  } catch {
    availAleo = r0?.caps.availableLiquidityMicroAleo ?? r1?.caps.availableLiquidityMicroAleo ?? null;
  }

  const z = (x: bigint | undefined) => x ?? BigInt(0);
  return {
    maxWithdrawMicroAleo: z(r0?.caps.maxWithdrawMicroAleo),
    maxWithdrawMicroUsdcx: z(r1?.caps.maxWithdrawMicroUsdcx),
    maxWithdrawMicroUsad: z(r2?.caps.maxWithdrawMicroUsad),
    maxWithdrawMicroAleoPortfolio: z(r0?.caps.maxWithdrawMicroAleoPortfolio),
    availableLiquidityMicroAleo: availAleo,
  };
}

function mergeBorrowCapsMax(a: CrossCollateralChainCaps, b: CrossCollateralChainCaps): void {
  if (b.headroomUsd > a.headroomUsd) a.headroomUsd = b.headroomUsd;
  if (b.maxBorrowMicroAleo > a.maxBorrowMicroAleo) a.maxBorrowMicroAleo = b.maxBorrowMicroAleo;
  if (b.maxBorrowMicroUsdcx > a.maxBorrowMicroUsdcx) a.maxBorrowMicroUsdcx = b.maxBorrowMicroUsdcx;
  if (b.maxBorrowMicroUsad > a.maxBorrowMicroUsad) a.maxBorrowMicroUsad = b.maxBorrowMicroUsad;
  if (b.totalCollateralUsd > a.totalCollateralUsd) a.totalCollateralUsd = b.totalCollateralUsd;
  if (b.totalDebtUsd > a.totalDebtUsd) a.totalDebtUsd = b.totalDebtUsd;
  if (b.realSupplyMicroAleo > a.realSupplyMicroAleo) a.realSupplyMicroAleo = b.realSupplyMicroAleo;
  if (b.realSupplyMicroUsdcx > a.realSupplyMicroUsdcx) a.realSupplyMicroUsdcx = b.realSupplyMicroUsdcx;
  if (b.realSupplyMicroUsad > a.realSupplyMicroUsad) a.realSupplyMicroUsad = b.realSupplyMicroUsad;
  if (b.realBorrowMicroAleo > a.realBorrowMicroAleo) a.realBorrowMicroAleo = b.realBorrowMicroAleo;
  if (b.realBorrowMicroUsdcx > a.realBorrowMicroUsdcx) a.realBorrowMicroUsdcx = b.realBorrowMicroUsdcx;
  if (b.realBorrowMicroUsad > a.realBorrowMicroUsad) a.realBorrowMicroUsad = b.realBorrowMicroUsad;
}

export async function getAggregatedCrossCollateralBorrowCapsFromWallet(
  programId: string,
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  decrypt?: (cipherText: string) => Promise<string>,
  recordsSnapshot?: any[],
): Promise<CrossCollateralChainCaps | null> {
  const pool = await listFundedLendingPositionCandidates(
    requestRecords,
    programId,
    decrypt,
    recordsSnapshot,
  );
  if (pool.length === 0) return null;
  const capsArr = await Promise.all(
    pool.map((c) => getCrossCollateralBorrowCapsFromChain(programId, c.scaled)),
  );
  const first = capsArr.find((x) => x != null);
  if (!first) return null;
  const merged: CrossCollateralChainCaps = { ...first };
  for (const c of capsArr) {
    if (c) mergeBorrowCapsMax(merged, c);
  }
  return merged;
}

function withdrawCapMetric(caps: CrossCollateralWithdrawCaps, outIdx: 0 | 1 | 2): bigint {
  return outIdx === 0
    ? caps.maxWithdrawMicroAleo
    : outIdx === 1
      ? caps.maxWithdrawMicroUsdcx
      : caps.maxWithdrawMicroUsad;
}

/**
 * Choose the `LendingPosition` note that maximizes on-chain-feasible withdraw for `outIdx` (0=ALEO, 1=USDCx, 2=USAD).
 */
export async function getBestLendingPositionRecordForWithdrawOut(
  requestRecords: (program: string, includeSpent?: boolean) => Promise<any[]>,
  programId: string,
  decrypt: ((cipherText: string) => Promise<string>) | undefined,
  outIdx: 0 | 1 | 2,
  recordsSnapshot?: any[],
): Promise<{
  input: string | any;
  scaled: LendingPositionScaled;
  recordIndex: number;
  walletRecord: any;
  caps: CrossCollateralWithdrawCaps;
} | null> {
  const pool = await listFundedLendingPositionCandidates(
    requestRecords,
    programId,
    decrypt,
    recordsSnapshot,
  );
  if (pool.length === 0) return null;

  const capsArr = await Promise.all(
    pool.map((c) => getCrossCollateralWithdrawCapsFromChain(programId, c.scaled)),
  );

  /** Prefer notes with minimum scaled-borrow total first. Stale unspent duplicates often keep pre-repay debt while a newer note is debt-free; max-cap-only tie-break can still go wrong if caps match due to RPC/oracle edge cases. */
  let minBorAmongFeasible: bigint | null = null;
  for (let i = 0; i < pool.length; i++) {
    if (!capsArr[i]) continue;
    const b = pool[i].borScore;
    if (minBorAmongFeasible == null || b < minBorAmongFeasible) minBorAmongFeasible = b;
  }

  let bestI = -1;
  let bestMetric = BigInt(-1);
  for (let i = 0; i < pool.length; i++) {
    const caps = capsArr[i];
    if (!caps) continue;
    if (minBorAmongFeasible != null && pool[i].borScore !== minBorAmongFeasible) continue;
    const m = withdrawCapMetric(caps, outIdx);
    if (m > bestMetric) {
      bestMetric = m;
      bestI = i;
    } else if (m === bestMetric && m >= BigInt(0) && bestI >= 0) {
      const ha = getWalletRecordBlockHeight(pool[i].walletRecord);
      const hb = getWalletRecordBlockHeight(pool[bestI].walletRecord);
      if (ha != null && hb != null && ha > hb) bestI = i;
      else if (ha != null && hb == null) bestI = i;
      else if (ha != null && hb != null && ha === hb) {
        if (pool[i].borScore < pool[bestI].borScore) bestI = i;
        else if (pool[i].borScore === pool[bestI].borScore && i > bestI) bestI = i;
      } else if (ha == null && hb == null) {
        if (pool[i].borScore < pool[bestI].borScore) bestI = i;
        else if (pool[i].borScore === pool[bestI].borScore && i > bestI) bestI = i;
      }
    }
  }
  if (bestI < 0) return null;
  const capsBest = capsArr[bestI];
  if (!capsBest) return null;

  const best = pool[bestI];
  let input: string | any = best.input;
  if (typeof input !== 'string' || !String(input).trim()) {
    const p = await resolveRecordPlaintext(best.walletRecord, decrypt);
    if (p) input = p;
  }
  return {
    input,
    scaled: best.scaled,
    recordIndex: best.idx,
    walletRecord: best.walletRecord,
    caps: capsBest,
  };
}

/**
 * Get address hash from contract (helper function for v8).
 * Calls: lending_pool_v8.aleo/get_address_hash() -> field
 */
export async function getAddressHashFromContract(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  requestTransactionHistory?: (program: string) => Promise<any[]>
): Promise<string | null> {
  if (!requestTransaction || !publicKey) {
    throw new Error('Wallet not connected or requestTransaction unavailable');
  }

  try {
    const inputs: string[] = [];
    const fee = DEFAULT_LENDING_FEE * 1_000_000;
    const chainId = CURRENT_NETWORK === Network.TESTNET 
      ? Network.TESTNET 
      : String(CURRENT_NETWORK);
    
    const transaction = {
      programId: LENDING_POOL_PROGRAM_ID,
      functionName: 'get_address_hash',
      inputs,
      fee,
      chainId,
    };
    
    const txId = await requestTransaction(transaction);
    privacyLog('✅ get_address_hash transaction submitted:', txId);
    
    // Wait for transaction to finalize and extract hash from output
    // Note: This is a simplified version - you may need to adjust based on actual transaction output format
    return txId;
  } catch (error: any) {
    console.error('getAddressHashFromContract failed:', error);
    return null;
  }
}

/**
 * Get user activity from contract (helper function for v8).
 * On-chain: UserActivity + Final (Leo 4 xyra_lending_v7)
 */
export async function getUserActivityFromContract(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string
): Promise<string | null> {
  if (!requestTransaction || !publicKey) {
    throw new Error('Wallet not connected or requestTransaction unavailable');
  }

  try {
    const inputs: string[] = [];
    const fee = DEFAULT_LENDING_FEE * 1_000_000;
    const chainId = CURRENT_NETWORK === Network.TESTNET 
      ? Network.TESTNET 
      : String(CURRENT_NETWORK);
    
    const transaction = {
      programId: LENDING_POOL_PROGRAM_ID,
      functionName: 'get_user_activity',
      inputs,
      fee,
      chainId,
    };
    
    const txId = await requestTransaction(transaction);
    privacyLog('✅ get_user_activity transaction submitted:', txId);
    
    return txId;
  } catch (error: any) {
    console.error('getUserActivityFromContract failed:', error);
    return null;
  }
}

/**
 * Create test credits (for testing only - v8 does not have this function).
 * Note: v8 does not have create_test_credits function
 */
export async function createTestCredits(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  amount: number
): Promise<string> {
  // Note: v8 does not have create_test_credits function
  // This function is kept for backward compatibility but will throw an error
  throw new Error('v8 does not support create_test_credits. Use actual credits.aleo records from your wallet.');
}

/**
 * Deposit test with real credits (for testing only - v8 does not have this function).
 * Note: v8 does not have deposit_test function
 */
export async function depositTestReal(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  amount: number,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>
): Promise<string> {
  // Note: v8 does not have deposit_test function
  // This function is kept for backward compatibility but will throw an error
  throw new Error('v8 does not support deposit_test. Use the regular deposit function instead.');
}

/**
 * Repay borrowed amount to the pool using wallet adapter.
export async function lendingRepay(
  requestTransaction: ((transaction: any) => Promise<string>) | undefined,
  publicKey: string,
  amount: number,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>
): Promise<string> {
  console.log('========================================');
  console.log('💰 LENDING REPAY FUNCTION CALLED (Option 1 - Real Tokens)');
  console.log('========================================');
  
  if (!requestTransaction || !publicKey) {
    throw new Error('Wallet not connected or requestTransaction unavailable');
  }

  if (!requestRecords) {
    throw new Error('requestRecords is not available. Please ensure your wallet is connected.');
  }

  const chainId = CURRENT_NETWORK === Network.TESTNET 
    ? Network.TESTNET 
    : String(CURRENT_NETWORK);
  
  const fee = DEFAULT_LENDING_FEE * 1_000_000;

  try {
    // Option 1: Fetch credits record from wallet (real Aleo tokens)
    console.log('🔍 Step 1: Fetching credits records from wallet...');
    console.log('📋 Credits Program ID:', CREDITS_PROGRAM_ID);
    console.log('📋 requestRecords function:', typeof requestRecords);
    
    // Convert amount (in credits) to microcredits (1 credit = 1_000_000 microcredits)
    const requiredMicrocredits = amount * 1_000_000;
    
    // Fetch all credits records from wallet
    let allCreditsRecords: any[] = [];
    try {
      // requestRecords takes two parameters: (programId: string, includeSpent?: boolean)
      // includeSpent: false = only unspent records, true = include spent records
      allCreditsRecords = await requestRecords(CREDITS_PROGRAM_ID, false);
      console.log(`📋 requestRecords returned:`, {
        isArray: Array.isArray(allCreditsRecords),
        length: allCreditsRecords?.length || 0,
        type: typeof allCreditsRecords,
        firstRecord: allCreditsRecords?.[0] ? JSON.stringify(allCreditsRecords[0]).substring(0, 200) : 'none',
      });
    } catch (recordsError: any) {
      console.error('❌ Error fetching credits records:', {
        message: recordsError?.message,
        error: recordsError,
      });
      // PHASE 3: Provide helpful error message with test credits option
      console.log('💡 PHASE 3: No credits records found for repay. For testing:');
        console.log('   Get Aleo credits from: https://faucet.aleo.org/ (testnet)');
        console.log('   Wait 10-30 seconds after receiving credits for wallet to index them');
        throw new Error(
          `No credits.aleo records found in wallet. ` +
          `Please: 1) Get Aleo credits from the testnet faucet (https://faucet.aleo.org/), ` +
          `2) Wait 10-30 seconds for wallet to index the new records, ` +
          `3) Then try repay again. ` +
          `Required: ${requiredMicrocredits} microcredits (${amount} credits) + ${fee / 1_000_000} credits fee. ` +
          `Error: ${recordsError?.message || 'Unknown error'}`
        );
    }
    
    if (!allCreditsRecords || !Array.isArray(allCreditsRecords) || allCreditsRecords.length === 0) {
      if (DISABLE_CREDITS_CHECK) {
        console.warn('⚠️ CREDITS CHECK DISABLED: No credits records found, but check is disabled. Creating mock record for testing.');
        // Create a mock credits record structure for testing
        allCreditsRecords = [{
          data: {
            owner: publicKey,
            microcredits: `${requiredMicrocredits + fee}u64.private`,
          },
          spent: false,
          program_id: CREDITS_PROGRAM_ID,
        }];
        console.log('📋 Created mock credits record:', allCreditsRecords[0]);
      } else {
        console.error('❌ No credits records found:', {
          allCreditsRecords,
          isArray: Array.isArray(allCreditsRecords),
          length: allCreditsRecords?.length,
        });
        throw new Error(
          'No credits records found in wallet. ' +
          'Please ensure: 1) You have Aleo credits in your wallet, 2) Your wallet is connected, ' +
          '3) You have granted record access permissions to the app.'
        );
      }
    }
    
    console.log(`📋 Found ${allCreditsRecords.length} total credits records`);
    
    // Log record structure for debugging
    if (allCreditsRecords.length > 0) {
      console.log('📋 Sample record structure:', {
        record: allCreditsRecords[0],
        hasData: !!allCreditsRecords[0]?.data,
        hasMicrocredits: !!allCreditsRecords[0]?.data?.microcredits,
        microcreditsValue: allCreditsRecords[0]?.data?.microcredits,
        spent: allCreditsRecords[0]?.spent,
        keys: Object.keys(allCreditsRecords[0] || {}),
      });
    }
    
    // Filter for private, unspent records
    // Try multiple record formats
    const privateRecords = allCreditsRecords.filter((record: any) => {
      // Check if record has microcredits field (could be in data or directly on record)
      const microcredits = record.data?.microcredits || record.microcredits;
      const isPrivate = microcredits && (
        typeof microcredits === 'string' && microcredits.endsWith('u64.private')
      );
      return isPrivate;
    });
    
    console.log(`📋 Found ${privateRecords.length} private credits records`);
    
    const unspentRecords = privateRecords.filter((record: any) => {
      const spent = record.spent === false || record.spent === undefined || record.data?.spent === false;
      return spent;
    });
    
    console.log(`📋 Found ${unspentRecords.length} unspent private credits records`);
    
    if (unspentRecords.length === 0) {
      // Provide more helpful error message
      const allSpent = privateRecords.length > 0 && privateRecords.every((r: any) => r.spent === true);
      if (DISABLE_CREDITS_CHECK) {
        console.warn('⚠️ CREDITS CHECK DISABLED: No unspent records, but check is disabled. Creating mock record for testing.');
        // Create a mock unspent record
        unspentRecords.push({
          data: {
            owner: publicKey,
            microcredits: `${requiredMicrocredits + fee}u64.private`,
          },
          spent: false,
          program_id: CREDITS_PROGRAM_ID,
        });
        console.log('📋 Created mock unspent credits record');
      } else {
        if (allSpent) {
          throw new Error('All credits records are already spent. Please wait for new records or receive more credits.');
        } else {
          throw new Error(
            'No unspent credits records available. ' +
            `Found ${privateRecords.length} private records but all are marked as spent. ` +
            'Please ensure you have available Aleo credits in your wallet.'
          );
        }
      }
    }
    
    // Helper to extract microcredits value
    const extractMicrocredits = (valueStr: string | undefined): number => {
      if (!valueStr || typeof valueStr !== 'string') return 0;
      const match = valueStr.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    
    // Find a record with enough microcredits (including fee)
    const totalNeeded = requiredMicrocredits + fee;
    console.log('💰 Credit requirements:', {
      amount: `${amount} credits`,
      requiredMicrocredits: `${requiredMicrocredits} microcredits`,
      fee: `${fee} microcredits`,
      totalNeeded: `${totalNeeded} microcredits (${totalNeeded / 1_000_000} credits)`,
    });
    
    let suitableRecord = unspentRecords.find((record: any) => {
      // Try both record.data.microcredits and record.microcredits
      const microcreditsStr = record.data?.microcredits || record.microcredits;
      const recordMicrocredits = extractMicrocredits(microcreditsStr);
      console.log('🔍 Checking record:', {
        microcreditsStr,
        recordMicrocredits,
        totalNeeded,
        sufficient: recordMicrocredits >= totalNeeded,
      });
      return recordMicrocredits >= totalNeeded;
    });
    
    if (!suitableRecord) {
      const recordAmounts = unspentRecords.map((r: any) => {
        const microcreditsStr = r.data?.microcredits || r.microcredits;
        return extractMicrocredits(microcreditsStr);
      });
      const maxAvailable = recordAmounts.length > 0 ? Math.max(...recordAmounts) : 0;
      const totalAvailable = recordAmounts.reduce((sum, amt) => sum + amt, 0);
      
      console.error('❌ No suitable record found:', {
        totalNeeded: `${totalNeeded} microcredits`,
        maxAvailable: `${maxAvailable} microcredits`,
        totalAvailable: `${totalAvailable} microcredits`,
        recordAmounts,
      });
      
      throw new Error(
        `Insufficient credits. Need ${totalNeeded / 1_000_000} credits (${amount} repay + ${fee / 1_000_000} fee), ` +
        `but largest available record has ${maxAvailable / 1_000_000} credits. ` +
        `Total available: ${totalAvailable / 1_000_000} credits across ${unspentRecords.length} records.`
      );
    }
    
    console.log('✅ Found suitable credits record:', {
      microcredits: suitableRecord.data?.microcredits || suitableRecord.microcredits,
      owner: suitableRecord.data?.owner || suitableRecord.owner,
      recordStructure: Object.keys(suitableRecord),
    });
    
    // Prepare the credits record for the transaction
    // The record format should match what the contract expects
    // Contract expects: { owner: address, microcredits: u64 }
    // When fetched from wallet, records have owner at top level and data fields nested
    // IMPORTANT: Pass as Leo record literal STRING with .private visibility modifiers
    // PHASE 3: Pass the record object directly to wallet adapter
    // The wallet adapter expects the actual record object from requestRecords, not a string
    console.log('✅ Using Credits Record Object for Transaction:', {
      recordId: suitableRecord.id,
      owner: suitableRecord.owner || suitableRecord.data?.owner,
      microcredits: suitableRecord.data?.microcredits || suitableRecord.microcredits,
      programId: suitableRecord.program_id,
      recordName: suitableRecord.recordName,
      spent: suitableRecord.spent,
    });
    
    // Call repay transition with amount and credits record object
    // Contract validates record owner and amount, then consumes the record
    // Pass record object directly (wallet adapter handles serialization)
    const repayInputs = [`${amount}u64`, suitableRecord];
    
    console.log('lendingRepay: Transaction inputs:', {
      amount: `${amount} credits`,
      requiredMicrocredits: `${requiredMicrocredits} microcredits`,
      fee: `${fee} microcredits`,
      creditsRecord: '[Record Object]',
      recordId: suitableRecord.id,
      programId: LENDING_POOL_PROGRAM_ID,
      chainId,
    });
    
    console.log('🔍 Step 2: Creating transaction object...');
    const repayTransaction = Transaction.createTransaction(
      publicKey,
      chainId,
      LENDING_POOL_PROGRAM_ID,
      'repay',
      repayInputs,
      fee,
      false
    );

    console.log('✅ Transaction object created');
    console.log('🔍 Step 3: Requesting transaction signature from wallet...');
    const repayTxId = await requestTransaction(repayTransaction);
    console.log('✅ Transaction submitted successfully!');
    console.log('📤 Transaction ID:', repayTxId);
    
    return repayTxId;
  } catch (error: any) {
    console.error('========================================');
    console.error('❌ LENDING REPAY FUNCTION FAILED');
    console.error('========================================');
    console.error('📋 Error Details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      error: error,
    });
    console.error('========================================\n');
    throw new Error(`Repay transaction failed: ${error?.message || 'Unknown wallet error'}`);
  }
}

/**
 * Withdraw supplied liquidity from the pool using wallet adapter.
 * Following basic_bank.aleo pattern - contract reads user data from mappings automatically.
 * - Updates public pool state (total_supplied, utilization_index)
 * - Updates private user mappings (increments total_withdrawals counter)
 * Returns: (UserActivity, Final) — Leo 4 on-chain bundle
 * No need to pass old_activity - contract reads from mappings using hashed address
 */

/**
 * Accrue interest on the pool using wallet adapter.
 * Calls: lending_pool_v8.aleo/accrue_interest(public delta_index: u64) -> Future
 */

/**
 * Read user's activity from UserActivity records returned by contract transitions.
 * 
 * IMPORTANT: The records returned by contract transitions show the LATEST transaction amounts,
 * not cumulative totals. The contract updates mappings correctly, but the returned records
 * are placeholders showing only the current transaction.
 * 
 * For EXACT cumulative values, we need to read from mappings using the hash method.
 * However, for simplicity, this function reads from records (which show latest transaction).
 * 
 * @param publicKey - User's Aleo address (aleo1...)
 * @param requestRecords - Function from useWallet() to request records (required)
 * @param requestTransaction - Function to call contract transitions (optional, for hash method)
 */
export async function getUserPosition(
  publicKey?: string,
  requestRecords?: (program: string, includeSpent?: boolean) => Promise<any[]>,
  requestTransaction?: ((transaction: any) => Promise<string>) | undefined,
  transactionStatus?: (txId: string) => Promise<any>,
  requestTransactionHistory?: (programId: string) => Promise<any[]>
): Promise<{
  supplied: string | null;
  borrowed: string | null;
  totalDeposits: string | null;
  totalWithdrawals: string | null;
  totalBorrows: string | null;
  totalRepayments: string | null;
}> {
  // Note: The contract returns UserActivity records, but they are placeholders (show current transaction, not cumulative)
  // The actual cumulative values are in mappings, which require hash computation to read
  // For simplicity, we'll read from records (which show latest transaction amounts)
  // The contract logic correctly updates mappings in finalize functions
  
  // Fallback: Read from records (may be placeholders, but better than nothing)
  if (!requestRecords) {
    privacyWarn('getUserPosition: requestRecords not available');
    return { 
      supplied: '0', 
      borrowed: '0',
      totalDeposits: '0',
      totalWithdrawals: '0',
      totalBorrows: '0',
      totalRepayments: '0',
    };
  }

  try {
    // Request all UserActivity records from the wallet for lending_pool_v8.aleo
    // These are PRIVATE records - only visible to the wallet owner
    privacyLog('========================================');
    privacyLog('🔍 getUserPosition: RECORD FETCH DEBUG');
    privacyLog('========================================');
    privacyLog('Step 1: Calling requestRecords with program ID:', LENDING_POOL_PROGRAM_ID);
    privacyLog('User Address:', publicKey);
    privacyLog('requestRecords function type:', typeof requestRecords);
    
    // Request records from current program only (lending_pool_v8.aleo)
    let records: any[] | null = null;
    
    try {
      privacyLog('Requesting records for program:', LENDING_POOL_PROGRAM_ID);
      // requestRecords takes two parameters: (programId: string, includeSpent?: boolean)
      records = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
      privacyLog('requestRecords returned:', records?.length || 0, 'records');
      
      if (records && Array.isArray(records) && records.length > 0) {
        privacyLog('✅ Successfully got records from current program');
      } else {
        privacyWarn('⚠️ No records found for current program');
      }
    } catch (recordsError: any) {
      privacyWarn('requestRecords failed:', recordsError?.message);
      records = null;
    }
    
    privacyLog('Final records result:');
    privacyLog('  - Records:', records);
    privacyLog('  - Is Array:', Array.isArray(records));
    privacyLog('  - Records Count:', records?.length || 0);
    privacyLog('  - Records Type:', typeof records);
    privacyLog('  - Is Null:', records === null);
    privacyLog('  - Is Undefined:', records === undefined);
    privacyLog('  - Full Records (first 1000 chars):', JSON.stringify(records, null, 2).substring(0, 1000));
    privacyLog('========================================');
    
    // Check if records is null, undefined, or empty
    if (records === null || records === undefined) {
      console.error('❌ getUserPosition: requestRecords returned null or undefined');
      console.error('This might mean:');
      console.error('  1. The wallet has not indexed records yet');
      console.error('  2. requestRecords function is not working correctly');
      console.error('  3. Permission issue with the wallet');
      return { 
        supplied: '0', 
        borrowed: '0',
        totalDeposits: '0',
        totalWithdrawals: '0',
        totalBorrows: '0',
        totalRepayments: '0',
      };
    }
    
    if (!Array.isArray(records)) {
      console.error('❌ getUserPosition: requestRecords did not return an array');
      console.error('Returned type:', typeof records);
      privacyLog('Returned value:', records);
      // Try to convert to array if it's an object
      if (records && typeof records === 'object') {
        privacyLog('Attempting to convert object to array...');
        records = Object.values(records);
        privacyLog('Converted records:', records);
      } else {
        return { 
          supplied: '0', 
          borrowed: '0',
          totalDeposits: '0',
          totalWithdrawals: '0',
          totalBorrows: '0',
          totalRepayments: '0',
        };
      }
    }
    
    if (records.length === 0) {
      console.error('❌ getUserPosition: NO RECORDS FOUND (array is empty)');
      console.error('This means the wallet has not indexed the UserActivity record yet.');
      console.error('Solutions:');
      console.error('  1. Wait 10-30 seconds after transaction finalizes');
      console.error('  2. Disconnect and reconnect wallet');
      console.error('  3. Check if transaction actually completed on explorer');
      console.error('  4. Check wallet activity view to see if records are there');
      return { 
        supplied: '0', 
        borrowed: '0',
        totalDeposits: '0',
        totalWithdrawals: '0',
        totalBorrows: '0',
        totalRepayments: '0',
      };
    }

    // Calculate CUMULATIVE totals by summing ALL UserActivity records
    // Each transaction creates a new record with the transaction amount
    // Summing all records gives the cumulative total (matching the mappings)
    let cumulativeTotalDeposits = 0;
    let cumulativeTotalWithdrawals = 0;
    let cumulativeTotalBorrows = 0;
    let cumulativeTotalRepayments = 0;
    let recordsProcessed = 0;

    // Iterate through ALL records and sum them up
    privacyLog('📊 Processing', records.length, 'records...');
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        privacyLog(`\n--- Processing Record ${i + 1}/${records.length} ---`);
        privacyLog('Record type:', typeof record);
        privacyLog('Record:', record);
        
        let recordData: any;
        if (typeof record === 'string') {
          try {
            recordData = JSON.parse(record);
            privacyLog('Parsed from JSON string');
          } catch {
            recordData = { raw: record };
            privacyLog('Could not parse as JSON, treating as raw string');
          }
        } else {
          recordData = record;
          privacyLog('Record is already an object');
        }
        
        privacyLog('Record Data:', JSON.stringify(recordData, null, 2));
        privacyLog('Record Keys:', recordData ? Object.keys(recordData) : 'null');
        
        // Check if this is a UserActivity record - be more lenient
        const hasUserActivityFields = 
          (recordData.data && (
            recordData.data.total_deposits !== undefined || 
            recordData.data.total_withdrawals !== undefined ||
            recordData.data.total_borrows !== undefined ||
            recordData.data.total_repayments !== undefined
          )) ||
          (recordData.total_deposits !== undefined || 
           recordData.total_withdrawals !== undefined ||
           recordData.total_borrows !== undefined ||
           recordData.total_repayments !== undefined);
        
        const matchesProgram = 
          recordData.program_id === LENDING_POOL_PROGRAM_ID || 
          recordData.programId === LENDING_POOL_PROGRAM_ID ||
          recordData.program === LENDING_POOL_PROGRAM_ID;
        
        const isUserActivity = hasUserActivityFields || matchesProgram;
        
        privacyLog('Is UserActivity?', isUserActivity);
        privacyLog('  - Has UserActivity fields:', hasUserActivityFields);
        privacyLog('  - Matches program:', matchesProgram);
        
        if (isUserActivity || hasUserActivityFields) {
          privacyLog('✅ Found UserActivity record!');
          
          // Helper function to extract numeric value from various formats
          const extractValue = (value: any): number | undefined => {
            if (value === undefined || value === null) return undefined;
            
            // If it's already a number
            if (typeof value === 'number') {
              return isNaN(value) ? undefined : value;
            }
            
            // If it's a string, try to parse it
            if (typeof value === 'string') {
              // Handle formats like "100u64.private", "100u64", "100"
              // Remove ".private", ".public", "u64" suffixes
              const cleaned = value.replace(/\.(private|public)$/, '').replace(/u64$/, '').trim();
              const num = Number(cleaned);
              return isNaN(num) ? undefined : num;
            }
            
            return undefined;
          };
          
          // Try multiple possible record structures
          let totalDeposits: number | undefined;
          let totalWithdrawals: number | undefined;
          let totalBorrows: number | undefined;
          let totalRepayments: number | undefined;
          
          // Structure 1: recordData.data.total_deposits (nested data) - THIS IS THE ACTUAL FORMAT!
          if (recordData.data) {
            // Values are like "0u64.private" or "100u64.private"
            totalDeposits = extractValue(recordData.data.total_deposits);
            totalWithdrawals = extractValue(recordData.data.total_withdrawals);
            totalBorrows = extractValue(recordData.data.total_borrows);
            totalRepayments = extractValue(recordData.data.total_repayments);
            privacyLog('getUserPosition: Extracted from data - deposits:', totalDeposits, 'withdrawals:', totalWithdrawals, 'borrows:', totalBorrows, 'repayments:', totalRepayments);
          }
          
          // Structure 2: recordData.total_deposits (top level)
          if (totalDeposits === undefined && recordData.total_deposits !== undefined) {
            privacyLog('📦 Trying top-level total_deposits');
            totalDeposits = extractValue(recordData.total_deposits);
          }
          if (totalWithdrawals === undefined && recordData.total_withdrawals !== undefined) {
            totalWithdrawals = extractValue(recordData.total_withdrawals);
          }
          if (totalBorrows === undefined && recordData.total_borrows !== undefined) {
            totalBorrows = extractValue(recordData.total_borrows);
          }
          if (totalRepayments === undefined && recordData.total_repayments !== undefined) {
            totalRepayments = extractValue(recordData.total_repayments);
          }
          
          // Structure 3: Deep search in the object
          if (totalDeposits === undefined || totalWithdrawals === undefined || totalBorrows === undefined || totalRepayments === undefined) {
            const searchInObject = (obj: any, key: string): any => {
              if (!obj || typeof obj !== 'object') return undefined;
              if (key in obj) return obj[key];
              for (const k in obj) {
                if (typeof obj[k] === 'object') {
                  const found = searchInObject(obj[k], key);
                  if (found !== undefined) return found;
                }
              }
              return undefined;
            };
            
            if (totalDeposits === undefined) {
              totalDeposits = extractValue(searchInObject(recordData, 'total_deposits'));
            }
            if (totalWithdrawals === undefined) {
              totalWithdrawals = extractValue(searchInObject(recordData, 'total_withdrawals'));
            }
            if (totalBorrows === undefined) {
              totalBorrows = extractValue(searchInObject(recordData, 'total_borrows'));
            }
            if (totalRepayments === undefined) {
              totalRepayments = extractValue(searchInObject(recordData, 'total_repayments'));
            }
          }
          
          privacyLog('getUserPosition: Extracted values from record - deposits:', totalDeposits, 'withdrawals:', totalWithdrawals, 'borrows:', totalBorrows, 'repayments:', totalRepayments);
          
          // Sum up all values to get cumulative totals
          // Each record represents one transaction, so summing all gives cumulative
          if (totalDeposits !== undefined && !isNaN(totalDeposits)) {
            cumulativeTotalDeposits += totalDeposits;
          }
          if (totalWithdrawals !== undefined && !isNaN(totalWithdrawals)) {
            cumulativeTotalWithdrawals += totalWithdrawals;
          }
          if (totalBorrows !== undefined && !isNaN(totalBorrows)) {
            cumulativeTotalBorrows += totalBorrows;
          }
          if (totalRepayments !== undefined && !isNaN(totalRepayments)) {
            cumulativeTotalRepayments += totalRepayments;
          }
          
          recordsProcessed++;
          privacyLog('getUserPosition: Cumulative totals so far - deposits:', cumulativeTotalDeposits, 'withdrawals:', cumulativeTotalWithdrawals, 'borrows:', cumulativeTotalBorrows, 'repayments:', cumulativeTotalRepayments);
        }
      } catch (e) {
        // Skip records that can't be parsed
        privacyWarn('getUserPosition: Failed to parse record:', e, record);
      }
    }

    // Calculate net positions from the cumulative counters
    const calculatedNetSupplied = cumulativeTotalDeposits - cumulativeTotalWithdrawals;
    const calculatedNetBorrowed = cumulativeTotalBorrows - cumulativeTotalRepayments;

    privacyLog('========================================');
    privacyLog('📊 getUserPosition: CUMULATIVE TOTALS FROM RECORDS');
    privacyLog('========================================');
    privacyLog('📝 Records Processed:', recordsProcessed, 'out of', records.length);
    privacyLog('💰 Cumulative Activity Totals (Sum of All Records):');
    privacyLog('  - Total Deposits:', cumulativeTotalDeposits, '(sum of all deposit records)');
    privacyLog('  - Total Withdrawals:', cumulativeTotalWithdrawals, '(sum of all withdrawal records)');
    privacyLog('  - Total Borrows:', cumulativeTotalBorrows, '(sum of all borrow records)');
    privacyLog('  - Total Repayments:', cumulativeTotalRepayments, '(sum of all repay records)');
    privacyLog('📈 Net Positions:');
    privacyLog('  - Net Supplied:', calculatedNetSupplied, '(deposits - withdrawals)');
    privacyLog('  - Net Borrowed:', calculatedNetBorrowed, '(borrows - repayments)');
    privacyLog('========================================');
    privacyLog('ℹ️  Note: These are cumulative totals calculated by summing all UserActivity records.');
    privacyLog('ℹ️  Each transaction creates a new record, so summing all gives the cumulative total.');
    privacyLog('========================================');

    // Return net positions (for backward compatibility) and individual counters
    // All values are returned as strings for display
    return {
      supplied: String(calculatedNetSupplied >= 0 ? calculatedNetSupplied : 0), // Net supplied (deposits - withdrawals)
      borrowed: String(calculatedNetBorrowed >= 0 ? calculatedNetBorrowed : 0), // Net borrowed (borrows - repayments)
      totalDeposits: String(cumulativeTotalDeposits), // Cumulative deposits (sum of all records)
      totalWithdrawals: String(cumulativeTotalWithdrawals), // Cumulative withdrawals (sum of all records)
      totalBorrows: String(cumulativeTotalBorrows), // Cumulative borrows (sum of all records)
      totalRepayments: String(cumulativeTotalRepayments), // Cumulative repayments (sum of all records)
    };
  } catch (error) {
    console.error(
      'getUserPosition: Failed to fetch user activity from private records:',
      error instanceof Error ? error.message : error,
    );
    return { 
      supplied: '0', 
      borrowed: '0',
      totalDeposits: '0',
      totalWithdrawals: '0',
      totalBorrows: '0',
      totalRepayments: '0',
    };
  }
}

/**
 * 1. Post Bounty
 */
export async function postBounty(
  caller: string,
  bountyId: number,
  reward: number
): Promise<string> {
  const inputs = [
    `${caller}.private`,
    `${bountyId}.private`,
    `${caller}.private`,
    `${reward}.private`,
  ];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'post_bounty',
    inputs,
  });
  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }
  return result.transactionId;
}

/**
 * 2. View Bounty by ID
 */
export async function viewBountyById(
  bountyId: number
): Promise<{ payment: number; status: number }> {
  const inputs = [`${bountyId}.private`];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'view_bounty_by_id',
    inputs,
  });

  // Fetch finalized data from the mappings
  const payment = await fetchMappingValue('bounty_output_payment', bountyId);
  const status = await fetchMappingValue('bounty_output_status', bountyId);

  return { payment, status };
}

/**
 * 3. Submit Proposal
 */
export async function submitProposal(
  caller: string,
  bountyId: number,
  proposalId: number,
  proposer: string
): Promise<string> {
  const inputs = [
    `${caller}.private`,
    `${bountyId}.private`,
    `${proposalId}.private`,
    `${proposer}.private`,
  ];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'submit_proposal',
    inputs,
  });
  return result.transactionId;
}

/**
 * 4. Accept Proposal
 */
export async function acceptProposal(
  caller: string,
  bountyId: number,
  proposalId: number,
  creator: string,
  reward: number
): Promise<string> {
  const inputs = [
    `${caller}.private`,
    `${bountyId}.private`,
    `${proposalId}.private`,
    `${creator}.private`,
    `${reward}.private`,
  ];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'accept_proposal',
    inputs,
  });
  return result.transactionId;
}

/**
 * 5. Delete Bounty
 */
export async function deleteBounty(
  caller: string,
  bountyId: number
): Promise<string> {
  const inputs = [`${caller}.private`, `${bountyId}.private`];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'delete_bounty',
    inputs,
  });
  return result.transactionId;
}

/**
 * 6. Wait for Transaction Finalization (best-effort)
 *
 * NOTE:
 * - Public Aleo RPC endpoints like `testnetbeta.aleorpc.com` do NOT currently
 *   expose a `getTransactionStatus` method, so we cannot poll precise status.
 * - Instead, we do a simple timed wait to give the network time to include
 *   and finalize the transaction, then return `false` if we timed out.
 *
 * This avoids noisy "Method not found" RPC errors while still giving the user
 * feedback that we're waiting a short period for finalization.
 */
export async function waitForTransactionToFinalize(
  _transactionId: string
): Promise<boolean> {
  const totalWaitMs = 15_000; // 15 seconds total wait
  const stepMs = 3_000; // check every 3 seconds
  let waited = 0;

  while (waited < totalWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    waited += stepMs;
    // We *could* add optional explorer polling here in the future.
  }

  // We don't know the real status, just that we've waited long enough.
  return false;
}


/**
 * 7. Transfer Payment
 */
export async function transfer(
  caller: string,
  receiver: string,
  amount: number
): Promise<string> {
  const inputs = [`${caller}.private`, `${receiver}.private`, `${amount}.private`];
  const result = await client.request('executeTransition', {
    programId: BOUNTY_PROGRAM_ID,
    functionName: 'transfer',
    inputs,
  });
  if (!result.transactionId) {
    throw new Error('Transaction failed: No transactionId returned.');
  }
  return result.transactionId;
}


/**
 * Helper to Fetch Mapping Values
 */
export async function fetchMappingValue(
  mappingName: string,
  key: string | number // Allow both string and number
): Promise<number> {
  try {
    // Convert `key` to string if it's a number
    const keyString = typeof key === 'number' ? `${key}.public` : `${key}.public`;

    const result = await client.request('getMappingValue', {
      programId: BOUNTY_PROGRAM_ID,
      mappingName,
      key: keyString, // Always pass as a string
    });

    return parseInt(result.value, 10); // Parse as integer
  } catch (error) {
    console.error(
      `Failed to fetch mapping ${mappingName} with key ${key}:`,
      error
    );
    throw error;
  }
}

/**
 * Utility to Create JSON-RPC Client
 */
export function getClient(apiUrl: string): JSONRPCClient {
  const client: JSONRPCClient = new JSONRPCClient((jsonRPCRequest: any) =>
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(jsonRPCRequest),
    }).then((response) => {
      if (response.status === 200) {
        return response.json().then((jsonRPCResponse) =>
          client.receive(jsonRPCResponse)
        );
      }
      throw new Error(response.statusText);
    })
  );
  return client;
}

/**
 * Get Verifying Key for a Function
 */
async function getDeploymentTransaction(programId: string): Promise<any> {
  const response = await fetch(`${CURRENT_RPC_URL}find/transactionID/deployment/${programId}`);
  const deployTxId = await response.json();
  const txResponse = await fetch(`${CURRENT_RPC_URL}transaction/${deployTxId}`);
  const tx = await txResponse.json();
  return tx;
}

export async function getVerifyingKey(
  programId: string,
  functionName: string
): Promise<string> {
  const deploymentTx = await getDeploymentTransaction(programId);

  const allVerifyingKeys = deploymentTx.deployment.verifying_keys;
  const verifyingKey = allVerifyingKeys.filter((vk: any) => vk[0] === functionName)[0][1][0];
  return verifyingKey;
}

export async function getProgram(programId: string, apiUrl: string): Promise<string> {
  const client = getClient(apiUrl);
  const program = await client.request('program', {
    id: programId
  });
  return program;
}


//Deny a proposal

export async function denyProposal(
  caller: string,
  bountyId: number,
  proposalId: number
): Promise<string> {
  const inputs = [
    `${caller}.private`,   
    `${bountyId}.private`, 
    `${proposalId}.private` 
  ];
    
    const result = await client.request('executeTransition', {
      programId: BOUNTY_PROGRAM_ID,
      functionName: 'deny_proposal', 
      inputs, 
    });

    return result.transactionId;
}