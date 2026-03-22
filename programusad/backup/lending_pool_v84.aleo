// Core single-asset lending pool program - Version 8
// This program implements a complete lending pool with:
//  - Deposit: User deposits amount (tracks state only, no token transfers)
//  - Withdraw: User withdraws amount (tracks state only, no token transfers)
//  - Borrow: User borrows amount (tracks state only, no token transfers)
//  - Repay: User repays amount (tracks state only, no token transfers)
//  - State tracking via public mappings and private records
//  - Privacy preservation via hashed address keys

import credits.aleo;

program lending_pool_v84.aleo {
    // ---- Constants ----
    const SCALE: u64 = 1_000_000u64;
    const GLOBAL_KEY: u8 = 0u8;
    // Vault address that will hold deposited ALEO credits.
    // All deposits send credits from the user to this address.
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

    // ---- Private User Mappings (with hashed keys for privacy) ----
    mapping user_total_deposits: field => u64;
    mapping user_total_withdrawals: field => u64;
    mapping user_total_borrows: field => u64;
    mapping user_total_repayments: field => u64;

    // ---- Constructor (Upgradable via Admin) ----
    // Only the specified admin address can upgrade this program.
    @admin(address = "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px")
    async constructor() {}

    // ==================== TRANSITIONS ====================

  

    // 1b) DEPOSIT with private ALEO credits -> vault public balance (transfer_private_to_public)
    async transition deposit_with_credits(
        pay_record: credits.aleo/credits,
        public amount: u64
    ) -> (UserActivity, credits.aleo/credits, Future) {
        assert(amount > 0u64);

        let caller: address = self.caller;
        assert(caller == pay_record.owner);

        let user_hash: field = BHP256::hash_to_field(caller);

        // Amount from frontend is in whole credits; credits.aleo uses microcredits.
        let micro_factor: u64 = 1_000_000u64;
        let amount_micro: u64 = amount * micro_factor;

        // Convert user's private credits to the vault's public balance (credits.aleo/account).
        // Returns (change record, Future); vault gets amount_micro in public balance.
        let (change_to_user, f_transfer): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, amount_micro);

        let updated: UserActivity = UserActivity {
            owner: caller,
            total_deposits: amount,
            total_withdrawals: 0u64,
            total_borrows: 0u64,
            total_repayments: 0u64,
        };

        // Consume credits.aleo Future by awaiting it in our async function, then update pool state.
        let f: Future = finalize_deposit_after_transfer(f_transfer, amount, user_hash);
        return (updated, change_to_user, f);
    }

    // 2) BORROW: User borrows amount (state tracking only)
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

    

    // 3b) REPAY with private ALEO credits -> vault public balance (transfer_private_to_public)
    async transition repay_with_credits(
        pay_record: credits.aleo/credits,
        public amount: u64
    ) -> (UserActivity, credits.aleo/credits, Future) {
        assert(amount > 0u64);

        let caller: address = self.caller;
        assert(caller == pay_record.owner);

        let user_hash: field = BHP256::hash_to_field(caller);

        let micro_factor: u64 = 1_000_000u64;
        let amount_micro: u64 = amount * micro_factor;

        let (change_to_user, f_transfer): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, amount_micro);

        let updated: UserActivity = UserActivity {
            owner: caller,
            total_deposits: 0u64,
            total_withdrawals: 0u64,
            total_borrows: 0u64,
            total_repayments: amount,
        };

        let f: Future = finalize_repay_after_transfer(f_transfer, amount, user_hash);
        return (updated, change_to_user, f);
    }

    // 4) WITHDRAW: User withdraws amount (state tracking only)
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

    // 5) Accrue interest
    async transition accrue_interest(public delta_index: u64) -> Future {
        let f: Future = finalize_accrue_interest(delta_index);
        return f;
    }

    // 6) Helper: Get address hash
    transition get_address_hash() -> field {
        let caller: address = self.caller;
        let user_hash: field = BHP256::hash_to_field(caller);
        return user_hash;
    }

    // 7) Helper: Get user activity (returns placeholder, actual values in mappings)
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

   
    // Used by deposit_with_credits: await credits.aleo transfer future, then run deposit state updates.
    async function finalize_deposit_after_transfer(f_transfer: Future, amount: u64, user_hash: field) {
        f_transfer.await();
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

   

    async function finalize_repay_after_transfer(f_transfer: Future, amount: u64, user_hash: field) {
        f_transfer.await();
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
        // This function reads from mappings but cannot return values
        // The actual values are stored in mappings and can be read via RPC
        let total_deposits: u64 = Mapping::get_or_use(user_total_deposits, user_hash, 0u64);
        let total_withdrawals: u64 = Mapping::get_or_use(user_total_withdrawals, user_hash, 0u64);
        let total_borrows: u64 = Mapping::get_or_use(user_total_borrows, user_hash, 0u64);
        let total_repayments: u64 = Mapping::get_or_use(user_total_repayments, user_hash, 0u64);
        // Values are in mappings, cannot return from finalize function
    }
}
