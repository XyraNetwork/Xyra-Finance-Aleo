-- Allow transaction_history.type = 'self_liquidate_payout' (vault pays seized collateral after self_liquidate_and_payout).
-- Also align CHECK with types used by the app (open_position, liquidation).
-- Run in Supabase SQL Editor if the table already exists with transaction_history_type_check.

ALTER TABLE transaction_history DROP CONSTRAINT IF EXISTS transaction_history_type_check;

ALTER TABLE transaction_history ADD CONSTRAINT transaction_history_type_check
  CHECK (type IN (
    'deposit',
    'withdraw',
    'borrow',
    'repay',
    'flash_loan',
    'open_position',
    'liquidation',
    'self_liquidate_payout'
  ));
