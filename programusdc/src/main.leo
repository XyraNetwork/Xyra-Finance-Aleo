// ============================================================
// lending_pool_usdcx_v16.aleo
// Same Aave-style lending logic as lending_pool_v91 (credits pool),
// with USDCx stablecoin transfers: test_usdcx_stablecoin.aleo/transfer_private_to_public
// (Token record, amount u64 → u128 at call, [MerkleProof; 2]).
//
// MerkleProof must be the imported stablecoin type (not a local struct).
//
// Stablecoin Token.amount is u128; pool public amounts are u64 in the same micro-unit scale — no mismatch.
// Index math uses u128 intermediates so `amount * INDEX_SCALE` cannot u64-overflow (~>18.45M micro per tx).
// ============================================================

import test_usdcx_stablecoin.aleo;

program lending_pool_usdcx_v17.aleo {

    const INDEX_SCALE: u64       = 1_000_000_000_000u64;
    const SCALE: u64             = 10_000u64;
    const BLOCKS_PER_YEAR: u64   = 2_102_400u64;
    const MAX_ACCRUAL_DELTA: u64 = 1_000u64;

    const POOL_VAULT_ADDRESS: address =
        aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr;

    const BASE_RATE: u64         = 200u64;
    const SLOPE_RATE: u64        = 400u64;
    const RESERVE_FACTOR: u64    = 1_000u64;
    const LTV_FACTOR: u64        = 7_500u64;

    /// UserActivity receipts for this pool (USDCx asset).
    const ASSET_ID: field        = 1field;

    mapping total_deposited:     field => u64;
    mapping total_borrowed:      field => u64;
    mapping available_liquidity: field => u64;
    mapping supply_index:        field => u64;
    mapping borrow_index:        field => u64;
    mapping last_accrual_block:  field => u64;
    mapping protocol_fees:       field => u64;
    mapping supply_apy:          field => u64;
    mapping borrow_apy:          field => u64;
    mapping initialized:         field => bool;

    mapping user_scaled_supply:  field => u64;
    mapping user_scaled_borrow:  field => u64;

    record UserActivity {
        owner:             address,
        asset_id:          field,
        total_deposits:    u64,
        total_withdrawals: u64,
        total_borrows:     u64,
        total_repayments:  u64,
    }

    /// Leo does not allow `constructor() -> Future` / init in constructor on this toolchain.
    /// Call `initialize()` once after deploy (admin wallet). Seeds mappings via `finalize_initialize`.
    @admin(address = "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px")
    async constructor() {}

    async transition initialize() -> Future {
        assert(self.caller == aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px);
        return finalize_initialize();
    }

    async transition deposit(
        pay_record:      test_usdcx_stablecoin.aleo/Token,
        public amount:  u64,
        private proofs: [MerkleProof; 2],
    ) -> (UserActivity, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let amount_u128: u128 = amount as u128;

        let (compliance_record, change_token, f_transfer): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            Future,
        ) = test_usdcx_stablecoin.aleo/transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);

        let receipt: UserActivity = UserActivity {
            owner:             caller,
            asset_id:          ASSET_ID,
            total_deposits:    amount,
            total_withdrawals: 0u64,
            total_borrows:     0u64,
            total_repayments:  0u64,
        };

        let f: Future = finalize_deposit(f_transfer, amount, user_key);
        return (receipt, compliance_record, change_token, f);
    }

    async transition withdraw(
        public amount: u64
    ) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);

        let receipt: UserActivity = UserActivity {
            owner:             caller,
            asset_id:          ASSET_ID,
            total_deposits:    0u64,
            total_withdrawals: amount,
            total_borrows:     0u64,
            total_repayments:  0u64,
        };

        let f: Future = finalize_withdraw(amount, user_key);
        return (receipt, f);
    }

    async transition borrow(
        public amount: u64
    ) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);

        let receipt: UserActivity = UserActivity {
            owner:             caller,
            asset_id:          ASSET_ID,
            total_deposits:    0u64,
            total_withdrawals: 0u64,
            total_borrows:     amount,
            total_repayments:  0u64,
        };

        let f: Future = finalize_borrow(amount, user_key);
        return (receipt, f);
    }

    async transition repay(
        pay_record:      test_usdcx_stablecoin.aleo/Token,
        public amount:  u64,
        private proofs: [MerkleProof; 2],
    ) -> (UserActivity, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let amount_u128: u128 = amount as u128;

        let (compliance_record, change_token, f_transfer): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            Future,
        ) = test_usdcx_stablecoin.aleo/transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);

        let receipt: UserActivity = UserActivity {
            owner:             caller,
            asset_id:          ASSET_ID,
            total_deposits:    0u64,
            total_withdrawals: 0u64,
            total_borrows:     0u64,
            total_repayments:  amount,
        };

        let f: Future = finalize_repay(f_transfer, amount, user_key);
        return (receipt, compliance_record, change_token, f);
    }

    async transition accrue_interest() -> Future {
        return finalize_accrue();
    }

    async transition withdraw_fees(public amount: u64) -> Future {
        assert(amount > 0u64);
        let caller: address = self.caller;
        return finalize_withdraw_fees(amount, caller);
    }

