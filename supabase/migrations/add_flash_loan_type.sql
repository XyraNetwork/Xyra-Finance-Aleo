-- Allow transaction_history.type = 'flash_loan' (ALEO pool flash loan).
-- Run in Supabase SQL Editor if the table already exists with a CHECK on type.

ALTER TABLE transaction_history DROP CONSTRAINT IF EXISTS transaction_history_type_check;

ALTER TABLE transaction_history ADD CONSTRAINT transaction_history_type_check
  CHECK (type IN ('deposit', 'withdraw', 'borrow', 'repay', 'flash_loan'));
