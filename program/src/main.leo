import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

// Three u64 values in one struct (transition input limits).
struct U64Triple {
    x0: u64,
    x1: u64,
    x2: u64,
}

program xyra_lending_v32.aleo {
    // --- Math & time ---
    const INDEX_SCALE: u64       = 1_000_000_000_000u64;
    const SCALE: u64             = 10_000u64;
    const BLOCKS_PER_YEAR: u64   = 2_102_400u64;
    const MAX_ACCRUAL_DELTA: u64 = 1_000u64;
    const PRICE_SCALE: u64       = 1_000_000u64;
    // Max remainder (USD units) after ALEO → USDCx → USAD burn ladder in cross-asset withdraw.
    const WITHDRAW_XA_REMAINDER_MAX: u64 = 3u64;
    const BPS_DENOMINATOR: u64   = 10_000u64;
    const LIQ_CLOSE_FACTOR_BPS: u64 = 5_000u64;

    // --- Addresses ---
    const POOL_VAULT_ADDRESS: address =
        aleo1a2ehlgqhvs3p7d4hqhs0tvgk954dr8gafu9kxse2mzu9a5sqxvpsrn98pr;
    const ADMIN_ADDRESS: address =
        aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px;

    // --- Asset ids (ALEO / USDCx / USAD) ---
    const ASSET_ALEO: field  = 0field;
    const ASSET_USDCX: field = 1field;
    const ASSET_USAD: field  = 2field;

    // --- Aggregate pool state ---
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

    // --- Per-asset risk, oracle, and rate model ---
    mapping asset_base_rate:      field => u64;
    mapping asset_slope_rate:     field => u64;
    mapping asset_reserve_factor: field => u64;
    mapping asset_ltv:            field => u64;
    mapping asset_liq_threshold:  field => u64;
    mapping asset_liq_bonus:      field => u64;
    mapping asset_price:          field => u64;

    // --- Flash loan (config + per-user session) ---
    mapping flash_enabled:          field => bool;
    mapping flash_premium_bps:      field => u64;
    mapping flash_max_amount:       field => u64;
    mapping flash_strategy_allowed: field => bool;
    mapping flash_active:           field => bool;
    mapping flash_asset:            field => field;
    mapping flash_principal:        field => u64;
    mapping flash_min_profit:       field => u64;
    mapping flash_strategy_id:      field => field;

    // --- User position (private record; pool indices live in mappings above) ---
    record LendingPosition {
        owner: address,
        scaled_sup_native: u64,
        scaled_sup_usdcx: u64,
        scaled_sup_usad: u64,
        scaled_bor_native: u64,
        scaled_bor_usdcx: u64,
        scaled_bor_usad: u64,
    }

    @admin(address = "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px")
    constructor() {}

    // ========== Lifecycle ==========

    fn initialize() -> Final {
        assert(self.caller == ADMIN_ADDRESS);
        return final { finalize_initialize(); };
    }

    fn open_lending_account() -> (LendingPosition, Final) {
        let caller: address = self.caller;
        let position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: 0u64,
            scaled_sup_usdcx: 0u64,
            scaled_sup_usad: 0u64,
            scaled_bor_native: 0u64,
            scaled_bor_usdcx: 0u64,
            scaled_bor_usad: 0u64,
        };
        return (position, final { });
    }

    // ========== Deposits ==========

    fn deposit_with_credits(
        position: LendingPosition,
        pay_record: credits.aleo::credits,
        private amount: u64,
        public sup_idx: u64,
    ) -> (LendingPosition, credits.aleo::credits, Final) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        let scaled_in: u64 = (((amount as u128) * (INDEX_SCALE as u128) / (sup_idx as u128)) as u64);
        assert((position.scaled_sup_native as u128) + (scaled_in as u128) <= 18446744073709551615u128);
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native + scaled_in,
            scaled_sup_usdcx: position.scaled_sup_usdcx,
            scaled_sup_usad: position.scaled_sup_usad,
            scaled_bor_native: position.scaled_bor_native,
            scaled_bor_usdcx: position.scaled_bor_usdcx,
            scaled_bor_usad: position.scaled_bor_usad,
        };
        let (change, f_transfer): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, amount);
        return (new_position, change, final { finalize_deposit_pos(f_transfer, ASSET_ALEO, amount, sup_idx); });
    }

    fn deposit_usdcx(
        position: LendingPosition,
        pay_record: test_usdcx_stablecoin.aleo::Token,
        private amount: u64,
        private proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
        public sup_idx: u64,
    ) -> (LendingPosition, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        let scaled_in: u64 = (((amount as u128) * (INDEX_SCALE as u128) / (sup_idx as u128)) as u64);
        assert((position.scaled_sup_usdcx as u128) + (scaled_in as u128) <= 18446744073709551615u128);
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native,
            scaled_sup_usdcx: position.scaled_sup_usdcx + scaled_in,
            scaled_sup_usad: position.scaled_sup_usad,
            scaled_bor_native: position.scaled_bor_native,
            scaled_bor_usdcx: position.scaled_bor_usdcx,
            scaled_bor_usad: position.scaled_bor_usad,
        };
        let amount_u128: u128 = amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        return (new_position, compliance_record, change_token, final { finalize_deposit_pos(f_transfer, ASSET_USDCX, amount, sup_idx); });
    }

    fn deposit_usad(
        position: LendingPosition,
        pay_record: test_usad_stablecoin.aleo::Token,
        private amount: u64,
        private proofs: [test_usad_stablecoin.aleo::MerkleProof; 2],
        public sup_idx: u64,
    ) -> (LendingPosition, test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        let scaled_in: u64 = (((amount as u128) * (INDEX_SCALE as u128) / (sup_idx as u128)) as u64);
        assert((position.scaled_sup_usad as u128) + (scaled_in as u128) <= 18446744073709551615u128);
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native,
            scaled_sup_usdcx: position.scaled_sup_usdcx,
            scaled_sup_usad: position.scaled_sup_usad + scaled_in,
            scaled_bor_native: position.scaled_bor_native,
            scaled_bor_usdcx: position.scaled_bor_usdcx,
            scaled_bor_usad: position.scaled_bor_usad,
        };
        let amount_u128: u128 = amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        return (new_position, compliance_record, change_token, final { finalize_deposit_pos(f_transfer, ASSET_USAD, amount, sup_idx); });
    }

    // ========== Withdraw (cross-asset) ==========
    // Burns collateral in order ALEO → USDCx → USAD to cover withdraw_usd; pays out `out_asset`. Witnesses checked in finalize_withdraw_pos.
    fn withdraw(
        position: LendingPosition,
        private amount: u64,
        private out_asset: field,
        private sup_idx_aleo: u64,
        private sup_idx_usdcx: u64,
        private sup_idx_usad: u64,
        private bor_idx_aleo: u64,
        private bor_idx_usdcx: u64,
        private bor_idx_usad: u64,
        private price_aleo: u64,
        private price_usdcx: u64,
        private price_usad: u64,
        private ltv_aleo: u64,
        private ltv_usdcx: u64,
        private ltv_usad: u64,
    ) -> (LendingPosition, Final) {
        assert(amount > 0u64);
        assert(out_asset == ASSET_ALEO || out_asset == ASSET_USDCX || out_asset == ASSET_USAD);
        assert(price_aleo > 0u64);
        assert(price_usdcx > 0u64);
        assert(price_usad > 0u64);
        let caller: address = self.caller;
        assert(position.owner == caller);
        let scaled_sup_native: u64 = position.scaled_sup_native;
        let scaled_sup_usdcx: u64 = position.scaled_sup_usdcx;
        let scaled_sup_usad: u64 = position.scaled_sup_usad;
        let scaled_bor_native: u64 = position.scaled_bor_native;
        let scaled_bor_usdcx: u64 = position.scaled_bor_usdcx;
        let scaled_bor_usad: u64 = position.scaled_bor_usad;
        let real_sup_aleo_before: u64 = (((scaled_sup_native as u128) * (sup_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usdcx_before: u64 = (((scaled_sup_usdcx as u128) * (sup_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usad_before: u64 = (((scaled_sup_usad as u128) * (sup_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let sup_aleo_usd_before: u64 = (((real_sup_aleo_before as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let sup_usdcx_usd_before: u64 = (((real_sup_usdcx_before as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let sup_usad_usd_before: u64 = (((real_sup_usad_before as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let total_supply_usd_before_u128: u128 = (sup_aleo_usd_before as u128) + (sup_usdcx_usd_before as u128) + (sup_usad_usd_before as u128);
        let price_out: u64 = out_asset == ASSET_ALEO ? price_aleo : (out_asset == ASSET_USDCX ? price_usdcx : price_usad);
        let withdraw_usd: u64 = (((amount as u128) * (price_out as u128) / (PRICE_SCALE as u128)) as u64);
        assert(withdraw_usd > 0u64);
        assert((withdraw_usd as u128) <= total_supply_usd_before_u128);
        let target_aleo_usd: u64 = withdraw_usd > sup_aleo_usd_before ? sup_aleo_usd_before : withdraw_usd;
        assert(target_aleo_usd == 0u64 || price_aleo > 0u64);
        let burn_aleo_amt_raw: u64 = target_aleo_usd == 0u64 ? 0u64 : (((target_aleo_usd as u128) * (PRICE_SCALE as u128) / (price_aleo as u128)) as u64);
        let burn_aleo_pre: u64 = burn_aleo_amt_raw > real_sup_aleo_before ? real_sup_aleo_before : burn_aleo_amt_raw;
        let scaled_probe_aleo: u64 = (((burn_aleo_pre as u128) * (INDEX_SCALE as u128) / (sup_idx_aleo as u128)) as u64);
        let ceil_idx_over_scale_aleo: u64 = (((sup_idx_aleo as u128) + (INDEX_SCALE as u128) - 1u128) / (INDEX_SCALE as u128)) as u64;
        let bumped_aleo: u64 = burn_aleo_pre > ceil_idx_over_scale_aleo ? burn_aleo_pre : ceil_idx_over_scale_aleo;
        let burn_aleo_amt: u64 =
            burn_aleo_pre == 0u64 ? 0u64
            : (scaled_probe_aleo > 0u64 ? burn_aleo_pre : (bumped_aleo > real_sup_aleo_before ? real_sup_aleo_before : bumped_aleo));
        let burn_aleo_usd: u64 = (((burn_aleo_amt as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let rem_after_aleo: u64 = withdraw_usd > burn_aleo_usd ? withdraw_usd - burn_aleo_usd : 0u64;
        let target_usdcx_usd: u64 = rem_after_aleo > sup_usdcx_usd_before ? sup_usdcx_usd_before : rem_after_aleo;
        assert(target_usdcx_usd == 0u64 || price_usdcx > 0u64);
        let burn_usdcx_amt_raw: u64 = target_usdcx_usd == 0u64 ? 0u64 : (((target_usdcx_usd as u128) * (PRICE_SCALE as u128) / (price_usdcx as u128)) as u64);
        let burn_usdcx_pre: u64 = burn_usdcx_amt_raw > real_sup_usdcx_before ? real_sup_usdcx_before : burn_usdcx_amt_raw;
        let scaled_probe_usdcx: u64 = (((burn_usdcx_pre as u128) * (INDEX_SCALE as u128) / (sup_idx_usdcx as u128)) as u64);
        let ceil_idx_over_scale_usdcx: u64 = (((sup_idx_usdcx as u128) + (INDEX_SCALE as u128) - 1u128) / (INDEX_SCALE as u128)) as u64;
        let bumped_usdcx: u64 = burn_usdcx_pre > ceil_idx_over_scale_usdcx ? burn_usdcx_pre : ceil_idx_over_scale_usdcx;
        let burn_usdcx_amt: u64 =
            burn_usdcx_pre == 0u64 ? 0u64
            : (scaled_probe_usdcx > 0u64 ? burn_usdcx_pre : (bumped_usdcx > real_sup_usdcx_before ? real_sup_usdcx_before : bumped_usdcx));
        let burn_usdcx_usd: u64 = (((burn_usdcx_amt as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let rem_after_usdcx: u64 = rem_after_aleo > burn_usdcx_usd ? rem_after_aleo - burn_usdcx_usd : 0u64;
        let target_usad_usd: u64 = rem_after_usdcx > sup_usad_usd_before ? sup_usad_usd_before : rem_after_usdcx;
        assert(target_usad_usd == 0u64 || price_usad > 0u64);
        let burn_usad_amt_raw: u64 = target_usad_usd == 0u64 ? 0u64 : (((target_usad_usd as u128) * (PRICE_SCALE as u128) / (price_usad as u128)) as u64);
        let burn_usad_pre: u64 = burn_usad_amt_raw > real_sup_usad_before ? real_sup_usad_before : burn_usad_amt_raw;
        let scaled_probe_usad: u64 = (((burn_usad_pre as u128) * (INDEX_SCALE as u128) / (sup_idx_usad as u128)) as u64);
        let ceil_idx_over_scale_usad: u64 = (((sup_idx_usad as u128) + (INDEX_SCALE as u128) - 1u128) / (INDEX_SCALE as u128)) as u64;
        let bumped_usad: u64 = burn_usad_pre > ceil_idx_over_scale_usad ? burn_usad_pre : ceil_idx_over_scale_usad;
        let burn_usad_amt: u64 =
            burn_usad_pre == 0u64 ? 0u64
            : (scaled_probe_usad > 0u64 ? burn_usad_pre : (bumped_usad > real_sup_usad_before ? real_sup_usad_before : bumped_usad));
        let burn_usad_usd: u64 = (((burn_usad_amt as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let rem_after_usad: u64 = rem_after_usdcx > burn_usad_usd ? rem_after_usdcx - burn_usad_usd : 0u64;
        let real_sup_aleo_after: u64 = real_sup_aleo_before > burn_aleo_amt ? real_sup_aleo_before - burn_aleo_amt : 0u64;
        let real_sup_usdcx_after: u64 = real_sup_usdcx_before > burn_usdcx_amt ? real_sup_usdcx_before - burn_usdcx_amt : 0u64;
        let real_sup_usad_after: u64 = real_sup_usad_before > burn_usad_amt ? real_sup_usad_before - burn_usad_amt : 0u64;
        let rp_wa_aleo: u128 = (real_sup_aleo_after as u128) * (price_aleo as u128);
        let l_wa_aleo: u128 = (ltv_aleo as u128);
        let den_wa_aleo: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_wa_aleo: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_wa_aleo: u128 = l_wa_aleo == 0u128 ? 1u128 : l_wa_aleo;
        let rp_times_l_ok_wa_aleo: bool = (l_wa_aleo == 0u128) || (rp_wa_aleo <= (max_u128_wa_aleo / safe_l_wa_aleo));
        let weighted_aleo_after: u64 = rp_times_l_ok_wa_aleo ? (((rp_wa_aleo * l_wa_aleo) / den_wa_aleo) as u64) : ((((rp_wa_aleo / (PRICE_SCALE as u128)) * l_wa_aleo / (SCALE as u128)) as u64));
        let rp_wa_usdcx: u128 = (real_sup_usdcx_after as u128) * (price_usdcx as u128);
        let l_wa_usdcx: u128 = (ltv_usdcx as u128);
        let den_wa_usdcx: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_wa_usdcx: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_wa_usdcx: u128 = l_wa_usdcx == 0u128 ? 1u128 : l_wa_usdcx;
        let rp_times_l_ok_wa_usdcx: bool = (l_wa_usdcx == 0u128) || (rp_wa_usdcx <= (max_u128_wa_usdcx / safe_l_wa_usdcx));
        let weighted_usdcx_after: u64 = rp_times_l_ok_wa_usdcx ? (((rp_wa_usdcx * l_wa_usdcx) / den_wa_usdcx) as u64) : ((((rp_wa_usdcx / (PRICE_SCALE as u128)) * l_wa_usdcx / (SCALE as u128)) as u64));
        let rp_wa_usad: u128 = (real_sup_usad_after as u128) * (price_usad as u128);
        let l_wa_usad: u128 = (ltv_usad as u128);
        let den_wa_usad: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_wa_usad: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_wa_usad: u128 = l_wa_usad == 0u128 ? 1u128 : l_wa_usad;
        let rp_times_l_ok_wa_usad: bool = (l_wa_usad == 0u128) || (rp_wa_usad <= (max_u128_wa_usad / safe_l_wa_usad));
        let weighted_usad_after: u64 = rp_times_l_ok_wa_usad ? (((rp_wa_usad * l_wa_usad) / den_wa_usad) as u64) : ((((rp_wa_usad / (PRICE_SCALE as u128)) * l_wa_usad / (SCALE as u128)) as u64));
        let real_bor_aleo: u64 = (((scaled_bor_native as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usdcx: u64 = (((scaled_bor_usdcx as u128) * (bor_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usad: u64 = (((scaled_bor_usad as u128) * (bor_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let debt_aleo_usd: u64 = (((real_bor_aleo as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usdcx_usd: u64 = (((real_bor_usdcx as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usad_usd: u64 = (((real_bor_usad as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let total_debt_u128: u128 = (debt_aleo_usd as u128) + (debt_usdcx_usd as u128) + (debt_usad_usd as u128);
        let total_collateral_after_u128: u128 =
            (weighted_aleo_after as u128) + (weighted_usdcx_after as u128) + (weighted_usad_after as u128);
        assert(sup_idx_aleo > 0u64 && sup_idx_usdcx > 0u64 && sup_idx_usad > 0u64);
        assert(burn_aleo_amt == 0u64 || (((burn_aleo_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_aleo as u128)) as u64) > 0u64);
        assert(burn_usdcx_amt == 0u64 || (((burn_usdcx_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_usdcx as u128)) as u64) > 0u64);
        assert(burn_usad_amt == 0u64 || (((burn_usad_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_usad as u128)) as u64) > 0u64);
        let scaled_out_aleo: u64 = (((burn_aleo_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_aleo as u128)) as u64);
        let scaled_out_usdcx: u64 = (((burn_usdcx_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_usdcx as u128)) as u64);
        let scaled_out_usad: u64 = (((burn_usad_amt as u128) * (INDEX_SCALE as u128) / (sup_idx_usad as u128)) as u64);
        let new_scaled_aleo: u64 = scaled_sup_native > scaled_out_aleo ? scaled_sup_native - scaled_out_aleo : 0u64;
        let new_scaled_usdcx: u64 = scaled_sup_usdcx > scaled_out_usdcx ? scaled_sup_usdcx - scaled_out_usdcx : 0u64;
        let new_scaled_usad: u64 = scaled_sup_usad > scaled_out_usad ? scaled_sup_usad - scaled_out_usad : 0u64;
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: new_scaled_aleo,
            scaled_sup_usdcx: new_scaled_usdcx,
            scaled_sup_usad: new_scaled_usad,
            scaled_bor_native: position.scaled_bor_native,
            scaled_bor_usdcx: position.scaled_bor_usdcx,
            scaled_bor_usad: position.scaled_bor_usad,
        };
        let burn_amts: U64Triple = U64Triple { x0: burn_aleo_amt, x1: burn_usdcx_amt, x2: burn_usad_amt };
        let sup_t: U64Triple = U64Triple { x0: sup_idx_aleo, x1: sup_idx_usdcx, x2: sup_idx_usad };
        let bor_t: U64Triple = U64Triple { x0: bor_idx_aleo, x1: bor_idx_usdcx, x2: bor_idx_usad };
        let price_t: U64Triple = U64Triple { x0: price_aleo, x1: price_usdcx, x2: price_usad };
        let ltv_t: U64Triple = U64Triple { x0: ltv_aleo, x1: ltv_usdcx, x2: ltv_usad };
        return (new_position, final {
            finalize_withdraw_pos(
                out_asset,
                amount,
                burn_amts,
                sup_t,
                bor_t,
                price_t,
                ltv_t,
                rem_after_usad,
                total_debt_u128,
                total_collateral_after_u128,
            );
        });
    }

    // ========== Borrow ==========
    // Portfolio cap: total debt USD + new borrow <= LTV-weighted collateral USD. finalize_borrow_pos checks witnesses.
    fn borrow(
        position: LendingPosition,
        private amount: u64,
        private borrow_asset: field,
        public sup_idx_aleo: u64,
        public sup_idx_usdcx: u64,
        public sup_idx_usad: u64,
        public bor_idx_aleo: u64,
        public bor_idx_usdcx: u64,
        public bor_idx_usad: u64,
        public price_aleo: u64,
        public price_usdcx: u64,
        public price_usad: u64,
        public ltv_aleo: u64,
        public ltv_usdcx: u64,
        public ltv_usad: u64,
    ) -> (LendingPosition, Final) {
        assert(amount > 0u64);
        assert(borrow_asset == ASSET_ALEO || borrow_asset == ASSET_USDCX || borrow_asset == ASSET_USAD);
        let caller: address = self.caller;
        assert(position.owner == caller);
        let scaled_sup_native: u64 = position.scaled_sup_native;
        let scaled_sup_usdcx: u64 = position.scaled_sup_usdcx;
        let scaled_sup_usad: u64 = position.scaled_sup_usad;
        let scaled_bor_native: u64 = position.scaled_bor_native;
        let scaled_bor_usdcx: u64 = position.scaled_bor_usdcx;
        let scaled_bor_usad: u64 = position.scaled_bor_usad;
        let real_sup_aleo: u64 = (((scaled_sup_native as u128) * (sup_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usdcx: u64 = (((scaled_sup_usdcx as u128) * (sup_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usad: u64 = (((scaled_sup_usad as u128) * (sup_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_aleo: u64 = (((scaled_bor_native as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usdcx: u64 = (((scaled_bor_usdcx as u128) * (bor_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usad: u64 = (((scaled_bor_usad as u128) * (bor_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let rp_waleo: u128 = (real_sup_aleo as u128) * (price_aleo as u128);
        let l_waleo: u128 = (ltv_aleo as u128);
        let den_waleo: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_waleo: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_waleo: u128 = l_waleo == 0u128 ? 1u128 : l_waleo;
        let rp_times_l_ok_waleo: bool = (l_waleo == 0u128) || (rp_waleo <= (max_u128_waleo / safe_l_waleo));
        let weighted_aleo: u64 = rp_times_l_ok_waleo ? (((rp_waleo * l_waleo) / den_waleo) as u64) : ((((rp_waleo / (PRICE_SCALE as u128)) * l_waleo / (SCALE as u128)) as u64));
        let rp_wusdcx: u128 = (real_sup_usdcx as u128) * (price_usdcx as u128);
        let l_wusdcx: u128 = (ltv_usdcx as u128);
        let den_wusdcx: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_wusdcx: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_wusdcx: u128 = l_wusdcx == 0u128 ? 1u128 : l_wusdcx;
        let rp_times_l_ok_wusdcx: bool = (l_wusdcx == 0u128) || (rp_wusdcx <= (max_u128_wusdcx / safe_l_wusdcx));
        let weighted_usdcx: u64 = rp_times_l_ok_wusdcx ? (((rp_wusdcx * l_wusdcx) / den_wusdcx) as u64) : ((((rp_wusdcx / (PRICE_SCALE as u128)) * l_wusdcx / (SCALE as u128)) as u64));
        let rp_wusad: u128 = (real_sup_usad as u128) * (price_usad as u128);
        let l_wusad: u128 = (ltv_usad as u128);
        let den_wusad: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_wusad: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_wusad: u128 = l_wusad == 0u128 ? 1u128 : l_wusad;
        let rp_times_l_ok_wusad: bool = (l_wusad == 0u128) || (rp_wusad <= (max_u128_wusad / safe_l_wusad));
        let weighted_usad: u64 = rp_times_l_ok_wusad ? (((rp_wusad * l_wusad) / den_wusad) as u64) : ((((rp_wusad / (PRICE_SCALE as u128)) * l_wusad / (SCALE as u128)) as u64));
        let debt_aleo_usd: u64 = (((real_bor_aleo as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usdcx_usd: u64 = (((real_bor_usdcx as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usad_usd: u64 = (((real_bor_usad as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let borrow_price: u64 = borrow_asset == ASSET_ALEO ? price_aleo : (borrow_asset == ASSET_USDCX ? price_usdcx : price_usad);
        let new_borrow_usd: u64 = (((amount as u128) * (borrow_price as u128) / (PRICE_SCALE as u128)) as u64);
        let total_collateral_u128: u128 = (weighted_aleo as u128) + (weighted_usdcx as u128) + (weighted_usad as u128);
        let total_debt_u128: u128 = (debt_aleo_usd as u128) + (debt_usdcx_usd as u128) + (debt_usad_usd as u128);
        assert(total_debt_u128 + (new_borrow_usd as u128) <= total_collateral_u128);
        let bor_idx: u64 = borrow_asset == ASSET_ALEO ? bor_idx_aleo : (borrow_asset == ASSET_USDCX ? bor_idx_usdcx : bor_idx_usad);
        let scaled_in: u64 = (((amount as u128) * (INDEX_SCALE as u128) / (bor_idx as u128)) as u64);
        let scaled_bor_cur: u64 = borrow_asset == ASSET_ALEO ? scaled_bor_native : (borrow_asset == ASSET_USDCX ? scaled_bor_usdcx : scaled_bor_usad);
        assert((scaled_bor_cur as u128) + (scaled_in as u128) <= 18446744073709551615u128);
        let new_scaled_bor_native: u64 = borrow_asset == ASSET_ALEO ? scaled_bor_native + scaled_in : scaled_bor_native;
        let new_scaled_bor_usdcx: u64 = borrow_asset == ASSET_USDCX ? scaled_bor_usdcx + scaled_in : scaled_bor_usdcx;
        let new_scaled_bor_usad: u64 = borrow_asset == ASSET_USAD ? scaled_bor_usad + scaled_in : scaled_bor_usad;
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native,
            scaled_sup_usdcx: position.scaled_sup_usdcx,
            scaled_sup_usad: position.scaled_sup_usad,
            scaled_bor_native: new_scaled_bor_native,
            scaled_bor_usdcx: new_scaled_bor_usdcx,
            scaled_bor_usad: new_scaled_bor_usad,
        };
        return (new_position, final {
            finalize_borrow_pos(
                borrow_asset,
                amount,
                sup_idx_aleo,
                sup_idx_usdcx,
                sup_idx_usad,
                bor_idx_aleo,
                bor_idx_usdcx,
                bor_idx_usad,
                price_aleo,
                price_usdcx,
                price_usad,
                ltv_aleo,
                ltv_usdcx,
                ltv_usad,
            );
        });
    }

    // ========== Repay (cross-asset waterfall: ALEO → USDCx → USAD debt) ==========

    fn repay_with_credits(
        position: LendingPosition,
        pay_record: credits.aleo::credits,
        private amount: u64,
        public bor_idx_aleo: u64,
        public bor_idx_usdcx: u64,
        public bor_idx_usad: u64,
        public price_aleo: u64,
        public price_usdcx: u64,
        public price_usad: u64,
    ) -> (LendingPosition, credits.aleo::credits, Final) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        let price_in: u64 = price_aleo;
        let payment_usd: u64 = (((amount as u128) * (price_in as u128) / (PRICE_SCALE as u128)) as u64);
        assert(payment_usd > 0u64);
        let scaled_bor_native: u64 = position.scaled_bor_native;
        let scaled_bor_usdcx: u64 = position.scaled_bor_usdcx;
        let scaled_bor_usad: u64 = position.scaled_bor_usad;
        let real_bor_aleo: u64 = (((scaled_bor_native as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
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
        let pay_aleo_usd: u64 = repay_budget_usd > debt_aleo_usd ? debt_aleo_usd : repay_budget_usd;
        let repay_aleo_asset: u64 = (((pay_aleo_usd as u128) * (PRICE_SCALE as u128) / (price_aleo as u128)) as u64);
        let scaled_out_aleo: u64 = (((repay_aleo_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_aleo as u128)) as u64);
        let new_scaled_aleo: u64 = scaled_bor_native > scaled_out_aleo ? scaled_bor_native - scaled_out_aleo : 0u64;
        let rem_after_aleo: u64 = repay_budget_usd > pay_aleo_usd ? repay_budget_usd - pay_aleo_usd : 0u64;
        let pay_usdcx_usd: u64 = rem_after_aleo > debt_usdcx_usd ? debt_usdcx_usd : rem_after_aleo;
        let repay_usdcx_asset: u64 = (((pay_usdcx_usd as u128) * (PRICE_SCALE as u128) / (price_usdcx as u128)) as u64);
        let scaled_out_usdcx: u64 = (((repay_usdcx_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usdcx as u128)) as u64);
        let new_scaled_usdcx: u64 = scaled_bor_usdcx > scaled_out_usdcx ? scaled_bor_usdcx - scaled_out_usdcx : 0u64;
        let rem_after_usdcx: u64 = rem_after_aleo > pay_usdcx_usd ? rem_after_aleo - pay_usdcx_usd : 0u64;
        let pay_usad_usd: u64 = rem_after_usdcx > debt_usad_usd ? debt_usad_usd : rem_after_usdcx;
        let repay_usad_asset: u64 = (((pay_usad_usd as u128) * (PRICE_SCALE as u128) / (price_usad as u128)) as u64);
        let scaled_out_usad: u64 = (((repay_usad_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usad as u128)) as u64);
        let new_scaled_usad: u64 = scaled_bor_usad > scaled_out_usad ? scaled_bor_usad - scaled_out_usad : 0u64;
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native,
            scaled_sup_usdcx: position.scaled_sup_usdcx,
            scaled_sup_usad: position.scaled_sup_usad,
            scaled_bor_native: new_scaled_aleo,
            scaled_bor_usdcx: new_scaled_usdcx,
            scaled_bor_usad: new_scaled_usad,
        };
        let (change, f_transfer): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, amount);
        return (new_position, change, final {
            finalize_repay_pos(
                f_transfer,
                ASSET_ALEO,
                amount,
                repay_aleo_asset,
                repay_usdcx_asset,
                repay_usad_asset,
                bor_idx_aleo,
                bor_idx_usdcx,
                bor_idx_usad,
                price_aleo,
                price_usdcx,
                price_usad,
            );
        });
    }

    fn repay_usdcx(
        position: LendingPosition,
        pay_record: test_usdcx_stablecoin.aleo::Token,
        private amount: u64,
        private proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
        public bor_idx_aleo: u64,
        public bor_idx_usdcx: u64,
        public bor_idx_usad: u64,
        public price_aleo: u64,
        public price_usdcx: u64,
        public price_usad: u64,
    ) -> (LendingPosition, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        let price_in: u64 = price_usdcx;
        let payment_usd: u64 = (((amount as u128) * (price_in as u128) / (PRICE_SCALE as u128)) as u64);
        assert(payment_usd > 0u64);
        let scaled_bor_native: u64 = position.scaled_bor_native;
        let scaled_bor_usdcx: u64 = position.scaled_bor_usdcx;
        let scaled_bor_usad: u64 = position.scaled_bor_usad;
        let real_bor_aleo: u64 = (((scaled_bor_native as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
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
        let pay_aleo_usd: u64 = repay_budget_usd > debt_aleo_usd ? debt_aleo_usd : repay_budget_usd;
        let repay_aleo_asset: u64 = (((pay_aleo_usd as u128) * (PRICE_SCALE as u128) / (price_aleo as u128)) as u64);
        let scaled_out_aleo: u64 = (((repay_aleo_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_aleo as u128)) as u64);
        let new_scaled_aleo: u64 = scaled_bor_native > scaled_out_aleo ? scaled_bor_native - scaled_out_aleo : 0u64;
        let rem_after_aleo: u64 = repay_budget_usd > pay_aleo_usd ? repay_budget_usd - pay_aleo_usd : 0u64;
        let pay_usdcx_usd: u64 = rem_after_aleo > debt_usdcx_usd ? debt_usdcx_usd : rem_after_aleo;
        let repay_usdcx_asset: u64 = (((pay_usdcx_usd as u128) * (PRICE_SCALE as u128) / (price_usdcx as u128)) as u64);
        let scaled_out_usdcx: u64 = (((repay_usdcx_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usdcx as u128)) as u64);
        let new_scaled_usdcx: u64 = scaled_bor_usdcx > scaled_out_usdcx ? scaled_bor_usdcx - scaled_out_usdcx : 0u64;
        let rem_after_usdcx: u64 = rem_after_aleo > pay_usdcx_usd ? rem_after_aleo - pay_usdcx_usd : 0u64;
        let pay_usad_usd: u64 = rem_after_usdcx > debt_usad_usd ? debt_usad_usd : rem_after_usdcx;
        let repay_usad_asset: u64 = (((pay_usad_usd as u128) * (PRICE_SCALE as u128) / (price_usad as u128)) as u64);
        let scaled_out_usad: u64 = (((repay_usad_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usad as u128)) as u64);
        let new_scaled_usad: u64 = scaled_bor_usad > scaled_out_usad ? scaled_bor_usad - scaled_out_usad : 0u64;
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native,
            scaled_sup_usdcx: position.scaled_sup_usdcx,
            scaled_sup_usad: position.scaled_sup_usad,
            scaled_bor_native: new_scaled_aleo,
            scaled_bor_usdcx: new_scaled_usdcx,
            scaled_bor_usad: new_scaled_usad,
        };
        let amount_u128: u128 = amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        return (new_position, compliance_record, change_token, final {
            finalize_repay_pos(
                f_transfer,
                ASSET_USDCX,
                amount,
                repay_aleo_asset,
                repay_usdcx_asset,
                repay_usad_asset,
                bor_idx_aleo,
                bor_idx_usdcx,
                bor_idx_usad,
                price_aleo,
                price_usdcx,
                price_usad,
            );
        });
    }

    fn repay_usad(
        position: LendingPosition,
        pay_record: test_usad_stablecoin.aleo::Token,
        private amount: u64,
        private proofs: [test_usad_stablecoin.aleo::MerkleProof; 2],
        public bor_idx_aleo: u64,
        public bor_idx_usdcx: u64,
        public bor_idx_usad: u64,
        public price_aleo: u64,
        public price_usdcx: u64,
        public price_usad: u64,
    ) -> (LendingPosition, test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        assert(amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        let price_in: u64 = price_usad;
        let payment_usd: u64 = (((amount as u128) * (price_in as u128) / (PRICE_SCALE as u128)) as u64);
        assert(payment_usd > 0u64);
        let scaled_bor_native: u64 = position.scaled_bor_native;
        let scaled_bor_usdcx: u64 = position.scaled_bor_usdcx;
        let scaled_bor_usad: u64 = position.scaled_bor_usad;
        let real_bor_aleo: u64 = (((scaled_bor_native as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
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
        let pay_aleo_usd: u64 = repay_budget_usd > debt_aleo_usd ? debt_aleo_usd : repay_budget_usd;
        let repay_aleo_asset: u64 = (((pay_aleo_usd as u128) * (PRICE_SCALE as u128) / (price_aleo as u128)) as u64);
        let scaled_out_aleo: u64 = (((repay_aleo_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_aleo as u128)) as u64);
        let new_scaled_aleo: u64 = scaled_bor_native > scaled_out_aleo ? scaled_bor_native - scaled_out_aleo : 0u64;
        let rem_after_aleo: u64 = repay_budget_usd > pay_aleo_usd ? repay_budget_usd - pay_aleo_usd : 0u64;
        let pay_usdcx_usd: u64 = rem_after_aleo > debt_usdcx_usd ? debt_usdcx_usd : rem_after_aleo;
        let repay_usdcx_asset: u64 = (((pay_usdcx_usd as u128) * (PRICE_SCALE as u128) / (price_usdcx as u128)) as u64);
        let scaled_out_usdcx: u64 = (((repay_usdcx_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usdcx as u128)) as u64);
        let new_scaled_usdcx: u64 = scaled_bor_usdcx > scaled_out_usdcx ? scaled_bor_usdcx - scaled_out_usdcx : 0u64;
        let rem_after_usdcx: u64 = rem_after_aleo > pay_usdcx_usd ? rem_after_aleo - pay_usdcx_usd : 0u64;
        let pay_usad_usd: u64 = rem_after_usdcx > debt_usad_usd ? debt_usad_usd : rem_after_usdcx;
        let repay_usad_asset: u64 = (((pay_usad_usd as u128) * (PRICE_SCALE as u128) / (price_usad as u128)) as u64);
        let scaled_out_usad: u64 = (((repay_usad_asset as u128) * (INDEX_SCALE as u128) / (bor_idx_usad as u128)) as u64);
        let new_scaled_usad: u64 = scaled_bor_usad > scaled_out_usad ? scaled_bor_usad - scaled_out_usad : 0u64;
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: position.scaled_sup_native,
            scaled_sup_usdcx: position.scaled_sup_usdcx,
            scaled_sup_usad: position.scaled_sup_usad,
            scaled_bor_native: new_scaled_aleo,
            scaled_bor_usdcx: new_scaled_usdcx,
            scaled_bor_usad: new_scaled_usad,
        };
        let amount_u128: u128 = amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        return (new_position, compliance_record, change_token, final {
            finalize_repay_pos(
                f_transfer,
                ASSET_USAD,
                amount,
                repay_aleo_asset,
                repay_usdcx_asset,
                repay_usad_asset,
                bor_idx_aleo,
                bor_idx_usdcx,
                bor_idx_usad,
                price_aleo,
                price_usdcx,
                price_usad,
            );
        });
    }

    // ========== Self-liquidation (owner pays ALEO debt, seizes chosen collateral) ==========

    fn self_liquidate_and_payout(
        position: LendingPosition,
        pay_record: credits.aleo::credits,
        private repay_amount: u64,
        private seize_asset: field,
        public sup_idx: U64Triple,
        public bor_idx: U64Triple,
        public price: U64Triple,
        public liq_thr: U64Triple,
        private liq_bonus_bps: u64,
    ) -> (LendingPosition, credits.aleo::credits, Final) {
        assert(repay_amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        assert(position.owner == caller);
        assert(seize_asset == ASSET_ALEO || seize_asset == ASSET_USDCX || seize_asset == ASSET_USAD);
        let sup_idx_aleo: u64 = sup_idx.x0;
        let sup_idx_usdcx: u64 = sup_idx.x1;
        let sup_idx_usad: u64 = sup_idx.x2;
        let bor_idx_aleo: u64 = bor_idx.x0;
        let bor_idx_usdcx: u64 = bor_idx.x1;
        let bor_idx_usad: u64 = bor_idx.x2;
        let price_aleo: u64 = price.x0;
        let price_usdcx: u64 = price.x1;
        let price_usad: u64 = price.x2;
        let liq_thr_aleo: u64 = liq_thr.x0;
        let liq_thr_usdcx: u64 = liq_thr.x1;
        let liq_thr_usad: u64 = liq_thr.x2;
        let scaled_sup_native: u64 = position.scaled_sup_native;
        let scaled_sup_usdcx: u64 = position.scaled_sup_usdcx;
        let scaled_sup_usad: u64 = position.scaled_sup_usad;
        let scaled_bor_native: u64 = position.scaled_bor_native;
        let scaled_bor_usdcx: u64 = position.scaled_bor_usdcx;
        let scaled_bor_usad: u64 = position.scaled_bor_usad;
        let real_sup_aleo: u64 = (((scaled_sup_native as u128) * (sup_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usdcx: u64 = (((scaled_sup_usdcx as u128) * (sup_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_sup_usad: u64 = (((scaled_sup_usad as u128) * (sup_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_aleo: u64 = (((scaled_bor_native as u128) * (bor_idx_aleo as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usdcx: u64 = (((scaled_bor_usdcx as u128) * (bor_idx_usdcx as u128) / (INDEX_SCALE as u128)) as u64);
        let real_bor_usad: u64 = (((scaled_bor_usad as u128) * (bor_idx_usad as u128) / (INDEX_SCALE as u128)) as u64);
        let rp_thr_aleo: u128 = (real_sup_aleo as u128) * (price_aleo as u128);
        let l_thr_aleo: u128 = (liq_thr_aleo as u128);
        let den_thr_aleo: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_thr_aleo: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_thr_aleo: u128 = l_thr_aleo == 0u128 ? 1u128 : l_thr_aleo;
        let rp_times_l_ok_thr_aleo: bool = (l_thr_aleo == 0u128) || (rp_thr_aleo <= (max_u128_thr_aleo / safe_l_thr_aleo));
        let collateral_thr_aleo: u64 = rp_times_l_ok_thr_aleo ? (((rp_thr_aleo * l_thr_aleo) / den_thr_aleo) as u64) : ((((rp_thr_aleo / (PRICE_SCALE as u128)) * l_thr_aleo / (SCALE as u128)) as u64));
        let rp_thr_usdcx: u128 = (real_sup_usdcx as u128) * (price_usdcx as u128);
        let l_thr_usdcx: u128 = (liq_thr_usdcx as u128);
        let den_thr_usdcx: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_thr_usdcx: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_thr_usdcx: u128 = l_thr_usdcx == 0u128 ? 1u128 : l_thr_usdcx;
        let rp_times_l_ok_thr_usdcx: bool = (l_thr_usdcx == 0u128) || (rp_thr_usdcx <= (max_u128_thr_usdcx / safe_l_thr_usdcx));
        let collateral_thr_usdcx: u64 = rp_times_l_ok_thr_usdcx ? (((rp_thr_usdcx * l_thr_usdcx) / den_thr_usdcx) as u64) : ((((rp_thr_usdcx / (PRICE_SCALE as u128)) * l_thr_usdcx / (SCALE as u128)) as u64));
        let rp_thr_usad: u128 = (real_sup_usad as u128) * (price_usad as u128);
        let l_thr_usad: u128 = (liq_thr_usad as u128);
        let den_thr_usad: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128_thr_usad: u128 = 340282366920938463463374607431768211455u128;
        let safe_l_thr_usad: u128 = l_thr_usad == 0u128 ? 1u128 : l_thr_usad;
        let rp_times_l_ok_thr_usad: bool = (l_thr_usad == 0u128) || (rp_thr_usad <= (max_u128_thr_usad / safe_l_thr_usad));
        let collateral_thr_usad: u64 = rp_times_l_ok_thr_usad ? (((rp_thr_usad * l_thr_usad) / den_thr_usad) as u64) : ((((rp_thr_usad / (PRICE_SCALE as u128)) * l_thr_usad / (SCALE as u128)) as u64));
        let debt_aleo_usd: u64 = (((real_bor_aleo as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usdcx_usd: u64 = (((real_bor_usdcx as u128) * (price_usdcx as u128) / (PRICE_SCALE as u128)) as u64);
        let debt_usad_usd: u64 = (((real_bor_usad as u128) * (price_usad as u128) / (PRICE_SCALE as u128)) as u64);
        let total_collateral_thr_u128: u128 =
            (collateral_thr_aleo as u128) + (collateral_thr_usdcx as u128) + (collateral_thr_usad as u128);
        let total_debt_u128: u128 = (debt_aleo_usd as u128) + (debt_usdcx_usd as u128) + (debt_usad_usd as u128);
        assert(total_debt_u128 > total_collateral_thr_u128);
        assert(real_bor_aleo > 0u64);
        let max_close_aleo: u64 = (((real_bor_aleo as u128) * (LIQ_CLOSE_FACTOR_BPS as u128) / (BPS_DENOMINATOR as u128)) as u64);
        let repay_cap_aleo: u64 = max_close_aleo == 0u64 ? 1u64 : max_close_aleo;
        assert(repay_amount <= repay_cap_aleo);
        assert(repay_amount <= real_bor_aleo);
        let repay_usd: u64 = (((repay_amount as u128) * (price_aleo as u128) / (PRICE_SCALE as u128)) as u64);
        assert(repay_usd > 0u64);
        // Self path: `liq_bonus_bps` must match `asset_liq_bonus[seize_asset]` (finalize). Small bps = near-par seize.
        let seize_usd: u64 = (((repay_usd as u128) * ((BPS_DENOMINATOR + liq_bonus_bps) as u128) / (BPS_DENOMINATOR as u128)) as u64);
        let seize_price: u64 = seize_asset == ASSET_ALEO ? price_aleo : seize_asset == ASSET_USDCX ? price_usdcx : price_usad;
        let seize_amount: u64 = (((seize_usd as u128) * (PRICE_SCALE as u128) / (seize_price as u128)) as u64);
        assert(seize_amount > 0u64);
        let borrower_seize_sup: u64 =
            seize_asset == ASSET_ALEO ? real_sup_aleo : seize_asset == ASSET_USDCX ? real_sup_usdcx : real_sup_usad;
        assert(seize_amount <= borrower_seize_sup);
        let scaled_out_bor_aleo: u64 = (((repay_amount as u128) * (INDEX_SCALE as u128) / (bor_idx_aleo as u128)) as u64);
        let new_scaled_bor_native: u64 = scaled_bor_native > scaled_out_bor_aleo ? scaled_bor_native - scaled_out_bor_aleo : 0u64;
        let out_sup_aleo: u64 = seize_asset == ASSET_ALEO ? (((seize_amount as u128) * (INDEX_SCALE as u128) / (sup_idx_aleo as u128)) as u64) : 0u64;
        let out_sup_usdcx: u64 = seize_asset == ASSET_USDCX ? (((seize_amount as u128) * (INDEX_SCALE as u128) / (sup_idx_usdcx as u128)) as u64) : 0u64;
        let out_sup_usad: u64 = seize_asset == ASSET_USAD ? (((seize_amount as u128) * (INDEX_SCALE as u128) / (sup_idx_usad as u128)) as u64) : 0u64;
        let new_scaled_sup_native: u64 = seize_asset == ASSET_ALEO ? (scaled_sup_native > out_sup_aleo ? scaled_sup_native - out_sup_aleo : 0u64) : scaled_sup_native;
        let new_scaled_sup_usdcx: u64 = seize_asset == ASSET_USDCX ? (scaled_sup_usdcx > out_sup_usdcx ? scaled_sup_usdcx - out_sup_usdcx : 0u64) : scaled_sup_usdcx;
        let new_scaled_sup_usad: u64 = seize_asset == ASSET_USAD ? (scaled_sup_usad > out_sup_usad ? scaled_sup_usad - out_sup_usad : 0u64) : scaled_sup_usad;
        let new_position: LendingPosition = LendingPosition {
            owner: caller,
            scaled_sup_native: new_scaled_sup_native,
            scaled_sup_usdcx: new_scaled_sup_usdcx,
            scaled_sup_usad: new_scaled_sup_usad,
            scaled_bor_native: new_scaled_bor_native,
            scaled_bor_usdcx: position.scaled_bor_usdcx,
            scaled_bor_usad: position.scaled_bor_usad,
        };
        let (change, f_transfer): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, repay_amount);
        return (new_position, change, final {
            finalize_self_liq_payout(
                f_transfer,
                repay_amount,
                seize_asset,
                seize_amount,
                liq_bonus_bps,
            );
        });
    }

    // ========== Admin & maintenance ==========

    fn accrue_interest(public asset_id: field) -> Final {
        return final { finalize_accrue(asset_id); };
    }

    fn set_asset_price(public asset_id: field, public price: u64) -> Final {
        assert(self.caller == ADMIN_ADDRESS);
        assert(price > 0u64);
        return final { finalize_set_price(asset_id, price); };
    }

    fn set_asset_params(
        public asset_id: field,
        public ltv: u64,
        public liq_threshold: u64,
        public liq_bonus: u64,
        public base_rate: u64,
        public slope_rate: u64,
        public reserve_factor: u64
    ) -> Final {
        assert(self.caller == ADMIN_ADDRESS);
        assert(asset_id == ASSET_ALEO || asset_id == ASSET_USDCX || asset_id == ASSET_USAD);
        assert(ltv <= BPS_DENOMINATOR);
        assert(liq_threshold <= BPS_DENOMINATOR);
        assert(liq_bonus <= BPS_DENOMINATOR);
        assert(reserve_factor <= SCALE);
        return final { finalize_set_params(asset_id, ltv, liq_threshold, liq_bonus, base_rate, slope_rate, reserve_factor); };
    }

    fn withdraw_fees(public asset_id: field, public amount: u64) -> Final {
        assert(amount > 0u64);
        assert(self.caller == ADMIN_ADDRESS);
        return final { finalize_withdraw_fees(asset_id, amount); };
    }

    // Batch update: price + LTV + liq params + rate model for one asset (does not touch totals/indices/liquidity).
    fn admin_update_asset(
        public asset_id: field,
        public price: u64,
        public ltv: u64,
        public liq_threshold: u64,
        public liq_bonus: u64,
        public base_rate: u64,
        public slope_rate: u64,
        public reserve_factor: u64,
    ) -> Final {
        assert(self.caller == ADMIN_ADDRESS);
        assert(asset_id == ASSET_ALEO || asset_id == ASSET_USDCX || asset_id == ASSET_USAD);
        assert(price > 0u64);
        assert(ltv <= BPS_DENOMINATOR);
        assert(liq_threshold <= BPS_DENOMINATOR);
        assert(liq_bonus <= BPS_DENOMINATOR);
        assert(reserve_factor <= SCALE);
        return final {
            finalize_admin_update_asset(
                asset_id,
                price,
                ltv,
                liq_threshold,
                liq_bonus,
                base_rate,
                slope_rate,
                reserve_factor,
            );
        };
    }

    // ========== Flash loan ==========

    fn set_flash_params(
        public asset_id: field,
        public enabled: bool,
        public premium_bps: u64,
        public max_amount: u64,
    ) -> Final {
        assert(self.caller == ADMIN_ADDRESS);
        assert(asset_id == ASSET_ALEO || asset_id == ASSET_USDCX || asset_id == ASSET_USAD);
        assert(premium_bps <= BPS_DENOMINATOR);
        return final { finalize_set_flash_params(asset_id, enabled, premium_bps, max_amount); };
    }

    fn set_flash_strategy_allowed(public strategy_id: field, public allowed: bool) -> Final {
        assert(self.caller == ADMIN_ADDRESS);
        return final { finalize_set_flash_strat(strategy_id, allowed); };
    }

    fn flash_open(
        private asset_id: field,
        private principal: u64,
        private min_profit: u64,
        private strategy_id: field,
    ) -> Final {
        assert(asset_id == ASSET_ALEO || asset_id == ASSET_USDCX || asset_id == ASSET_USAD);
        assert(principal > 0u64);
        let user_key: field = BHP256::hash_to_field(self.caller);
        return final { finalize_flash_open(user_key, asset_id, principal, min_profit, strategy_id); };
    }

    fn flash_settle_with_credits(
        pay_record: credits.aleo::credits,
        private repay_amount: u64,
        private strategy_id: field,
    ) -> (credits.aleo::credits, Final) {
        assert(repay_amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let (change, f_transfer): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(pay_record, POOL_VAULT_ADDRESS, repay_amount);
        return (change, final {
            finalize_flash_settle(f_transfer, user_key, repay_amount, strategy_id);
        });
    }

    fn flash_settle_with_usdcx(
        pay_record: test_usdcx_stablecoin.aleo::Token,
        private repay_amount: u64,
        private strategy_id: field,
        private proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(repay_amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let amount_u128: u128 = repay_amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usdcx_stablecoin.aleo::ComplianceRecord,
            test_usdcx_stablecoin.aleo::Token,
            Final
        ) = test_usdcx_stablecoin.aleo::transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        return (compliance_record, change_token, final {
            finalize_flash_settle(f_transfer, user_key, repay_amount, strategy_id);
        });
    }

    fn flash_settle_with_usad(
        pay_record: test_usad_stablecoin.aleo::Token,
        private repay_amount: u64,
        private strategy_id: field,
        private proofs: [test_usad_stablecoin.aleo::MerkleProof; 2],
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, Final) {
        assert(repay_amount > 0u64);
        let caller: address = self.caller;
        assert(caller == pay_record.owner);
        let user_key: field = BHP256::hash_to_field(caller);
        let amount_u128: u128 = repay_amount as u128;
        let (compliance_record, change_token, f_transfer): (
            test_usad_stablecoin.aleo::ComplianceRecord,
            test_usad_stablecoin.aleo::Token,
            Final
        ) = test_usad_stablecoin.aleo::transfer_private_to_public(POOL_VAULT_ADDRESS, amount_u128, pay_record, proofs);
        return (compliance_record, change_token, final {
            finalize_flash_settle(f_transfer, user_key, repay_amount, strategy_id);
        });
    }
}

// =============================================================================
// Finalize (on-chain state updates)
// =============================================================================

final fn finalize_initialize() {

let already: bool = Mapping::get_or_use(initialized, 0field, false);
assert(!already);

    // Max 16 mapping writes per finalize in Leo.
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

// `sup_idx` must match chain supply_index at finalize (stale index after accrue causes revert).
final fn finalize_deposit_pos(
    public f_transfer: Final,
    asset_id: field,
    amount: u64,
    public sup_idx: u64,
) {
    f_transfer.run();
    let chain_sup: u64 = Mapping::get_or_use(supply_index, asset_id, INDEX_SCALE);
    assert(sup_idx == chain_sup);
    let deposited: u64 = Mapping::get_or_use(total_deposited, asset_id, 0u64);
    assert((deposited as u128) + (amount as u128) <= (18446744073709551615u128));
    Mapping::set(total_deposited, asset_id, deposited + amount);
    let prev_avail: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
    assert((prev_avail as u128) + (amount as u128) <= (18446744073709551615u128));
    Mapping::set(available_liquidity, asset_id, prev_avail + amount);
}

final fn finalize_borrow_pos(
     asset_id: field,
     amount: u64,
    public sup_idx_aleo: u64,
    public sup_idx_usdcx: u64,
    public sup_idx_usad: u64,
    public bor_idx_aleo: u64,
    public bor_idx_usdcx: u64,
    public bor_idx_usad: u64,
    public price_aleo: u64,
    public price_usdcx: u64,
    public price_usad: u64,
    public ltv_aleo: u64,
    public ltv_usdcx: u64,
    public ltv_usad: u64,
) {
    assert(sup_idx_aleo == Mapping::get_or_use(supply_index, ASSET_ALEO, INDEX_SCALE));
    assert(sup_idx_usdcx == Mapping::get_or_use(supply_index, ASSET_USDCX, INDEX_SCALE));
    assert(sup_idx_usad == Mapping::get_or_use(supply_index, ASSET_USAD, INDEX_SCALE));
    assert(bor_idx_aleo == Mapping::get_or_use(borrow_index, ASSET_ALEO, INDEX_SCALE));
    assert(bor_idx_usdcx == Mapping::get_or_use(borrow_index, ASSET_USDCX, INDEX_SCALE));
    assert(bor_idx_usad == Mapping::get_or_use(borrow_index, ASSET_USAD, INDEX_SCALE));
    assert(price_aleo == Mapping::get_or_use(asset_price, ASSET_ALEO, PRICE_SCALE));
    assert(price_usdcx == Mapping::get_or_use(asset_price, ASSET_USDCX, PRICE_SCALE));
    assert(price_usad == Mapping::get_or_use(asset_price, ASSET_USAD, PRICE_SCALE));
    assert(ltv_aleo == Mapping::get_or_use(asset_ltv, ASSET_ALEO, 7_500u64));
    assert(ltv_usdcx == Mapping::get_or_use(asset_ltv, ASSET_USDCX, 8_500u64));
    assert(ltv_usad == Mapping::get_or_use(asset_ltv, ASSET_USAD, 8_500u64));
    let borrowed: u64 = Mapping::get_or_use(total_borrowed, asset_id, 0u64);
    assert((borrowed as u128) + (amount as u128) <= (18446744073709551615u128));
    Mapping::set(total_borrowed, asset_id, borrowed + amount);
}

final fn finalize_repay_pos(
    f_transfer: Final,
    asset_in: field,
    amount: u64,
    public repay_aleo_asset: u64,
    public repay_usdcx_asset: u64,
    public repay_usad_asset: u64,
    public bor_idx_aleo: u64,
    public bor_idx_usdcx: u64,
    public bor_idx_usad: u64,
    public price_aleo: u64,
    public price_usdcx: u64,
    public price_usad: u64,
) {
    f_transfer.run();
    assert(bor_idx_aleo == Mapping::get_or_use(borrow_index, ASSET_ALEO, INDEX_SCALE));
    assert(bor_idx_usdcx == Mapping::get_or_use(borrow_index, ASSET_USDCX, INDEX_SCALE));
    assert(bor_idx_usad == Mapping::get_or_use(borrow_index, ASSET_USAD, INDEX_SCALE));
    assert(price_aleo == Mapping::get_or_use(asset_price, ASSET_ALEO, PRICE_SCALE));
    assert(price_usdcx == Mapping::get_or_use(asset_price, ASSET_USDCX, PRICE_SCALE));
    assert(price_usad == Mapping::get_or_use(asset_price, ASSET_USAD, PRICE_SCALE));
    let price_in: u64 = Mapping::get_or_use(asset_price, asset_in, PRICE_SCALE);
    let payment_usd: u64 = (((amount as u128) * (price_in as u128) / (PRICE_SCALE as u128)) as u64);
    assert(payment_usd > 0u64);
    let borrowed_aleo: u64 = Mapping::get_or_use(total_borrowed, ASSET_ALEO, 0u64);
    let new_borrowed_aleo: u64 = borrowed_aleo > repay_aleo_asset ? borrowed_aleo - repay_aleo_asset : 0u64;
    Mapping::set(total_borrowed, ASSET_ALEO, new_borrowed_aleo);
    let borrowed_usdcx: u64 = Mapping::get_or_use(total_borrowed, ASSET_USDCX, 0u64);
    let new_borrowed_usdcx: u64 = borrowed_usdcx > repay_usdcx_asset ? borrowed_usdcx - repay_usdcx_asset : 0u64;
    Mapping::set(total_borrowed, ASSET_USDCX, new_borrowed_usdcx);
    let borrowed_usad: u64 = Mapping::get_or_use(total_borrowed, ASSET_USAD, 0u64);
    let new_borrowed_usad: u64 = borrowed_usad > repay_usad_asset ? borrowed_usad - repay_usad_asset : 0u64;
    Mapping::set(total_borrowed, ASSET_USAD, new_borrowed_usad);
    let prev_avail_in: u64 = Mapping::get_or_use(available_liquidity, asset_in, 0u64);
    assert((prev_avail_in as u128) + (amount as u128) <= (18446744073709551615u128));
    Mapping::set(available_liquidity, asset_in, prev_avail_in + amount);
}

final fn finalize_self_liq_payout(
    public f_transfer: Final,
    public repay_amount: u64,
    public seize_asset: field,
    public seize_amount: u64,
    public liq_bonus_bps: u64,
) {
    f_transfer.run();
    assert(seize_asset == ASSET_ALEO || seize_asset == ASSET_USDCX || seize_asset == ASSET_USAD);
    assert(liq_bonus_bps == Mapping::get_or_use(asset_liq_bonus, seize_asset, 500u64));
    let total_bor_aleo: u64 = Mapping::get_or_use(total_borrowed, ASSET_ALEO, 0u64);
    let new_total_bor_aleo: u64 = total_bor_aleo > repay_amount ? total_bor_aleo - repay_amount : 0u64;
    Mapping::set(total_borrowed, ASSET_ALEO, new_total_bor_aleo);
    if (seize_asset == ASSET_ALEO) {
        let dep: u64 = Mapping::get_or_use(total_deposited, ASSET_ALEO, 0u64);
        Mapping::set(total_deposited, ASSET_ALEO, dep > seize_amount ? dep - seize_amount : 0u64);
    } else if (seize_asset == ASSET_USDCX) {
        let dep: u64 = Mapping::get_or_use(total_deposited, ASSET_USDCX, 0u64);
        Mapping::set(total_deposited, ASSET_USDCX, dep > seize_amount ? dep - seize_amount : 0u64);
    } else {
        let dep: u64 = Mapping::get_or_use(total_deposited, ASSET_USAD, 0u64);
        Mapping::set(total_deposited, ASSET_USAD, dep > seize_amount ? dep - seize_amount : 0u64);
    }
    let avail_in: u64 = Mapping::get_or_use(available_liquidity, ASSET_ALEO, 0u64);
    assert((avail_in as u128) + (repay_amount as u128) <= (18446744073709551615u128));
    Mapping::set(available_liquidity, ASSET_ALEO, avail_in + repay_amount);
    let avail_out: u64 = Mapping::get_or_use(available_liquidity, seize_asset, 0u64);
    let new_avail_out: u64 = avail_out > seize_amount ? avail_out - seize_amount : 0u64;
    Mapping::set(available_liquidity, seize_asset, new_avail_out);
}

// Asserts witnesses match chain mappings; updates total_deposited and payout available_liquidity when applicable.
final fn finalize_withdraw_pos(
    asset_id: field,
    amount: u64,
    burn_amts: U64Triple,
    sup_idx: U64Triple,
    bor_idx: U64Triple,
    price: U64Triple,
    ltv: U64Triple,
    rem_after_usad: u64,
    total_debt_u128: u128,
    total_collateral_after_u128: u128,
) {
        assert(sup_idx.x0 == Mapping::get_or_use(supply_index, ASSET_ALEO, INDEX_SCALE));
        assert(sup_idx.x1 == Mapping::get_or_use(supply_index, ASSET_USDCX, INDEX_SCALE));
        assert(sup_idx.x2 == Mapping::get_or_use(supply_index, ASSET_USAD, INDEX_SCALE));
        assert(bor_idx.x0 == Mapping::get_or_use(borrow_index, ASSET_ALEO, INDEX_SCALE));
        assert(bor_idx.x1 == Mapping::get_or_use(borrow_index, ASSET_USDCX, INDEX_SCALE));
        assert(bor_idx.x2 == Mapping::get_or_use(borrow_index, ASSET_USAD, INDEX_SCALE));
        assert(price.x0 == Mapping::get_or_use(asset_price, ASSET_ALEO, PRICE_SCALE));
        assert(price.x1 == Mapping::get_or_use(asset_price, ASSET_USDCX, PRICE_SCALE));
        assert(price.x2 == Mapping::get_or_use(asset_price, ASSET_USAD, PRICE_SCALE));
        assert(ltv.x0 == Mapping::get_or_use(asset_ltv, ASSET_ALEO, 7_500u64));
        assert(ltv.x1 == Mapping::get_or_use(asset_ltv, ASSET_USDCX, 8_500u64));
        assert(ltv.x2 == Mapping::get_or_use(asset_ltv, ASSET_USAD, 8_500u64));
   
        assert(rem_after_usad <= WITHDRAW_XA_REMAINDER_MAX);
    
        assert(total_debt_u128 == 0u128 || total_debt_u128 <= total_collateral_after_u128);
    
    let deposited_aleo: u64 = Mapping::get_or_use(total_deposited, ASSET_ALEO, 0u64);
    let deposited_usdcx: u64 = Mapping::get_or_use(total_deposited, ASSET_USDCX, 0u64);
    let deposited_usad: u64 = Mapping::get_or_use(total_deposited, ASSET_USAD, 0u64);
    let burn_aleo: u64 = burn_amts.x0;
    let burn_usdcx: u64 = burn_amts.x1;
    let burn_usad: u64 = burn_amts.x2;
    // total_deposited is principal-only; user real supply grows with index — saturate burn vs deposited.
    let new_deposited_aleo: u64 = deposited_aleo > burn_aleo ? deposited_aleo - burn_aleo : 0u64;
    let new_deposited_usdcx: u64 = deposited_usdcx > burn_usdcx ? deposited_usdcx - burn_usdcx : 0u64;
    let new_deposited_usad: u64 = deposited_usad > burn_usad ? deposited_usad - burn_usad : 0u64;
    Mapping::set(total_deposited, ASSET_ALEO, new_deposited_aleo);
    Mapping::set(total_deposited, ASSET_USDCX, new_deposited_usdcx);
    Mapping::set(total_deposited, ASSET_USAD, new_deposited_usad);
    // Decrement available_liquidity for payout asset when that leg burned collateral on this tx.
    if (asset_id == ASSET_ALEO) {
        if (burn_aleo > 0u64) {
            let prev_avail_aleo: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
            let new_avail_aleo: u64 = prev_avail_aleo > amount ? prev_avail_aleo - amount : 0u64;
            Mapping::set(available_liquidity, ASSET_ALEO, new_avail_aleo);
        }
    } else if (asset_id == ASSET_USDCX) {
        if (burn_usdcx > 0u64) {
            let prev_avail_out: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
            let new_avail_out: u64 = prev_avail_out > amount ? prev_avail_out - amount : 0u64;
            Mapping::set(available_liquidity, asset_id, new_avail_out);
        }
    } else {
        if (burn_usad > 0u64) {
            let prev_avail_out: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
            let new_avail_out: u64 = prev_avail_out > amount ? prev_avail_out - amount : 0u64;
            Mapping::set(available_liquidity, asset_id, new_avail_out);
        }
    }
}



final fn finalize_accrue(
    public asset_id: field
) {

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
    assert(reserve_factor <= SCALE);
    let raw_delta: u64 = current_block > last_block ? current_block - last_block : 0u64;
    let delta: u64 = raw_delta > MAX_ACCRUAL_DELTA ? MAX_ACCRUAL_DELTA : raw_delta;
    let do_accrue: bool = delta > 0u64 && deposited > 0u64;
    let util_u128: u128 = deposited == 0u64
        ? 0u128
        : (((borrowed as u128) * (SCALE as u128)) / (deposited as u128));
    let util_capped_u128: u128 = util_u128 > (SCALE as u128) ? (SCALE as u128) : util_u128;
    let util: u64 = util_capped_u128 as u64;
    let borrow_rate_u128: u128 =
        (((base_rate as u128) + (((slope_rate as u128) * (util as u128)) / (SCALE as u128)))
            * (INDEX_SCALE as u128))
            / ((BLOCKS_PER_YEAR as u128) * (SCALE as u128));
    let borrow_rate: u64 = borrow_rate_u128 as u64;
    let supply_rate_u128: u128 =
        ((borrow_rate as u128) * (util as u128) * ((SCALE - reserve_factor) as u128))
            / ((SCALE as u128) * (SCALE as u128));
    let supply_rate: u64 = supply_rate_u128 as u64;
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

final fn finalize_set_price(
    public asset_id: field,
    public price: u64
) {

    Mapping::set(asset_price, asset_id, price);

}

final fn finalize_set_params(
    public asset_id: field,
    public ltv: u64,
    public liq_threshold: u64,
    public liq_bonus: u64,
    public base_rate: u64,
    public slope_rate: u64,
    public reserve_factor: u64
) {

    Mapping::set(asset_ltv, asset_id, ltv);
    Mapping::set(asset_liq_threshold, asset_id, liq_threshold);
    Mapping::set(asset_liq_bonus, asset_id, liq_bonus);
    Mapping::set(asset_base_rate, asset_id, base_rate);
    Mapping::set(asset_slope_rate, asset_id, slope_rate);
    Mapping::set(asset_reserve_factor, asset_id, reserve_factor);

}

final fn finalize_admin_update_asset(
    public asset_id: field,
    public price: u64,
    public ltv: u64,
    public liq_threshold: u64,
    public liq_bonus: u64,
    public base_rate: u64,
    public slope_rate: u64,
    public reserve_factor: u64,
) {
    Mapping::set(asset_price, asset_id, price);
    Mapping::set(asset_ltv, asset_id, ltv);
    Mapping::set(asset_liq_threshold, asset_id, liq_threshold);
    Mapping::set(asset_liq_bonus, asset_id, liq_bonus);
    Mapping::set(asset_base_rate, asset_id, base_rate);
    Mapping::set(asset_slope_rate, asset_id, slope_rate);
    Mapping::set(asset_reserve_factor, asset_id, reserve_factor);
}

final fn finalize_set_flash_params(
    public asset_id: field,
    public enabled: bool,
    public premium_bps: u64,
    public max_amount: u64,
) {
    Mapping::set(flash_enabled, asset_id, enabled);
    Mapping::set(flash_premium_bps, asset_id, premium_bps);
    Mapping::set(flash_max_amount, asset_id, max_amount);
}

final fn finalize_set_flash_strat(
    public strategy_id: field,
    public allowed: bool,
) {
    Mapping::set(flash_strategy_allowed, strategy_id, allowed);
}

final fn finalize_flash_open(
     user_key: field,
     asset_id: field,
     principal: u64,
     min_profit: u64,
     strategy_id: field,
) {
    assert(Mapping::get_or_use(flash_enabled, asset_id, false));
    assert(Mapping::get_or_use(flash_strategy_allowed, strategy_id, false));
    let max_amount: u64 = Mapping::get_or_use(flash_max_amount, asset_id, 0u64);
    assert(max_amount == 0u64 || principal <= max_amount);
    assert(!Mapping::get_or_use(flash_active, user_key, false));
    let avail: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
    assert(principal <= avail);

    Mapping::set(available_liquidity, asset_id, avail - principal);
    Mapping::set(flash_active, user_key, true);
    Mapping::set(flash_asset, user_key, asset_id);
    Mapping::set(flash_principal, user_key, principal);
    Mapping::set(flash_min_profit, user_key, min_profit);
    Mapping::set(flash_strategy_id, user_key, strategy_id);
}

final fn finalize_flash_settle(
    public f_transfer: Final,
    public user_key: field,
    public repay_amount: u64,
    public strategy_id: field,
) {
    f_transfer.run();
    assert(Mapping::get_or_use(flash_active, user_key, false));
    let asset_id: field = Mapping::get_or_use(flash_asset, user_key, 0field);
    assert(asset_id == ASSET_ALEO || asset_id == ASSET_USDCX || asset_id == ASSET_USAD);
    let expected_strategy: field = Mapping::get_or_use(flash_strategy_id, user_key, 0field);
    assert(expected_strategy == strategy_id);
    let principal: u64 = Mapping::get_or_use(flash_principal, user_key, 0u64);
    let premium_bps: u64 = Mapping::get_or_use(flash_premium_bps, asset_id, 5u64);
    let fee_u128: u128 =
        ((principal as u128) * (premium_bps as u128) + ((BPS_DENOMINATOR - 1u64) as u128))
        / (BPS_DENOMINATOR as u128);
    assert(fee_u128 <= 18446744073709551615u128);
    let fee: u64 = fee_u128 as u64;
    assert((principal as u128) + (fee as u128) <= 18446744073709551615u128);
    assert(repay_amount >= principal + fee);
    let realized_profit: u64 = repay_amount - (principal + fee);
    let min_profit: u64 = Mapping::get_or_use(flash_min_profit, user_key, 0u64);
    assert(realized_profit >= min_profit);

    let avail: u64 = Mapping::get_or_use(available_liquidity, asset_id, 0u64);
    assert((avail as u128) + (repay_amount as u128) <= 18446744073709551615u128);
    Mapping::set(available_liquidity, asset_id, avail + repay_amount);

    let fees: u64 = Mapping::get_or_use(protocol_fees, asset_id, 0u64);
    assert((fees as u128) + (fee as u128) <= 18446744073709551615u128);
    Mapping::set(protocol_fees, asset_id, fees + fee);

    Mapping::set(flash_active, user_key, false);
    Mapping::set(flash_principal, user_key, 0u64);
    Mapping::set(flash_min_profit, user_key, 0u64);
    Mapping::set(flash_strategy_id, user_key, 0field);
}

final fn finalize_withdraw_fees(
    public asset_id: field,
    public amount: u64
) {

    let fees: u64 = Mapping::get_or_use(protocol_fees, asset_id, 0u64);
assert(amount <= fees);
    Mapping::set(protocol_fees, asset_id, fees - amount);

}
