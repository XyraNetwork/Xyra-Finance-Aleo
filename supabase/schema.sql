-- =============================================================================
-- Transaction history table for Aave-Aleo frontend
-- Run this in Supabase: SQL Editor → New query → paste and Run
-- =============================================================================

-- Table: store one row per user transaction (deposit, withdraw, borrow, repay)
CREATE TABLE IF NOT EXISTS transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  tx_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'borrow', 'repay', 'flash_loan')),
  asset TEXT NOT NULL CHECK (asset IN ('aleo', 'usdcx', 'usad')),
  amount NUMERIC(20, 6) NOT NULL,
  repay_amount NUMERIC(20, 6),
  program_id TEXT,
  explorer_url TEXT,
  vault_tx_id TEXT,
  vault_explorer_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If table already exists, add vault columns (run once)
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS vault_tx_id TEXT;
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS vault_explorer_url TEXT;
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS repay_amount NUMERIC(20, 6);
COMMENT ON COLUMN transaction_history.status IS 'Optional: vault_pending (withdraw/borrow queued), completed (vault done). UI infers from vault_tx_id when null.';

-- If you already had a narrower asset CHECK, run migrations in supabase/migrations/ (e.g. add_usad_asset.sql).
-- Legacy: migrate old usdc → usdcx, usadx → usad if needed:
-- UPDATE transaction_history SET asset = 'usdcx' WHERE asset = 'usdc';
-- UPDATE transaction_history SET asset = 'usad' WHERE asset = 'usadx';

-- Index: fetch transactions by user wallet (used by GET /api/transactions?wallet=...)
CREATE INDEX IF NOT EXISTS idx_transaction_history_wallet_address
  ON transaction_history (wallet_address);

-- Index: order by created_at when fetching by wallet
CREATE INDEX IF NOT EXISTS idx_transaction_history_wallet_created_at
  ON transaction_history (wallet_address, created_at DESC);

-- Row Level Security: Publishable key (anon) can only SELECT. INSERT is done by the backend (service role) via POST /record-transaction to prevent fake withdraw/borrow rows.
ALTER TABLE transaction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transaction_history_anon_select" ON transaction_history;
DROP POLICY IF EXISTS "transaction_history_publishable_select" ON transaction_history;
CREATE POLICY "transaction_history_publishable_select"
  ON transaction_history FOR SELECT TO anon
  USING (true);

-- No INSERT policy for anon. Run supabase/migrations/revoke_anon_insert_transaction_history.sql to drop any existing anon INSERT policy.
-- Inserts: backend only (service role), via POST /record-transaction.

COMMENT ON TABLE transaction_history IS 'Transaction history per wallet. SELECT: anon. INSERT: service role only (backend).';
