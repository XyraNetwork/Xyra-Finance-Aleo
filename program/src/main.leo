import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program xyra_lending_v6.aleo {
    const INDEX_SCALE: u64       = 1_000_000_000_000u64;
    const SCALE: u64             = 10_000u64;
    const BLOCKS_PER_YEAR: u64   = 2_102_400u64;
    const MAX_ACCRUAL_DELTA: u64 = 1_000u64;
    const PRICE_SCALE: u64       = 1_000_000u64;

    const POOL_VAULT_ADDRESS: address =
        aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr;
    const ADMIN_ADDRESS: address =
        aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px;

    const ASSET_ALEO: field  = 0field;
    const ASSET_USDCX: field = 1field;
    const ASSET_USAD: field  = 2field;

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

    mapping asset_base_rate:      field => u64;
    mapping asset_slope_rate:     field => u64;
    mapping asset_reserve_factor: field => u64;
    mapping asset_ltv:            field => u64;
    mapping asset_liq_threshold:  field => u64;
    mapping asset_liq_bonus:      field => u64;
    mapping asset_price:          field => u64;

    mapping user_scaled_supply:   field => u64;
    mapping user_scaled_borrow:   field => u64;

    record UserActivity {
        owner:             address,
        asset_id:          field,
        total_deposits:    u64,
        total_withdrawals: u64,
        total_borrows:     u64,
        total_repayments:  u64,
    }

    @admin(address = "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px")
    async constructor() {}

    async transition initialize() -> Future {
        assert(self.caller == ADMIN_ADDRESS);
        return finalize_initialize();
    }

    async transition deposit_with_credits(
        pay_record: credits.aleo/credits,
        public amount: u64
    ) -> (UserActivity, credits.aleo/credits, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let (change, f_transfer): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, amount);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_ALEO, total_deposits: amount,
            total_withdrawals: 0u64, total_borrows: 0u64, total_repayments: 0u64
        };
        let f: Future = finalize_deposit(f_transfer, ASSET_ALEO, amount, user_key);
        return (receipt, change, f);
    }

    async transition deposit_usdcx(
        pay_record: test_usdcx_stablecoin.aleo/Token,
        public amount: u64,
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
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USDCX, total_deposits: amount,
            total_withdrawals: 0u64, total_borrows: 0u64, total_repayments: 0u64
        };
        let f: Future = finalize_deposit(f_transfer, ASSET_USDCX, amount, user_key);
        return (receipt, compliance_record, change_token, f);
    }

    async transition deposit_usad(
        pay_record: test_usad_stablecoin.aleo/Token,
        public amount: u64,
        private proofs: [MerkleProof; 2],
    ) -> (UserActivity, test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let amount_u128: u128 = amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USAD, total_deposits: amount,
            total_withdrawals: 0u64, total_borrows: 0u64, total_repayments: 0u64
        };
        let f: Future = finalize_deposit(f_transfer, ASSET_USAD, amount, user_key);
        return (receipt, compliance_record, change_token, f);
    }

    async transition withdraw(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_ALEO, total_deposits: 0u64,
            total_withdrawals: amount, total_borrows: 0u64, total_repayments: 0u64
        };
        let f: Future = finalize_withdraw(ASSET_ALEO, amount, user_key);
        return (receipt, f);
    }

    async transition withdraw_usdcx(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USDCX, total_deposits: 0u64,
            total_withdrawals: amount, total_borrows: 0u64, total_repayments: 0u64
        };
        let f: Future = finalize_withdraw(ASSET_USDCX, amount, user_key);
        return (receipt, f);
    }

    async transition withdraw_usad(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USAD, total_deposits: 0u64,
            total_withdrawals: amount, total_borrows: 0u64, total_repayments: 0u64
        };
        let f: Future = finalize_withdraw(ASSET_USAD, amount, user_key);
        return (receipt, f);
    }

    async transition borrow(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_ALEO, total_deposits: 0u64,
            total_withdrawals: 0u64, total_borrows: amount, total_repayments: 0u64
        };
        let f: Future = finalize_borrow(ASSET_ALEO, amount, user_key);
        return (receipt, f);
    }

    async transition borrow_usdcx(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USDCX, total_deposits: 0u64,
            total_withdrawals: 0u64, total_borrows: amount, total_repayments: 0u64
        };
        let f: Future = finalize_borrow(ASSET_USDCX, amount, user_key);
        return (receipt, f);
    }

    async transition borrow_usad(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_key: field = BHP256::hash_to_field(caller);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USAD, total_deposits: 0u64,
            total_withdrawals: 0u64, total_borrows: amount, total_repayments: 0u64
        };
        let f: Future = finalize_borrow(ASSET_USAD, amount, user_key);
        return (receipt, f);
    }

    async transition repay_with_credits(
        pay_record: credits.aleo/credits,
        public amount: u64
    ) -> (UserActivity, credits.aleo/credits, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let (change, f_transfer): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, amount);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_ALEO, total_deposits: 0u64,
            total_withdrawals: 0u64, total_borrows: 0u64, total_repayments: amount
        };
        let f: Future = finalize_repay_any(f_transfer, ASSET_ALEO, amount, user_key);
        return (receipt, change, f);
    }

    async transition repay_usdcx(
        pay_record: test_usdcx_stablecoin.aleo/Token,
        public amount: u64,
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
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USDCX, total_deposits: 0u64,
            total_withdrawals: 0u64, total_borrows: 0u64, total_repayments: amount
        };
        let f: Future = finalize_repay_any(f_transfer, ASSET_USDCX, amount, user_key);
        return (receipt, compliance_record, change_token, f);
    }

    async transition repay_usad(
        pay_record: test_usad_stablecoin.aleo/Token,
        public amount: u64,
        private proofs: [MerkleProof; 2],
    ) -> (UserActivity, test_usad_stablecoin.aleo/ComplianceRecord, test_usad_stablecoin.aleo/Token, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let amount_u128: u128 = amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        let receipt: UserActivity = UserActivity {
            owner: caller, asset_id: ASSET_USAD, total_deposits: 0u64,
            total_withdrawals: 0u64, total_borrows: 0u64, total_repayments: amount
        };
        let f: Future = finalize_repay_any(f_transfer, ASSET_USAD, amount, user_key);
        return (receipt, compliance_record, change_token, f);
    }

    async transition accrue_interest(public asset_id: field) -> Future {
        return finalize_accrue(asset_id);
    }

    async transition set_asset_price(public asset_id: field, public price: u64) -> Future {
        assert(self.caller == ADMIN_ADDRESS);
        assert(price > 0u64);
        return finalize_set_price(asset_id, price);
    }

    async transition set_asset_params(
        public asset_id: field,
        public ltv: u64,
        public liq_threshold: u64,
        public liq_bonus: u64,
        public base_rate: u64,
        public slope_rate: u64,
        public reserve_factor: u64
    ) -> Future {
        assert(self.caller == ADMIN_ADDRESS);
        return finalize_set_params(asset_id, ltv, liq_threshold, liq_bonus, base_rate, slope_rate, reserve_factor);
    }

    async transition withdraw_fees(public asset_id: field, public amount: u64) -> Future {
        assert(amount > 0u64);
        assert(self.caller == ADMIN_ADDRESS);
        return finalize_withdraw_fees(asset_id, amount);
    }

    inline compute_position_key(user_key: field, asset_id: field) -> field {
        return BHP256::hash_to_field(user_key + asset_id);
    }

    // Borrowing power in USD micro-units: floor(real_sup * price * ltv / (PRICE_SCALE * SCALE)).
    // Chained divisions floor twice and can be 1 unit lower than this single floor (breaks max borrow).
    // When (real_sup * price) * ltv would overflow u128, fall back to the legacy chained form.
    inline weighted_collateral_usd(real_sup: u64, price: u64, ltv: u64) -> u64 {
        let rp: u128 = (real_sup as u128) * (price as u128);
        let l: u128 = (ltv as u128);
        let den: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128: u128 = 340282366920938463463374607431768211455u128;
        let rp_times_l_ok: bool = (l == 0u128) || (rp <= (max_u128 / l));
        return rp_times_l_ok ? (((rp * l) / den) as u64) : ((((rp / (PRICE_SCALE as u128)) * l / (SCALE as u128)) as u64));
    }

    async function finalize_initialize() {
    let already: bool = Mapping::get_or_use(initialized, 0field, false);
    assert(!already);

        // Leo limit: <=16 mapping writes per finalize. Keep initialize minimal.
        Mapping::set(initialized, ASSET_ALEO, true);
        Mapping::set(initialized, ASSET_USDCX, true);
        Mapping::set(initialized, ASSET_USAD, true);
        Mapping::set(supply_index, ASSET_ALEO, INDEX_SCALE);
        Mapping::set(supply_index, ASSET_USDCX, INDEX_SCALE);
        Mapping::set(supply_index, ASSET_USAD, INDEX_SCALE);
        Mapping::set(borrow_index, ASSET_ALEO, INDEX_SCALE);
        Mapping::set(borrow_index, ASSET_USDCX, INDEX_SCALE);
        Mapping::set(borrow_index, ASSET_USAD, INDEX_SCALE);
        Mapping::set(last_accrual_block, ASSET_ALEO, 0u64);
        Mapping::set(last_accrual_block, ASSET_USDCX, 0u64);
        Mapping::set(last_accrual_block, ASSET_USAD, 0u64);
        Mapping::set(asset_price, ASSET_ALEO, PRICE_SCALE);
        Mapping::set(asset_price, ASSET_USDCX, PRICE_SCALE);
        Mapping::set(asset_price, ASSET_USAD, PRICE_SCALE);
        Mapping::set(asset_ltv, ASSET_ALEO, 7_500u64);
    }

    async function finalize_deposit(f_transfer: Future, asset_id: field, amount: u64, user_key: field) {
        f_transfer.await();

        let sup_idx: u64 = Mapping::get_or_use(supply_index, asset_id, INDEX_SCALE);
        let deposited: u64 = Mapping::get_or_use(total_deposited, asset_id, 0u64);
        let pos_key: field = compute_position_key(user_key, asset_id);
        // u128 intermediate: amount * INDEX_SCALE can exceed u64::MAX for large amounts (micro units).
        let scaled_in: u64 = (((amount as u128) * (INDEX_SCALE as u128) / (sup_idx as u128)) as u64);
        let prev_scaled: u64 = Mapping::get_or_use(user_scaled_supply, pos_key, 0u64);
        assert((prev_scaled as u128) + (scaled_in as u128) <= (18446744073709551615u128));
        Mapping::set(user_scaled_supply, pos_key, prev_scaled + scaled_in);
        assert((deposited as u128) + (amount as u128) <= (18446744073709551615u128));
        Mapping::set(total_deposited, asset_id, deposited + amount);
        let prev_avail: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
        assert((prev_avail as u128) + (amount as u128) <= (18446744073709551615u128));
        Mapping::set(available_liquidity, asset_id, prev_avail + amount);
    }

    async function finalize_borrow(asset_id: field, amount: u64, user_key: field) {
        let sup_idx_aleo: u64 = Mapping::get_or_use(supply_index, ASSET_ALEO, INDEX_SCALE);
        let sup_idx_usdcx: u64 = Mapping::get_or_use(supply_index, ASSET_USDCX, INDEX_SCALE);
        let sup_idx_usad: u64 = Mapping::get_or_use(supply_index, ASSET_USAD, INDEX_SCALE);
        let bor_idx_aleo: u64 = Mapping::get_or_use(borrow_index, ASSET_ALEO, INDEX_SCALE);
        let bor_idx_usdcx: u64 = Mapping::get_or_use(borrow_index, ASSET_USDCX, INDEX_SCALE);
        let bor_idx_usad: u64 = Mapping::get_or_use(borrow_index, ASSET_USAD, INDEX_SCALE);

        let price_aleo: u64 = Mapping::get_or_use(asset_price, ASSET_ALEO, PRICE_SCALE);
        let price_usdcx: u64 = Mapping::get_or_use(asset_price, ASSET_USDCX, PRICE_SCALE);
        let price_usad: u64 = Mapping::get_or_use(asset_price, ASSET_USAD, PRICE_SCALE);
        let ltv_aleo: u64 = Mapping::get_or_use(asset_ltv, ASSET_ALEO, 7_500u64);
        let ltv_usdcx: u64 = Mapping::get_or_use(asset_ltv, ASSET_USDCX, 8_500u64);
        let ltv_usad: u64 = Mapping::get_or_use(asset_ltv, ASSET_USAD, 8_500u64);

        let pos_aleo: field = compute_position_key(user_key, ASSET_ALEO);
        let pos_usdcx: field = compute_position_key(user_key, ASSET_USDCX);
        let pos_usad: field = compute_position_key(user_key, ASSET_USAD);

        let scaled_sup_aleo: u64 = Mapping::get_or_use(user_scaled_supply, pos_aleo, 0u64);
        let scaled_sup_usdcx: u64 = Mapping::get_or_use(user_scaled_supply, pos_usdcx, 0u64);
        let scaled_sup_usad: u64 = Mapping::get_or_use(user_scaled_supply, pos_usad, 0u64);
        let scaled_bor_aleo: u64 = Mapping::get_or_use(user_scaled_borrow, pos_aleo, 0u64);
        let scaled_bor_usdcx: u64 = Mapping::get_or_use(user_scaled_borrow, pos_usdcx, 0u64);
        let scaled_bor_usad: u64 = Mapping::get_or_use(user_scaled_borrow, pos_usad, 0u64);

        let real_sup_aleo: u64 = (((scaled_sup_aleo as u128) * (sup_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usdcx: u64 = (((scaled_sup_usdcx as u128) * (sup_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usad: u64 = (((scaled_sup_usad as u128) * (sup_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_aleo: u64 = (((scaled_bor_aleo as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usdcx: u64 = (((scaled_bor_usdcx as u128) * (bor_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usad: u64 = (((scaled_bor_usad as u128) * (bor_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);

        let weighted_aleo: u64 = weighted_collateral_usd(real_sup_aleo, price_aleo, ltv_aleo);
        let weighted_usdcx: u64 = weighted_collateral_usd(real_sup_usdcx, price_usdcx, ltv_usdcx);
        let weighted_usad: u64 = weighted_collateral_usd(real_sup_usad, price_usad, ltv_usad);

        let debt_aleo_usd: u64 = (((real_bor_aleo as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usdcx_usd: u64 = (((real_bor_usdcx as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usad_usd: u64 = (((real_bor_usad as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);

        let borrow_price: u64 = Mapping::get_or_use(asset_price, asset_id, PRICE_SCALE);
        let new_borrow_usd: u64 = (((amount as u128) * (borrow_price as u128) / (PRICE_SCALE as u128)) as u64);
        // Sum in u128 so intermediate u64 sums cannot wrap (same inequality as Aave health).
        let total_collateral_u128: u128 = (weighted_aleo as u128) + (weighted_usdcx as u128) + (weighted_usad as u128);
        let total_debt_u128: u128 = (debt_aleo_usd as u128) + (debt_usdcx_usd as u128) + (debt_usad_usd as u128);
        assert(total_debt_u128 + (new_borrow_usd as u128) <= total_collateral_u128);

        // Do not reduce `available_liquidity` on borrow: borrow principal is paid from the
        // backend vault, not necessarily from tokens sitting in this pool mapping. Debt is
        // still tracked via `total_borrowed` and `user_scaled_borrow`.

        let bor_idx: u64 = Mapping::get_or_use(borrow_index, asset_id, INDEX_SCALE);
        let pos_key: field = compute_position_key(user_key, asset_id);
        let scaled_bor: u64 = Mapping::get_or_use(user_scaled_borrow, pos_key, 0u64);
        let scaled_in: u64 = (((amount as u128) * (INDEX_SCALE as u128) / (bor_idx as u128)) as u64);
        assert((scaled_bor as u128) + (scaled_in as u128) <= (18446744073709551615u128));
        Mapping::set(user_scaled_borrow, pos_key, scaled_bor + scaled_in);

        let borrowed: u64 = Mapping::get_or_use(total_borrowed, asset_id, 0u64);
        assert((borrowed as u128) + (amount as u128) <= (18446744073709551615u128));
        Mapping::set(total_borrowed, asset_id, borrowed + amount);
    }

    async function finalize_repay_any(f_transfer: Future, asset_in: field, amount: u64, user_key: field) {
        f_transfer.await();

        let price_in: u64 = Mapping::get_or_use(asset_price, asset_in, PRICE_SCALE);
        let payment_usd: u64 = (((amount as u128) * (price_in as u128) / (PRICE_SCALE as u128)) as u64);
        assert(payment_usd > 0u64);

        let bor_idx_aleo: u64 = Mapping::get_or_use(borrow_index, ASSET_ALEO, INDEX_SCALE);
        let bor_idx_usdcx: u64 = Mapping::get_or_use(borrow_index, ASSET_USDCX, INDEX_SCALE);
        let bor_idx_usad: u64 = Mapping::get_or_use(borrow_index, ASSET_USAD, INDEX_SCALE);
        let price_aleo: u64 = Mapping::get_or_use(asset_price, ASSET_ALEO, PRICE_SCALE);
        let price_usdcx: u64 = Mapping::get_or_use(asset_price, ASSET_USDCX, PRICE_SCALE);
        let price_usad: u64 = Mapping::get_or_use(asset_price, ASSET_USAD, PRICE_SCALE);

        let pos_aleo: field = compute_position_key(user_key, ASSET_ALEO);
        let pos_usdcx: field = compute_position_key(user_key, ASSET_USDCX);
        let pos_usad: field = compute_position_key(user_key, ASSET_USAD);
        let scaled_bor_aleo: u64 = Mapping::get_or_use(user_scaled_borrow, pos_aleo, 0u64);
        let scaled_bor_usdcx: u64 = Mapping::get_or_use(user_scaled_borrow, pos_usdcx, 0u64);
        let scaled_bor_usad: u64 = Mapping::get_or_use(user_scaled_borrow, pos_usad, 0u64);

        let real_bor_aleo: u64 = (((scaled_bor_aleo as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usdcx: u64 = (((scaled_bor_usdcx as u128) * (bor_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usad: u64 = (((scaled_bor_usad as u128) * (bor_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let debt_aleo_usd: u64 = (((real_bor_aleo as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usdcx_usd: u64 = (((real_bor_usdcx as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usad_usd: u64 = (((real_bor_usad as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let total_debt_usd_u128: u128 = (debt_aleo_usd as u128) + (debt_usdcx_usd as u128) + (debt_usad_usd as u128);
        assert(total_debt_usd_u128 > 0u128);
        assert(total_debt_usd_u128 <= 18446744073709551615u128);
        let total_debt_usd: u64 = (total_debt_usd_u128 as u64);

        let repay_budget_usd: u64 = payment_usd > total_debt_usd ? total_debt_usd : payment_usd;

        // Reduce ALEO debt first.
        let pay_aleo_usd: u64 = repay_budget_usd > debt_aleo_usd ? debt_aleo_usd : repay_budget_usd;
        let repay_aleo_asset: u64 = (((pay_aleo_usd as u128) * (PRICE_SCALE as u128) / (price_aleo as u128)) as u64);
        let scaled_out_aleo: u64 = (((repay_aleo_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_aleo as u128)) as u64);
        let new_scaled_aleo: u64 = scaled_bor_aleo > scaled_out_aleo ? scaled_bor_aleo - scaled_out_aleo : 0u64;
        Mapping::set(user_scaled_borrow, pos_aleo, new_scaled_aleo);
        let borrowed_aleo: u64 = Mapping::get_or_use(total_borrowed, ASSET_ALEO, 0u64);
        let new_borrowed_aleo: u64 = borrowed_aleo > repay_aleo_asset ? borrowed_aleo - repay_aleo_asset : 0u64;
        Mapping::set(total_borrowed, ASSET_ALEO, new_borrowed_aleo);
        let rem_after_aleo: u64 = repay_budget_usd > pay_aleo_usd ? repay_budget_usd - pay_aleo_usd : 0u64;

        // Then reduce USDCx debt.
        let pay_usdcx_usd: u64 = rem_after_aleo > debt_usdcx_usd ? debt_usdcx_usd : rem_after_aleo;
        let repay_usdcx_asset: u64 = (((pay_usdcx_usd as u128) * (PRICE_SCALE as u128) / (price_usdcx as u128)) as u64);
        let scaled_out_usdcx: u64 = (((repay_usdcx_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usdcx as u128)) as u64);
        let new_scaled_usdcx: u64 = scaled_bor_usdcx > scaled_out_usdcx ? scaled_bor_usdcx - scaled_out_usdcx : 0u64;
        Mapping::set(user_scaled_borrow, pos_usdcx, new_scaled_usdcx);
        let borrowed_usdcx: u64 = Mapping::get_or_use(total_borrowed, ASSET_USDCX, 0u64);
        let new_borrowed_usdcx: u64 = borrowed_usdcx > repay_usdcx_asset ? borrowed_usdcx - repay_usdcx_asset : 0u64;
        Mapping::set(total_borrowed, ASSET_USDCX, new_borrowed_usdcx);
        let rem_after_usdcx: u64 = rem_after_aleo > pay_usdcx_usd ? rem_after_aleo - pay_usdcx_usd : 0u64;

        // Finally reduce USAD debt.
        let pay_usad_usd: u64 = rem_after_usdcx > debt_usad_usd ? debt_usad_usd : rem_after_usdcx;
        let repay_usad_asset: u64 = (((pay_usad_usd as u128) * (PRICE_SCALE as u128) / (price_usad as u128)) as u64);
        let scaled_out_usad: u64 = (((repay_usad_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usad as u128)) as u64);
        let new_scaled_usad: u64 = scaled_bor_usad > scaled_out_usad ? scaled_bor_usad - scaled_out_usad : 0u64;
        Mapping::set(user_scaled_borrow, pos_usad, new_scaled_usad);
        let borrowed_usad: u64 = Mapping::get_or_use(total_borrowed, ASSET_USAD, 0u64);
        let new_borrowed_usad: u64 = borrowed_usad > repay_usad_asset ? borrowed_usad - repay_usad_asset : 0u64;
        Mapping::set(total_borrowed, ASSET_USAD, new_borrowed_usad);

        let prev_avail_in: u64 = Mapping::get_or_use(available_liquidity, asset_in, 0u64);
        assert((prev_avail_in as u128) + (amount as u128) <= (18446744073709551615u128));
        Mapping::set(available_liquidity, asset_in, prev_avail_in + amount);
    }

    async function finalize_withdraw(asset_id: field, amount: u64, user_key: field) {
        let sup_idx_aleo: u64 = Mapping::get_or_use(supply_index, ASSET_ALEO, INDEX_SCALE);
        let sup_idx_usdcx: u64 = Mapping::get_or_use(supply_index, ASSET_USDCX, INDEX_SCALE);
        let sup_idx_usad: u64 = Mapping::get_or_use(supply_index, ASSET_USAD, INDEX_SCALE);
        let bor_idx_aleo: u64 = Mapping::get_or_use(borrow_index, ASSET_ALEO, INDEX_SCALE);
        let bor_idx_usdcx: u64 = Mapping::get_or_use(borrow_index, ASSET_USDCX, INDEX_SCALE);
        let bor_idx_usad: u64 = Mapping::get_or_use(borrow_index, ASSET_USAD, INDEX_SCALE);

        let price_aleo: u64 = Mapping::get_or_use(asset_price, ASSET_ALEO, PRICE_SCALE);
        let price_usdcx: u64 = Mapping::get_or_use(asset_price, ASSET_USDCX, PRICE_SCALE);
        let price_usad: u64 = Mapping::get_or_use(asset_price, ASSET_USAD, PRICE_SCALE);
        let ltv_aleo: u64 = Mapping::get_or_use(asset_ltv, ASSET_ALEO, 7_500u64);
        let ltv_usdcx: u64 = Mapping::get_or_use(asset_ltv, ASSET_USDCX, 8_500u64);
        let ltv_usad: u64 = Mapping::get_or_use(asset_ltv, ASSET_USAD, 8_500u64);

        let pos_aleo: field = compute_position_key(user_key, ASSET_ALEO);
        let pos_usdcx: field = compute_position_key(user_key, ASSET_USDCX);
        let pos_usad: field = compute_position_key(user_key, ASSET_USAD);

        let scaled_sup_aleo: u64 = Mapping::get_or_use(user_scaled_supply, pos_aleo, 0u64);
        let scaled_sup_usdcx: u64 = Mapping::get_or_use(user_scaled_supply, pos_usdcx, 0u64);
        let scaled_sup_usad: u64 = Mapping::get_or_use(user_scaled_supply, pos_usad, 0u64);
        let scaled_bor_aleo: u64 = Mapping::get_or_use(user_scaled_borrow, pos_aleo, 0u64);
        let scaled_bor_usdcx: u64 = Mapping::get_or_use(user_scaled_borrow, pos_usdcx, 0u64);
        let scaled_bor_usad: u64 = Mapping::get_or_use(user_scaled_borrow, pos_usad, 0u64);

        let real_sup_aleo_before: u64 = (((scaled_sup_aleo as u128) * (sup_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usdcx_before: u64 = (((scaled_sup_usdcx as u128) * (sup_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usad_before: u64 = (((scaled_sup_usad as u128) * (sup_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let sup_aleo_usd_before: u64 = (((real_sup_aleo_before as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let sup_usdcx_usd_before: u64 = (((real_sup_usdcx_before as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let sup_usad_usd_before: u64 = (((real_sup_usad_before as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let total_supply_usd_before_u128: u128 = (sup_aleo_usd_before as u128) + (sup_usdcx_usd_before as u128) + (sup_usad_usd_before as u128);

        let price_out: u64 = Mapping::get_or_use(asset_price, asset_id, PRICE_SCALE);
        let withdraw_usd: u64 = (((amount as u128) * (price_out as u128) / (PRICE_SCALE as u128)) as u64);
        assert(withdraw_usd > 0u64);
        assert((withdraw_usd as u128) <= total_supply_usd_before_u128);

        // Reallocate collateral burn across assets in deterministic order (ALEO -> USDCx -> USAD),
        // so users can withdraw any output asset against total portfolio collateral.
        let target_aleo_usd: u64 = withdraw_usd > sup_aleo_usd_before ? sup_aleo_usd_before : withdraw_usd;
        let burn_aleo_amt_raw: u64 = (((target_aleo_usd as u128) * (PRICE_SCALE as u128) / (price_aleo as u128)) as u64);
        let burn_aleo_amt: u64 = burn_aleo_amt_raw > real_sup_aleo_before ? real_sup_aleo_before : burn_aleo_amt_raw;
        let burn_aleo_usd: u64 = (((burn_aleo_amt as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let rem_after_aleo: u64 = withdraw_usd > burn_aleo_usd ? withdraw_usd - burn_aleo_usd : 0u64;

        let target_usdcx_usd: u64 = rem_after_aleo > sup_usdcx_usd_before ? sup_usdcx_usd_before : rem_after_aleo;
        let burn_usdcx_amt_raw: u64 = (((target_usdcx_usd as u128) * (PRICE_SCALE as u128) / (price_usdcx as u128)) as u64);
        let burn_usdcx_amt: u64 = burn_usdcx_amt_raw > real_sup_usdcx_before ? real_sup_usdcx_before : burn_usdcx_amt_raw;
        let burn_usdcx_usd: u64 = (((burn_usdcx_amt as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let rem_after_usdcx: u64 = rem_after_aleo > burn_usdcx_usd ? rem_after_aleo - burn_usdcx_usd : 0u64;

        let target_usad_usd: u64 = rem_after_usdcx > sup_usad_usd_before ? sup_usad_usd_before : rem_after_usdcx;
        let burn_usad_amt_raw: u64 = (((target_usad_usd as u128) * (PRICE_SCALE as u128) / (price_usad as u128)) as u64);
        let burn_usad_amt: u64 = burn_usad_amt_raw > real_sup_usad_before ? real_sup_usad_before : burn_usad_amt_raw;
        let burn_usad_usd: u64 = (((burn_usad_amt as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let rem_after_usad: u64 = rem_after_usdcx > burn_usad_usd ? rem_after_usdcx - burn_usad_usd : 0u64;
        // Tiny rounding dust tolerance in USD-micro units.
        assert(rem_after_usad <= 3u64);

        let real_sup_aleo_after: u64 = real_sup_aleo_before > burn_aleo_amt ? real_sup_aleo_before - burn_aleo_amt : 0u64;
        let real_sup_usdcx_after: u64 = real_sup_usdcx_before > burn_usdcx_amt ? real_sup_usdcx_before - burn_usdcx_amt : 0u64;
        let real_sup_usad_after: u64 = real_sup_usad_before > burn_usad_amt ? real_sup_usad_before - burn_usad_amt : 0u64;

        let weighted_aleo_after: u64 = weighted_collateral_usd(real_sup_aleo_after, price_aleo, ltv_aleo);
        let weighted_usdcx_after: u64 = weighted_collateral_usd(real_sup_usdcx_after, price_usdcx, ltv_usdcx);
        let weighted_usad_after: u64 = weighted_collateral_usd(real_sup_usad_after, price_usad, ltv_usad);
        let total_collateral_after: u64 = weighted_aleo_after + weighted_usdcx_after + weighted_usad_after;

        let real_bor_aleo: u64 = (((scaled_bor_aleo as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usdcx: u64 = (((scaled_bor_usdcx as u128) * (bor_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usad: u64 = (((scaled_bor_usad as u128) * (bor_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let debt_aleo_usd: u64 = (((real_bor_aleo as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usdcx_usd: u64 = (((real_bor_usdcx as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usad_usd: u64 = (((real_bor_usad as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let total_debt_u128: u128 = (debt_aleo_usd as u128) + (debt_usdcx_usd as u128) + (debt_usad_usd as u128);
        let total_collateral_after_u128: u128 =
            (weighted_aleo_after as u128) + (weighted_usdcx_after as u128) + (weighted_usad_after as u128);
        assert(total_debt_u128 == 0u128 || total_debt_u128 <= total_collateral_after_u128);

        // Update user scaled supplies after cross-asset burn.
        let scaled_out_aleo: u64 = (((burn_aleo_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_aleo as u128)) as u64);
        let scaled_out_usdcx: u64 = (((burn_usdcx_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_usdcx as u128)) as u64);
        let scaled_out_usad: u64 = (((burn_usad_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_usad as u128)) as u64);
        let new_scaled_aleo: u64 = scaled_sup_aleo > scaled_out_aleo ? scaled_sup_aleo - scaled_out_aleo : 0u64;
        let new_scaled_usdcx: u64 = scaled_sup_usdcx > scaled_out_usdcx ? scaled_sup_usdcx - scaled_out_usdcx : 0u64;
        let new_scaled_usad: u64 = scaled_sup_usad > scaled_out_usad ? scaled_sup_usad - scaled_out_usad : 0u64;
        Mapping::set(user_scaled_supply, pos_aleo, new_scaled_aleo);
        Mapping::set(user_scaled_supply, pos_usdcx, new_scaled_usdcx);
        Mapping::set(user_scaled_supply, pos_usad, new_scaled_usad);

        // Update pooled collateral accounting on each burned asset.
        let deposited_aleo: u64 = Mapping::get_or_use(total_deposited, ASSET_ALEO, 0u64);
        let deposited_usdcx: u64 = Mapping::get_or_use(total_deposited, ASSET_USDCX, 0u64);
        let deposited_usad: u64 = Mapping::get_or_use(total_deposited, ASSET_USAD, 0u64);
        let new_deposited_aleo: u64 = deposited_aleo > burn_aleo_amt ? deposited_aleo - burn_aleo_amt : 0u64;
        let new_deposited_usdcx: u64 = deposited_usdcx > burn_usdcx_amt ? deposited_usdcx - burn_usdcx_amt : 0u64;
        let new_deposited_usad: u64 = deposited_usad > burn_usad_amt ? deposited_usad - burn_usad_amt : 0u64;
        Mapping::set(total_deposited, ASSET_ALEO, new_deposited_aleo);
        Mapping::set(total_deposited, ASSET_USDCX, new_deposited_usdcx);
        Mapping::set(total_deposited, ASSET_USAD, new_deposited_usad);

        // Outgoing asset availability is tracked on requested asset for backend settlement.
        let prev_avail_out: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
        let new_avail_out: u64 = prev_avail_out > amount ? prev_avail_out - amount : 0u64;
        Mapping::set(available_liquidity, asset_id, new_avail_out);
    }

    async function finalize_accrue(asset_id: field) {
        let current_block: u64 = (block.height as u64);
        let last_block: u64 = Mapping::get_or_use(last_accrual_block, asset_id, 0u64);
        let sup_idx: u64 = Mapping::get_or_use(supply_index, asset_id, INDEX_SCALE);
        let bor_idx: u64 = Mapping::get_or_use(borrow_index, asset_id, INDEX_SCALE);
        let deposited: u64 = Mapping::get_or_use(total_deposited, asset_id, 0u64);
        let borrowed: u64 = Mapping::get_or_use(total_borrowed, asset_id, 0u64);
        let fees: u64 = Mapping::get_or_use(protocol_fees, asset_id, 0u64);
        let base_rate: u64 = Mapping::get_or_use(asset_base_rate, asset_id, 200u64);
        let slope_rate: u64 = Mapping::get_or_use(asset_slope_rate, asset_id, 400u64);
        let reserve_factor: u64 = Mapping::get_or_use(asset_reserve_factor, asset_id, 1000u64);
        let raw_delta: u64 = current_block > last_block ? current_block - last_block : 0u64;
        let delta: u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
        let do_accrue: bool = delta > 0u64 && deposited > 0u64;
        let safe_deposited: u64 = deposited == 0u64 ? 1u64 : deposited;
        let raw_util: u64 = (borrowed * SCALE) / safe_deposited;
        let util: u64 = deposited == 0u64 ? 0u64 : raw_util;
        let borrow_rate: u64 = (base_rate + (slope_rate * util) / SCALE) * INDEX_SCALE / (BLOCKS_PER_YEAR * SCALE);
        let supply_rate: u64 = (borrow_rate * util * (SCALE - reserve_factor)) / (SCALE * SCALE);
        let new_sup_idx: u64 = do_accrue ? sup_idx + (sup_idx * supply_rate * delta) / INDEX_SCALE : sup_idx;
        let new_bor_idx: u64 = do_accrue ? bor_idx + (bor_idx * borrow_rate * delta) / INDEX_SCALE : bor_idx;
        let fee_rate: u64 = (borrowed * borrow_rate) / INDEX_SCALE;
        let fee_delta: u64 = do_accrue ? (fee_rate * delta * reserve_factor) / SCALE : 0u64;
        let new_s_apy: u64 = (supply_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
        let new_b_apy: u64 = (borrow_rate * BLOCKS_PER_YEAR * SCALE) / INDEX_SCALE;
        let new_block: u64 = delta > 0u64 ? last_block + delta : last_block;
        Mapping::set(supply_index, asset_id, new_sup_idx);
        Mapping::set(borrow_index, asset_id, new_bor_idx);
        Mapping::set(last_accrual_block, asset_id, new_block);
        assert((fees as u128) + (fee_delta as u128) <= (18446744073709551615u128));
        Mapping::set(protocol_fees, asset_id, fees + fee_delta);
        Mapping::set(supply_apy, asset_id, new_s_apy);
        Mapping::set(borrow_apy, asset_id, new_b_apy);
    }

    async function finalize_set_price(asset_id: field, price: u64) {
        Mapping::set(asset_price, asset_id, price);
    }

    async function finalize_set_params(
        asset_id: field,
        ltv: u64,
        liq_threshold: u64,
        liq_bonus: u64,
        base_rate: u64,
        slope_rate: u64,
        reserve_factor: u64
    ) {
        Mapping::set(asset_ltv, asset_id, ltv);
        Mapping::set(asset_liq_threshold, asset_id, liq_threshold);
        Mapping::set(asset_liq_bonus, asset_id, liq_bonus);
        Mapping::set(asset_base_rate, asset_id, base_rate);
        Mapping::set(asset_slope_rate, asset_id, slope_rate);
        Mapping::set(asset_reserve_factor, asset_id, reserve_factor);
    }

    async function finalize_withdraw_fees(asset_id: field, amount: u64) {
        let fees: u64 = Mapping::get_or_use(protocol_fees, asset_id, 0u64);
    assert(amount <= fees);
        Mapping::set(protocol_fees, asset_id, fees - amount);
    }
}