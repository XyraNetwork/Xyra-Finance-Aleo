'use client';

import { useEffect, useState } from 'react';
import {
  getLendingPoolState,
  getUsdcLendingPoolState,
  getUsadLendingPoolState,
  getPoolApyFractionsFromChain,
  resolvePoolApyDisplay,
  getAssetPriceForProgram,
  getLatestBlockHeight,
  fetchAvailableLiquidityMicro,
  fetchVaultHumanBalancesFromBackend,
  LENDING_POOL_PROGRAM_ID,
  USDC_LENDING_POOL_PROGRAM_ID,
  USAD_LENDING_POOL_PROGRAM_ID,
} from '@/components/aleo/rpc';
import { CURRENT_RPC_URL } from '@/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

const SCALE = 1_000_000;

const customStyles = {
  glassPanel: {
    background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.4) 0%, rgba(3, 7, 18, 0.6) 100%)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
};

const FeatherIcon = ({ name, className = '', style = {} }: { name: string, className?: string, style?: React.CSSProperties }) => {
  const icons: Record<string, React.ReactNode> = {
    hexagon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
      </svg>
    ),
    activity: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    shield: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    'dollar-sign': (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  };
  return <>{icons[name] || null}</>;
};

const StatCard = ({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string | React.ReactNode;
  loading?: boolean;
}) => (
  <div style={customStyles.glassPanel} className="p-4 rounded-2xl border-white/5">
    <div className="text-[10px] text-slate-500 uppercase mb-1 font-mono">{label}</div>
    {loading ? (
      <div className="h-6 w-24 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
    ) : (
      <div className="text-lg font-bold text-white font-mono">{value}</div>
    )}
  </div>
);

function rpcHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0] || url;
  }
}

