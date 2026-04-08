-- Add optional repay_amount to transaction_history.
-- Used by self_liquidate_payout rows to store repay amount (ALEO)
-- while keeping amount as payout amount.

ALTER TABLE transaction_history
  ADD COLUMN IF NOT EXISTS repay_amount NUMERIC(20, 6);
