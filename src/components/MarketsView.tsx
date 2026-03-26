'use client';

import { useEffect, useState } from 'react';
import {
  getLendingPoolState,
  getUsdcLendingPoolState,
  getUsadLendingPoolState,
  computeAleoPoolAPY,
  computeUsdcPoolAPY,
  computeUsadPoolAPY,
  getAssetPriceForProgram,
  LENDING_POOL_PROGRAM_ID,
  USDC_LENDING_POOL_PROGRAM_ID,
  USAD_LENDING_POOL_PROGRAM_ID,
} from '@/components/aleo/rpc';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { AssetBadge } from '@/components/ui/AssetBadge';

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

  const [vaultLoading, setVaultLoading] = useState<boolean>(true);
  const [vaultAleoBalance, setVaultAleoBalance] = useState<number>(0);
  const [vaultUsdcxBalance, setVaultUsdcxBalance] = useState<number>(0);
  const [vaultUsadBalance, setVaultUsadBalance] = useState<number>(0);
  const [vaultPricesLoading, setVaultPricesLoading] = useState<boolean>(true);
  const [priceUsdAleo, setPriceUsdAleo] = useState<number | null>(null);
  const [priceUsdUsdcx, setPriceUsdUsdcx] = useState<number | null>(null);
  const [priceUsdUsad, setPriceUsdUsad] = useState<number | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    setVaultLoading(true);
    setVaultPricesLoading(true);

    (async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error('NEXT_PUBLIC_BACKEND_URL missing');

        const [resp, pA, pU, pD] = await Promise.all([
          fetch(`${backendUrl}/vault-balances`),
          getAssetPriceForProgram(LENDING_POOL_PROGRAM_ID, '0field'),
          getAssetPriceForProgram(USDC_LENDING_POOL_PROGRAM_ID, '1field'),
          getAssetPriceForProgram(USAD_LENDING_POOL_PROGRAM_ID, '2field'),
        ]);
        if (!resp.ok) throw new Error(`vault-balances HTTP ${resp.status}`);
        const data = await resp.json();

        const aleo = Number(data?.human?.aleo ?? '0');
        const usdcx = Number(data?.human?.usdcx ?? '0');
        const usad = Number(data?.human?.usad ?? '0');

        if (cancelled) return;
        setVaultAleoBalance(Number.isFinite(aleo) ? aleo : 0);
        setVaultUsdcxBalance(Number.isFinite(usdcx) ? usdcx : 0);
        setVaultUsadBalance(Number.isFinite(usad) ? usad : 0);

        // Prices are in PRICE_SCALE units (1e6 => $1.000000)
        const toUsd = (raw: number | null) => (raw == null ? null : raw / 1_000_000);
        setPriceUsdAleo(toUsd(pA));
        setPriceUsdUsdcx(toUsd(pU));
        setPriceUsdUsad(toUsd(pD));
      } catch (e) {
        console.warn('Markets: failed to fetch vault balances:', e);
      } finally {
        if (!cancelled) {
          setVaultLoading(false);
          setVaultPricesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const aleoAvailable = Math.max(0, aleoTotalSupplied - aleoTotalBorrowed);
  const usdcAvailable = Math.max(0, usdcTotalSupplied - usdcTotalBorrowed);
  const fmtVault = (bal: number, priceUsd: number | null) => {
    if (vaultLoading || vaultPricesLoading) return '—';
    const usd = priceUsd == null ? null : bal * priceUsd;
    return usd == null ? bal.toFixed(4) : `${bal.toFixed(4)} (~$${usd.toFixed(2)})`;
  };

  return (
    <div className="flex justify-center pt-16 sm:pt-20">
      <div className="w-full max-w-6xl space-y-6 px-4">
        <SectionHeader
          title="Markets"
          subtitle="Unified pool telemetry for ALEO, USDCx, and USAD. Public data."
          badge="Aleo Testnet"
          rightSlot={<StatusChip label="Live on-chain metrics" variant="info" />}
        />

        <div className="privacy-card rounded-xl bg-base-200 border border-base-300 overflow-hidden">
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
              Supply and borrow APY, total supplied, total borrowed, available liquidity, and vault wallet balance.
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
                      Vault balance
                      <InfoTooltip tip="Backend vault wallet public balance for this asset (from token program mappings). Not pool liquidity." />
                    </th>
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
                    <td><AssetBadge asset="ALEO" compact /></td>
                    <td>{aleoTotalSupplied.toFixed(4)}</td>
                    <td>{aleoTotalBorrowed.toFixed(4)}</td>
                    <td>{aleoAvailable.toFixed(4)}</td>
                    <td>{fmtVault(vaultAleoBalance, priceUsdAleo)}</td>
                    <td className="text-success">{aleoSupplyAPY.toFixed(2)}%</td>
                    <td className="text-warning">{aleoBorrowAPY.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-base-300">
                    <td><AssetBadge asset="USDCx" compact /></td>
                    <td>{usdcTotalSupplied.toFixed(4)}</td>
                    <td>{usdcTotalBorrowed.toFixed(4)}</td>
                    <td>{usdcAvailable.toFixed(4)}</td>
                    <td>{fmtVault(vaultUsdcxBalance, priceUsdUsdcx)}</td>
                    <td className="text-success">{usdcSupplyAPY.toFixed(2)}%</td>
                    <td className="text-warning">{usdcBorrowAPY.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-base-300">
                    <td><AssetBadge asset="USAD" compact /></td>
                    <td>{usadTotalSupplied.toFixed(4)}</td>
                    <td>{usadTotalBorrowed.toFixed(4)}</td>
                    <td>{Math.max(0, usadTotalSupplied - usadTotalBorrowed).toFixed(4)}</td>
                    <td>{fmtVault(vaultUsadBalance, priceUsdUsad)}</td>
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

