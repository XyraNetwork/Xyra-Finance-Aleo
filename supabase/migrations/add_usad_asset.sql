-- Allow asset = 'usad' (USAD pool) and normalize legacy 'usadx' → 'usad'.
-- Run in Supabase SQL Editor if you already have transaction_history with an older CHECK.

-- 1) Optional: rename legacy rows before recreating constraint
UPDATE transaction_history SET asset = 'usad' WHERE asset = 'usadx';

-- 2) Replace CHECK constraint (name may be transaction_history_asset_check)
ALTER TABLE transaction_history DROP CONSTRAINT IF EXISTS transaction_history_asset_check;
ALTER TABLE transaction_history
  ADD CONSTRAINT transaction_history_asset_check
  CHECK (asset IN ('aleo', 'usdcx', 'usad'));
