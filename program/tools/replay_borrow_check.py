#!/usr/bin/env python3
"""
Replay xyra_lending_v* finalize_borrow health check with real integers.

Use when a borrow fails on-chain: pull effective supplies/debts (or raw mappings +
indices) from the explorer / RPC, then confirm whether
  total_debt_usd + new_borrow_usd <= total_collateral_usd
matches the contract.

Weighted collateral matches Leo `weighted_collateral_usd` (single floor when safe).

Examples:
  python3 replay_borrow_check.py \\
    --real-sup-aleo 5000000 --real-sup-usdcx 0 --real-sup-usad 0 \\
    --real-bor-aleo 0 --real-bor-usdcx 0 --real-bor-usad 0 \\
    --price-aleo 1500000 --price-usdcx 1000000 --price-usad 1000000 \\
    --ltv-aleo 7500 --ltv-usdcx 8500 --ltv-usad 8500 \\
    --borrow-asset aleo --borrow-amount 1000000

  # Same, JSON file: { "real_sup": {"aleo",...}, "real_bor": {...}, "prices": {...}, ... }
  python3 replay_borrow_check.py --json scenario.json
"""

from __future__ import annotations

import argparse
import json
import sys

PRICE_SCALE = 1_000_000
SCALE = 10_000
MAX_U128 = (1 << 128) - 1


def weighted_collateral_usd(real_sup: int, price: int, ltv: int) -> int:
    rp = real_sup * price
    l = ltv
    den = PRICE_SCALE * SCALE
    if l == 0 or rp <= MAX_U128 // l:
        return (rp * l) // den
    return ((rp // PRICE_SCALE) * l) // SCALE


def debt_usd(real_bor: int, price: int) -> int:
    return (real_bor * price) // PRICE_SCALE


def new_borrow_usd(amount: int, borrow_price: int) -> int:
    return (amount * borrow_price) // PRICE_SCALE


def check(
    real_sup: tuple[int, int, int],
    real_bor: tuple[int, int, int],
    prices: tuple[int, int, int],
    ltvs: tuple[int, int, int],
    borrow_idx: int,
    borrow_amount: int,
) -> dict:
    ra, ru, rd = real_sup
    ba, bu, bd = real_bor
    pa, pu, pd = prices
    la, lu, ld = ltvs
    bp = (pa, pu, pd)[borrow_idx]

    wa = weighted_collateral_usd(ra, pa, la)
    wu = weighted_collateral_usd(ru, pu, lu)
    wd = weighted_collateral_usd(rd, pd, ld)
    total_collateral = wa + wu + wd

    da = debt_usd(ba, pa)
    du = debt_usd(bu, pu)
    dd = debt_usd(bd, pd)
    total_debt = da + du + dd

    nb = new_borrow_usd(borrow_amount, bp)
    lhs = total_debt + nb
    ok = lhs <= total_collateral
    return {
        "weighted_aleo": wa,
        "weighted_usdcx": wu,
        "weighted_usad": wd,
        "total_collateral_usd": total_collateral,
        "debt_aleo_usd": da,
        "debt_usdcx_usd": du,
        "debt_usad_usd": dd,
        "total_debt_usd": total_debt,
        "new_borrow_usd": nb,
        "assert_lhs": lhs,
        "assert_ok": ok,
        "headroom_if_ok": total_collateral - lhs if ok else total_collateral - lhs,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json", type=str, help="Path to JSON scenario file")
    p.add_argument("--real-sup-aleo", type=int, default=0)
    p.add_argument("--real-sup-usdcx", type=int, default=0)
    p.add_argument("--real-sup-usad", type=int, default=0)
    p.add_argument("--real-bor-aleo", type=int, default=0)
    p.add_argument("--real-bor-usdcx", type=int, default=0)
    p.add_argument("--real-bor-usad", type=int, default=0)
    p.add_argument("--price-aleo", type=int, default=PRICE_SCALE)
    p.add_argument("--price-usdcx", type=int, default=PRICE_SCALE)
    p.add_argument("--price-usad", type=int, default=PRICE_SCALE)
    p.add_argument("--ltv-aleo", type=int, default=7500)
    p.add_argument("--ltv-usdcx", type=int, default=8500)
    p.add_argument("--ltv-usad", type=int, default=8500)
    p.add_argument("--borrow-asset", choices=("aleo", "usdcx", "usad"), default="aleo")
    p.add_argument("--borrow-amount", type=int, required=False, default=0)
    args = p.parse_args()

    if args.json:
        with open(args.json, encoding="utf-8") as f:
            data = json.load(f)
        rs = tuple(data["real_sup"][k] for k in ("aleo", "usdcx", "usad"))
        rb = tuple(data["real_bor"][k] for k in ("aleo", "usdcx", "usad"))
        pr = tuple(data["prices"][k] for k in ("aleo", "usdcx", "usad"))
        lt = tuple(data["ltvs"][k] for k in ("aleo", "usdcx", "usad"))
        bidx = {"aleo": 0, "usdcx": 1, "usad": 2}[data.get("borrow_asset", "aleo")]
        amt = int(data["borrow_amount"])
    else:
        rs = (args.real_sup_aleo, args.real_sup_usdcx, args.real_sup_usad)
        rb = (args.real_bor_aleo, args.real_bor_usdcx, args.real_bor_usad)
        pr = (args.price_aleo, args.price_usdcx, args.price_usad)
        lt = (args.ltv_aleo, args.ltv_usdcx, args.ltv_usad)
        bidx = {"aleo": 0, "usdcx": 1, "usad": 2}[args.borrow_asset]
        amt = args.borrow_amount

    if amt <= 0:
        print("borrow_amount must be > 0 unless using --json with borrow_amount", file=sys.stderr)
        sys.exit(2)

    out = check(rs, rb, pr, lt, bidx, amt)
    print(json.dumps(out, indent=2))
    sys.exit(0 if out["assert_ok"] else 1)


if __name__ == "__main__":
    main()