const MarketRow = ({ market, isLast }: { market: any, isLast: boolean }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      className={`${!isLast ? 'border-b border-white/5' : ''}`}
      style={{
        transition: 'all 0.2s ease',
        background: hovered ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
        borderColor: hovered ? 'rgba(6, 182, 212, 0.2)' : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-8 py-8">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl ${market.iconBg} border ${market.iconBorder} flex items-center justify-center p-2`}>
            {market.image ? (
              <img src={market.image} alt={market.name} className="w-full h-full object-contain" />
            ) : (
              <FeatherIcon name={market.icon} className={`${market.iconColor} w-full h-full`} />
            )}
          </div>
          <div>
            <div className="text-white font-bold">{market.name}</div>
            <div className="text-[10px] text-slate-500 font-mono">{market.subtitle}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-8 text-right font-mono text-sm text-slate-300">
        {market.supplied} <span className="text-[10px] text-slate-500">{market.suppliedUnit}</span>
      </td>
      <td className="px-6 py-8 text-right font-mono text-sm text-slate-300">
        {market.borrowed} <span className="text-[10px] text-slate-500">{market.borrowedUnit}</span>
      </td>
      <td className="px-6 py-8 text-right font-mono text-sm text-slate-300">
        {market.available} <span className="text-[10px] text-slate-500">{market.availableUnit}</span>
      </td>
      <td className="px-6 py-8 text-right font-mono text-sm text-slate-300">{market.vault}</td>
      <td className="px-6 py-8 text-right font-mono text-base font-bold text-cyan-400">{market.supplyApy}</td>
      <td className="px-8 py-8 text-right font-mono text-base font-bold text-indigo-400">{market.borrowApy}</td>
    </tr>
  );
};

const MobileMarketCard = ({ market }: { market: any }) => (
  <div style={customStyles.glassPanel} className="rounded-2xl border border-white/5 p-4">
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-10 h-10 rounded-xl ${market.iconBg} border ${market.iconBorder} flex items-center justify-center p-2`}>
        {market.image ? (
          <img src={market.image} alt={market.name} className="w-full h-full object-contain" />
        ) : (
          <FeatherIcon name={market.icon} className={`${market.iconColor} w-full h-full`} />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-white font-bold">{market.name}</div>
        <div className="text-[10px] text-slate-500 font-mono">{market.subtitle}</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
      <div>
        <div className="text-slate-500 uppercase tracking-wider mb-1">Supplied</div>
        <div className="text-slate-200">{market.supplied} <span className="text-slate-500">{market.suppliedUnit}</span></div>
      </div>
      <div>
        <div className="text-slate-500 uppercase tracking-wider mb-1">Borrowed</div>
        <div className="text-slate-200">{market.borrowed} <span className="text-slate-500">{market.borrowedUnit}</span></div>
      </div>
      <div>
        <div className="text-slate-500 uppercase tracking-wider mb-1">Available</div>
        <div className="text-slate-200">{market.available} <span className="text-slate-500">{market.availableUnit}</span></div>
      </div>
      <div>
        <div className="text-slate-500 uppercase tracking-wider mb-1">Vault</div>
        <div className="text-slate-200 break-words">{market.vault}</div>
      </div>
      <div>
        <div className="text-slate-500 uppercase tracking-wider mb-1">Supply APY</div>
        <div className="text-cyan-400 font-bold">{market.supplyApy}</div>
      </div>
      <div>
        <div className="text-slate-500 uppercase tracking-wider mb-1">Borrow APY</div>
        <div className="text-indigo-400 font-bold">{market.borrowApy}</div>
      </div>
    </div>
  </div>
);

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

  /** Human units from `available_liquidity` mapping (what withdraw/borrow finalize use per asset). */
  const [onChainAvailHuman, setOnChainAvailHuman] = useState<{ aleo: number; usdc: number; usad: number }>({
    aleo: 0,
    usdc: 0,
    usad: 0,
  });

  const [vaultLoading, setVaultLoading] = useState<boolean>(true);
  const [vaultAleoBalance, setVaultAleoBalance] = useState<number>(0);
  const [vaultUsdcxBalance, setVaultUsdcxBalance] = useState<number>(0);
  const [vaultUsadBalance, setVaultUsadBalance] = useState<number>(0);
  const [vaultPricesLoading, setVaultPricesLoading] = useState<boolean>(true);
  const [priceUsdAleo, setPriceUsdAleo] = useState<number | null>(null);
  const [priceUsdUsdcx, setPriceUsdUsdcx] = useState<number | null>(null);
  const [priceUsdUsad, setPriceUsdUsad] = useState<number | null>(null);

  const [networkBlockHeight, setNetworkBlockHeight] = useState<number | null>(null);
  const [networkRpcStatus, setNetworkRpcStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [aleoState, usdcState, usadState, aleoAvailMicro, usdcAvailMicro, usadAvailMicro] =
          await Promise.all([
            getLendingPoolState(),
            getUsdcLendingPoolState(),
            getUsadLendingPoolState(),
            fetchAvailableLiquidityMicro(LENDING_POOL_PROGRAM_ID, '0field'),
            fetchAvailableLiquidityMicro(USDC_LENDING_POOL_PROGRAM_ID, '1field'),
            fetchAvailableLiquidityMicro(USAD_LENDING_POOL_PROGRAM_ID, '2field'),
          ]);
        if (cancelled) return;

        const tsAleo = Number(aleoState.totalSupplied ?? 0) || 0;
        const tbAleo = Number(aleoState.totalBorrowed ?? 0) || 0;
        const tsUsdc = Number(usdcState.totalSupplied ?? 0) || 0;
        const tbUsdc = Number(usdcState.totalBorrowed ?? 0) || 0;
        const tsUsad = Number(usadState.totalSupplied ?? 0) || 0;
        const tbUsad = Number(usadState.totalBorrowed ?? 0) || 0;

        const aleoFallbackAvail = Math.max(0, tsAleo - tbAleo) / SCALE;
        const usdcFallbackAvail = Math.max(0, tsUsdc - tbUsdc) / SCALE;
        const usadFallbackAvail = Math.max(0, tsUsad - tbUsad) / SCALE;
        setOnChainAvailHuman({
          aleo: aleoAvailMicro != null ? Number(aleoAvailMicro) / SCALE : aleoFallbackAvail,
          usdc: usdcAvailMicro != null ? Number(usdcAvailMicro) / SCALE : usdcFallbackAvail,
          usad: usadAvailMicro != null ? Number(usadAvailMicro) / SCALE : usadFallbackAvail,
        });

        const [chainAleo, chainUsdc, chainUsad] = await Promise.all([
          getPoolApyFractionsFromChain(LENDING_POOL_PROGRAM_ID, '0field'),
          getPoolApyFractionsFromChain(USDC_LENDING_POOL_PROGRAM_ID, '1field'),
          getPoolApyFractionsFromChain(USAD_LENDING_POOL_PROGRAM_ID, '2field'),
        ]);
        const { supplyAPY: sApyAleo, borrowAPY: bApyAleo } = resolvePoolApyDisplay(tsAleo, tbAleo, chainAleo);
        const { supplyAPY: sApyUsdc, borrowAPY: bApyUsdc } = resolvePoolApyDisplay(tsUsdc, tbUsdc, chainUsdc);
        const { supplyAPY: sApyUsad, borrowAPY: bApyUsad } = resolvePoolApyDisplay(tsUsad, tbUsad, chainUsad);

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
        if (!process.env.NEXT_PUBLIC_BACKEND_URL?.trim()) {
          throw new Error('NEXT_PUBLIC_BACKEND_URL missing');
        }

        const [vaultHum, pA, pU, pD] = await Promise.all([
          fetchVaultHumanBalancesFromBackend(),
          getAssetPriceForProgram(LENDING_POOL_PROGRAM_ID, '0field'),
          getAssetPriceForProgram(USDC_LENDING_POOL_PROGRAM_ID, '1field'),
          getAssetPriceForProgram(USAD_LENDING_POOL_PROGRAM_ID, '2field'),
        ]);

        if (cancelled) return;
        setVaultAleoBalance(vaultHum && Number.isFinite(vaultHum.aleo) ? vaultHum.aleo : 0);
        setVaultUsdcxBalance(vaultHum && Number.isFinite(vaultHum.usdcx) ? vaultHum.usdcx : 0);
        setVaultUsadBalance(vaultHum && Number.isFinite(vaultHum.usad) ? vaultHum.usad : 0);

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

  /** Live RPC: latest block height + status (was never wired — UI stayed on "Checking…"). */
  useEffect(() => {
    let cancelled = false;
    const rpcUrl = CURRENT_RPC_URL;

    const refresh = async () => {
      console.info('[MarketsView][network] Polling chain height…', { rpcUrl });
      try {
        const h = await getLatestBlockHeight();
        if (cancelled) return;
        console.info('[MarketsView][network] Height result', { height: h, ok: h > 0 });
        if (h > 0) {
          setNetworkBlockHeight(h);
          setNetworkRpcStatus('ok');
        } else {
          setNetworkBlockHeight(null);
          setNetworkRpcStatus('error');
          console.warn('[MarketsView][network] Invalid height (0). Check console for [getLatestBlockHeight] logs.');
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[MarketsView][network] Unexpected error', e);
          setNetworkBlockHeight(null);
          setNetworkRpcStatus('error');
        }
      }
    };

    void refresh();
    const interval = setInterval(refresh, 45_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const aleoAvailable = onChainAvailHuman.aleo;
  const usdcAvailable = onChainAvailHuman.usdc;
  const usadAvailable = onChainAvailHuman.usad;
  const fmtVault = (bal: number, priceUsd: number | null) => {
    if (vaultLoading || vaultPricesLoading) return '—';
    const usd = priceUsd == null ? null : bal * priceUsd;
    return usd == null ? bal.toFixed(2) : `${bal.toFixed(2)} (~$${usd.toFixed(2)})`;
  };

  const formatLargeUsd = (val: number | null) => {
    if (vaultPricesLoading || val == null) return '—';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
    return `$${val.toFixed(2)}`;
  };

  const tvl = aleoTotalSupplied * (priceUsdAleo ?? 0) + usdcTotalSupplied * (priceUsdUsdcx ?? 0) + usadTotalSupplied * (priceUsdUsad ?? 0);
  const totalBorrowedUsd = aleoTotalBorrowed * (priceUsdAleo ?? 0) + usdcTotalBorrowed * (priceUsdUsdcx ?? 0) + usadTotalBorrowed * (priceUsdUsad ?? 0);
  const statsLoading = loading || vaultLoading || vaultPricesLoading;

  const marketsData = [
    {
      id: 1,
      icon: 'hexagon',
      image: '/logos/aleo-dark.svg',
      iconBg: 'bg-cyan-500/10',
      iconBorder: 'border-cyan-500/20',
      iconColor: 'text-cyan-400',
      name: 'ALEO',
      subtitle: 'Native Privacy Token',
      supplied: aleoTotalSupplied.toFixed(2),
      suppliedUnit: 'ALEO',
      borrowed: aleoTotalBorrowed.toFixed(2),
      borrowedUnit: 'ALEO',
      available: aleoAvailable.toFixed(2),
      availableUnit: 'ALEO',
      vault: fmtVault(vaultAleoBalance, priceUsdAleo),
      supplyApy: `${aleoSupplyAPY.toFixed(2)}%`,
      borrowApy: `${aleoBorrowAPY.toFixed(2)}%`,
    },
    {
      id: 2,
      icon: 'dollar-sign',
      image: '/logos/usdc.svg',
      iconBg: 'bg-indigo-500/10',
      iconBorder: 'border-indigo-500/20',
      iconColor: 'text-indigo-400',
      name: 'USDCx',
      subtitle: 'Shielded USDC Wrapper',
      supplied: usdcTotalSupplied.toFixed(2),
      suppliedUnit: 'USDCx',
      borrowed: usdcTotalBorrowed.toFixed(2),
      borrowedUnit: 'USDCx',
      available: usdcAvailable.toFixed(2),
      availableUnit: 'USDCx',
      vault: fmtVault(vaultUsdcxBalance, priceUsdUsdcx),
      supplyApy: `${usdcSupplyAPY.toFixed(2)}%`,
      borrowApy: `${usdcBorrowAPY.toFixed(2)}%`,
    },
    {
      id: 3,
      icon: 'shield',
      image: '/logos/usad.svg',
      iconBg: 'bg-purple-500/10',
      iconBorder: 'border-purple-500/20',
      iconColor: 'text-purple-400',
      name: 'USAD',
      subtitle: 'Algorithmic Dark Stable',
      supplied: usadTotalSupplied.toFixed(2),
      suppliedUnit: 'USAD',
      borrowed: usadTotalBorrowed.toFixed(2),
      borrowedUnit: 'USAD',
      available: usadAvailable.toFixed(2),
      availableUnit: 'USAD',
      vault: fmtVault(vaultUsadBalance, priceUsdUsad),
      supplyApy: `${usadSupplyAPY.toFixed(2)}%`,
      borrowApy: `${usadBorrowAPY.toFixed(2)}%`,
    },
  ];

  return (
    <main className="relative z-10 pt-4 pb-20 max-w-[1440px] mx-auto px-4 sm:px-8">
      <header className="mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
              <div
                style={customStyles.glassPanel}
                className="px-3 py-1 rounded-full border border-cyan-500/30 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest">Aleo Testnet</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                <FeatherIcon name="activity" className="w-3 h-3" />
                Live on-chain metrics
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>Markets</h1>
            <p className="text-slate-400 font-light max-w-xl break-words">
              Unified pool telemetry across the Aleo dark pool. Real-time reserve analytics for shielded liquidity providers and borrowers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 font-mono w-full md:w-auto">
            <StatCard label="Total Value Locked" value={formatLargeUsd(tvl)} loading={statsLoading} />
            <StatCard label="Total Borrowed" value={formatLargeUsd(totalBorrowedUsd)} loading={statsLoading} />
            <div className="hidden md:block">
              <StatCard label="Total Assets" value="3" loading={statsLoading} />
            </div>
          </div>
        </div>
      </header>

      <div>
        <div className="md:hidden space-y-4">
          {loading
            ? [0, 1, 2].map((i) => (
                <div key={i} style={customStyles.glassPanel} className="rounded-2xl border border-white/5 p-4">
                  <div className="h-5 w-24 rounded animate-pulse mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="h-10 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    ))}
                  </div>
                </div>
              ))
            : marketsData.map((market) => (
                <MobileMarketCard key={market.id} market={market} />
              ))}
        </div>

        <div style={customStyles.glassPanel} className="hidden md:block rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-8 py-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Asset</th>
                  <th className="px-6 py-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-right">Total Supplied</th>
                  <th className="px-6 py-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-right">Total Borrowed</th>
                  <th className="px-6 py-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-right">
                    Available{' '}
                    <InfoTooltip tip="On-chain `available_liquidity` (program accounting). The app’s withdraw/borrow MAX also clamps to treasury `/vault-balances` when NEXT_PUBLIC_BACKEND_URL is set — cross-asset payouts follow that operational liquidity." />
                  </th>
                  <th className="px-6 py-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-right">
                    Vault Balance{' '}
                    <InfoTooltip tip="Backend treasury wallet balance (public mapping read). Used to settle payouts after txs finalize. Can be higher than “Available” while the program’s internal liquidity counter is lower — native ALEO withdraws are limited by Available, not this cell." />
                  </th>
                  <th className="px-6 py-6 text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest text-right">Supply APY</th>
                  <th className="px-8 py-6 text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest text-right">Borrow APY</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [0, 1, 2].map((i) => (
                      <tr key={i} className={`${i !== 2 ? 'border-b border-white/5' : ''}`}>
                        <td className="px-8 py-8">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
                            <div className="space-y-2">
                              <div className="h-4 w-16 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
                              <div className="h-3 w-24 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            </div>
                          </div>
                        </td>
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <td key={idx} className="px-6 py-8 text-right">
                            <div className="h-4 w-20 ml-auto rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.10)' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : marketsData.map((market, index) => (
                      <MarketRow key={market.id} market={market} isLast={index === marketsData.length - 1} />
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div style={customStyles.glassPanel} className="p-8 rounded-3xl border-white/5">
          <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <FeatherIcon name="shield" className="w-4 h-4 text-cyan-400" />
            Privacy Guarantee
          </h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            All market metrics above represent aggregate pool data. Individual position sizes, health factors, and liquidation thresholds are entirely shielded via zero-knowledge proofs on the Aleo network. Solvency is mathematically proven without data exposure.
          </p>
        </div>
        <div style={customStyles.glassPanel} className="p-8 rounded-3xl border-white/5 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-4 gap-3">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Network Status</span>
            <span
              className={`text-xs font-mono shrink-0 ${
                networkRpcStatus === 'ok'
                  ? 'text-emerald-400'
                  : networkRpcStatus === 'loading'
                    ? 'text-slate-400'
                    : 'text-amber-400'
              }`}
            >
              {networkRpcStatus === 'ok'
                ? 'Operational'
                : networkRpcStatus === 'loading'
                  ? 'Checking…'
                  : 'Unavailable'}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                networkRpcStatus === 'ok'
                  ? 'w-full bg-gradient-to-r from-cyan-500 to-indigo-500'
                  : networkRpcStatus === 'loading'
                    ? 'w-2/3 animate-pulse bg-gradient-to-r from-cyan-500/60 to-indigo-500/60'
                    : 'w-1/3 bg-amber-500/70'
              }`}
            />
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 text-[10px] font-mono text-slate-500">
            <span>
              Block:{' '}
              <span className="text-slate-300 tabular-nums">
                {networkRpcStatus === 'loading' && networkBlockHeight == null
                  ? '…'
                  : networkBlockHeight != null
                    ? `#${networkBlockHeight.toLocaleString()}`
                    : '—'}
              </span>
            </span>
            <span className="sm:text-right break-all" title={CURRENT_RPC_URL}>
              RPC:{' '}
              <span className="text-slate-400">{rpcHostLabel(CURRENT_RPC_URL)}</span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