// ---- finalize (same interest/accounting as lending_pool_v91) ----

async function finalize_initialize() {
    let already: bool = Mapping::get_or_use(initialized, 0field, false);
    assert(!already);

    let id: field = 0field;
    Mapping::set(supply_index,        id, INDEX_SCALE);
    Mapping::set(borrow_index,        id, INDEX_SCALE);
    Mapping::set(last_accrual_block,  id, 0u64);
    Mapping::set(total_deposited,     id, 0u64);
    Mapping::set(total_borrowed,      id, 0u64);
    Mapping::set(available_liquidity, id, 0u64);
    Mapping::set(protocol_fees,       id, 0u64);
    Mapping::set(supply_apy,          id, BASE_RATE);
    Mapping::set(borrow_apy,          id, BASE_RATE);

    Mapping::set(initialized, 0field, true);
}

async function finalize_deposit(
    f_transfer:    Future,
    amount:        u64,
    user_key:      field
) {
    f_transfer.await();

    let id: field = 0field;

    let current_block: u64 = (block.height as u64);
    let last_block:  u64 = Mapping::get_or_use(last_accrual_block,  id, 0u64);
    let sup_idx:     u64 = Mapping::get_or_use(supply_index,        id, INDEX_SCALE);
    let bor_idx:     u64 = Mapping::get_or_use(borrow_index,        id, INDEX_SCALE);
    let deposited:   u64 = Mapping::get_or_use(total_deposited,     id, 0u64);
    let borrowed:    u64 = Mapping::get_or_use(total_borrowed,      id, 0u64);
    let fees:        u64 = Mapping::get_or_use(protocol_fees,       id, 0u64);

    let raw_delta:   u64 = current_block > last_block ? current_block - last_block : 0u64;
    let delta:       u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
    let do_accrue:  bool = delta > 0u64 && deposited > 0u64;

    let safe_deposited: u64 = deposited == 0u64 ? 1u64 : deposited;
    let raw_util:    u64 = (borrowed * SCALE) / safe_deposited;
    let util:        u64 = deposited == 0u64 ? 0u64 : raw_util;

    let borrow_rate: u64 = (BASE_RATE + (SLOPE_RATE * util) / SCALE)
                           * INDEX_SCALE / (BLOCKS_PER_YEAR * SCALE);

    let supply_rate: u64 = (borrow_rate * util * (SCALE - RESERVE_FACTOR))
                           / (SCALE * SCALE);

    let new_sup_idx: u64 = do_accrue
        ? sup_idx + (sup_idx * supply_rate * delta) / INDEX_SCALE
        : sup_idx;
    let new_bor_idx: u64 = do_accrue
        ? bor_idx + (bor_idx * borrow_rate * delta) / INDEX_SCALE
        : bor_idx;

    let fee_rate:    u64 = (borrowed * borrow_rate) / INDEX_SCALE;
    let fee_delta:   u64 = do_accrue
        ? (fee_rate * delta * RESERVE_FACTOR) / SCALE
        : 0u64;

    let new_s_apy:   u64 = (supply_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_b_apy:   u64 = (borrow_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_block:   u64 = delta > 0u64 ? last_block + delta : last_block;

    Mapping::set(supply_index,        id, new_sup_idx);
    Mapping::set(borrow_index,        id, new_bor_idx);
    Mapping::set(last_accrual_block,  id, new_block);
    Mapping::set(protocol_fees,       id, fees + fee_delta);
    Mapping::set(supply_apy,          id, new_s_apy);
    Mapping::set(borrow_apy,          id, new_b_apy);

    let scaled_in: u64 = ((amount as u128) * (INDEX_SCALE as u128) / (new_sup_idx as u128)) as u64;
    let prev_scaled:  u64 = Mapping::get_or_use(user_scaled_supply, user_key, 0u64);
    Mapping::set(user_scaled_supply, user_key, prev_scaled + scaled_in);

    Mapping::set(total_deposited,     id, deposited + amount);
    let prev_avail:   u64 = Mapping::get_or_use(available_liquidity, id, 0u64);
    Mapping::set(available_liquidity, id, prev_avail + amount);
}

async function finalize_withdraw(
    amount:        u64,
    user_key:      field
) {
    let id: field = 0field;

    let current_block: u64 = (block.height as u64);
    let last_block:  u64 = Mapping::get_or_use(last_accrual_block,  id, 0u64);
    let sup_idx:     u64 = Mapping::get_or_use(supply_index,        id, INDEX_SCALE);
    let bor_idx:     u64 = Mapping::get_or_use(borrow_index,        id, INDEX_SCALE);
    let deposited:   u64 = Mapping::get_or_use(total_deposited,     id, 0u64);
    let borrowed:    u64 = Mapping::get_or_use(total_borrowed,      id, 0u64);
    let fees:        u64 = Mapping::get_or_use(protocol_fees,       id, 0u64);

    let raw_delta:   u64 = current_block > last_block ? current_block - last_block : 0u64;
    let delta:       u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
    let do_accrue:  bool = delta > 0u64 && deposited > 0u64;

    let safe_deposited: u64 = deposited == 0u64 ? 1u64 : deposited;
    let raw_util:    u64 = (borrowed * SCALE) / safe_deposited;
    let util:        u64 = deposited == 0u64 ? 0u64 : raw_util;

    let borrow_rate: u64 = (BASE_RATE + (SLOPE_RATE * util) / SCALE)
                           * INDEX_SCALE / (BLOCKS_PER_YEAR * SCALE);
    let supply_rate: u64 = (borrow_rate * util * (SCALE - RESERVE_FACTOR))
                           / (SCALE * SCALE);

    let new_sup_idx: u64 = do_accrue
        ? sup_idx + (sup_idx * supply_rate * delta) / INDEX_SCALE
        : sup_idx;
    let new_bor_idx: u64 = do_accrue
        ? bor_idx + (bor_idx * borrow_rate * delta) / INDEX_SCALE
        : bor_idx;
    let fee_rate:    u64 = (borrowed * borrow_rate) / INDEX_SCALE;
    let fee_delta:   u64 = do_accrue
        ? (fee_rate * delta * RESERVE_FACTOR) / SCALE
        : 0u64;
    let new_s_apy:   u64 = (supply_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_b_apy:   u64 = (borrow_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_block:   u64 = delta > 0u64 ? last_block + delta : last_block;

    Mapping::set(supply_index,        id, new_sup_idx);
    Mapping::set(borrow_index,        id, new_bor_idx);
    Mapping::set(last_accrual_block,  id, new_block);
    Mapping::set(protocol_fees,       id, fees + fee_delta);
    Mapping::set(supply_apy,          id, new_s_apy);
    Mapping::set(borrow_apy,          id, new_b_apy);

    let scaled_sup:   u64 = Mapping::get_or_use(user_scaled_supply, user_key, 0u64);
    let real_balance: u64 = ((scaled_sup as u128) * (new_sup_idx as u128) / (INDEX_SCALE as u128)) as u64;
    assert(amount <= real_balance);

    let scaled_bor:   u64 = Mapping::get_or_use(user_scaled_borrow, user_key, 0u64);
    let real_debt: u64 = ((scaled_bor as u128) * (new_bor_idx as u128) / (INDEX_SCALE as u128)) as u64;
    let remaining:    u64 = real_balance - amount;
    let max_debt:     u64 = (remaining * LTV_FACTOR) / SCALE;
    assert(real_debt == 0u64 || real_debt <= max_debt);

    let scaled_out: u64 = ((amount as u128) * (INDEX_SCALE as u128) / (new_sup_idx as u128)) as u64;
    let new_scaled:   u64 = scaled_sup > scaled_out ? scaled_sup - scaled_out : 0u64;
    Mapping::set(user_scaled_supply, user_key, new_scaled);

    let new_deposited: u64 = deposited > amount ? deposited - amount : 0u64;
    Mapping::set(total_deposited,     id, new_deposited);
    let prev_avail:    u64 = Mapping::get_or_use(available_liquidity, id, 0u64);
    let new_avail:     u64 = prev_avail > amount ? prev_avail - amount : 0u64;
    Mapping::set(available_liquidity, id, new_avail);
}

async function finalize_borrow(
    amount:        u64,
    user_key:      field
) {
    let id: field = 0field;

    let current_block: u64 = (block.height as u64);
    let last_block:  u64 = Mapping::get_or_use(last_accrual_block,  id, 0u64);
    let sup_idx:     u64 = Mapping::get_or_use(supply_index,        id, INDEX_SCALE);
    let bor_idx:     u64 = Mapping::get_or_use(borrow_index,        id, INDEX_SCALE);
    let deposited:   u64 = Mapping::get_or_use(total_deposited,     id, 0u64);
    let borrowed:    u64 = Mapping::get_or_use(total_borrowed,      id, 0u64);
    let fees:        u64 = Mapping::get_or_use(protocol_fees,       id, 0u64);

    let raw_delta:   u64 = current_block > last_block ? current_block - last_block : 0u64;
    let delta:       u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
    let do_accrue:  bool = delta > 0u64 && deposited > 0u64;

    let safe_deposited: u64 = deposited == 0u64 ? 1u64 : deposited;
    let raw_util:    u64 = (borrowed * SCALE) / safe_deposited;
    let util:        u64 = deposited == 0u64 ? 0u64 : raw_util;

    let borrow_rate: u64 = (BASE_RATE + (SLOPE_RATE * util) / SCALE)
                           * INDEX_SCALE / (BLOCKS_PER_YEAR * SCALE);
    let supply_rate: u64 = (borrow_rate * util * (SCALE - RESERVE_FACTOR))
                           / (SCALE * SCALE);

    let new_sup_idx: u64 = do_accrue
        ? sup_idx + (sup_idx * supply_rate * delta) / INDEX_SCALE
        : sup_idx;
    let new_bor_idx: u64 = do_accrue
        ? bor_idx + (bor_idx * borrow_rate * delta) / INDEX_SCALE
        : bor_idx;
    let fee_rate:    u64 = (borrowed * borrow_rate) / INDEX_SCALE;
    let fee_delta:   u64 = do_accrue
        ? (fee_rate * delta * RESERVE_FACTOR) / SCALE
        : 0u64;
    let new_s_apy:   u64 = (supply_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_b_apy:   u64 = (borrow_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_block:   u64 = delta > 0u64 ? last_block + delta : last_block;

    Mapping::set(supply_index,        id, new_sup_idx);
    Mapping::set(borrow_index,        id, new_bor_idx);
    Mapping::set(last_accrual_block,  id, new_block);
    Mapping::set(protocol_fees,       id, fees + fee_delta);
    Mapping::set(supply_apy,          id, new_s_apy);
    Mapping::set(borrow_apy,          id, new_b_apy);

    let scaled_sup:       u64 = Mapping::get_or_use(user_scaled_supply, user_key, 0u64);
    let collateral_value: u64 = ((scaled_sup as u128) * (new_sup_idx as u128) / (INDEX_SCALE as u128)) as u64;
    let max_borrow:       u64 = (collateral_value * LTV_FACTOR) / SCALE;
    let scaled_bor:       u64 = Mapping::get_or_use(user_scaled_borrow, user_key, 0u64);
    let existing_debt: u64 = ((scaled_bor as u128) * (new_bor_idx as u128) / (INDEX_SCALE as u128)) as u64;
    assert(existing_debt + amount <= max_borrow);

    let avail:            u64 = Mapping::get_or_use(available_liquidity, id, 0u64);
    assert(amount <= avail);

    let scaled_in: u64 = ((amount as u128) * (INDEX_SCALE as u128) / (new_bor_idx as u128)) as u64;
    Mapping::set(user_scaled_borrow, user_key, scaled_bor + scaled_in);

    Mapping::set(total_borrowed,      id, borrowed + amount);
    let new_avail:        u64 = avail > amount ? avail - amount : 0u64;
    Mapping::set(available_liquidity, id, new_avail);
}

async function finalize_repay(
    f_transfer:    Future,
    amount:        u64,
    user_key:      field
) {
    f_transfer.await();

    let id: field = 0field;

    let current_block: u64 = (block.height as u64);
    let last_block:  u64 = Mapping::get_or_use(last_accrual_block,  id, 0u64);
    let sup_idx:     u64 = Mapping::get_or_use(supply_index,        id, INDEX_SCALE);
    let bor_idx:     u64 = Mapping::get_or_use(borrow_index,        id, INDEX_SCALE);
    let deposited:   u64 = Mapping::get_or_use(total_deposited,     id, 0u64);
    let borrowed:    u64 = Mapping::get_or_use(total_borrowed,      id, 0u64);
    let fees:        u64 = Mapping::get_or_use(protocol_fees,       id, 0u64);

    let raw_delta:   u64 = current_block > last_block ? current_block - last_block : 0u64;
    let delta:       u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
    let do_accrue:  bool = delta > 0u64 && deposited > 0u64;

    let safe_deposited: u64 = deposited == 0u64 ? 1u64 : deposited;
    let raw_util:    u64 = (borrowed * SCALE) / safe_deposited;
    let util:        u64 = deposited == 0u64 ? 0u64 : raw_util;

    let borrow_rate: u64 = (BASE_RATE + (SLOPE_RATE * util) / SCALE)
                           * INDEX_SCALE / (BLOCKS_PER_YEAR * SCALE);
    let supply_rate: u64 = (borrow_rate * util * (SCALE - RESERVE_FACTOR))
                           / (SCALE * SCALE);

    let new_sup_idx: u64 = do_accrue
        ? sup_idx + (sup_idx * supply_rate * delta) / INDEX_SCALE
        : sup_idx;
    let new_bor_idx: u64 = do_accrue
        ? bor_idx + (bor_idx * borrow_rate * delta) / INDEX_SCALE
        : bor_idx;
    let fee_rate:    u64 = (borrowed * borrow_rate) / INDEX_SCALE;
    let fee_delta:   u64 = do_accrue
        ? (fee_rate * delta * RESERVE_FACTOR) / SCALE
        : 0u64;
    let new_s_apy:   u64 = (supply_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_b_apy:   u64 = (borrow_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_block:   u64 = delta > 0u64 ? last_block + delta : last_block;

    Mapping::set(supply_index,        id, new_sup_idx);
    Mapping::set(borrow_index,        id, new_bor_idx);
    Mapping::set(last_accrual_block,  id, new_block);
    Mapping::set(protocol_fees,       id, fees + fee_delta);
    Mapping::set(supply_apy,          id, new_s_apy);
    Mapping::set(borrow_apy,          id, new_b_apy);

    let scaled_bor:   u64 = Mapping::get_or_use(user_scaled_borrow, user_key, 0u64);
    let real_debt: u64 = ((scaled_bor as u128) * (new_bor_idx as u128) / (INDEX_SCALE as u128)) as u64;
    assert(amount <= real_debt);
    let repay_amt:    u64 = amount;

    let scaled_out: u64 = ((repay_amt as u128) * (INDEX_SCALE as u128) / (new_bor_idx as u128)) as u64;
    let new_scaled:   u64 = scaled_bor > scaled_out ? scaled_bor - scaled_out : 0u64;
    Mapping::set(user_scaled_borrow, user_key, new_scaled);

    let new_borrowed: u64 = borrowed > repay_amt ? borrowed - repay_amt : 0u64;
    Mapping::set(total_borrowed,      id, new_borrowed);
    let prev_avail:   u64 = Mapping::get_or_use(available_liquidity, id, 0u64);
    Mapping::set(available_liquidity, id, prev_avail + repay_amt);
}

async function finalize_accrue() {
    let id: field = 0field;

    let current_block: u64 = (block.height as u64);
    let last_block:  u64 = Mapping::get_or_use(last_accrual_block,  id, 0u64);
    let sup_idx:     u64 = Mapping::get_or_use(supply_index,        id, INDEX_SCALE);
    let bor_idx:     u64 = Mapping::get_or_use(borrow_index,        id, INDEX_SCALE);
    let deposited:   u64 = Mapping::get_or_use(total_deposited,     id, 0u64);
    let borrowed:    u64 = Mapping::get_or_use(total_borrowed,      id, 0u64);
    let fees:        u64 = Mapping::get_or_use(protocol_fees,       id, 0u64);

    let raw_delta:   u64 = current_block > last_block ? current_block - last_block : 0u64;
    let delta:       u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
    let do_accrue:  bool = delta > 0u64 && deposited > 0u64;

    let safe_deposited: u64 = deposited == 0u64 ? 1u64 : deposited;
    let raw_util:    u64 = (borrowed * SCALE) / safe_deposited;
    let util:        u64 = deposited == 0u64 ? 0u64 : raw_util;

    let borrow_rate: u64 = (BASE_RATE + (SLOPE_RATE * util) / SCALE)
                           * INDEX_SCALE / (BLOCKS_PER_YEAR * SCALE);
    let supply_rate: u64 = (borrow_rate * util * (SCALE - RESERVE_FACTOR))
                           / (SCALE * SCALE);

    let new_sup_idx: u64 = do_accrue
        ? sup_idx + (sup_idx * supply_rate * delta) / INDEX_SCALE
        : sup_idx;
    let new_bor_idx: u64 = do_accrue
        ? bor_idx + (bor_idx * borrow_rate * delta) / INDEX_SCALE
        : bor_idx;
    let fee_rate:    u64 = (borrowed * borrow_rate) / INDEX_SCALE;
    let fee_delta:   u64 = do_accrue
        ? (fee_rate * delta * RESERVE_FACTOR) / SCALE
        : 0u64;
    let new_s_apy:   u64 = (supply_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_b_apy:   u64 = (borrow_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
    let new_block:   u64 = delta > 0u64 ? last_block + delta : last_block;

    Mapping::set(supply_index,        id, new_sup_idx);
    Mapping::set(borrow_index,        id, new_bor_idx);
    Mapping::set(last_accrual_block,  id, new_block);
    Mapping::set(protocol_fees,       id, fees + fee_delta);
    Mapping::set(supply_apy,          id, new_s_apy);
    Mapping::set(borrow_apy,          id, new_b_apy);
}

async function finalize_withdraw_fees(
    amount:     u64,
    caller:     address
) {
    assert(caller == aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px);
    let id: field = 0field;
    let fees: u64 = Mapping::get_or_use(protocol_fees, id, 0u64);
    assert(amount <= fees);
    Mapping::set(protocol_fees, id, fees - amount);
}
}
