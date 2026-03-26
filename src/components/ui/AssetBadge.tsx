'use client';

type AssetSymbol = 'ALEO' | 'USDCx' | 'USAD';

type AssetBadgeProps = {
  asset: AssetSymbol;
  compact?: boolean;
};

const LOGO_SRC: Record<AssetSymbol, string> = {
  ALEO: '/logos/aleo.svg',
  USDCx: '/logos/usdc.svg',
  USAD: '/logos/usad.svg',
};

export function AssetBadge({ asset, compact = false }: AssetBadgeProps) {
  const tone =
    asset === 'ALEO'
      ? 'text-cyan-300 border-cyan-400/35 bg-cyan-400/10'
      : asset === 'USDCx'
        ? 'text-blue-300 border-blue-400/35 bg-blue-400/10'
        : 'text-emerald-300 border-emerald-400/35 bg-emerald-400/10';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${tone} ${
        compact ? 'gap-1.5' : 'gap-2'
      }`}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/35 bg-base-100/80">
        <img src={LOGO_SRC[asset]} alt={`${asset} logo`} className="h-3.5 w-3.5 object-contain" />
      </span>
      <span>{asset}</span>
    </span>
  );
}

