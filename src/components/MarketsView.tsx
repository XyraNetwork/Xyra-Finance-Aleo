'use client';

import { useEffect, useState } from 'react';
import {
  getLendingPoolState,
  getUsdcLendingPoolState,
  getUsadLendingPoolState,
  computeAleoPoolAPY,
  computeUsdcPoolAPY,
  computeUsadPoolAPY,
} from '@/components/aleo/rpc';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

const SCALE = 1_000_000;

export function MarketsView() {
  const [loading, setLoading] = useState(true);
  const [aleoTotalSupplied, setAleoTotalSupplied] = useState<number>(0);
  const [aleoTotalBorrowed, setAleoTotalBorrowed] = useState<number>(0);
  const [aleoSupplyAPY, setAleoSupplyAPY] = useState<number>(0);
  const [aleoBorrowAPY, setAleoBorrowAPY] = useState<number>(0);
  const [usdcTotalSupplied, setUsdcTotalSupplied] = useState<number>(0);
  const [usdcTotalBorrowed, setUsdcTotalBorrowed] = useState<number>(0);
  const [usdcSupplyAPY, setUsdcSupplyAPY] = useState<number>(0);
  const [usdcBorrowAPY, setUsdcBorrowAPY] = useState<number>(0);

  const [usadTotalSupplied, setUsadTotalSupplied] = useState<number>(0);
  const [usadTotalBorrowed, setUsadTotalBorrowed] = useState<number>(0);
  const [usadSupplyAPY, setUsadSupplyAPY] = useState<number>(0);
  const [usadBorrowAPY, setUsadBorrowAPY] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [aleoState, usdcState, usadState] = await Promise.all([
          getLendingPoolState(),
          getUsdcLendingPoolState(),
          // USAD pool state
          getUsadLendingPoolState(),
        ]);
        if (cancelled) return;

        const tsAleo = Number(aleoState.totalSupplied ?? 0) || 0;
        const tbAleo = Number(aleoState.totalBorrowed ?? 0) || 0;
        const tsUsdc = Number(usdcState.totalSupplied ?? 0) || 0;
        const tbUsdc = Number(usdcState.totalBorrowed ?? 0) || 0;
        const tsUsad = Number(usadState.totalSupplied ?? 0) || 0;
        const tbUsad = Number(usadState.totalBorrowed ?? 0) || 0;

        const { supplyAPY: sApyAleo, borrowAPY: bApyAleo } = computeAleoPoolAPY(tsAleo, tbAleo);
        const { supplyAPY: sApyUsdc, borrowAPY: bApyUsdc } = computeUsdcPoolAPY(tsUsdc, tbUsdc);
        const { supplyAPY: sApyUsad, borrowAPY: bApyUsad } = computeUsadPoolAPY(tsUsad, tbUsad);

        setAleoTotalSupplied(tsAleo / SCALE);
        setAleoTotalBorrowed(tbAleo / SCALE);
        setAleoSupplyAPY(sApyAleo * 100);
        setAleoBorrowAPY(bApyAleo * 100);

        setUsdcTotalSupplied(tsUsdc / SCALE);
        setUsdcTotalBorrowed(tbUsdc / SCALE);
        setUsdcSupplyAPY(sApyUsdc * 100);
        setUsdcBorrowAPY(bApyUsdc * 100);

        setUsadTotalSupplied(tsUsad / SCALE);
        setUsadTotalBorrowed(tbUsad / SCALE);
        setUsadSupplyAPY(sApyUsad * 100);
        setUsadBorrowAPY(bApyUsad * 100);
      } catch (e) {
        console.error('Markets: failed to fetch pool state', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const aleoAvailable = Math.max(0, aleoTotalSupplied - aleoTotalBorrowed);
  const usdcAvailable = Math.max(0, usdcTotalSupplied - usdcTotalBorrowed);

  return (
    <div className="flex justify-center pt-16 sm:pt-20">
      <div className="w-full max-w-6xl space-y-6 px-4">
        <div className="rounded-xl bg-base-200 p-5 border border-base-300">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-xl font-bold">Markets</h1>
            <span className="badge badge-sm badge-outline">Aleo Testnet</span>
          </div>
          <p className="text-sm text-base-content/70">
            Lending markets with the largest selection of assets. Public data.
          </p>
        </div>

        <div className="rounded-xl bg-base-200 border border-base-300 overflow-hidden">
          <div className="p-4 border-b border-base-300">
            <h2 className="text-lg font-semibold">
              Reserve overview
              {process.env.NEXT_PUBLIC_VAULT_ADDRESS?.trim() ? (
                <>
                  {' '}
                  (
                  <a
                    href={`https://testnet.explorer.provable.com/address/${process.env.NEXT_PUBLIC_VAULT_ADDRESS.trim()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary"
                  >
                    Vault
                  </a>
                  )
                </>
              ) : null}
            </h2>
            <p className="text-xs text-base-content/70 mt-0.5">
              Supply and borrow APY, total supplied, total borrowed, and available liquidity.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead>
                  <tr className="border-base-300">
                    <th className="bg-base-300/50 font-semibold">Asset</th>
                    <th className="bg-base-300/50 font-semibold">Total supplied</th>
                    <th className="bg-base-300/50 font-semibold">Total borrowed</th>
                    <th className="bg-base-300/50 font-semibold">Available</th>
                    <th className="bg-base-300/50 font-semibold">
                      Supply APY
                      <InfoTooltip
                        tip="Supply APY is the yearly interest earned by suppliers to this pool. It depends on utilization (total borrowed divided by total supplied) and a reserve factor that keeps some interest in the protocol."
                      />
                    </th>
                    <th className="bg-base-300/50 font-semibold">
                      Borrow APY
                      <InfoTooltip
                        tip="Borrow APY is the yearly interest paid by borrowers. It increases as pool utilization (total borrowed divided by total supplied) goes up."
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-base-300">
                    <td>
                      <span className="font-medium">ALEO</span>
                    </td>
                    <td>{aleoTotalSupplied.toFixed(4)}</td>
                    <td>{aleoTotalBorrowed.toFixed(4)}</td>
                    <td>{aleoAvailable.toFixed(4)}</td>
                    <td className="text-success">{aleoSupplyAPY.toFixed(2)}%</td>
                    <td className="text-warning">{aleoBorrowAPY.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-base-300">
                    <td>
                      <span className="font-medium">USDCx</span>
                    </td>
                    <td>{usdcTotalSupplied.toFixed(4)}</td>
                    <td>{usdcTotalBorrowed.toFixed(4)}</td>
                    <td>{usdcAvailable.toFixed(4)}</td>
                    <td className="text-success">{usdcSupplyAPY.toFixed(2)}%</td>
                    <td className="text-warning">{usdcBorrowAPY.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-base-300">
                    <td>
                      <span className="font-medium">USAD</span>
                    </td>
                    <td>{usadTotalSupplied.toFixed(4)}</td>
                    <td>{usadTotalBorrowed.toFixed(4)}</td>
                    <td>{Math.max(0, usadTotalSupplied - usadTotalBorrowed).toFixed(4)}</td>
                    <td className="text-success">{usadSupplyAPY.toFixed(2)}%</td>
                    <td className="text-warning">{usadBorrowAPY.toFixed(2)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

