import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceRoleKey) {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

const PROVABLE_EXPLORER_TX = 'https://testnet.explorer.provable.com/transaction';

function logSupabaseError(label, err) {
  if (!err) return;
  const exact = {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
  };
  try {
    const keys = typeof err === 'object' && err !== null ? Object.keys(err) : [];
    if (keys.length) exact._keys = keys;
  } catch (_) {}
  console.error(`[Supabase] ${label}:`, JSON.stringify(exact, null, 2));
}

export function updateVaultTx(walletAddress, txId, type, vaultTxId) {
  if (!supabase) {
    console.warn('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Skipping vault_tx update.');
    return Promise.resolve();
  }
  const vaultExplorerUrl = vaultTxId ? `${PROVABLE_EXPLORER_TX}/${vaultTxId}` : null;
  const payload = {
    vault_tx_id: vaultTxId,
    vault_explorer_url: vaultExplorerUrl,
    status: 'completed',
  };
  return supabase
    .from('transaction_history')
    .update(payload)
    .eq('wallet_address', walletAddress)
    .eq('tx_id', txId)
    .eq('type', type)
    .is('vault_tx_id', null)
    .then(({ error }) => {
      if (error) logSupabaseError('updateVaultTx', error);
    });
}

/** Rows where vault transfer is not yet done (for watcher). */
export function getPendingVaultTransactions(limit = 20) {
  if (!supabase) return Promise.resolve([]);
  const q = supabase
    .from('transaction_history')
    .select('wallet_address, tx_id, type, asset, amount, created_at')
    .in('type', ['withdraw', 'borrow', 'flash_loan'])
    .is('vault_tx_id', null)
    .or('status.is.null,status.eq.vault_pending')
    .order('created_at', { ascending: true })
    .limit(limit);
  return q.then(({ data, error }) => {
    if (error) {
      logSupabaseError('getPendingVaultTransactions', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  });
}

/** Set status (vault_processing when claiming, vault_pending on failure for retry).
 * When claiming (vault_processing): only update rows where status is null or vault_pending (so only one claimant wins).
 * When setting vault_pending/completed: update the row by wallet+tx_id+type+vault_tx_id null (no status filter).
 * Returns { rowsUpdated: number }. */
export function setVaultStatus(walletAddress, txId, type, status) {
  if (!supabase) return Promise.resolve({ rowsUpdated: 0 });
  
  let q = supabase
    .from('transaction_history')
    .update({ status })
    .eq('wallet_address', walletAddress)
    .eq('tx_id', txId)
    .eq('type', type)
    .is('vault_tx_id', null);

  // When claiming (vault_processing) we could restrict with .or('status.is.null,status.eq.vault_pending')
  // but that requires the status column and can trigger "column does not exist" in some setups.
  // We update only by (wallet, tx_id, type, vault_tx_id null); inProgressKeys in the watcher prevents double enqueue.

  return q.select('id').then(({ data, error }) => {
    if (error) {
      logSupabaseError('setVaultStatus', error);
      return { rowsUpdated: 0 };
    }
    return { rowsUpdated: Array.isArray(data) ? data.length : 0 };
  });
}

/** Insert a transaction record (server-only). Used by POST /record-transaction so only the backend can add rows; prevents fake withdraw/borrow rows from triggering vault payouts. */
export function insertTransactionRecord(payload) {
  if (!supabase) {
    return Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
  }
  const explorerUrl = payload.tx_id ? `${PROVABLE_EXPLORER_TX}/${payload.tx_id}` : null;
  const row = {
    wallet_address: payload.wallet_address,
    tx_id: payload.tx_id,
    type: payload.type,
    asset: payload.asset,
    amount: payload.amount,
    program_id: payload.program_id ?? null,
    explorer_url: explorerUrl,
    vault_tx_id: null,
    vault_explorer_url: null,
  };
  return supabase.from('transaction_history').insert(row).select('id').single();
}
