// Mirrors `../src/main.leo` in xyra_lending parent package (weighted + finalize_borrow assert).

program test_lending_math.aleo {
    const SCALE: u64 = 10_000u64;
    const PRICE_SCALE: u64 = 1_000_000u64;

    inline mirror_weighted_collateral_usd(real_sup: u64, price: u64, ltv: u64) -> u64 {
        let rp: u128 = (real_sup as u128) * (price as u128);
        let l: u128 = (ltv as u128);
        let den: u128 = (PRICE_SCALE as u128) * (SCALE as u128);
        let max_u128: u128 = 340282366920938463463374607431768211455u128;
        let rp_times_l_ok: bool = (l == 0u128) || (rp <= (max_u128 / l));
        return rp_times_l_ok ? (((rp * l) / den) as u64) : ((((rp / (PRICE_SCALE as u128)) * l / (SCALE as u128)) as u64));
    }

    inline debt_usd_micro(real_bor: u64, price: u64) -> u64 {
        return (((real_bor as u128) * (price as u128) / (PRICE_SCALE as u128)) as u64);
    }

    inline new_borrow_usd_micro(amount: u64, borrow_price: u64) -> u64 {
        return (((amount as u128) * (borrow_price as u128) / (PRICE_SCALE as u128)) as u64);
    }

    @test
    transition test_weighted_known() {
        let w: u64 = mirror_weighted_collateral_usd(10_000_000u64, PRICE_SCALE, 7_500u64);
        assert(w == 7_500_000u64);
    }

    @test
    transition test_health_cross_ok() {
        let wa: u64 = mirror_weighted_collateral_usd(20_000_000u64, PRICE_SCALE, 7_500u64);
        let wu: u64 = mirror_weighted_collateral_usd(10_000_000u64, PRICE_SCALE, 8_500u64);
        let wd: u64 = mirror_weighted_collateral_usd(0u64, PRICE_SCALE, 8_500u64);
        let total_collateral: u128 = (wa as u128) + (wu as u128) + (wd as u128);

        let debt_aleo: u64 = debt_usd_micro(0u64, PRICE_SCALE);
        let debt_usdcx: u64 = debt_usd_micro(0u64, PRICE_SCALE);
        let debt_usad: u64 = debt_usd_micro(0u64, PRICE_SCALE);
        let total_debt: u128 = (debt_aleo as u128) + (debt_usdcx as u128) + (debt_usad as u128);

        let borrow_amount: u64 = 10_000_000u64;
        let new_borrow_usd: u64 = new_borrow_usd_micro(borrow_amount, PRICE_SCALE);
        assert(total_debt + (new_borrow_usd as u128) <= total_collateral);
    }

    @test
    transition test_health_over_fail() {
        let weighted: u64 = mirror_weighted_collateral_usd(1_000_000u64, PRICE_SCALE, 7_500u64);
        let total_collateral: u128 = (weighted as u128);
        let total_debt: u128 = 0u128;
        let greedy_borrow_usd: u64 = 1_000_000u64;
        assert(!(total_debt + (greedy_borrow_usd as u128) <= total_collateral));
    }

    @noupgrade
    async constructor() {}
}
