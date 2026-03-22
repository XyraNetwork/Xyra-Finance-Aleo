// USDC lending pool - uses test_usdcx_stablecoin.aleo (USDCx) for deposit & repay only.
//  - Deposit: Real USDCx — user sends token to pool vault; state updated after transfer.
//  - Repay: Real USDCx — user sends token to pool vault; state updated after transfer.
//  - Withdraw: State only. Caller’s withdrawal recorded; backend sends USDCx from vault to user.
//  - Borrow: State only. Caller’s borrow recorded; backend sends USDCx from vault to user.

import test_usdcx_stablecoin.aleo;

program lending_pool_usdce_v85.aleo {
    // ---- Constants ----
    const SCALE: u64 = 1_000_000u64;
    const GLOBAL_KEY: u8 = 0u8;
    // Vault address that holds pool USDCx. Deposits/repays send here; withdraw/borrow spend from here.
    const POOL_VAULT_ADDRESS: address = aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr;

    // ---- Public Aggregates (Pool State) ----
    mapping total_supplied: u8 => u64;
    mapping total_borrowed: u8 => u64;
    mapping interest_index: u8 => u64;
    mapping utilization_index: u8 => u64;

    // ---- Private User Records ----
    record UserActivity {
        owner: address,
        total_deposits: u64,
        total_withdrawals: u64,
        total_borrows: u64,
        total_repayments: u64,
    }

    // ---- Private User Mappings (hashed keys for privacy) ----
    mapping user_total_deposits: field => u64;
    mapping user_total_withdrawals: field => u64;
    mapping user_total_borrows: field => u64;
    mapping user_total_repayments: field => u64;

    // ---- Constructor ----
    @admin(address = "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px")
    async constructor() {}

    // ==================== TRANSITIONS (USDCx) ====================

    // 1) DEPOSIT: User sends USDCx to pool. transfer_private(recipient, amount, token, proofs) per NullPay.
    async transition deposit(
        token: test_usdcx_stablecoin.aleo/Token,
        public amount: u64,
        proofs: [MerkleProof; 2]
    ) -> (UserActivity, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, Future) {
        let caller: address = self.caller;
        assert(amount > 0u64);
        assert(caller == token.owner);

        let amount_scaled: u64 = amount * SCALE;
        let amount_u128: u128 = (amount_scaled as u128);
        assert(token.amount >= amount_u128);

        let user_hash: field = BHP256::hash_to_field(caller);

        let (compliance_out, to_user, to_pool, token_future): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_private(POOL_VAULT_ADDRESS, amount_u128, token, proofs);

        let updated: UserActivity = UserActivity {
            owner: caller,
            total_deposits: amount,
            total_withdrawals: 0u64,
            total_borrows: 0u64,
            total_repayments: 0u64,
        };

        let f: Future = finalize_deposit(amount, user_hash, token_future);
        return (updated, to_pool, to_user, f);
    }

    // 2) REPAY: User sends USDCx to pool. Same transfer_private pattern as deposit.
    async transition repay(
        token: test_usdcx_stablecoin.aleo/Token,
        public amount: u64,
        proofs: [MerkleProof; 2]
    ) -> (UserActivity, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, Future) {
        let caller: address = self.caller;
        assert(amount > 0u64);
        assert(caller == token.owner);
        let amount_scaled: u64 = amount * SCALE;
        let amount_u128: u128 = (amount_scaled as u128);
        assert(token.amount >= amount_u128);

        let user_hash: field = BHP256::hash_to_field(caller);

        let (compliance_out, to_user, to_pool, token_future): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_private(POOL_VAULT_ADDRESS, amount_u128, token, proofs);

        let updated: UserActivity = UserActivity {
            owner: caller,
            total_deposits: 0u64,
            total_withdrawals: 0u64,
            total_borrows: 0u64,
            total_repayments: amount,
        };

        let f: Future = finalize_repay(amount, user_hash, token_future);
        return (updated, to_pool, to_user, f);
    }

    // 3) WITHDRAW: State only. Caller is the user withdrawing; backend sends USDCx from vault to user.
    async transition withdraw(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_hash: field = BHP256::hash_to_field(caller);

        let updated: UserActivity = UserActivity {
            owner: caller,
            total_deposits: 0u64,
            total_withdrawals: amount,
            total_borrows: 0u64,
            total_repayments: 0u64,
        };

        let f: Future = finalize_withdraw(amount, user_hash);
        return (updated, f);
    }

    // 4) BORROW: State only. Caller is the borrower; backend sends USDCx from vault to user.
    async transition borrow(public amount: u64) -> (UserActivity, Future) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        let user_hash: field = BHP256::hash_to_field(caller);

        let updated: UserActivity = UserActivity {
            owner: caller,
            total_deposits: 0u64,
            total_withdrawals: 0u64,
            total_borrows: amount,
            total_repayments: 0u64,
        };

        let f: Future = finalize_borrow(amount, user_hash);
        return (updated, f);
    }

    // 5) Accrue interest
    async transition accrue_interest(public delta_index: u64) -> Future {
        let f: Future = finalize_accrue_interest(delta_index);
        return f;
    }

    transition get_address_hash() -> field {
        let caller: address = self.caller;
        let user_hash: field = BHP256::hash_to_field(caller);
        return user_hash;
    }

    async transition get_user_activity() -> (UserActivity, Future) {
        let caller: address = self.caller;
        let user_hash: field = BHP256::hash_to_field(caller);

        let placeholder: UserActivity = UserActivity {
            owner: caller,
            total_deposits: 0u64,
            total_withdrawals: 0u64,
            total_borrows: 0u64,
            total_repayments: 0u64,
        };

        let f: Future = finalize_get_user_activity(user_hash);
        return (placeholder, f);
    }

    // ==================== FINALIZE FUNCTIONS ====================

    async function finalize_deposit(amount: u64, user_hash: field, token_future: Future) {
        token_future.await();
        let current_deposits: u64 = Mapping::get_or_use(user_total_deposits, user_hash, 0u64);
        let new_total_deposits: u64 = current_deposits + amount;
        Mapping::set(user_total_deposits, user_hash, new_total_deposits);

        if total_supplied.contains(GLOBAL_KEY) && total_borrowed.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);
            let prev_borrowed: u64 = total_borrowed.get(GLOBAL_KEY);
            let new_supplied: u64 = prev_supplied + amount;
            total_supplied.set(GLOBAL_KEY, new_supplied);

            if new_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (prev_borrowed * SCALE) / new_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else if total_supplied.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);
            let new_supplied: u64 = prev_supplied + amount;
            total_supplied.set(GLOBAL_KEY, new_supplied);

            if new_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (0u64 * SCALE) / new_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else if total_borrowed.contains(GLOBAL_KEY) {
            let prev_borrowed: u64 = total_borrowed.get(GLOBAL_KEY);
            let new_supplied: u64 = 0u64 + amount;
            total_supplied.set(GLOBAL_KEY, new_supplied);

            if new_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (prev_borrowed * SCALE) / new_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else {
            total_supplied.set(GLOBAL_KEY, amount);
            utilization_index.set(GLOBAL_KEY, 0u64);
        }
    }

    async function finalize_repay(amount: u64, user_hash: field, token_future: Future) {
        token_future.await();
        let current_borrows: u64 = Mapping::get_or_use(user_total_borrows, user_hash, 0u64);
        let current_repayments: u64 = Mapping::get_or_use(user_total_repayments, user_hash, 0u64);

        let new_total_repayments_check: u64 = current_repayments + amount;
        assert(new_total_repayments_check <= current_borrows);

        let new_total_repayments: u64 = current_repayments + amount;
        Mapping::set(user_total_repayments, user_hash, new_total_repayments);

        if total_supplied.contains(GLOBAL_KEY) && total_borrowed.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);
            let prev_borrowed: u64 = total_borrowed.get(GLOBAL_KEY);

            assert(amount <= prev_borrowed);

            let new_borrowed: u64 = prev_borrowed - amount;
            total_borrowed.set(GLOBAL_KEY, new_borrowed);

            if prev_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (new_borrowed * SCALE) / prev_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else {
            assert(false);
        }
    }

    async function finalize_withdraw(amount: u64, user_hash: field) {
        let current_deposits: u64 = Mapping::get_or_use(user_total_deposits, user_hash, 0u64);
        let current_withdrawals: u64 = Mapping::get_or_use(user_total_withdrawals, user_hash, 0u64);

        let new_total_withdrawals_check: u64 = current_withdrawals + amount;
        assert(new_total_withdrawals_check <= current_deposits);

        let new_total_withdrawals: u64 = current_withdrawals + amount;
        Mapping::set(user_total_withdrawals, user_hash, new_total_withdrawals);

        if total_supplied.contains(GLOBAL_KEY) && total_borrowed.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);
            let prev_borrowed: u64 = total_borrowed.get(GLOBAL_KEY);

            assert(prev_supplied >= amount);
            assert((prev_supplied - amount) >= prev_borrowed);

            let new_supplied: u64 = prev_supplied - amount;
            total_supplied.set(GLOBAL_KEY, new_supplied);

            if new_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (prev_borrowed * SCALE) / new_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else if total_supplied.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);

            assert(prev_supplied >= amount);

            let new_supplied: u64 = prev_supplied - amount;
            total_supplied.set(GLOBAL_KEY, new_supplied);

            if new_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (0u64 * SCALE) / new_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else {
            assert(false);
        }
    }

    async function finalize_borrow(amount: u64, user_hash: field) {
        let current_borrows: u64 = Mapping::get_or_use(user_total_borrows, user_hash, 0u64);
        let new_total_borrows: u64 = current_borrows + amount;
        Mapping::set(user_total_borrows, user_hash, new_total_borrows);

        if total_supplied.contains(GLOBAL_KEY) && total_borrowed.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);
            let prev_borrowed: u64 = total_borrowed.get(GLOBAL_KEY);

            assert(prev_borrowed + amount <= prev_supplied);

            let new_borrowed: u64 = prev_borrowed + amount;
            total_borrowed.set(GLOBAL_KEY, new_borrowed);

            if prev_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (new_borrowed * SCALE) / prev_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else if total_supplied.contains(GLOBAL_KEY) {
            let prev_supplied: u64 = total_supplied.get(GLOBAL_KEY);
            let amount_to_borrow: u64 = amount;

            assert(amount_to_borrow <= prev_supplied);

            total_borrowed.set(GLOBAL_KEY, amount_to_borrow);

            if prev_supplied == 0u64 {
                utilization_index.set(GLOBAL_KEY, 0u64);
            } else {
                let util: u64 = (amount_to_borrow * SCALE) / prev_supplied;
                utilization_index.set(GLOBAL_KEY, util);
            }
        } else {
            assert(false);
        }
    }

    async function finalize_accrue_interest(delta_index: u64) {
        if interest_index.contains(GLOBAL_KEY) {
            let current: u64 = interest_index.get(GLOBAL_KEY);
            let updated: u64 = current + delta_index;
            interest_index.set(GLOBAL_KEY, updated);
        } else {
            let current: u64 = SCALE;
            let updated: u64 = current + delta_index;
            interest_index.set(GLOBAL_KEY, updated);
        }
    }

    async function finalize_get_user_activity(user_hash: field) {
        let total_deposits: u64 = Mapping::get_or_use(user_total_deposits, user_hash, 0u64);
        let total_withdrawals: u64 = Mapping::get_or_use(user_total_withdrawals, user_hash, 0u64);
        let total_borrows: u64 = Mapping::get_or_use(user_total_borrows, user_hash, 0u64);
        let total_repayments: u64 = Mapping::get_or_use(user_total_repayments, user_hash, 0u64);
    }
}
