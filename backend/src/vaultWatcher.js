import {
  runWithdrawal,
  runBorrow,
  runWithdrawalUsdc,
  runBorrowUsdc,
  runWithdrawalUsad,
  runBorrowUsad,
} from './processWithdrawal.js';
import { getPendingVaultTransactions, setVaultStatus, updateVaultTx } from './supabase.js';

const WATCH_INTERVAL_MS = Math.max(15_000, Number(process.env.VAULT_WATCHER_INTERVAL_MS) || 60_000);
const PENDING_LIMIT = Math.min(50, Math.max(1, Number(process.env.VAULT_WATCHER_BATCH_LIMIT) || 10));

let runVaultTaskRef = null;

/** In-memory set of (wallet_address, tx_id, type) currently being processed. Prevents re-enqueueing the same row on the next cycle (e.g. when status column is missing or task is slow). */
const inProgressKeys = new Set();

function vaultTaskKey(wallet_address, tx_id, type) {
  return `${wallet_address}:${tx_id}:${type}`;
}

export function startVaultWatcher(runVaultTask) {
  runVaultTaskRef = runVaultTask;
  if (!runVaultTaskRef) {
    console.warn('Vault watcher: runVaultTask not provided, watcher disabled.');
    return;
  }
  console.log(`🔄 Vault watcher started: checking every ${WATCH_INTERVAL_MS / 1000}s, batch limit ${PENDING_LIMIT}`);
  runWatchCycle();
  setInterval(runWatchCycle, WATCH_INTERVAL_MS);
}

async function runWatchCycle() {
  let pending;
  try {
    pending = await getPendingVaultTransactions(PENDING_LIMIT);
  } catch (e) {
    console.warn('Vault watcher: getPending failed', e?.message || e);
    return;
  }
  if (!pending || pending.length === 0) return;

  console.log(`🔄 Vault watcher: found ${pending.length} pending vault transfer(s)`);
  for (const row of pending) {
    const { wallet_address, tx_id, type, asset, amount } = row;
    const amountNum = Number(amount);
    if (!wallet_address || !tx_id || !type || !Number.isFinite(amountNum) || amountNum <= 0) continue;

    const assetLower = (asset || '').toLowerCase();
    if (type === 'flash_loan' && assetLower !== 'aleo') {
      console.warn('Vault watcher: flash_loan is only supported for asset aleo, skipping row', tx_id);
      continue;
    }

    const key = vaultTaskKey(wallet_address, tx_id, type);
    if (inProgressKeys.has(key)) {
      continue; // already processing this tx (e.g. from previous cycle); skip to avoid double-processing
    }

    const { rowsUpdated } = await setVaultStatus(wallet_address, tx_id, type, 'vault_processing');
    if (rowsUpdated === 0) continue;

    inProgressKeys.add(key);

    const isUsdc = assetLower === 'usdcx';
    const isUsad = assetLower === 'usad' || assetLower === 'usadx';
    // flash_loan (ALEO): not withdraw — falls through to same runBorrow as borrow (principal → user).
    const run =
      type === 'withdraw'
        ? isUsad
          ? () => runWithdrawalUsad(wallet_address, amountNum)
          : isUsdc
            ? () => runWithdrawalUsdc(wallet_address, amountNum)
            : () => runWithdrawal(wallet_address, amountNum)
        : isUsad
          ? () => runBorrowUsad(wallet_address, amountNum)
          : isUsdc
            ? () => runBorrowUsdc(wallet_address, amountNum)
            : () => runBorrow(wallet_address, amountNum);

    runVaultTaskRef(run)
      .then((transactionId) => {
        return updateVaultTx(wallet_address, tx_id, type, transactionId);
      })
      .then(() => {
        console.log(`✅ Vault watcher: completed ${type} for tx ${tx_id.slice(0, 12)}…`);
      })
      .catch((err) => {
        console.error(`❌ Vault watcher: ${type} failed for tx ${tx_id}`, err?.message || err);
        return setVaultStatus(wallet_address, tx_id, type, 'vault_pending');
      })
      .finally(() => {
        inProgressKeys.delete(key);
      });
  }
}
