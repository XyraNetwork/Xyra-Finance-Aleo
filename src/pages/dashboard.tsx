import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import type { NextPageWithLayout } from '@/types';
import Layout from '@/layouts/_layout';
import Link from 'next/link';
import { MarketsView } from '@/components/MarketsView';
import DocsPage from '@/pages/docs';
import { useDashboardView } from '@/contexts/DashboardViewContext';
import Button from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { PrivateDataColumnHeader } from '@/components/ui/PrivateDataColumnHeader';
import { PrivateActionButton } from '@/components/ui/PrivateActionButton';
import { AssetBadge } from '@/components/ui/AssetBadge';
import { StatCard } from '@/components/ui/StatCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Network } from '@provablehq/aleo-types';
import {
  getLendingPoolState,
  getUsdcLendingPoolState,
  lendingDeposit,
  lendingBorrow,
  lendingRepay,
  lendingWithdraw,
  lendingDepositUsdc,
  lendingBorrowUsdc,
  lendingRepayUsdc,
  lendingWithdrawUsdc,
  getSuitableUsdcTokenRecord,
  getPrivateUsdcBalance,
  lendingDepositUsad,
  lendingBorrowUsad,
  lendingRepayUsad,
  lendingWithdrawUsad,
  getSuitableUsadTokenRecord,
  getPrivateUsadBalance,
  lendingAccrueInterest,
  lendingAccrueInterestUsdc,
  lendingAccrueInterestUsad,
  lendingFlashOpen,
  lendingFlashSettleWithCredits,
  lendingFlashSettleWithUsdcx,
  lendingFlashSettleWithUsad,
  fetchAvailableLiquidityMicro,
  type FlashLendingAssetId,
  lendingMintPositionMigrationNote,
  getPositionNoteSchemaFromChain,
  POSITION_NOTE_SCHEMA_ON_CHAIN_V2,
  getLiquidationPreviewAleo,
  getSelfLiquidationUiLimits,
  aleoFlashFeeMicro,
  ALEO_FLASH_PREMIUM_BPS,
  debugAllRecords,
  LENDING_POOL_PROGRAM_ID,
  USDC_LENDING_POOL_PROGRAM_ID,
  USAD_LENDING_POOL_PROGRAM_ID,
  getPoolApyFractionsFromChain,
  resolvePoolApyDisplay,
  getAleoPoolUserEffectivePosition,
  getPrivateCreditsBalance,
  getUsadLendingPoolState,
  getAssetPriceForProgram,
  getAggregatedCrossCollateralBorrowCapsFromWallet,
  getAggregatedCrossCollateralWithdrawCapsFromWallet,
  fetchVaultHumanBalancesFromBackend,
  floorTokenMicroToDisplayDecimals,
  parseLatestLendingPositionScaled,
  lendingOpenLendingAccount,
  lendingSelfLiquidateDebtCredits,
  createTestCredits,
  depositTestReal,
  logAleoTxExplorer,
  ALEO_TESTNET_TX_EXPLORER,
  type CrossCollateralChainCaps,
  type CrossCollateralWithdrawCaps,
  type LendingPositionScaled,
  type SelfLiquidationUiLimits,
} from '@/components/aleo/rpc';
import { frontendLogger } from '@/utils/logger';
import { privacyLog, privacyWarn } from '@/utils/privacyLog';
import { CURRENT_NETWORK } from '@/types';
import { getSupabaseBrowserClient } from '@/utils/supabase/client';
import {
  summarizeLendingRecordsForMigration,
  describeOnChainSchemaVersion,
  type MigrationRecordSummary,
} from '@/lib/migration/privateRecordMigration';

// Frontend app environment: 'dev' or 'prod' (default to dev for non-production NODE_ENV)
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const isDevAppEnv = APP_ENV ? APP_ENV === 'dev' : process.env.NODE_ENV !== 'production';
/** Sprint 2: Flash tab panel for `mint_position_migration_note` + migration readout. */
const SHOW_SPRINT2_MIGRATION_UI = process.env.NEXT_PUBLIC_SHOW_SPRINT2_MIGRATION_UI === 'true';

/** Withdraw MAX in UI: floor to this many decimal places (same style as borrow/repay inputs). */
const WITHDRAW_MAX_DISPLAY_DECIMALS = 2;

const FLASH_SESSION_TERMINAL_STATUSES = new Set(['settled', 'expired', 'failed', 'cancelled']);

function isFlashSessionStatusActive(status: string): boolean {
  return !FLASH_SESSION_TERMINAL_STATUSES.has(String(status || '').toLowerCase());
}

function flashSessionStatusChipProps(status: string): {
  label: string;
  variant: 'neutral' | 'good' | 'warn' | 'danger' | 'info';
} {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'opened':
      return { label: 'Opened', variant: 'info' };
    case 'funding_pending':
      return { label: 'Funding pending', variant: 'warn' };
    case 'funded':
      return { label: 'Funded', variant: 'info' };
    case 'settle_pending':
      return { label: 'Settle pending', variant: 'warn' };
    case 'settled':
      return { label: 'Settled', variant: 'good' };
    case 'expired':
      return { label: 'Expired', variant: 'neutral' };
    case 'failed':
      return { label: 'Failed', variant: 'danger' };
    default: {
      const raw = String(status || '').trim();
      const label = raw
        ? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Unknown';
      return { label, variant: 'neutral' };
    }
  }
}

/** Rich console output when a pool tx is rejected / failed / dropped (helps debug repay). */
function logPoolTxRejected(
  poolLabel: string,
  status: string,
  txId: string,
  meta?: { action?: string; program?: string }
) {
  logAleoTxExplorer(`${poolLabel} tx ${status}`, txId);
  console.error(`[${poolLabel}] Transaction ${status}`, {
    txId,
    explorerUrl: `${ALEO_TESTNET_TX_EXPLORER}/${txId}`,
    action: meta?.action,
    program: meta?.program,
    hints:
      status.toLowerCase() === 'rejected'
        ? [
          meta?.action === 'borrow'
            ? 'Validator rejected borrow: usually new_borrow_usd > cross-collateral headroom (integer rounding), wrong program id, or stale UI — try Max (chain) or a slightly smaller amount; confirm on-chain asset_price / LTV.'
            : meta?.action === 'withdraw'
              ? 'Validator/wallet rejected withdraw: wrong `recordIndices` vs `requestRecords` order, stale oracle (`sup_idx`), or Shield spend auth (pass full record + fresh index). With **multiple** unspent `LendingPosition` notes, consolidate or use Max; cross-asset USDCx/USAD still needs treasury vault balance.'
              : 'Validator rejected: for repay, amount > accrued debt or bad Merkle proofs; for borrow, portfolio assert failed or program mismatch.',
          'Verify NEXT_PUBLIC_* pool id matches deployment; run accrue interest; refresh balances.',
        ]
        : undefined,
  });
}

function txHistoryTypeLabel(type: string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'deposit') return 'Deposit Tx';
  if (t === 'withdraw') return 'Withdraw Tx';
  if (t === 'borrow') return 'Borrow Tx';
  if (t === 'repay') return 'Repay Tx';
  if (t === 'flash_loan') return 'Flash Loan Tx';
  if (t === 'open_position') return 'Open Position Tx';
  if (t === 'self_liquidate_payout') return 'Self Liquidate Payout Tx';
  const words = t
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${words || 'Program'} Tx`;
}

function txHistoryTypeText(type: string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'flash_loan') return 'Flash Loan';
  if (t === 'open_position') return 'Open Position';
  if (t === 'self_liquidate_payout') return 'Self Liquidate Payout';
  return t
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Program';
}

function txHistoryAssetVaultLabel(asset: string): string {
  const a = String(asset || '').toLowerCase();
  if (a === 'usdcx') return 'USDCx';
  if (a === 'usad' || a === 'usadx') return 'USAD';
  if (a === 'aleo') return 'ALEO';
  return String(asset || 'Asset').toUpperCase();
}

/**
 * True if amount is positive and does not exceed max. Uses 1e6 micro-unit rounding so
 * UI strings / Max (toFixed(2)) match portfolio math from USD÷price (avoids only 1.60
 * working when displayed max is 1.61 due to float drift).
 */
function amountWithinMax(amount: number, max: number, slackMicro = 0): boolean {
  if (!Number.isFinite(amount) || !Number.isFinite(max)) return false;
  if (amount <= 0 || max < 0) return false;
  const SCALE = 1_000_000;
  return Math.round(amount * SCALE) <= Math.round(max * SCALE) + slackMicro;
}

/**
 * Merge mapping `getAleoPoolUserEffectivePosition` with wallet record aggregates (micro units).
 * `effectiveMicro === 0` is still a number, so `effective ?? wallet` incorrectly ignores receipts.
 */
function effectiveMicroOrWalletAggregate(
  effectiveMicro: number | null,
  walletMicroStr: string,
): number {
  const w = Number(walletMicroStr) || 0;
  const e = effectiveMicro;
  if (e != null && e > 0) return e;
  if (w > 0) return w;
  if (e != null) return e;
  return 0;
}

/** Prefer mapping `user_scaled_*` when RPC returns &gt; 0; else wallet receipts (mappings can lag or mis-read). */
function chainMicroOrWalletMicro(chainMicro: bigint | undefined, walletMicro: number): number {
  if (chainMicro != null && chainMicro > BigInt(0)) return Number(chainMicro);
  return walletMicro;
}

/** Temporary: extra micro-units in `amountWithinMax` for Borrow / Repay at Max (remove after testing). */
const BORROW_REPAY_MAX_TEST_SLACK_MICRO = 50;

/** Liquidation submit: tolerate float ↔ micro rounding vs on-chain preview. */
const LIQ_SUBMIT_SLACK_MICRO = 50;

/** Borrow / withdraw Max: 2-decimal floor so MAX and validation match `WITHDRAW_MAX_DISPLAY_DECIMALS` / chain micro floor. */
function borrowMaxInputAmount(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(Math.floor(max * 100) / 100, max);
}

/**
 * Floor to micro-units so `toFixed(2)` never rounds *above* the cap (e.g. 0.00735 → "0.01"), which
 * would fail `amountWithinMax` and keep Repay / Submit disabled after MAX.
 */
function floorAmountMicro(maxHuman: number): number {
  if (!Number.isFinite(maxHuman) || maxHuman <= 0) return 0;
  return Math.floor(maxHuman * 1_000_000) / 1_000_000;
}

function floorAmountMicroInputString(maxHuman: number): string {
  const n = floorAmountMicro(maxHuman);
  if (n <= 0) return '0';
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

/**
 * USD label for debt/collateral stats. Values in (0, $0.01) are "dust" — `toFixed(2)` shows $0.00
 * while Repay MAX in an asset can still be > 0; extra decimals avoid that mismatch.
 */
function formatUsdDebtLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  if (n < 0.01) return n.toFixed(4);
  return n.toFixed(2);
}

/** Cross-asset repay: value of `amountAsset` in USD must not exceed total portfolio debt (same rounding as amountWithinMax). */
function repayAmountAssetWithinTotalDebtUsd(
  amountAsset: number,
  priceUsd: number,
  totalDebtUsd: number,
): boolean {
  if (!Number.isFinite(amountAsset) || !Number.isFinite(priceUsd) || !Number.isFinite(totalDebtUsd)) return false;
  if (amountAsset <= 0 || priceUsd <= 0 || totalDebtUsd <= 0) return false;
  const payUsd = amountAsset * priceUsd;
  return amountWithinMax(payUsd, totalDebtUsd);
}

/** Transaction history: program tx + optional vault tx pills in one row */
function TxHistoryTrxPills({
  txId,
  explorerUrl,
  vaultExplorerUrl,
  type,
  asset,
  getProvableExplorerTxUrl,
}: {
  txId: string;
  explorerUrl: string | null;
  vaultExplorerUrl: string | null;
  type: string;
  asset: string;
  getProvableExplorerTxUrl: (id: string) => string;
}) {
  const programHref = (explorerUrl && explorerUrl.trim()) || getProvableExplorerTxUrl(txId);
  const needsVaultPayment =
    type === 'withdraw' ||
    type === 'borrow' ||
    type === 'flash_loan' ||
    type === 'self_liquidate_payout';
  const vaultAssetLabel = `${txHistoryAssetVaultLabel(asset)} Tx`;
  const firstLabel = txHistoryTypeLabel(type);

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 min-w-0 max-w-[320px]">
      <a
        href={programHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/[0.07] px-2 py-1 text-[11px] font-semibold tracking-wide text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-400/45 transition-colors"
        title="On-chain program transaction"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" className="shrink-0 opacity-90" fill="currentColor" aria-hidden>
          <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" />
        </svg>
        {firstLabel}
      </a>
      {vaultExplorerUrl ? (
        <a
          href={vaultExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-2 py-1 text-[11px] font-semibold tracking-wide text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/45 transition-colors"
          title="Vault transfer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" className="shrink-0 opacity-90" fill="currentColor" aria-hidden>
            <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm45.66-93.66-56-56a8,8,0,0,0-11.32,0l-24,24a8,8,0,0,0,11.32,11.32L120,132.69l50.34-50.35a8,8,0,0,0,0-11.32Z" />
          </svg>
          {vaultAssetLabel}
        </a>
      ) : needsVaultPayment ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/[0.06] px-2 py-1 text-[11px] font-semibold tracking-wide text-amber-800 dark:text-amber-300 dark:border-amber-400/40"
          title="Vault transfer in progress"
        >
          <span className="loading loading-spinner loading-xs text-amber-600" aria-hidden />
          <span className="truncate max-w-[120px]">{vaultAssetLabel}</span>
          <span className="opacity-80 font-normal">Pending</span>
        </span>
      ) : null}
    </div>
  );
}

const DashboardPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { view, setView } = useDashboardView();

  // Sync URL to context when landing on /dashboard?view=...
  useEffect(() => {
    if (router.query.view === 'markets') {
      setView('markets');
    } else if (router.query.view === 'docs') {
      setView('docs');
    } else if (router.query.view === 'liquidation') {
      setView('liquidation');
    } else if (router.query.view === 'flash') {
      setView('flash');
    } else {
      setView('dashboard');
    }
  }, [router.query.view, setView]);

  /** Main lending UI only: avoids fetchRecords + decrypt for flash/liquidation/markets/docs cold loads. */
  const viewWantsFullLendingHydration = view === 'dashboard';

  const wallet = useWallet() as any;
  const {
    address,
    connected,
    connecting,
    executeTransaction,
    transactionStatus,
    requestRecords,
    requestTransactionHistory,
    decrypt,
  } = wallet;
  const requestTransaction = wallet.requestTransaction;
  const publicKey = address; // Use address as publicKey for compatibility

  // Avoid showing "Connect wallet" immediately after nav from Markets when already connected (adapter may restore state shortly)
  const [allowShowConnectCTA, setAllowShowConnectCTA] = useState(true);
  useEffect(() => {
    if (connected) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('wallet_connected', '1');
      setAllowShowConnectCTA(true);
      return;
    }
    const hadConnection = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wallet_connected');
    if (hadConnection) {
      setAllowShowConnectCTA(false);
      const t = setTimeout(() => {
        setAllowShowConnectCTA(true);
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('wallet_connected');
      }, 600);
      return () => clearTimeout(t);
    }
    setAllowShowConnectCTA(true);
  }, [connected]);

  const [amount, setAmount] = useState<number>(0);
  const [testCreditsAmount, setTestCreditsAmount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [txId, setTxId] = useState<string | null>(null);
  const [vaultWithdrawTxId, setVaultWithdrawTxId] = useState<string | null>(null);
  const [vaultBorrowTxId, setVaultBorrowTxId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showLogsPanel, setShowLogsPanel] = useState<boolean>(false);
  const [logsSummary, setLogsSummary] = useState<any>(null);

  const [totalSupplied, setTotalSupplied] = useState<string | null>(null);
  const [totalBorrowed, setTotalBorrowed] = useState<string | null>(null);
  const [utilizationIndex, setUtilizationIndex] = useState<string | null>(null);
  const [interestIndex, setInterestIndex] = useState<string | null>(null);
  const [liquidityIndex, setLiquidityIndex] = useState<string | null>(null);
  const [borrowIndex, setBorrowIndex] = useState<string | null>(null);
  const [supplyAPY, setSupplyAPY] = useState<number>(0);
  const [borrowAPY, setBorrowAPY] = useState<number>(0);
  const [effectiveUserSupplied, setEffectiveUserSupplied] = useState<number | null>(null);
  const [effectiveUserBorrowed, setEffectiveUserBorrowed] = useState<number | null>(null);
  const [txFinalized, setTxFinalized] = useState<boolean>(false);

  // User position state (from records; effective balance from mappings when available)
  const [userSupplied, setUserSupplied] = useState<string>('0');
  const [userBorrowed, setUserBorrowed] = useState<string>('0');
  const [totalDeposits, setTotalDeposits] = useState<string>('0');
  const [totalWithdrawals, setTotalWithdrawals] = useState<string>('0');
  const [totalBorrows, setTotalBorrows] = useState<string>('0');
  const [totalRepayments, setTotalRepayments] = useState<string>('0');
  const [isFetchingRecords, setIsFetchingRecords] = useState<boolean>(false);
  const [isRefreshingState, setIsRefreshingState] = useState<boolean>(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [privateAleoBalance, setPrivateAleoBalance] = useState<number | null>(null);

  // USDC Pool state (program from NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID or main pool)
  const [totalSuppliedUsdc, setTotalSuppliedUsdc] = useState<string | null>(null);
  const [totalBorrowedUsdc, setTotalBorrowedUsdc] = useState<string | null>(null);
  const [utilizationIndexUsdc, setUtilizationIndexUsdc] = useState<string | null>(null);
  const [liquidityIndexUsdc, setLiquidityIndexUsdc] = useState<string | null>(null);
  const [borrowIndexUsdc, setBorrowIndexUsdc] = useState<string | null>(null);
  const [supplyAPYUsdc, setSupplyAPYUsdc] = useState<number>(0);
  const [borrowAPYUsdc, setBorrowAPYUsdc] = useState<number>(0);
  const [userSuppliedUsdc, setUserSuppliedUsdc] = useState<string>('0');
  const [userBorrowedUsdc, setUserBorrowedUsdc] = useState<string>('0');
  const [effectiveUserSuppliedUsdc, setEffectiveUserSuppliedUsdc] = useState<number | null>(null);
  const [effectiveUserBorrowedUsdc, setEffectiveUserBorrowedUsdc] = useState<number | null>(null);
  const [totalDepositsUsdc, setTotalDepositsUsdc] = useState<string>('0');
  const [totalWithdrawalsUsdc, setTotalWithdrawalsUsdc] = useState<string>('0');
  const [totalBorrowsUsdc, setTotalBorrowsUsdc] = useState<string>('0');
  const [totalRepaymentsUsdc, setTotalRepaymentsUsdc] = useState<string>('0');
  const [isRefreshingUsdcState, setIsRefreshingUsdcState] = useState<boolean>(false);
  const [amountUsdc, setAmountUsdc] = useState<number>(0);
  const [modalAmountInput, setModalAmountInput] = useState<string>('');
  const [amountErrorUsdc, setAmountErrorUsdc] = useState<string | null>(null);
  const [privateUsdcBalance, setPrivateUsdcBalance] = useState<number | null>(null);

  // USAD Pool state
  const [totalSuppliedUsad, setTotalSuppliedUsad] = useState<string | null>(null);
  const [totalBorrowedUsad, setTotalBorrowedUsad] = useState<string | null>(null);
  const [utilizationIndexUsad, setUtilizationIndexUsad] = useState<string | null>(null);
  const [liquidityIndexUsad, setLiquidityIndexUsad] = useState<string | null>(null);
  const [borrowIndexUsad, setBorrowIndexUsad] = useState<string | null>(null);
  const [supplyAPYUsad, setSupplyAPYUsad] = useState<number>(0);
  const [borrowAPYUsad, setBorrowAPYUsad] = useState<number>(0);
  const [userSuppliedUsad, setUserSuppliedUsad] = useState<string>('0');
  const [userBorrowedUsad, setUserBorrowedUsad] = useState<string>('0');
  const [effectiveUserSuppliedUsad, setEffectiveUserSuppliedUsad] = useState<number | null>(null);
  const [effectiveUserBorrowedUsad, setEffectiveUserBorrowedUsad] = useState<number | null>(null);
  const [totalDepositsUsad, setTotalDepositsUsad] = useState<string>('0');
  const [totalWithdrawalsUsad, setTotalWithdrawalsUsad] = useState<string>('0');
  const [totalBorrowsUsad, setTotalBorrowsUsad] = useState<string>('0');
  const [totalRepaymentsUsad, setTotalRepaymentsUsad] = useState<string>('0');
  const [isRefreshingUsadState, setIsRefreshingUsadState] = useState<boolean>(false);
  const [amountUsad, setAmountUsad] = useState<number>(0);
  const [amountErrorUsad, setAmountErrorUsad] = useState<string | null>(null);
  const [privateUsadBalance, setPrivateUsadBalance] = useState<number | null>(null);
  const [assetPriceAleo, setAssetPriceAleo] = useState<number | null>(null); // PRICE_SCALE (1e6)
  const [assetPriceUsdc, setAssetPriceUsdc] = useState<number | null>(null); // PRICE_SCALE (1e6)
  const [assetPriceUsad, setAssetPriceUsad] = useState<number | null>(null); // PRICE_SCALE (1e6)
  /** Matches `finalize_borrow` integer math; when set, borrow limits use this instead of float portfolio. */
  const [chainBorrowCaps, setChainBorrowCaps] = useState<CrossCollateralChainCaps | null>(null);

  /** Matches `finalize_withdraw` integer math; when set, withdraw caps use this instead of float portfolio. */
  const [chainWithdrawCaps, setChainWithdrawCaps] = useState<CrossCollateralWithdrawCaps | null>(null);

  /** Latest cross-asset totals for handlers defined above portfolio math (repay/borrow caps). */
  const crossAssetPortfolioRef = useRef({
    totalDebtUsd: 0,
    aleoPriceUsd: 1,
    usdcPriceUsd: 1,
    usadPriceUsd: 1,
  });

  // Action modal (Aave-style: withdraw/deposit/borrow/repay with overview + tx status)
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionModalMode, setActionModalMode] = useState<'withdraw' | 'deposit' | 'borrow' | 'repay'>('withdraw');
  const [actionModalAsset, setActionModalAsset] = useState<'aleo' | 'usdc' | 'usad'>('aleo');
  const [actionModalSubmitted, setActionModalSubmitted] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<'aleo' | 'usdc' | 'usad' | null>(null);
  const [activeManageTab, setActiveManageTab] = useState<'Supply' | 'Withdraw' | 'Borrow' | 'Repay'>('Supply');
  const [manageAmountInput, setManageAmountInput] = useState('');
  const [inlineTxContext, setInlineTxContext] = useState<{
    tab: 'Supply' | 'Withdraw' | 'Borrow' | 'Repay';
    asset: 'aleo' | 'usdc' | 'usad';
  } | null>(null);

  // Track if we've already triggered a one-time records permission request for this connection
  const [walletPermissionsInitialized, setWalletPermissionsInitialized] = useState<boolean>(false);

  // Flash loan (unified pool: per-asset `available_liquidity`) — separate tab
  const [flashAsset, setFlashAsset] = useState<FlashLendingAssetId>('0field');
  const [flashSettleAsset, setFlashSettleAsset] = useState<FlashLendingAssetId>('0field');
  const [flashAvailLiquidityMicro, setFlashAvailLiquidityMicro] = useState<bigint | null>(null);
  const [flashAmountInput, setFlashAmountInput] = useState('');
  const [flashMinProfitInput, setFlashMinProfitInput] = useState('0');
  const [flashRepayInput, setFlashRepayInput] = useState('');
  const [flashStrategyIdInput, setFlashStrategyIdInput] = useState('1field');
  const [flashOpenAttempted, setFlashOpenAttempted] = useState(false);
  const [flashLoading, setFlashLoading] = useState(false);
  const [flashStatusMessage, setFlashStatusMessage] = useState('');
  const [flashTxId, setFlashTxId] = useState<string | null>(null);
  const [flashVaultTxId, setFlashVaultTxId] = useState<string | null>(null);
  const [flashSessionId, setFlashSessionId] = useState<string | null>(null);
  const [flashTxModalOpen, setFlashTxModalOpen] = useState(false);
  const [flashTxModalKind, setFlashTxModalKind] = useState<'open' | 'settle'>('open');
  type FlashSessionRow = {
    id: string;
    status: string;
    asset_id: string;
    principal_micro: number;
    min_profit_micro: number;
    strategy_id_field: string;
    flash_open_tx_id: string | null;
    vault_fund_tx_id: string | null;
    flash_settle_tx_id: string | null;
    expected_repay_micro?: number | null;
    actual_repay_micro?: number | null;
    profit_micro?: number | null;
    created_at: string;
  };
  const [flashSessions, setFlashSessions] = useState<FlashSessionRow[]>([]);
  const [flashSessionsLoading, setFlashSessionsLoading] = useState(false);
  const [flashSessionsError, setFlashSessionsError] = useState<string | null>(null);
  const [flashHistoryFilter, setFlashHistoryFilter] = useState<'all' | 'active'>('all');

  const displayedFlashSessions = useMemo(() => {
    if (flashHistoryFilter !== 'active') return flashSessions;
    return flashSessions.filter((s) => isFlashSessionStatusActive(s.status));
  }, [flashSessions, flashHistoryFilter]);

  const prefillSettleFromSession = useCallback((s: FlashSessionRow) => {
    const aid = String(s.asset_id || '');
    if (aid === '0field' || aid === '1field' || aid === '2field') {
      setFlashSettleAsset(aid as FlashLendingAssetId);
    }
    if (s.strategy_id_field) setFlashStrategyIdInput(String(s.strategy_id_field));
    const expectedMicro =
      Number(s.expected_repay_micro ?? 0) > 0
        ? Number(s.expected_repay_micro)
        : Math.round(Number(s.principal_micro || 0)) +
          aleoFlashFeeMicro(Math.round(Number(s.principal_micro || 0))) +
          Math.round(Number(s.min_profit_micro || 0));
    if (expectedMicro > 0) setFlashRepayInput((expectedMicro / 1_000_000).toFixed(6));
    if (s.id) setFlashSessionId(s.id);
  }, []);
  const [liqRepayAmountInput, setLiqRepayAmountInput] = useState('');
  const [liqSeizeAsset, setLiqSeizeAsset] = useState<'0field' | '1field' | '2field'>('1field');
  const [liqLoading, setLiqLoading] = useState(false);
  const [liqStatusMessage, setLiqStatusMessage] = useState('');
  const [liqTxId, setLiqTxId] = useState<string | null>(null);
  const [liqPreview, setLiqPreview] = useState<{
    loading: boolean;
    ok: boolean;
    reason?: string;
    liquidatable?: boolean;
    totalDebtUsd?: number;
    thresholdCollateralUsd?: number;
    aleoDebt?: number;
    maxCloseAleo?: number;
    seizeAmount?: number;
    collateralSeizeAsset?: number;
    liqBonusBps?: number;
  }>({ loading: false, ok: false });
  const [liqUiLimits, setLiqUiLimits] = useState<SelfLiquidationUiLimits | null>(null);
  const [liqHeroRefreshing, setLiqHeroRefreshing] = useState(false);
  const [flashHeroRefreshing, setFlashHeroRefreshing] = useState(false);
  const [chainPositionNoteSchema, setChainPositionNoteSchema] = useState<number | null>(null);
  const [posNoteLoading, setPosNoteLoading] = useState(false);
  const [posNoteStatus, setPosNoteStatus] = useState('');
  const [posNoteTxId, setPosNoteTxId] = useState<string | null>(null);
  const [migrationRecSummary, setMigrationRecSummary] = useState<MigrationRecordSummary | null>(null);
  // Track if we've already loaded the user's position once after wallet connect
  const [userPositionInitialized, setUserPositionInitialized] = useState<boolean>(false);
  /** Parsed private `LendingPosition` (v8) for caps / previews — no public mapping. */
  const [lendingPositionScaled, setLendingPositionScaled] = useState<LendingPositionScaled | null>(null);
  /** Modal for `open_lending_account`: same flow as other txs (submit → poll → explorer). */
  const [openAccountModalOpen, setOpenAccountModalOpen] = useState(false);
  const [openAccountSubmitted, setOpenAccountSubmitted] = useState(false);
  const [openAccountStatusMsg, setOpenAccountStatusMsg] = useState('');
  /** True once submit finishes (success, timeout, chain reject, or catch). Allows closing the modal. */
  const [openAccountFlowDone, setOpenAccountFlowDone] = useState(false);
  // Transaction history from Supabase (by wallet address)
  type TxHistoryRow = {
    id: string;
    tx_id: string;
    type: string;
    asset: string;
    amount: number;
    repay_amount?: number | null;
    explorer_url: string | null;
    vault_tx_id: string | null;
    vault_explorer_url: string | null;
    created_at: string;
  };
  const [txHistory, setTxHistory] = useState<TxHistoryRow[]>([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryPage, setTxHistoryPage] = useState(1);

  // Helper to extract a ciphertext string from a generic record object.
  const extractCiphertext = (record: any): string | null => {
    if (!record || typeof record !== 'object') return null;
    for (const key of Object.keys(record)) {
      const lower = key.toLowerCase();
      if (lower.includes('cipher')) {
        const val = (record as any)[key];
        if (typeof val === 'string' && val.trim().length > 0) {
          return val;
        }
      }
    }
    if ((record as any).data && typeof (record as any).data === 'object') {
      return extractCiphertext((record as any).data);
    }
    return null;
  };

  // Helper to parse numeric u64-style fields (e.g. "10u64", "10u64.private") from decrypted text.
  const extractU64FromText = (label: string, text: string): number => {
    if (!text) return 0;
    // Some pools may emit counters as `u64` or `u128`; normalize both.
    const regex = new RegExp(`${label}\\s*[:=]\\s*([0-9_]+)u(?:64|128)`, 'i');
    const match = text.match(regex);
    if (!match || !match[1]) return 0;
    const cleaned = match[1].replace(/_/g, '');
    const n = Number(cleaned);
    return Number.isNaN(n) ? 0 : n;
  };

  // Parse field-style values (e.g. "0field") from decrypted Leo record text.
  const extractFieldFromText = (label: string, text: string): string | null => {
    if (!text) return null;
    // `asset_id` may be printed as `2field` or sometimes `2u8` / `2u64` depending on how
    // the record was generated. Normalize all numeric variants to `<n>field` so the
    // existing filters (`assetId !== '2field'`) keep working.
    const regex = new RegExp(`${label}\\s*[:=]\\s*([0-9_]+)(field|u8|u64|u128)?`, 'i');
    const match = text.match(regex);
    if (!match || !match[1]) return null;
    const n = match[1].replace(/_/g, '');
    // Always normalize suffix to `field` for comparisons used throughout the UI.
    return `${n}field`;
  };

  // Background record fetching function (non-blocking) - memoized with useCallback
  const fetchRecordsInBackground = useCallback(async (programId: string = LENDING_POOL_PROGRAM_ID) => {
    if (!connected || !requestRecords || !publicKey) {
      privacyLog('📋 fetchRecordsInBackground: Skipping - wallet not connected or requestRecords not available');
      return;
    }

    // Don't fetch if already fetching
    if (isFetchingRecords) {
      privacyLog('📋 fetchRecordsInBackground: Already fetching, skipping duplicate request');
      return;
    }

    setIsFetchingRecords(true);
    privacyLog(`📋 fetchRecordsInBackground: Starting background fetch for ${programId}...`);

    try {
      // Step 1: Fetch encrypted records for this user from lending_pool_v8.aleo.
      // We use includePlaintext=false so we explicitly decrypt via decrypt().
      const records = await requestRecords(programId, false);
      privacyLog(
        `📋 fetchRecordsInBackground: Fetched ${records?.length || 0} records for ${programId}`,
        records,
      );

      if (!records || !Array.isArray(records) || records.length === 0) {
        privacyLog('📋 fetchRecordsInBackground: No records found yet (may need more time to index)');
        // Reset user position to zero when no records
        setUserSupplied('0');
        setUserBorrowed('0');
        setTotalDeposits('0');
        setTotalWithdrawals('0');
        setTotalBorrows('0');
        setTotalRepayments('0');
        return;
      }

      if (!decrypt) {
        privacyWarn('📋 fetchRecordsInBackground: decrypt() not available on wallet, cannot compute user position from records.');
        return;
      }

      // Step 2: Decrypt each record's ciphertext and accumulate totals.
      let totalDepositsAccum = 0;
      let totalWithdrawalsAccum = 0;
      let totalBorrowsAccum = 0;
      let totalRepaymentsAccum = 0;

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        privacyLog(`📋 Decrypting record [${i}]`, rec);

        const cipher = extractCiphertext(rec);
        if (!cipher) {
          privacyWarn(`📋 Record [${i}] has no ciphertext field, skipping.`);
          continue;
        }

        try {
          const decryptedText = await decrypt(cipher);
          privacyLog(`📋 Decrypted record [${i}] text:`, decryptedText);

          // In v2, one program emits UserActivity for all assets.
          // Filter to ALEO records only for this fetch path.
          const assetId = extractFieldFromText('asset_id', decryptedText);
          if (assetId !== '0field') continue;

          // Try to parse totals directly from decrypted Leo record text.
          totalDepositsAccum += extractU64FromText('total_deposits', decryptedText);
          totalWithdrawalsAccum += extractU64FromText('total_withdrawals', decryptedText);
          totalBorrowsAccum += extractU64FromText('total_borrows', decryptedText);
          totalRepaymentsAccum += extractU64FromText('total_repayments', decryptedText);
        } catch (e: any) {
          privacyWarn(`📋 Failed to decrypt record [${i}]:`, e?.message || e);
        }
      }

      const netSupplied = Math.max(0, totalDepositsAccum - totalWithdrawalsAccum);
      const netBorrowed = Math.max(0, totalBorrowsAccum - totalRepaymentsAccum);

      // Update state for UI
      setTotalDeposits(String(totalDepositsAccum));
      setTotalWithdrawals(String(totalWithdrawalsAccum));
      setTotalBorrows(String(totalBorrowsAccum));
      setTotalRepayments(String(totalRepaymentsAccum));
      setUserSupplied(String(netSupplied));
      setUserBorrowed(String(netBorrowed));

      privacyLog('📋 fetchRecordsInBackground: User position updated from decrypted records', {
        totalDepositsAccum,
        totalWithdrawalsAccum,
        totalBorrowsAccum,
        totalRepaymentsAccum,
        netSupplied,
        netBorrowed,
      });
    } catch (error: any) {
      // Silently handle errors in background fetch (don't spam user)
      privacyWarn('📋 fetchRecordsInBackground: Error fetching records (non-critical):', error?.message);
    } finally {
      setIsFetchingRecords(false);
      privacyLog('📋 fetchRecordsInBackground: Background fetch completed');
    }
  }, [connected, requestRecords, publicKey, decrypt, isFetchingRecords]);

  // Fetch user position for USDC pool (lending_pool_usdce_v85.aleo) — same UserActivity record shape.
  const fetchRecordsInBackgroundUsdc = useCallback(async () => {
    if (!connected || !requestRecords || !publicKey) return;
    if (isFetchingRecords) return;
    setIsFetchingRecords(true);
    try {
      const records = await requestRecords(USDC_LENDING_POOL_PROGRAM_ID, false);
      if (!records || !Array.isArray(records) || records.length === 0) {
        setUserSuppliedUsdc('0');
        setUserBorrowedUsdc('0');
        setTotalDepositsUsdc('0');
        setTotalWithdrawalsUsdc('0');
        setTotalBorrowsUsdc('0');
        setTotalRepaymentsUsdc('0');
        return;
      }
      if (!decrypt) return;
      let totalDepositsAccum = 0;
      let totalWithdrawalsAccum = 0;
      let totalBorrowsAccum = 0;
      let totalRepaymentsAccum = 0;
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const cipher = extractCiphertext(rec);
        if (!cipher) continue;
        try {
          const decryptedText = await decrypt(cipher);
          const assetId = extractFieldFromText('asset_id', decryptedText);
          if (assetId !== '1field') continue;
          totalDepositsAccum += extractU64FromText('total_deposits', decryptedText);
          totalWithdrawalsAccum += extractU64FromText('total_withdrawals', decryptedText);
          totalBorrowsAccum += extractU64FromText('total_borrows', decryptedText);
          totalRepaymentsAccum += extractU64FromText('total_repayments', decryptedText);
        } catch {
          // skip
        }
      }
      const netSupplied = Math.max(0, totalDepositsAccum - totalWithdrawalsAccum);
      const netBorrowed = Math.max(0, totalBorrowsAccum - totalRepaymentsAccum);
      setTotalDepositsUsdc(String(totalDepositsAccum));
      setTotalWithdrawalsUsdc(String(totalWithdrawalsAccum));
      setTotalBorrowsUsdc(String(totalBorrowsAccum));
      setTotalRepaymentsUsdc(String(totalRepaymentsAccum));
      setUserSuppliedUsdc(String(netSupplied));
      setUserBorrowedUsdc(String(netBorrowed));
    } catch (error: any) {
      privacyWarn('fetchRecordsInBackgroundUsdc:', error?.message);
    } finally {
      setIsFetchingRecords(false);
    }
  }, [connected, requestRecords, publicKey, decrypt, isFetchingRecords]);

  // Fetch user position for USAD pool (lending_pool_usad_v17.aleo) — same UserActivity record shape.
  const fetchRecordsInBackgroundUsad = useCallback(async () => {
    if (!connected || !requestRecords || !publicKey) return;
    if (isFetchingRecords) return;
    setIsFetchingRecords(true);
    try {
      const records = await requestRecords(USAD_LENDING_POOL_PROGRAM_ID, false);
      if (!records || !Array.isArray(records) || records.length === 0) {
        setUserSuppliedUsad('0');
        setUserBorrowedUsad('0');
        setTotalDepositsUsad('0');
        setTotalWithdrawalsUsad('0');
        setTotalBorrowsUsad('0');
        setTotalRepaymentsUsad('0');
        return;
      }
      if (!decrypt) return;
      const seenAssetIds = new Map<string, number>();
      let loggedSamples = 0;

      let totalDepositsAccum = 0;
      let totalWithdrawalsAccum = 0;
      let totalBorrowsAccum = 0;
      let totalRepaymentsAccum = 0;
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const cipher = extractCiphertext(rec);
        if (!cipher) continue;
        try {
          const decryptedText = await decrypt(cipher);
          const assetId = extractFieldFromText('asset_id', decryptedText);
          if (assetId) seenAssetIds.set(assetId, (seenAssetIds.get(assetId) ?? 0) + 1);
          if (loggedSamples < 3) {
            // Avoid logging huge decrypted text; just show prefix + parsed asset_id.
            const sampleDeposits = extractU64FromText('total_deposits', decryptedText);
            const sampleWithdrawals = extractU64FromText('total_withdrawals', decryptedText);
            const sampleBorrows = extractU64FromText('total_borrows', decryptedText);
            const sampleRepayments = extractU64FromText('total_repayments', decryptedText);
            privacyLog('[USAD records debug] sample', {
              i,
              assetId,
              textPrefix: String(decryptedText).slice(0, 120),
              parsedTotals: {
                total_deposits: sampleDeposits,
                total_withdrawals: sampleWithdrawals,
                total_borrows: sampleBorrows,
                total_repayments: sampleRepayments,
              },
            });
            loggedSamples++;
          }
          if (assetId !== '2field') continue;
          totalDepositsAccum += extractU64FromText('total_deposits', decryptedText);
          totalWithdrawalsAccum += extractU64FromText('total_withdrawals', decryptedText);
          totalBorrowsAccum += extractU64FromText('total_borrows', decryptedText);
          totalRepaymentsAccum += extractU64FromText('total_repayments', decryptedText);
        } catch {
          // skip
        }
      }
      const netSupplied = Math.max(0, totalDepositsAccum - totalWithdrawalsAccum);
      const netBorrowed = Math.max(0, totalBorrowsAccum - totalRepaymentsAccum);
      privacyLog('[USAD records debug] assetId distribution', Object.fromEntries(seenAssetIds.entries()));
      privacyLog('[USAD records debug] computed nets', {
        total_deposits: totalDepositsAccum,
        total_withdrawals: totalWithdrawalsAccum,
        total_borrows: totalBorrowsAccum,
        total_repayments: totalRepaymentsAccum,
        netSupplied,
        netBorrowed,
      });
      setTotalDepositsUsad(String(totalDepositsAccum));
      setTotalWithdrawalsUsad(String(totalWithdrawalsAccum));
      setTotalBorrowsUsad(String(totalBorrowsAccum));
      setTotalRepaymentsUsad(String(totalRepaymentsAccum));
      setUserSuppliedUsad(String(netSupplied));
      setUserBorrowedUsad(String(netBorrowed));
    } catch (error: any) {
      privacyWarn('fetchRecordsInBackgroundUsad:', error?.message);
    } finally {
      setIsFetchingRecords(false);
    }
  }, [connected, requestRecords, publicKey, decrypt, isFetchingRecords]);

  // Fetch all user records (both credits.aleo and lending_pool_v8.aleo)
  const fetchAllUserRecords = useCallback(async () => {
    if (!connected || !requestRecords || !publicKey) {
      privacyLog('📋 fetchAllUserRecords: Skipping - wallet not connected');
      return;
    }

    if (isFetchingRecords) {
      privacyLog('📋 fetchAllUserRecords: Already fetching, skipping');
      return;
    }

    setIsFetchingRecords(true);
    privacyLog('📋 fetchAllUserRecords: Fetching all user records on refresh...');

    try {
      // Fetch credits.aleo records
      try {
        const creditsRecords = await requestRecords('credits.aleo', false);
        privacyLog(`📋 fetchAllUserRecords: Fetched ${creditsRecords?.length || 0} credits.aleo records`);
      } catch (error: any) {
        privacyWarn('📋 fetchAllUserRecords: Error fetching credits.aleo records:', error?.message);
      }

      // Fetch lending_pool_v8.aleo records and update user position
      await fetchRecordsInBackground(LENDING_POOL_PROGRAM_ID);
      
      privacyLog('📋 fetchAllUserRecords: All records fetched successfully');
    } catch (error: any) {
      privacyWarn('📋 fetchAllUserRecords: Error fetching records:', error?.message);
    } finally {
      setIsFetchingRecords(false);
    }
  }, [connected, requestRecords, publicKey, fetchRecordsInBackground, isFetchingRecords]);

  // Format scaled indices (SCALE = 1_000_000 in the Leo program) as human-friendly decimals.
  const formatScaled = (value: string | null, decimals = 6) => {
    if (!value) return '0';
    const n = Number(value);
    if (Number.isNaN(n)) return value;
    return (n / 1_000_000).toFixed(decimals);
  };

  // Format micro-ALEO (u64 from program) as ALEO with given decimals (default 2).
  const formatAleoAmount = (micro: number | string | null, decimals = 2) => {
    if (micro == null) return (0).toFixed(decimals);
    const n = typeof micro === 'string' ? Number(micro) : micro;
    if (!Number.isFinite(n)) return (0).toFixed(decimals);
    return (n / 1_000_000).toFixed(decimals);
  };

  const isExplorerHash = (id: string | null) => !!id && id.length >= 61;

  const getErrorMessage = (e: unknown): string => {
    if (e == null) return 'Unknown error';
    const err = e as Record<string, unknown>;
    const msg =
      typeof err?.message === 'string'
        ? err.message
        : typeof (err?.data as any)?.message === 'string'
          ? (err.data as { message: string }).message
          : typeof err?.reason === 'string'
            ? err.reason
            : typeof err?.error === 'string'
              ? err.error
              : typeof err?.toString === 'function'
                ? err.toString()
                : String(e);
    return msg || 'Unknown error';
  };

  const openActionModal = (
    mode: 'withdraw' | 'deposit' | 'borrow' | 'repay',
    asset: 'aleo' | 'usdc' | 'usad',
    prefilledAmount?: number
  ) => {
    setActionModalMode(mode);
    setActionModalAsset(asset);
    setActionModalSubmitted(false);
    setStatusMessage('');
    setAmountError(null);
    setAmountErrorUsdc(null);
    setAmountErrorUsad(null);
    setTxId(null);
    setTxFinalized(false);
    setVaultWithdrawTxId(null);
    setVaultBorrowTxId(null);
    if (prefilledAmount != null) {
      setModalAmountInput(String(prefilledAmount));
      if (asset === 'usdc') setAmountUsdc(prefilledAmount);
      else if (asset === 'usad') setAmountUsad(prefilledAmount);
      else setAmount(prefilledAmount);
    } else {
      setModalAmountInput('');
    }
    setActionModalOpen(true);
  };

  const closeActionModal = () => {
    setActionModalOpen(false);
    setActionModalSubmitted(false);
  };

  // Derived user metrics for interest display (Aleo pool)
  const INDEX_SCALE_ALEO = 1_000_000_000_000;
  const numericTotalDeposits = Number(totalDeposits) || 0;
  const numericTotalWithdrawals = Number(totalWithdrawals) || 0;
  const numericTotalBorrows = Number(totalBorrows) || 0;
  const numericTotalRepayments = Number(totalRepayments) || 0;
  const principalSupplied = Math.max(0, numericTotalDeposits - numericTotalWithdrawals);
  const principalBorrowed = Math.max(0, numericTotalBorrows - numericTotalRepayments);
  const walletMicroAleoSup = effectiveMicroOrWalletAggregate(effectiveUserSupplied, userSupplied);
  const walletMicroAleoBor = effectiveMicroOrWalletAggregate(effectiveUserBorrowed, userBorrowed);
  const effectiveSuppliedVal = chainMicroOrWalletMicro(chainBorrowCaps?.realSupplyMicroAleo, walletMicroAleoSup);
  const effectiveBorrowedVal = chainMicroOrWalletMicro(chainBorrowCaps?.realBorrowMicroAleo, walletMicroAleoBor);
  const liNum = liquidityIndex != null ? Number(liquidityIndex) : null;
  const biNum = borrowIndex != null ? Number(borrowIndex) : null;
  const liFactor =
    liNum != null && Number.isFinite(liNum) && liNum > 0
      ? liNum / INDEX_SCALE_ALEO
      : 1;
  const biFactor =
    biNum != null && Number.isFinite(biNum) && biNum > 0
      ? biNum / INDEX_SCALE_ALEO
      : 1;
  // Approximate interest using indices (can show fractional ALEO even before whole-token accrual),
  // falling back to effective-minus-principal if indices are unavailable.
  const interestEarnedAleo =
    principalSupplied > 0 && liFactor > 1
      ? Math.max(0, principalSupplied * (liFactor - 1))
      : Math.max(0, effectiveSuppliedVal - principalSupplied);
  const interestOwedAleo =
    principalBorrowed > 0 && biFactor > 1
      ? Math.max(0, principalBorrowed * (biFactor - 1))
      : Math.max(0, effectiveBorrowedVal - principalBorrowed);

  // Derived user metrics for interest display (USDC pool)
  const INDEX_SCALE_USDC = 1_000_000_000_000;
  const USDC_SCALE = 1_000_000;
  const numericTotalDepositsUsdc = Number(totalDepositsUsdc) || 0;
  const numericTotalWithdrawalsUsdc = Number(totalWithdrawalsUsdc) || 0;
  const numericTotalBorrowsUsdc = Number(totalBorrowsUsdc) || 0;
  const numericTotalRepaymentsUsdc = Number(totalRepaymentsUsdc) || 0;
  const principalSuppliedUsdc = Math.max(0, numericTotalDepositsUsdc - numericTotalWithdrawalsUsdc);
  const principalBorrowedUsdc = Math.max(0, numericTotalBorrowsUsdc - numericTotalRepaymentsUsdc);
  const walletMicroUsdcSup = effectiveMicroOrWalletAggregate(effectiveUserSuppliedUsdc, userSuppliedUsdc);
  const walletMicroUsdcBor = effectiveMicroOrWalletAggregate(effectiveUserBorrowedUsdc, userBorrowedUsdc);
  const effectiveSuppliedUsdcVal = chainMicroOrWalletMicro(
    chainBorrowCaps?.realSupplyMicroUsdcx,
    walletMicroUsdcSup,
  );
  const effectiveBorrowedUsdcVal = chainMicroOrWalletMicro(
    chainBorrowCaps?.realBorrowMicroUsdcx,
    walletMicroUsdcBor,
  );
  const liUsdcNum = liquidityIndexUsdc != null ? Number(liquidityIndexUsdc) : null;
  const biUsdcNum = borrowIndexUsdc != null ? Number(borrowIndexUsdc) : null;
  const liUsdcFactor =
    liUsdcNum != null && Number.isFinite(liUsdcNum) && liUsdcNum > 0
      ? liUsdcNum / INDEX_SCALE_USDC
      : 1;
  const biUsdcFactor =
    biUsdcNum != null && Number.isFinite(biUsdcNum) && biUsdcNum > 0
      ? biUsdcNum / INDEX_SCALE_USDC
      : 1;
  const interestEarnedUsdcMicro =
    principalSuppliedUsdc > 0 && liUsdcFactor > 1
      ? Math.max(0, principalSuppliedUsdc * (liUsdcFactor - 1))
      : Math.max(0, effectiveSuppliedUsdcVal - principalSuppliedUsdc);
  const interestOwedUsdcMicro =
    principalBorrowedUsdc > 0 && biUsdcFactor > 1
      ? Math.max(0, principalBorrowedUsdc * (biUsdcFactor - 1))
      : Math.max(0, effectiveBorrowedUsdcVal - principalBorrowedUsdc);
  const interestEarnedUsdc =
    interestEarnedUsdcMicro > 0 ? interestEarnedUsdcMicro / USDC_SCALE : 0;
  const interestOwedUsdc =
    interestOwedUsdcMicro > 0 ? interestOwedUsdcMicro / USDC_SCALE : 0;

  // Per-asset tooltips: supply = interest earned, borrow = interest owed (real calculated values)
  const tooltipInterestEarnedAleo = `Interest earned (ALEO): ${formatAleoAmount(interestEarnedAleo, 6)}`;
  const tooltipInterestEarnedUsdc = `Interest earned (USDC): ${interestEarnedUsdc.toFixed(6)} USDC`;
  const tooltipInterestOwedAleo = `Interest owed (ALEO): ${formatAleoAmount(interestOwedAleo, 6)}`;
  const tooltipInterestOwedUsdc = `Interest owed (USDC): ${interestOwedUsdc.toFixed(6)} USDC`;

  const getExplorerTxUrl = (id: string) => {
    let base = 'https://explorer.aleo.org/transaction';

    if (CURRENT_NETWORK === Network.TESTNET) {
      base = 'https://testnet.explorer.aleo.org/transaction';
    }

    // If you later switch to MainnetBeta explicitly, you can add a branch here.
    return `${base}/${id}`;
  };

  const getProvableExplorerTxUrl = (id: string) =>
    `https://testnet.explorer.provable.com/transaction/${id}`;

  const [txHistoryError, setTxHistoryError] = useState<string | null>(null);

  const fetchTransactionHistory = useCallback(async () => {
    if (!address?.trim()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setTxHistoryError('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUB_KEY to .env');
      setTxHistory([]);
      return;
    }
    setTxHistoryLoading(true);
    setTxHistoryError(null);
    try {
      const { data, error } = await supabase
        .from('transaction_history')
        .select('id, wallet_address, tx_id, type, asset, amount, repay_amount, program_id, explorer_url, vault_tx_id, vault_explorer_url, created_at')
        .eq('wallet_address', address)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        setTxHistoryError(error.message);
        setTxHistory([]);
        return;
      }
      setTxHistory(Array.isArray(data) ? data : []);
    } catch (e: any) {
      privacyWarn('Failed to fetch transaction history:', e);
      setTxHistoryError(e?.message || 'Network error');
      setTxHistory([]);
    } finally {
      setTxHistoryLoading(false);
    }
  }, [address]);

  const fetchFlashSessions = useCallback(async () => {
    if (!address?.trim()) return;
    setFlashSessionsLoading(true);
    setFlashSessionsError(null);
    try {
      const resp = await fetch(`/api/flash-sessions?wallet=${encodeURIComponent(address.trim())}&limit=100`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        setFlashSessionsError(data?.error || 'Failed to load flash sessions.');
        setFlashSessions([]);
        return;
      }
      setFlashSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: any) {
      setFlashSessionsError(e?.message || 'Network error while loading flash sessions.');
      setFlashSessions([]);
    } finally {
      setFlashSessionsLoading(false);
    }
  }, [address]);

  /** Hero card: reload Supabase history + on-chain liquidation preview / repay limits (no full page reload). */
  const refreshLiquidationHero = useCallback(async () => {
    if (!connected || !requestRecords || !publicKey?.trim().startsWith('aleo1')) {
      if (address?.trim()) await fetchTransactionHistory();
      return;
    }
    setLiqHeroRefreshing(true);
    try {
      await fetchTransactionHistory();
      const repayRaw = Number(liqRepayAmountInput);
      const repay = Number.isFinite(repayRaw) && repayRaw > 0 ? repayRaw : 0;
      setLiqPreview((p) => ({ ...p, loading: true }));
      const scaled = await parseLatestLendingPositionScaled(
        requestRecords,
        LENDING_POOL_PROGRAM_ID,
        decrypt,
      );
      const preview = await getLiquidationPreviewAleo(
        LENDING_POOL_PROGRAM_ID,
        repay,
        liqSeizeAsset,
        scaled,
      );
      setLiqPreview({
        loading: false,
        ok: preview.ok,
        reason: preview.reason,
        liquidatable: preview.liquidatable,
        totalDebtUsd: preview.totalDebtUsd,
        thresholdCollateralUsd: preview.thresholdCollateralUsd,
        aleoDebt: preview.aleoDebt,
        maxCloseAleo: preview.maxCloseAleo,
        seizeAmount: preview.seizeAmount,
        collateralSeizeAsset: preview.collateralSeizeAsset,
        liqBonusBps: preview.liqBonusBps,
      });
      const lim = await getSelfLiquidationUiLimits(LENDING_POOL_PROGRAM_ID, requestRecords, decrypt);
      setLiqUiLimits(lim);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Refresh failed.';
      setLiqPreview((p) => ({
        ...p,
        loading: false,
        ok: false,
        reason: msg,
        liquidatable: false,
      }));
      setLiqUiLimits({
        ok: false,
        reason: msg,
        maxCloseAleo: 0,
        maxCreditsSingleRecordAleo: 0,
        effectiveMaxRepayAleo: 0,
        seizeOptions: [],
        aleoDebt: 0,
        realSupAleo: 0,
        realSupUsdcx: 0,
        realSupUsad: 0,
      });
    } finally {
      setLiqHeroRefreshing(false);
    }
  }, [
    address,
    connected,
    decrypt,
    fetchTransactionHistory,
    liqRepayAmountInput,
    liqSeizeAsset,
    publicKey,
    requestRecords,
  ]);

  /** Hero card: reload pool liquidity for selected asset + flash sessions from backend. */
  const refreshFlashHero = useCallback(async () => {
    setFlashHeroRefreshing(true);
    try {
      await fetchFlashSessions();
      try {
        const v = await fetchAvailableLiquidityMicro(LENDING_POOL_PROGRAM_ID, flashAsset);
        setFlashAvailLiquidityMicro(v);
      } catch {
        setFlashAvailLiquidityMicro(null);
      }
    } finally {
      setFlashHeroRefreshing(false);
    }
  }, [fetchFlashSessions, flashAsset]);

  const saveTransactionToSupabase = async (
    walletAddress: string,
    txId: string,
    type:
      | 'deposit'
      | 'withdraw'
      | 'borrow'
      | 'repay'
      | 'liquidation'
      | 'open_position'
      | 'self_liquidate_payout',
    asset: 'aleo' | 'usdc' | 'usad',
    amount: number,
    programId?: string,
    _vaultTxId?: string | null,
    repayAmount?: number | null,
  ) => {
    try {
      const res = await fetch('/api/record-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          tx_id: txId,
          type,
          asset: asset === 'usdc' ? 'usdcx' : asset,
          amount,
          repay_amount: repayAmount ?? null,
          program_id: programId ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        privacyWarn('Save transaction failed:', err?.error || res.statusText);
        return;
      }
      await fetchTransactionHistory();
    } catch (e) {
      privacyWarn('Failed to save transaction:', e);
    }
  };

  /** Portfolio USD + per-asset max borrow/withdraw from mappings (same math as `finalize_*`). Retries wasm/RPC cold start. */
  const CHAIN_CAPS_RETRY_MS = [0, 120, 320, 700];
  const refreshChainPortfolioCaps = useCallback(async () => {
    const addr = publicKey?.trim();
    if (!addr || !requestRecords) {
      setChainBorrowCaps(null);
      setChainWithdrawCaps(null);
      setLendingPositionScaled(null);
      return;
    }
    let scaled: LendingPositionScaled | null = null;
    let lendingSnap: any[] | undefined;
    try {
      lendingSnap = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
      scaled = await parseLatestLendingPositionScaled(
        requestRecords,
        LENDING_POOL_PROGRAM_ID,
        decrypt,
        lendingSnap,
      );
      setLendingPositionScaled(scaled);
    } catch {
      setLendingPositionScaled(null);
    }
    for (let i = 0; i < CHAIN_CAPS_RETRY_MS.length; i++) {
      const ms = CHAIN_CAPS_RETRY_MS[i];
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      try {
        const [borrow, withdraw] = await Promise.all([
          getAggregatedCrossCollateralBorrowCapsFromWallet(
            LENDING_POOL_PROGRAM_ID,
            requestRecords,
            decrypt,
            lendingSnap,
          ),
          getAggregatedCrossCollateralWithdrawCapsFromWallet(
            LENDING_POOL_PROGRAM_ID,
            requestRecords,
            decrypt,
            lendingSnap,
          ),
        ]);
        if (borrow && withdraw) {
          setChainBorrowCaps(borrow);
          setChainWithdrawCaps(withdraw);
          return;
        }
        if (isDevAppEnv) {
          privacyWarn('[chain caps] borrow or withdraw null', { borrow: !!borrow, withdraw: !!withdraw });
        }
      } catch (e) {
        if (isDevAppEnv) privacyWarn('[chain caps] attempt failed', i, e);
      }
    }
    if (isDevAppEnv) privacyWarn('[chain caps] all retries exhausted for', addr);
    setChainBorrowCaps(null);
    setChainWithdrawCaps(null);
  }, [publicKey, requestRecords, decrypt]);

  /** Borrow/withdraw caps hit `/vault-balances`; liquidation & flash UIs do not need them. */
  const refreshChainPortfolioCapsForActiveView = useCallback(async () => {
    if (view === 'liquidation' || view === 'flash') return;
    await refreshChainPortfolioCaps();
  }, [view, refreshChainPortfolioCaps]);

  const refreshPoolState = async (includeUserPosition: boolean = false) => {
    try {
      setIsRefreshingState(true);
      const state = await getLendingPoolState();
      const onChainPrice = await getAssetPriceForProgram(LENDING_POOL_PROGRAM_ID, '0field');
      setAssetPriceAleo(onChainPrice);
      setTotalSupplied(state.totalSupplied ?? '0');
      setTotalBorrowed(state.totalBorrowed ?? '0');
      setUtilizationIndex(state.utilizationIndex ?? '0');
      setInterestIndex(state.interestIndex ?? '0');
      setLiquidityIndex(state.liquidityIndex ?? null);
      setBorrowIndex(state.borrowIndex ?? null);
      const ts = Number(state.totalSupplied ?? 0) || 0;
      const tb = Number(state.totalBorrowed ?? 0) || 0;
      const chainApyAleo = await getPoolApyFractionsFromChain(LENDING_POOL_PROGRAM_ID, '0field');
      const { supplyAPY: sApy, borrowAPY: bApy } = resolvePoolApyDisplay(ts, tb, chainApyAleo);
      setSupplyAPY(sApy);
      setBorrowAPY(bApy);

      if (includeUserPosition && publicKey && requestRecords) {
        try {
          await fetchRecordsInBackground(LENDING_POOL_PROGRAM_ID);
          const scaled = await parseLatestLendingPositionScaled(
            requestRecords,
            LENDING_POOL_PROGRAM_ID,
            decrypt,
          );
          const effective = await getAleoPoolUserEffectivePosition(
            LENDING_POOL_PROGRAM_ID,
            publicKey,
            '0field',
            scaled,
          );
          if (effective) {
            setEffectiveUserSupplied(effective.effectiveSupplyBalance);
            setEffectiveUserBorrowed(effective.effectiveBorrowDebt);
          } else {
            setEffectiveUserSupplied(null);
            setEffectiveUserBorrowed(null);
          }
          if (requestRecords) {
            getPrivateCreditsBalance(requestRecords, decrypt).then(setPrivateAleoBalance).catch(() => setPrivateAleoBalance(null));
          }
          await refreshChainPortfolioCapsForActiveView();
        } catch (error) {
          privacyWarn('Failed to refresh user position from records:', error);
          setUserSupplied('0');
          setUserBorrowed('0');
          setTotalDeposits('0');
          setTotalWithdrawals('0');
          setTotalBorrows('0');
          setTotalRepayments('0');
          setEffectiveUserSupplied(null);
          setEffectiveUserBorrowed(null);
          setChainBorrowCaps(null);
          setChainWithdrawCaps(null);
        }
      } else if (!publicKey?.trim()) {
        // Guest / disconnected: clear per-wallet rows and portfolio caps.
        setUserSupplied('0');
        setUserBorrowed('0');
        setTotalDeposits('0');
        setTotalWithdrawals('0');
        setTotalBorrows('0');
        setTotalRepayments('0');
        setEffectiveUserSupplied(null);
        setEffectiveUserBorrowed(null);
        setPrivateAleoBalance(null);
        setChainBorrowCaps(null);
        setChainWithdrawCaps(null);
      }
      // Pool-only refresh while wallet connected: do not zero user rows or clear chain caps (see chain caps effect).
    } catch (e) {
      console.error('Failed to fetch pool state', e);
      setStatusMessage('Failed to fetch pool state. Check console for details.');
    }
    finally {
      setIsRefreshingState(false);
    }
  };

  const refreshUsdcPoolState = async (includeUserPosition: boolean = false) => {
    try {
      setIsRefreshingUsdcState(true);
      const state = await getUsdcLendingPoolState();
      const onChainPrice = await getAssetPriceForProgram(USDC_LENDING_POOL_PROGRAM_ID, '1field');
      setAssetPriceUsdc(onChainPrice);
      setTotalSuppliedUsdc(state.totalSupplied ?? '0');
      setTotalBorrowedUsdc(state.totalBorrowed ?? '0');
      setUtilizationIndexUsdc(state.utilizationIndex ?? '0');
      setLiquidityIndexUsdc(state.liquidityIndex ?? null);
      setBorrowIndexUsdc(state.borrowIndex ?? null);
      const ts = Number(state.totalSupplied ?? 0) || 0;
      const tb = Number(state.totalBorrowed ?? 0) || 0;
      const chainApyUsdc = await getPoolApyFractionsFromChain(USDC_LENDING_POOL_PROGRAM_ID, '1field');
      const { supplyAPY: sApy, borrowAPY: bApy } = resolvePoolApyDisplay(ts, tb, chainApyUsdc);
      setSupplyAPYUsdc(sApy);
      setBorrowAPYUsdc(bApy);
      if (includeUserPosition && requestRecords && publicKey) {
        try {
          await fetchRecordsInBackgroundUsdc();
          const scaledUsdc =
            USDC_LENDING_POOL_PROGRAM_ID === LENDING_POOL_PROGRAM_ID
              ? await parseLatestLendingPositionScaled(
                  requestRecords,
                  LENDING_POOL_PROGRAM_ID,
                  decrypt,
                )
              : await parseLatestLendingPositionScaled(
                  requestRecords,
                  USDC_LENDING_POOL_PROGRAM_ID,
                  decrypt,
                );
          const effective = await getAleoPoolUserEffectivePosition(
            USDC_LENDING_POOL_PROGRAM_ID,
            publicKey,
            '1field',
            scaledUsdc,
          );
          if (effective) {
            setEffectiveUserSuppliedUsdc(effective.effectiveSupplyBalance);
            setEffectiveUserBorrowedUsdc(effective.effectiveBorrowDebt);
          } else {
            setEffectiveUserSuppliedUsdc(null);
            setEffectiveUserBorrowedUsdc(null);
          }
          getPrivateUsdcBalance(requestRecords, decrypt).then(setPrivateUsdcBalance).catch(() => setPrivateUsdcBalance(null));
          await refreshChainPortfolioCapsForActiveView();
        } catch (error) {
          privacyWarn('Failed to refresh USDC user position:', error);
          setUserSuppliedUsdc('0');
          setUserBorrowedUsdc('0');
          setTotalDepositsUsdc('0');
          setTotalWithdrawalsUsdc('0');
          setTotalBorrowsUsdc('0');
          setTotalRepaymentsUsdc('0');
          setEffectiveUserSuppliedUsdc(null);
          setEffectiveUserBorrowedUsdc(null);
          setPrivateUsdcBalance(null);
          setChainBorrowCaps(null);
          setChainWithdrawCaps(null);
        }
      } else if (!publicKey?.trim()) {
        setEffectiveUserSuppliedUsdc(null);
        setEffectiveUserBorrowedUsdc(null);
        setPrivateUsdcBalance(null);
        setChainBorrowCaps(null);
        setChainWithdrawCaps(null);
      }
    } catch (e) {
      console.error('Failed to fetch USDC pool state', e);
    } finally {
      setIsRefreshingUsdcState(false);
    }
  };

  const refreshUsadPoolState = async (includeUserPosition: boolean = false) => {
    try {
      setIsRefreshingUsadState(true);
      const state = await getUsadLendingPoolState();
      const onChainPrice = await getAssetPriceForProgram(USAD_LENDING_POOL_PROGRAM_ID, '2field');
      setAssetPriceUsad(onChainPrice);
      setTotalSuppliedUsad(state.totalSupplied ?? '0');
      setTotalBorrowedUsad(state.totalBorrowed ?? '0');
      setUtilizationIndexUsad(state.utilizationIndex ?? '0');
      setLiquidityIndexUsad(state.liquidityIndex ?? null);
      setBorrowIndexUsad(state.borrowIndex ?? null);
      const ts = Number(state.totalSupplied ?? 0) || 0;
      const tb = Number(state.totalBorrowed ?? 0) || 0;
      const chainApyUsad = await getPoolApyFractionsFromChain(USAD_LENDING_POOL_PROGRAM_ID, '2field');
      const { supplyAPY: sApy, borrowAPY: bApy } = resolvePoolApyDisplay(ts, tb, chainApyUsad);
      setSupplyAPYUsad(sApy);
      setBorrowAPYUsad(bApy);

      if (includeUserPosition && requestRecords && publicKey) {
        try {
          await fetchRecordsInBackgroundUsad();
          const scaledUsad =
            USAD_LENDING_POOL_PROGRAM_ID === LENDING_POOL_PROGRAM_ID
              ? await parseLatestLendingPositionScaled(
                  requestRecords,
                  LENDING_POOL_PROGRAM_ID,
                  decrypt,
                )
              : await parseLatestLendingPositionScaled(
                  requestRecords,
                  USAD_LENDING_POOL_PROGRAM_ID,
                  decrypt,
                );
          const effective = await getAleoPoolUserEffectivePosition(
            USAD_LENDING_POOL_PROGRAM_ID,
            publicKey,
            '2field',
            scaledUsad,
          );
          if (effective) {
            setEffectiveUserSuppliedUsad(effective.effectiveSupplyBalance);
            setEffectiveUserBorrowedUsad(effective.effectiveBorrowDebt);
          } else {
            setEffectiveUserSuppliedUsad(null);
            setEffectiveUserBorrowedUsad(null);
          }

          const privUsad = await getPrivateUsadBalance(requestRecords, decrypt);
          setPrivateUsadBalance(privUsad);
          privacyLog('[USAD refresh debug]', {
            effectiveSupply_usad: effective?.effectiveSupplyBalance ?? null,
            effectiveBorrow_usad: effective?.effectiveBorrowDebt ?? null,
            privateBalance_usad: privUsad,
          });
          await refreshChainPortfolioCapsForActiveView();
        } catch (error) {
          privacyWarn('Failed to refresh USAD user position:', error);
          setUserSuppliedUsad('0');
          setUserBorrowedUsad('0');
          setTotalDepositsUsad('0');
          setTotalWithdrawalsUsad('0');
          setTotalBorrowsUsad('0');
          setTotalRepaymentsUsad('0');
          setEffectiveUserSuppliedUsad(null);
          setEffectiveUserBorrowedUsad(null);
          setPrivateUsadBalance(null);
          setChainBorrowCaps(null);
          setChainWithdrawCaps(null);
        }
      } else if (!publicKey?.trim()) {
        setEffectiveUserSuppliedUsad(null);
        setEffectiveUserBorrowedUsad(null);
        setPrivateUsadBalance(null);
        setChainBorrowCaps(null);
        setChainWithdrawCaps(null);
      }
      // Pool-only refresh while wallet connected: do not clear user rows or chain caps (same as USDC).
    } catch (e) {
      console.error('Failed to fetch USAD pool state', e);
    } finally {
      setIsRefreshingUsadState(false);
    }
  };

  /** Hero / portfolio USD from unified lending mappings (address + RPC only; no private records). */
  useEffect(() => {
    if (!connected || !publicKey?.trim()) {
      setChainBorrowCaps(null);
      setChainWithdrawCaps(null);
      return;
    }
    void refreshChainPortfolioCapsForActiveView();
  }, [connected, publicKey, refreshChainPortfolioCapsForActiveView]);

  // One-time pool state fetch on page load/refresh and when wallet connects.
  // This DOES NOT touch private records / requestRecords to avoid extra wallet prompts.
  useEffect(() => {
    refreshPoolState(false);
    refreshUsdcPoolState(false);
    refreshUsadPoolState(false);
  }, [publicKey, connected]);

  // When wallet connects, trigger a ONE-TIME broad records request to get permissions up front.
  // This will show the wallet permission popup once per connection, then we rely on manual refresh.
  useEffect(() => {
    if (!connected || !publicKey || !requestRecords) {
      // Reset flag on disconnect so next connection can re-initialize
      if (!connected && walletPermissionsInitialized) {
        setWalletPermissionsInitialized(false);
      }
      if (!connected && userPositionInitialized) {
        setUserPositionInitialized(false);
      }
      return;
    }

    if (walletPermissionsInitialized) return;

    (async () => {
      try {
        privacyLog('🔐 Initializing wallet record permissions (one-time request)...');
        // Some wallets do not allow an empty program string. Instead, request for
        // the specific programs this dApp cares about so the user sees at most
        // one prompt per program.
        try {
          await requestRecords(LENDING_POOL_PROGRAM_ID, false);
          privacyLog(`✅ Wallet record permissions initialized for ${LENDING_POOL_PROGRAM_ID}`);
        } catch (e: any) {
          privacyWarn(
            `⚠️ Failed to pre-initialize permissions for ${LENDING_POOL_PROGRAM_ID}:`,
            e?.message,
          );
        }
        try {
          await requestRecords(USDC_LENDING_POOL_PROGRAM_ID, false);
          privacyLog(`✅ Wallet record permissions initialized for ${USDC_LENDING_POOL_PROGRAM_ID}`);
        } catch (e: any) {
          privacyWarn(`⚠️ Failed to pre-initialize permissions for ${USDC_LENDING_POOL_PROGRAM_ID}:`, e?.message);
        }
        try {
          await requestRecords(USAD_LENDING_POOL_PROGRAM_ID, false);
          privacyLog(`✅ Wallet record permissions initialized for ${USAD_LENDING_POOL_PROGRAM_ID}`);
        } catch (e: any) {
          privacyWarn(`⚠️ Failed to pre-initialize permissions for ${USAD_LENDING_POOL_PROGRAM_ID}:`, e?.message);
        }
        try {
          await requestRecords('credits.aleo', false);
          privacyLog('✅ Wallet record permissions initialized for credits.aleo');
        } catch (e: any) {
          privacyWarn('⚠️ Failed to pre-initialize permissions for credits.aleo:', e?.message);
        }
      } finally {
        setWalletPermissionsInitialized(true);
      }
    })();
  }, [connected, publicKey, requestRecords, walletPermissionsInitialized, userPositionInitialized]);

  // After wallet is connected and permissions are initialized, load the user's
  // position once automatically (Your Position / Activity Totals). Skipped on Flash/Liquidation/etc.
  useEffect(() => {
    if (!connected || !publicKey || !requestRecords) {
      return;
    }
    if (!walletPermissionsInitialized) {
      // Wait until we've done the initial record-permission request
      return;
    }
    if (!viewWantsFullLendingHydration) {
      return;
    }
    if (userPositionInitialized) {
      return;
    }

    (async () => {
      try {
        await Promise.all([
          refreshPoolState(true),
          refreshUsdcPoolState(true),
          refreshUsadPoolState(true),
        ]);
      } finally {
        setUserPositionInitialized(true);
      }
    })();
  }, [
    connected,
    publicKey,
    requestRecords,
    walletPermissionsInitialized,
    userPositionInitialized,
    viewWantsFullLendingHydration,
  ]);

  // Load Supabase tx history only on views that show it (avoid work on Flash-only visits).
  const viewWantsTxHistory = view === 'dashboard' || view === 'liquidation';
  useEffect(() => {
    if (!address?.trim()) {
      setTxHistory([]);
      return;
    }
    if (viewWantsTxHistory) {
      fetchTransactionHistory();
    }
  }, [address, viewWantsTxHistory, fetchTransactionHistory]);

  // Flash sessions API only when Flash tab is open (sessions table is not shown elsewhere).
  useEffect(() => {
    if (!address?.trim()) {
      setFlashSessions([]);
      return;
    }
    if (view === 'flash') {
      fetchFlashSessions();
    }
  }, [address, view, fetchFlashSessions]);

  // Poll only what the current view needs (no duplicate 60s load of both lists on every tab).
  useEffect(() => {
    if (!address?.trim()) return;
    const interval = setInterval(() => {
      if (view === 'dashboard' || view === 'liquidation') {
        fetchTransactionHistory();
      }
      if (view === 'flash') {
        fetchFlashSessions();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [address, view, fetchTransactionHistory, fetchFlashSessions]);

  useEffect(() => {
    if (!flashSessionId) return;
    const row = flashSessions.find((s) => s.id === flashSessionId);
    if (row?.vault_fund_tx_id) setFlashVaultTxId(row.vault_fund_tx_id);
  }, [flashSessionId, flashSessions]);

  useEffect(() => {
    if (view !== 'flash' || !flashSessions.length) return;
    const latest = [...flashSessions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    if (!latest) return;
    const latestStatus = String(latest.status || '').toLowerCase();
    if (FLASH_SESSION_TERMINAL_STATUSES.has(latestStatus)) {
      // No latest active session to settle -> keep settle fields empty/default.
      setFlashSessionId(null);
      setFlashRepayInput('');
      setFlashSettleAsset('0field');
      setFlashStrategyIdInput('1field');
      return;
    }
    prefillSettleFromSession(latest);
  }, [view, flashSessions, prefillSettleFromSession]);

  useEffect(() => {
    if (view !== 'flash') return;
    let cancelled = false;
    void (async () => {
      try {
        const v = await fetchAvailableLiquidityMicro(LENDING_POOL_PROGRAM_ID, flashAsset);
        if (!cancelled) setFlashAvailLiquidityMicro(v);
      } catch {
        if (!cancelled) setFlashAvailLiquidityMicro(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, flashAsset]);

  const inlineTxClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // After inline panel tx finalizes: clear inputs + overview (brief delay so explorer link can show)
  useEffect(() => {
    if (!txFinalized || loading || !inlineTxContext) return;
    if (inlineTxClearTimerRef.current) clearTimeout(inlineTxClearTimerRef.current);
    inlineTxClearTimerRef.current = setTimeout(() => {
      inlineTxClearTimerRef.current = null;
      setManageAmountInput('');
      setInlineTxContext(null);
      setModalAmountInput('');
      setAmount(0);
      setAmountUsdc(0);
      setAmountUsad(0);
      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('');
      setActionModalSubmitted(false);
    }, 1800);
    return () => {
      if (inlineTxClearTimerRef.current) clearTimeout(inlineTxClearTimerRef.current);
    };
  }, [txFinalized, loading, inlineTxContext]);

  const handleAction = async (
    action: 'deposit' | 'borrow' | 'repay' | 'withdraw',
    amountOverride?: number,
  ) => {
    if (!connected) {
      const error = 'Please connect your wallet first.';
      setStatusMessage(error);
      console.error('❌ VALIDATION FAILED: Wallet not connected');
      privacyLog('========================================\n');
      return;
    }
    
    if (!publicKey) {
      const error = 'Public key not available. Please reconnect your wallet.';
      setStatusMessage(error);
      console.error('❌ VALIDATION FAILED: Public key not available');
      privacyLog('========================================\n');
      return;
    }

    const amountToUse = typeof amountOverride === 'number' ? amountOverride : amount;
    
    try {
      setLoading(true);
      setStatusMessage(`Executing ${action}...`);
      setAmountError(null);
      
      if (amountToUse <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      // Cross-asset repay: any asset can pay down total USD debt; cap payment at portfolio total.
      if (action === 'repay') {
        if (portfolioDebtUsdForRepay <= 1e-9) {
          const msg = 'No outstanding debt to repay.';
          setAmountError(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
        if (
          !repayAmountAssetWithinTotalDebtUsd(amountToUse, ALEO_PRICE_USD, portfolioDebtUsdForRepay)
        ) {
          const cap =
            ALEO_PRICE_USD > 0 ? portfolioDebtUsdForRepay / ALEO_PRICE_USD : 0;
          const msg = `Repay exceeds total portfolio debt (~$${portfolioDebtUsdForRepay.toFixed(
            2,
          )}). At current prices, pay at most ~${cap.toFixed(4)} ALEO (you can clear all debt using any asset).`;
          setAmountError(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      // Vault liquidity check (borrow/withdraw payouts are settled from backend vault).
      // Keep existing portfolio/on-chain checks; this is an additional safety gate.
      let vaultBalancesHuman: { aleo: number; usdcx: number; usad: number } | null = null;
      if (action === 'borrow' || action === 'withdraw') {
        vaultBalancesHuman = await fetchVaultHumanBalancesFromBackend();
        const vault = vaultBalancesHuman;
        if (vault && amountToUse > (vault.aleo ?? 0)) {
          const max = Math.max(0, vault.aleo ?? 0);
          const msg = `Insufficient vault liquidity. You can ${action} at most ${max.toFixed(2)} ALEO right now (vault wallet balance).`;
          setAmountError(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      // First check for deposit/repay: private Aleo balance must be at least the input amount
      if (action === 'deposit' || action === 'repay') {
        let balance = privateAleoBalance;
        if (balance === null && requestRecords) {
          balance = await getPrivateCreditsBalance(requestRecords, decrypt);
          setPrivateAleoBalance(balance);
        }
        if (amountToUse > (balance ?? 0)) {
          const msg = `Insufficient private Aleo. Your balance: ${(Math.floor((balance ?? 0) * 100) / 100).toFixed(2)} credits.`;
          setAmountError(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      // Frontend limit checks (Aleo pool):
      // Program and mappings use micro-ALEO (u64). Convert to ALEO (credits) for comparisons with `amount`.
      const netSuppliedMicro = effectiveMicroOrWalletAggregate(effectiveUserSupplied, userSupplied);
      const netBorrowedMicro = effectiveMicroOrWalletAggregate(effectiveUserBorrowed, userBorrowed);
      const poolSuppliedMicro = Number(totalSupplied) || 0;
      const poolBorrowedMicro = Number(totalBorrowed) || 0;

      const netSupplied = netSuppliedMicro / 1_000_000; // ALEO
      const netBorrowed = netBorrowedMicro / 1_000_000; // ALEO
      const availableLiquidity = Math.max(
        0,
        (poolSuppliedMicro - poolBorrowedMicro) / 1_000_000,
      ); // ALEO
      // When pool state is not loaded (totalSupplied 0), allow withdraw up to user position; program will enforce liquidity
      const poolStateLoaded = poolSuppliedMicro > 0 || poolBorrowedMicro > 0;
      // LTV-safe withdraw limit: w <= C - D/0.75
      const maxWithdrawByLtv = Math.max(0, netSupplied - netBorrowed / 0.75);
      const maxWithdrawable = poolStateLoaded
        ? Math.min(netSupplied, availableLiquidity, maxWithdrawByLtv)
        : Math.min(netSupplied, maxWithdrawByLtv);

      // Withdraw: same shared USD budget ÷ price as inline Withdraw + modal (`withdrawMaxAleoUi`), not the
      // per-asset micro cap alone (integer rounding can under-report vs supplied / vs portfolio max USD).
      const effectiveMaxWithdraw = withdrawMaxAleoUi;

      if (action === 'withdraw' && amountToUse > effectiveMaxWithdraw) {
        const caps = chainWithdrawCaps;
        const softCapped =
          caps != null && caps.maxWithdrawMicroAleoPortfolio > caps.maxWithdrawMicroAleo;
        const portfolioAleoHuman = caps
          ? Number(caps.maxWithdrawMicroAleoPortfolio) / 1_000_000
          : null;
        const mappingAleoHuman =
          caps?.availableLiquidityMicroAleo != null
            ? Number(caps.availableLiquidityMicroAleo) / 1_000_000
            : null;
        const vaultAleo = vaultBalancesHuman?.aleo ?? null;
        const msg = softCapped
          ? `You can withdraw at most ${effectiveMaxWithdraw.toFixed(2)} ALEO. Cross-asset withdraw is capped at the lower of your collateral (~${portfolioAleoHuman != null ? portfolioAleoHuman.toFixed(2) : '?'} ALEO) and treasury liquidity${vaultAleo != null && Number.isFinite(vaultAleo) ? ` (~${vaultAleo.toFixed(2)} ALEO in vault)` : ''}. If the transaction still reverts, the on-chain pool counter may be below the vault — deposit ALEO into the pool or use USDCx/USAD withdraw.${mappingAleoHuman != null && mappingAleoHuman + 1e-9 < (portfolioAleoHuman ?? Infinity) ? ` (Program mapping idle ALEO ~${mappingAleoHuman.toFixed(2)}.)` : ''}`
          : `You can withdraw at most ${effectiveMaxWithdraw.toFixed(
              2,
            )} ALEO (frontend estimate from on-chain caps). Final limit is enforced on-chain by cross-collateral portfolio checks.`;
        setAmountError(msg);
        setStatusMessage(msg);
        setLoading(false);
        return;
      }

      // Repay supports cross-asset debt reduction on-chain.
      // Program clamps the USD repayment to total debt, so we only restrict by user balance above.

      if (action === 'borrow' && amountToUse > availableBorrowAleo) {
        const msg = `Borrow amount exceeds your available borrow (${availableBorrowAleo.toFixed(
          4,
        )} ALEO, frontend estimate). Final limit is enforced on-chain by cross-collateral portfolio checks.`;
        setAmountError(msg);
        setStatusMessage(msg);
        setLoading(false);
        return;
      }

      setActionModalSubmitted(true);
      let tx: string;
      const startTime = Date.now();

      // v7: Contract reads user data from mappings automatically - only amount needed
      privacyLog(`🔄 Executing ${action} transaction...`);
      switch (action) {
        case 'deposit':
          privacyLog('💰 DEPOSIT: Starting deposit transaction (executeTransaction)...');
          tx = await lendingDeposit(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          privacyLog('💰 DEPOSIT: Transaction submitted successfully:', tx);
          break;
        case 'borrow':
          privacyLog('📥 BORROW: Starting borrow transaction (executeTransaction)...');
          setVaultBorrowTxId(null);
          tx = await lendingBorrow(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          privacyLog('📥 BORROW: Transaction submitted successfully:', tx);
          break;
        case 'repay':
          privacyLog('💳 REPAY: Starting repay_with_credits transaction (executeTransaction)...');
          tx = await lendingRepay(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          privacyLog('💳 REPAY: Transaction submitted successfully:', tx);
          break;
        case 'withdraw':
          privacyLog('💸 WITHDRAW: Starting withdraw transaction (executeTransaction)...');
          setVaultWithdrawTxId(null);
          {
            let microOverride: bigint | undefined;
            if (chainWithdrawCaps?.maxWithdrawMicroAleo != null) {
              const cap = chainWithdrawCaps.maxWithdrawMicroAleo;
              const req = BigInt(Math.floor(amountToUse * 1_000_000 + 1e-9));
              microOverride = req > cap ? cap : req;
            }
            tx = await lendingWithdraw(
              executeTransaction,
              amountToUse,
              publicKey || undefined,
              requestRecords,
              decrypt,
              microOverride,
            );
          }
          privacyLog('💸 WITHDRAW: Transaction submitted successfully:', tx);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // If wallet action was cancelled, upstream helper returns sentinel value.
      if (tx === '__CANCELLED__') {
        privacyLog(`💡 ${action.toUpperCase()} transaction was cancelled by user (no error).`);
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) {
          setTimeout(() => setStatusMessage(''), 2500);
        }
        setLoading(false);
        privacyLog('========================================\n');
        return;
      }

      const transactionTime = Date.now() - startTime;
      privacyLog(`⏱️ Transaction submitted in ${transactionTime}ms`);

      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('Transaction submitted. Waiting for finalization…');
      
      privacyLog('📤 Transaction ID:', tx);
      privacyLog('⏳ Starting finalization polling...');

      // Poll for transaction finalization; then save to Supabase (withdraw/borrow). Backend watcher performs vault transfer.
      let finalized = false;
      let txFailed = false;
      let finalTxId = tx; // use final on-chain id (at1...) for explorer and Supabase, not the initial shield id
      const maxAttempts = 45;
      const delayMs = 2000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        privacyLog(`🔄 Polling transaction status (attempt ${attempt}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        if (transactionStatus) {
          try {
            const statusResult = await transactionStatus(tx);
            privacyLog(`📊 Transaction status (attempt ${attempt}):`, statusResult);

            const statusText =
              typeof statusResult === 'string'
                ? statusResult
                : (statusResult as any)?.status ?? '';
            const statusLower = (statusText || '').toLowerCase();

            if (statusLower === 'finalized' || statusLower === 'accepted') {
              finalized = true;
              privacyLog('✅ Transaction finalized!', statusResult);
              const resolvedId =
                (typeof statusResult === 'object' && (statusResult as any).transactionId) || tx;
              finalTxId = resolvedId;
              setTxId(isExplorerHash(resolvedId) ? resolvedId : null);
              break;
            }
            if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
              txFailed = true;
              logPoolTxRejected('ALEO pool', statusLower, tx, {
                action,
                program: LENDING_POOL_PROGRAM_ID,
              });
              setStatusMessage(
                `Transaction ${statusLower} on-chain (not a vault step). Try a slightly lower amount, refresh caps, or repay any remaining borrow dust and retry.`,
              );
              setLoading(false);
              privacyLog('========================================\n');
              return;
            }
            setStatusMessage(`Transaction ${statusText || 'pending'}... (attempt ${attempt}/${maxAttempts})`);
          } catch (e) {
            privacyWarn(`⚠️ Failed to check transaction status (attempt ${attempt}):`, e);
          }
        } else {
          if (attempt === maxAttempts) {
            finalized = true;
            privacyLog('⏰ Max attempts reached, assuming finalized');
          }
        }
      }

      if (txFailed) {
        setLoading(false);
        privacyLog('========================================\n');
        return;
      }
      if (!finalized) {
        setStatusMessage(
          'Transaction not finalized in time. Please check the explorer. Backend will process vault transfer once it is finalized.'
        );
        setLoading(false);
        privacyLog('========================================\n');
        return;
      }

      setTxFinalized(true);
      privacyLog('✅ Transaction finalized successfully!');

      if (action === 'deposit' || action === 'repay') {
        if (publicKey) {
          saveTransactionToSupabase(
            publicKey,
            finalTxId,
            action,
            'aleo',
            amountToUse,
            LENDING_POOL_PROGRAM_ID
          )
            .then(() => fetchTransactionHistory())
            .catch(() => { });
        }
      }

      // After finalization: save one record (vault_tx_id null). Backend watcher picks it up and performs vault transfer; no frontend call.
      if (action === 'withdraw' || action === 'borrow') {
        if (publicKey) {
          await saveTransactionToSupabase(
            publicKey,
            finalTxId,
            action,
            'aleo',
            amountToUse,
            LENDING_POOL_PROGRAM_ID,
            null
          ).catch(() => { });
          fetchTransactionHistory();
        }
      }

      setAmount(0);
      privacyLog('📋 Refreshing pool and user position after transaction finalization...');
      try {
        // Cross-asset repay updates every asset's scaled borrow on-chain; refresh all rows.
        if (action === 'repay') {
          await Promise.all([
            refreshPoolState(true),
            refreshUsdcPoolState(true),
            refreshUsadPoolState(true),
          ]);
        } else {
        await refreshPoolState(true);
        }
        if (action === 'withdraw' || action === 'borrow') {
          setStatusMessage('Transaction finalized! Vault transfer will be done in 1–5 min — check status in Transaction History.');
        } else {
          setStatusMessage('Transaction finalized! Pool and position have been refreshed.');
        }
        if (!isDevAppEnv) setTimeout(() => setStatusMessage(''), 5000);
      } catch (refreshError) {
        privacyWarn('⚠️ Failed to refresh pool state after transaction:', refreshError);
        setStatusMessage('Transaction finalized, but automatic refresh failed. Please click Refresh to update.');
      }
      privacyLog('✅ Transaction flow completed successfully');
      privacyLog('========================================\n');
    } catch (e: any) {
      const displayMsg = getErrorMessage(e);
      if (process.env.NODE_ENV === 'development') {
        privacyWarn(`[${action}]`, displayMsg, e);
      }
      
      // Detect wallet cancellation/rejection
      const errorMsg = displayMsg.toLowerCase();
      const isCancelled = errorMsg.includes('cancel') || errorMsg.includes('reject') || errorMsg.includes('denied') || errorMsg.includes('user rejected');
      
      if (isCancelled) {
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) {
          setTimeout(() => setStatusMessage(''), 2500);
        }
      } else {
        setStatusMessage(displayMsg);
        const isLiquidityOrLimit =
          errorMsg.includes('withdraw at most') ||
          errorMsg.includes('available pool liquidity') ||
          errorMsg.includes('free for withdrawal') ||
          errorMsg.includes('exceeds available') ||
          errorMsg.includes('insufficient liquidity');
        if (isLiquidityOrLimit) setAmountError(displayMsg);
      }
    } finally {
      setLoading(false);
      privacyLog(`🏁 ${action.toUpperCase()} flow ended (loading set to false)`);
    }
  };

  async function waitForPoolTxFinalization(
    tx: string,
    action: 'flash_open' | 'flash_settle',
  ): Promise<string> {
    let finalTxId = tx;
    let finalized = false;
    const maxAttempts = 45;
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (transactionStatus) {
        try {
          const statusResult = await transactionStatus(tx);
          const statusText =
            typeof statusResult === 'string'
              ? statusResult
              : (statusResult as { status?: string })?.status ?? '';
          const statusLower = (statusText || '').toLowerCase();
          if (statusLower === 'finalized' || statusLower === 'accepted') {
            finalized = true;
            const resolvedId =
              (typeof statusResult === 'object' &&
                (statusResult as { transactionId?: string }).transactionId) ||
              tx;
            finalTxId = resolvedId;
            setFlashTxId(isExplorerHash(resolvedId) ? resolvedId : null);
            break;
          }
          if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
            logPoolTxRejected('ALEO pool', statusLower, tx, {
              action,
              program: LENDING_POOL_PROGRAM_ID,
            });
            throw new Error(`Transaction ${statusLower}.`);
          }
          setFlashStatusMessage(`Transaction ${statusText || 'pending'}… (${attempt}/${maxAttempts})`);
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('Transaction ')) throw e;
          privacyWarn('Flash tx status poll:', e);
        }
      }
    }
    if (!finalized) {
      throw new Error('Transaction not finalized in time. Check the explorer.');
    }
    return finalTxId;
  }

  /** Unified pool flash: open session (`flash_open`) for selected asset. */
  const handleFlashLoan = async () => {
    setFlashOpenAttempted(true);
    if (!connected || !publicKey || !executeTransaction || !requestRecords) {
      setFlashStatusMessage('Please connect your wallet.');
      return;
    }
    if (isRefreshingState) {
      setFlashStatusMessage('Wait for pool data to finish loading, then try again.');
      return;
    }
    const principal = Number(flashAmountInput);
    if (!Number.isFinite(principal) || principal <= 0) {
      setFlashStatusMessage('Enter a valid principal amount.');
      return;
    }
    const principalMicro = Math.round(principal * 1_000_000);
    let onChainAvail: bigint | null = null;
    try {
      onChainAvail = await fetchAvailableLiquidityMicro(LENDING_POOL_PROGRAM_ID, flashAsset);
      setFlashAvailLiquidityMicro(onChainAvail);
    } catch {
      onChainAvail = null;
    }
    if (onChainAvail != null && BigInt(principalMicro) > onChainAvail) {
      setFlashStatusMessage(
        `Principal exceeds on-chain available liquidity for this asset (${(Number(onChainAvail) / 1_000_000).toFixed(6)}).`,
      );
      return;
    }
    const minProfit = Number(flashMinProfitInput || '0');
    if (!Number.isFinite(minProfit) || minProfit < 0) {
      setFlashStatusMessage('Enter valid min profit (>= 0).');
      return;
    }
    const strategyId = (flashStrategyIdInput || '').trim();
    if (!/^\d+field$/.test(strategyId)) {
      setFlashStatusMessage("Strategy id must be Leo field like '1field'.");
      return;
    }
    const feeMicro = aleoFlashFeeMicro(principalMicro);
    const totalMicro = principalMicro + feeMicro + Math.round(minProfit * 1_000_000);
    if (flashAsset === '0field') {
      let balance = privateAleoBalance;
      if (balance === null && requestRecords) {
        balance = await getPrivateCreditsBalance(requestRecords, decrypt);
        setPrivateAleoBalance(balance);
      }
      if (totalMicro / 1_000_000 > (balance ?? 0) + 1e-9) {
        setFlashStatusMessage(
          `Need one private credits record covering principal + fee + min profit (${(totalMicro / 1_000_000).toFixed(6)} ALEO).`,
        );
        return;
      }
    } else if (flashAsset === '1field') {
      const rec = await getSuitableUsdcTokenRecord(requestRecords, totalMicro, publicKey, decrypt);
      if (!rec) {
        setFlashStatusMessage(
          `Need one USDCx Token record covering principal + fee + min profit (${(totalMicro / 1_000_000).toFixed(6)} USDC).`,
        );
        return;
      }
    } else {
      const rec = await getSuitableUsadTokenRecord(requestRecords, totalMicro, publicKey, decrypt);
      if (!rec) {
        setFlashStatusMessage(
          `Need one USAD Token record covering principal + fee + min profit (${(totalMicro / 1_000_000).toFixed(6)} USAD).`,
        );
        return;
      }
    }
    try {
      setFlashTxModalKind('open');
      setFlashTxModalOpen(true);
      setFlashLoading(true);
      setFlashStatusMessage('Submitting flash open…');
      setFlashVaultTxId(null);
      setFlashTxId(null);
      const tx = await lendingFlashOpen(
        executeTransaction,
        principal,
        minProfit,
        strategyId,
        publicKey,
        requestRecords,
        decrypt,
        LENDING_POOL_PROGRAM_ID,
        flashAsset,
      );
      if (tx === '__CANCELLED__') {
        setFlashStatusMessage('Transaction cancelled by user.');
        setFlashLoading(false);
        return;
      }
      const finalTxId = await waitForPoolTxFinalization(tx, 'flash_open');
      const idempotencyKey = `flash-${publicKey}-${Date.now()}`;
      const recResp = await fetch('/api/flash-record-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_address: publicKey,
          strategy_wallet: publicKey,
          asset_id: flashAsset,
          principal_micro: principalMicro,
          min_profit_micro: Math.round(minProfit * 1_000_000),
          strategy_id: strategyId,
          flash_open_tx_id: finalTxId,
          idempotency_key: idempotencyKey,
        }),
      });
      const recJson = await recResp.json().catch(() => ({}));
      if (!recResp.ok) {
        throw new Error(recJson?.error || 'Flash open finalized, but failed to record session');
      }
      const session = recJson?.session;
      if (session?.id) setFlashSessionId(session.id);
      setFlashOpenAttempted(false);
      setFlashTxId(finalTxId);
      setFlashRepayInput(((totalMicro) / 1_000_000).toFixed(6));
      setFlashStatusMessage('Flash session opened. Backend watcher will fund from vault shortly.');
      fetchTransactionHistory();
      fetchFlashSessions();
      try {
        await refreshPoolState(true);
      } catch {
        setFlashStatusMessage((s) => s + ' (Refresh pool manually.)');
      }
    } catch (e: unknown) {
      setFlashStatusMessage(getErrorMessage(e));
    } finally {
      setFlashLoading(false);
    }
  };

  const handleFlashSettle = async () => {
    if (!connected || !publicKey || !executeTransaction || !requestRecords) {
      setFlashStatusMessage('Please connect your wallet.');
      return;
    }
    const repay = Number(flashRepayInput);
    if (!Number.isFinite(repay) || repay <= 0) {
      setFlashStatusMessage('Enter valid repay amount (> 0).');
      return;
    }
    const strategyId = (flashStrategyIdInput || '').trim();
    if (!/^\d+field$/.test(strategyId)) {
      setFlashStatusMessage("Strategy id must be Leo field like '1field'.");
      return;
    }
    let sessionsSnapshot = flashSessions;
    if (publicKey?.trim()) {
      try {
        const resp = await fetch(
          `/api/flash-sessions?wallet=${encodeURIComponent(publicKey.trim())}&limit=100`,
        );
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && Array.isArray(data?.sessions)) sessionsSnapshot = data.sessions;
      } catch {
        /* keep flashSessions */
      }
    }
    const explicitSession = flashSessionId?.trim();
    const rowForAsset = explicitSession
      ? sessionsSnapshot.find((s) => s.id === explicitSession)
      : [...sessionsSnapshot]
          .filter((s) => ['funded', 'settle_pending'].includes(String(s.status || '').toLowerCase()))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const aid = rowForAsset?.asset_id;
    const settleAsset: FlashLendingAssetId =
      aid === '0field' || aid === '1field' || aid === '2field' ? aid : flashSettleAsset;
    const repayMicro = Math.round(repay * 1_000_000);
    const principalMicro = Number(rowForAsset?.principal_micro ?? 0);
    if (Number.isFinite(principalMicro) && principalMicro > 0) {
      const principalMicroRounded = Math.round(principalMicro);
      const feeMicro = aleoFlashFeeMicro(principalMicroRounded);
      const minRequiredMicro = principalMicroRounded + feeMicro;
      if (repayMicro < minRequiredMicro) {
        const settleUnit = settleAsset === '0field' ? 'ALEO' : settleAsset === '1field' ? 'USDCx' : 'USAD';
        setFlashStatusMessage(
          `Repay amount is too low. Minimum needed is ${(minRequiredMicro / 1_000_000).toFixed(6)} ${settleUnit} (principal + fee).`,
        );
        return;
      }
    }
    try {
      setFlashTxModalKind('settle');
      setFlashTxModalOpen(true);
      setFlashLoading(true);
      setFlashStatusMessage('Submitting flash settle…');
      setFlashTxId(null);
      let tx: string;
      if (settleAsset === '0field') {
        tx = await lendingFlashSettleWithCredits(
          executeTransaction,
          repay,
          strategyId,
          publicKey,
          requestRecords,
          decrypt,
        );
      } else if (settleAsset === '1field') {
        tx = await lendingFlashSettleWithUsdcx(
          executeTransaction,
          repay,
          strategyId,
          publicKey,
          requestRecords,
          decrypt,
        );
      } else {
        tx = await lendingFlashSettleWithUsad(
          executeTransaction,
          repay,
          strategyId,
          publicKey,
          requestRecords,
          decrypt,
        );
      }
      if (tx === '__CANCELLED__') {
        setFlashStatusMessage('Transaction cancelled by user.');
        setFlashLoading(false);
        return;
      }
      const finalTxId = await waitForPoolTxFinalization(tx, 'flash_settle');
      setFlashTxId(finalTxId);
      let sessionsForResolve = sessionsSnapshot;
      if (publicKey?.trim()) {
        try {
          const resp = await fetch(
            `/api/flash-sessions?wallet=${encodeURIComponent(publicKey.trim())}&limit=100`,
          );
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && Array.isArray(data?.sessions)) sessionsForResolve = data.sessions;
        } catch {
          /* use snapshot */
        }
      }
      const sessionIdForSettle = (() => {
        const explicit = flashSessionId?.trim();
        if (explicit) return explicit;
        const candidates = sessionsForResolve.filter((s) =>
          ['funded', 'settle_pending'].includes(String(s.status || '').toLowerCase()),
        );
        if (!candidates.length) return null;
        return [...candidates].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0]?.id ?? null;
      })();
      const readFlashBackendError = async (r: Response) => {
        try {
          const j = await r.json();
          return typeof j?.error === 'string' ? j.error : r.statusText || 'Request failed';
        } catch {
          return r.statusText || 'Request failed';
        }
      };
      const backendFlashWarnings: string[] = [];
      if (sessionIdForSettle) {
        try {
          const r1 = await fetch('/api/flash-mark-settle-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionIdForSettle, flash_settle_tx_id: finalTxId }),
          });
          if (!r1.ok) backendFlashWarnings.push(`mark-settle-pending: ${await readFlashBackendError(r1)}`);
        } catch (e) {
          backendFlashWarnings.push(`mark-settle-pending: ${getErrorMessage(e)}`);
        }
        try {
          const r2 = await fetch('/api/flash-complete-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionIdForSettle,
              flash_settle_tx_id: finalTxId,
              actual_repay_micro: Math.round(repay * 1_000_000),
            }),
          });
          if (!r2.ok) backendFlashWarnings.push(`complete-session: ${await readFlashBackendError(r2)}`);
        } catch (e) {
          backendFlashWarnings.push(`complete-session: ${getErrorMessage(e)}`);
        }
      } else {
        backendFlashWarnings.push(
          'No funded flash session in memory — refresh Flash Loan History after vault funding, then settle again to sync status.',
        );
      }
      /* Flash: open/fund/settle state lives in flash_sessions only (not transaction_history). */
      fetchFlashSessions();
      let settleMsg = 'Flash settle finalized successfully.';
      if (backendFlashWarnings.length) {
        settleMsg += ` ${backendFlashWarnings.join(' ')}`;
      }
      setFlashStatusMessage(settleMsg);
      try {
        await refreshPoolState(true);
      } catch {
        setFlashStatusMessage((s) => s + ' (Refresh pool manually.)');
      }
    } catch (e: unknown) {
      setFlashStatusMessage(getErrorMessage(e));
    } finally {
      setFlashLoading(false);
    }
  };

  const openOpenAccountModal = () => {
    setOpenAccountSubmitted(false);
    setOpenAccountStatusMsg('');
    setOpenAccountFlowDone(false);
    setOpenAccountModalOpen(true);
    // Auto-submit so the modal opens directly in processing state.
    setTimeout(() => {
      void handleOpenDarkPoolPosition();
    }, 0);
  };

  const closeOpenAccountModal = () => {
    if (openAccountSubmitted && !openAccountFlowDone) return;
    setOpenAccountModalOpen(false);
    setOpenAccountSubmitted(false);
    setOpenAccountFlowDone(false);
  };

  const handleOpenDarkPoolPosition = async () => {
    setOpenAccountStatusMsg('');
    if (!executeTransaction) {
      setOpenAccountStatusMsg('Wallet not ready.');
      return;
    }
    if (!publicKey) {
      setOpenAccountStatusMsg('Connect your wallet first.');
      return;
    }
    setOpenAccountSubmitted(true);
    setOpenAccountFlowDone(false);
    setOpenAccountStatusMsg('Submitting transaction…');
    try {
      const tx = await lendingOpenLendingAccount(executeTransaction, LENDING_POOL_PROGRAM_ID);
      logAleoTxExplorer('Create Dark Pool position', tx);
      let finalTxId = tx;
      let finalized = false;
      const maxAttempts = 45;
      const delayMs = 2000;
      setOpenAccountStatusMsg('Transaction submitted. Waiting for finalization…');
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (!transactionStatus) continue;
        try {
          const statusResult = await transactionStatus(tx);
          const statusText =
            typeof statusResult === 'string'
              ? statusResult
              : (statusResult as { status?: string })?.status ?? '';
          const statusLower = (statusText || '').toLowerCase();
          if (statusLower === 'finalized' || statusLower === 'accepted') {
            finalized = true;
            const resolvedId =
              (typeof statusResult === 'object' && (statusResult as { transactionId?: string }).transactionId) || tx;
            finalTxId = resolvedId;
            break;
          }
          if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
            logPoolTxRejected('ALEO pool', statusLower, tx, {
              action: 'open_position',
              program: LENDING_POOL_PROGRAM_ID,
            });
            setOpenAccountStatusMsg(
              `Transaction ${statusLower} on-chain. Check the explorer or try again.`,
            );
            setOpenAccountFlowDone(true);
            return;
          }
          setOpenAccountStatusMsg(`Transaction ${statusText || 'pending'}… (${attempt}/${maxAttempts})`);
        } catch {
          // continue polling
        }
      }
      if (!finalized) {
        setOpenAccountStatusMsg('Transaction not finalized in time. Check the explorer and use Refresh.');
        setOpenAccountFlowDone(true);
        return;
      }
      setOpenAccountStatusMsg('Transaction finalized. Syncing your private position…');
      await saveTransactionToSupabase(
        publicKey,
        finalTxId,
        'open_position',
        'aleo',
        0,
        LENDING_POOL_PROGRAM_ID,
        null,
      ).catch(() => { });
      fetchTransactionHistory();
      // Keep spinner visible and refresh in background until wallet exposes the new LendingPosition.
      const maxRecordAttempts = 90; // ~3 minutes at 2s interval
      const recordDelayMs = 2000;
      let foundPosition = false;
      for (let i = 1; i <= maxRecordAttempts; i++) {
        setOpenAccountStatusMsg(`Syncing private position… (${i}/${maxRecordAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, recordDelayMs));
        try {
          await refreshChainPortfolioCapsForActiveView();
          if (requestRecords) {
            const maybeScaled = await parseLatestLendingPositionScaled(
              requestRecords,
              LENDING_POOL_PROGRAM_ID,
              decrypt,
            );
            if (maybeScaled != null) {
              foundPosition = true;
              break;
            }
          }
        } catch {
          // Keep polling until the position record appears.
        }
      }
      if (foundPosition) {
        setOpenAccountModalOpen(false);
        setOpenAccountSubmitted(false);
        setOpenAccountFlowDone(false);
        setOpenAccountStatusMsg('');
        return;
      }
      setOpenAccountStatusMsg('Position not visible yet. Keep this open or click Refresh.');
      setOpenAccountFlowDone(true);
    } catch (e: unknown) {
      setOpenAccountStatusMsg(getErrorMessage(e));
      setOpenAccountFlowDone(true);
    }
  };

  const handleMintPositionMigrationNote = async () => {
    if (!connected || !publicKey || !executeTransaction) {
      setPosNoteStatus('Connect your wallet.');
      return;
    }
    if (chainPositionNoteSchema === POSITION_NOTE_SCHEMA_ON_CHAIN_V2) {
      setPosNoteStatus('On-chain migration flag already set — repeating would revert.');
      return;
    }
    try {
      setPosNoteLoading(true);
      setPosNoteStatus('Submitting mint_position_migration_note…');
      setPosNoteTxId(null);
      const tx = await lendingMintPositionMigrationNote(executeTransaction);
      if (tx === '__CANCELLED__') {
        setPosNoteStatus('Transaction cancelled by user.');
        return;
      }
      let finalTxId = tx;
      let finalized = false;
      const maxAttempts = 45;
      const delayMs = 2000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (!transactionStatus) continue;
        try {
          const statusResult = await transactionStatus(tx);
          const statusText =
            typeof statusResult === 'string'
              ? statusResult
              : (statusResult as { status?: string })?.status ?? '';
          const statusLower = (statusText || '').toLowerCase();
          if (statusLower === 'finalized' || statusLower === 'accepted') {
            finalized = true;
            const resolvedId =
              (typeof statusResult === 'object' && (statusResult as { transactionId?: string }).transactionId) || tx;
            finalTxId = resolvedId;
            setPosNoteTxId(isExplorerHash(resolvedId) ? resolvedId : null);
            break;
          }
          if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
            setPosNoteStatus(`Transaction ${statusLower}.`);
            return;
          }
          setPosNoteStatus(`Transaction ${statusText || 'pending'}… (${attempt}/${maxAttempts})`);
        } catch {
          // continue polling
        }
      }
      if (!finalized) {
        setPosNoteStatus('Transaction not finalized in time. Check explorer.');
        return;
      }
      setPosNoteStatus('Finalized. Refresh wallet records to see PositionNote.');
      const v = await getPositionNoteSchemaFromChain(LENDING_POOL_PROGRAM_ID, publicKey);
      setChainPositionNoteSchema(v);
      if (requestRecords) {
        const recs = await requestRecords(LENDING_POOL_PROGRAM_ID, false);
        setMigrationRecSummary(summarizeLendingRecordsForMigration(LENDING_POOL_PROGRAM_ID, recs));
      }
    } catch (e: unknown) {
      setPosNoteStatus(getErrorMessage(e));
    } finally {
      setPosNoteLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'liquidation') {
      setLiqPreview({ loading: false, ok: false, liquidatable: false });
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!publicKey?.trim().startsWith('aleo1') || !requestRecords) {
        setLiqPreview({ loading: false, ok: false, reason: 'Connect wallet to preview self-liquidation.' });
        return;
      }
      const repayRaw = Number(liqRepayAmountInput);
      const repay = Number.isFinite(repayRaw) && repayRaw > 0 ? repayRaw : 0;
      setLiqPreview((p) => ({ ...p, loading: true }));
      const scaled = await parseLatestLendingPositionScaled(requestRecords, LENDING_POOL_PROGRAM_ID, decrypt);
      const preview = await getLiquidationPreviewAleo(
        LENDING_POOL_PROGRAM_ID,
        repay,
        liqSeizeAsset,
        scaled,
      );
      if (cancelled) return;
      setLiqPreview({
        loading: false,
        ok: preview.ok,
        reason: preview.reason,
        liquidatable: preview.liquidatable,
        totalDebtUsd: preview.totalDebtUsd,
        thresholdCollateralUsd: preview.thresholdCollateralUsd,
        aleoDebt: preview.aleoDebt,
        maxCloseAleo: preview.maxCloseAleo,
        seizeAmount: preview.seizeAmount,
        collateralSeizeAsset: preview.collateralSeizeAsset,
        liqBonusBps: preview.liqBonusBps,
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [view, liqRepayAmountInput, liqSeizeAsset, publicKey, requestRecords, decrypt]);

  useEffect(() => {
    if (view !== 'liquidation' || !connected || !requestRecords || !publicKey?.trim().startsWith('aleo1')) {
      setLiqUiLimits(null);
      return;
    }
    let cancelled = false;
    setLiqUiLimits(null);
    void (async () => {
      try {
        const lim = await getSelfLiquidationUiLimits(LENDING_POOL_PROGRAM_ID, requestRecords, decrypt);
        if (!cancelled) setLiqUiLimits(lim);
      } catch (e: unknown) {
        if (!cancelled) {
          setLiqUiLimits({
            ok: false,
            reason: e instanceof Error ? e.message : 'Failed to load limits.',
            maxCloseAleo: 0,
            maxCreditsSingleRecordAleo: 0,
            effectiveMaxRepayAleo: 0,
            seizeOptions: [],
            aleoDebt: 0,
            realSupAleo: 0,
            realSupUsdcx: 0,
            realSupUsad: 0,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, connected, publicKey, requestRecords, decrypt]);

  useEffect(() => {
    if (!liqUiLimits?.ok || !liqUiLimits.seizeOptions.length) return;
    setLiqSeizeAsset((prev) =>
      liqUiLimits.seizeOptions.includes(prev) ? prev : liqUiLimits.seizeOptions[0],
    );
  }, [liqUiLimits]);

  useEffect(() => {
    if (!SHOW_SPRINT2_MIGRATION_UI || view !== 'flash' || !connected || !publicKey) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      const [schema, recs] = await Promise.all([
        getPositionNoteSchemaFromChain(LENDING_POOL_PROGRAM_ID, publicKey),
        requestRecords ? requestRecords(LENDING_POOL_PROGRAM_ID, false) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setChainPositionNoteSchema(schema);
      setMigrationRecSummary(summarizeLendingRecordsForMigration(LENDING_POOL_PROGRAM_ID, recs));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [SHOW_SPRINT2_MIGRATION_UI, view, connected, publicKey, requestRecords]);

  const liquidationSubmitGate = useMemo(() => {
    if (liqLoading) return { disabled: true as const, reason: 'Submitting…' };
    if (!connected) return { disabled: true as const, reason: 'Connect wallet.' };
    if (view === 'liquidation' && connected && publicKey?.trim().startsWith('aleo1') && liqUiLimits === null) {
      return { disabled: true as const, reason: 'Loading repay limits…' };
    }
    if (liqUiLimits?.ok && liqUiLimits.seizeOptions.length === 0) {
      return { disabled: true as const, reason: 'No collateral available to seize (zero supplied balances).' };
    }
    if (liqPreview.loading) return { disabled: true as const, reason: 'Loading preview…' };
    const repayNum = Number(liqRepayAmountInput);
    if (!publicKey?.trim().startsWith('aleo1')) {
      return { disabled: true as const, reason: 'Connect a valid Aleo wallet.' };
    }
    if (!Number.isFinite(repayNum) || repayNum <= 0) {
      return { disabled: true as const, reason: 'Enter repay amount.' };
    }
    if (!liqPreview.ok) {
      return { disabled: true as const, reason: liqPreview.reason ?? 'Preview unavailable.' };
    }
    if (!liqPreview.liquidatable) {
      return { disabled: true as const, reason: 'Position is not liquidatable (debt ≤ liquidation threshold).' };
    }
    if ((liqPreview.aleoDebt ?? 0) <= 0) {
      return { disabled: true as const, reason: 'No ALEO debt to liquidate with this action.' };
    }
    const repayMicro = Math.round(repayNum * 1_000_000);
    const maxCloseMicro = Math.round((liqPreview.maxCloseAleo ?? 0) * 1_000_000);
    if (repayMicro > maxCloseMicro + LIQ_SUBMIT_SLACK_MICRO) {
      return {
        disabled: true as const,
        reason: `Repay exceeds max close (${(liqPreview.maxCloseAleo ?? 0).toFixed(6)} ALEO).`,
      };
    }
    if (liqUiLimits?.ok) {
      const effMax = liqUiLimits.effectiveMaxRepayAleo;
      const effMicro = Math.round(effMax * 1_000_000);
      if (effMax <= 0 && repayMicro > LIQ_SUBMIT_SLACK_MICRO) {
        return {
          disabled: true as const,
          reason:
            'No effective max repay (check ALEO debt, close factor, and a single credits.aleo record large enough).',
        };
      }
      if (effMax > 0 && repayMicro > effMicro + LIQ_SUBMIT_SLACK_MICRO) {
        return {
          disabled: true as const,
          reason: `Repay exceeds max (${effMax.toFixed(6)} ALEO) — min(close factor cap, largest single credits record).`,
        };
      }
    }
    const seizeMicro = Math.round((liqPreview.seizeAmount ?? 0) * 1_000_000);
    const collMicro = Math.round((liqPreview.collateralSeizeAsset ?? 0) * 1_000_000);
    if (seizeMicro > collMicro + LIQ_SUBMIT_SLACK_MICRO) {
      return {
        disabled: true as const,
        reason: 'Estimated seize exceeds borrower collateral in the selected asset — lower repay or choose another collateral.',
      };
    }
    return { disabled: false as const, reason: null as string | null };
  }, [connected, liqLoading, liqPreview, publicKey, liqRepayAmountInput, view, liqUiLimits]);

  const handleActionUsdc = async (
    action: 'deposit' | 'borrow' | 'repay' | 'withdraw',
    amountOverride?: number,
  ) => {
    if (!connected || !publicKey || !executeTransaction || !requestRecords) {
      setStatusMessage('Please connect your wallet.');
      return;
    }
    try {
      setLoading(true);
      setStatusMessage(`Executing USDC ${action}...`);
      setAmountErrorUsdc(null);
      const amountToUse = typeof amountOverride === 'number' ? amountOverride : amountUsdc;
      if (amountToUse <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      if (action === 'repay') {
        if (portfolioDebtUsdForRepay <= 1e-9) {
          const msg = 'No outstanding debt to repay.';
          setAmountErrorUsdc(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
        if (
          !repayAmountAssetWithinTotalDebtUsd(amountToUse, USDCX_PRICE_USD, portfolioDebtUsdForRepay)
        ) {
          const cap =
            USDCX_PRICE_USD > 0 ? portfolioDebtUsdForRepay / USDCX_PRICE_USD : 0;
          const msg = `Repay exceeds total portfolio debt (~$${portfolioDebtUsdForRepay.toFixed(
            2,
          )}). At current prices, pay at most ~${cap.toFixed(4)} USDCx (any asset can pay down total debt).`;
          setAmountErrorUsdc(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      // Vault liquidity check (USDCx withdrawals/borrows are paid by backend vault).
      if (action === 'borrow' || action === 'withdraw') {
        const vault = await fetchVaultHumanBalancesFromBackend();
        if (vault && amountToUse > (vault.usdcx ?? 0)) {
          const max = Math.max(0, vault.usdcx ?? 0);
          const msg = `Insufficient vault liquidity. You can ${action} at most ${max.toFixed(2)} USDCx right now (treasury wallet). Cross-asset USDCx payouts require USDCx in the vault even when your collateral is only ALEO.`;
          setAmountErrorUsdc(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }
      const amountMicro = Math.round(amountToUse * 1_000_000);
      const USDC_SCALE = 1_000_000;
      const netSuppliedMicro = effectiveMicroOrWalletAggregate(effectiveUserSuppliedUsdc, userSuppliedUsdc);
      const netBorrowedMicro = effectiveMicroOrWalletAggregate(effectiveUserBorrowedUsdc, userBorrowedUsdc);
      const poolSuppliedMicro = Number(totalSuppliedUsdc) || 0;
      const poolBorrowedMicro = Number(totalBorrowedUsdc) || 0;
      const netSuppliedHuman = netSuppliedMicro / USDC_SCALE;
      const netBorrowedHuman = netBorrowedMicro / USDC_SCALE;
      const availableLiquidityHuman = Math.max(0, (poolSuppliedMicro - poolBorrowedMicro) / USDC_SCALE);
      const poolStateLoadedUsdc = poolSuppliedMicro > 0 || poolBorrowedMicro > 0;
      // Withdraw: w <= min(supply, liquidity, C - D/LTV)
      const maxWithdrawUsdcByLtv = Math.max(0, netSuppliedHuman - netBorrowedHuman / 0.85);
      const maxWithdrawHuman = poolStateLoadedUsdc
        ? Math.min(netSuppliedHuman, availableLiquidityHuman, maxWithdrawUsdcByLtv)
        : Math.min(netSuppliedHuman, maxWithdrawUsdcByLtv);
      const effectiveMaxWithdrawUsdc = withdrawMaxUsdcUi;

      if (action === 'withdraw' && amountToUse > effectiveMaxWithdrawUsdc) {
        const msg = `You can withdraw at most ${effectiveMaxWithdrawUsdc.toFixed(
          2,
        )} USDCx (frontend estimate from on-chain caps). Final limit is enforced on-chain by cross-collateral portfolio checks.`;
        setAmountErrorUsdc(msg);
        setStatusMessage(msg);
        setLoading(false);
        return;
      }
      // Repay supports cross-asset debt reduction on-chain.
      // Program clamps the USD repayment to total debt, so we only restrict by user balance above.
      if (action === 'borrow' && amountToUse > availableBorrowUsdc) {
        const msg = `Borrow exceeds your available borrow (${availableBorrowUsdc.toFixed(2)} USDCx, frontend estimate). Final limit is enforced on-chain by cross-collateral portfolio checks.`;
        setAmountErrorUsdc(msg);
        setStatusMessage(msg);
        setLoading(false);
        return;
      }
      if (action === 'deposit' || action === 'repay') {
        let balance = privateUsdcBalance;
        if (balance === null && requestRecords) {
          balance = await getPrivateUsdcBalance(requestRecords, decrypt);
          setPrivateUsdcBalance(balance);
        }
        if (amountToUse > (balance ?? 0)) {
          const msg = `Insufficient private USDC. Your balance: ${(Math.floor((balance ?? 0) * 100) / 100).toFixed(2)} USDC.`;
          setAmountErrorUsdc(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }
      setActionModalSubmitted(true);
      let tx: string;
      switch (action) {
        case 'deposit': {
          let tokenRecord = await getSuitableUsdcTokenRecord(requestRecords, amountMicro, publicKey, decrypt);
          if (!tokenRecord) {
            privacyWarn('[USDC Deposit] No suitable USDCx record. See [getSuitableUsdcTokenRecord] logs above for details.');
            setAmountErrorUsdc(
              'No single USDCx record covers this amount (one private Token record must hold the full deposit). If your balance is split across multiple records, send USDCx to yourself to consolidate, or reduce the amount. Check console (F12) for details.',
            );
            setStatusMessage('No USDCx record with sufficient balance.');
            setLoading(false);
            return;
          }
          if (!tokenRecord.plaintext && decrypt) {
            const cipher = tokenRecord.recordCiphertext ?? tokenRecord.record_ciphertext ?? tokenRecord.ciphertext;
            if (typeof cipher === 'string') {
              try {
                const plain = await decrypt(cipher);
                if (plain) tokenRecord = { ...tokenRecord, plaintext: plain };
              } catch (e) {
                privacyWarn('[USDC Deposit] Decrypt failed, using ciphertext:', e);
              }
            }
          }
          tx = await lendingDepositUsdc(
            executeTransaction,
            amountToUse,
            tokenRecord,
            undefined,
            requestRecords,
            decrypt,
          );
          break;
        }
        case 'repay': {
          privacyLog('[Dashboard][USDC repay] pre-submit context', {
            amountToUse,
            amountMicro,
            netBorrowedMicro,
            effectiveUserBorrowedUsdc: effectiveUserBorrowedUsdc ?? null,
            userBorrowedUsdc,
            poolProgramResolved: USDC_LENDING_POOL_PROGRAM_ID,
            envNEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID:
              process.env.NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          });
          let tokenRecord = await getSuitableUsdcTokenRecord(requestRecords, amountMicro, publicKey, decrypt);
          if (!tokenRecord) {
            privacyWarn('[USDC Repay] No suitable USDCx record. See [getSuitableUsdcTokenRecord] logs above for details.');
            setAmountErrorUsdc(
              'No single USDCx record covers this repay amount. Consolidate private balance into one record or reduce the amount. See console (F12).',
            );
            setStatusMessage('No USDCx record with sufficient balance.');
            setLoading(false);
            return;
          }
          if (!tokenRecord.plaintext && decrypt) {
            const cipher = tokenRecord.recordCiphertext ?? tokenRecord.record_ciphertext ?? tokenRecord.ciphertext;
            if (typeof cipher === 'string') {
              try {
                const plain = await decrypt(cipher);
                if (plain) tokenRecord = { ...tokenRecord, plaintext: plain };
              } catch (e) {
                privacyWarn('[USDC Repay] Decrypt failed, using ciphertext:', e);
              }
            }
          }
          tx = await lendingRepayUsdc(
            executeTransaction,
            amountToUse,
            tokenRecord,
            undefined,
            requestRecords,
            decrypt,
          );
          break;
        }
        case 'withdraw': {
          if (
            chainBorrowCaps != null &&
            chainBorrowCaps.totalDebtUsd > BigInt(0) &&
            portfolioDebtUsdForRepay < 0.01
          ) {
            privacyWarn(
              '[USDC withdraw] On-chain debt is sub-cent but non-zero; if the tx fails, accrue interest and repay USDCx dust, then retry.',
            );
          }
          // Cap clamp runs inside lendingWithdrawUsdc using the same LendingPosition as the tx (avoids a
          // second requestRecords snapshot disagreeing with getLatestLendingPositionRecordInput).
          tx = await lendingWithdrawUsdc(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          break;
        }
        case 'borrow': {
          tx = await lendingBorrowUsdc(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          break;
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      if (tx === '__CANCELLED__') {
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) setTimeout(() => setStatusMessage(''), 2500);
        setLoading(false);
        return;
      }
      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('Transaction submitted. Waiting for finalization…');
      let finalized = false;
      let txFailed = false;
      let finalTxId = tx;
      for (let attempt = 1; attempt <= 45; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (transactionStatus) {
          try {
            const statusResult = await transactionStatus(tx);
            const statusText = typeof statusResult === 'string' ? statusResult : (statusResult as any)?.status ?? '';
            const statusLower = (statusText || '').toLowerCase();
            if (statusLower === 'finalized' || statusLower === 'accepted') {
              finalized = true;
              finalTxId = (typeof statusResult === 'object' && (statusResult as any).transactionId) || tx;
              setTxId(isExplorerHash(finalTxId) ? finalTxId : null);
              break;
            }
            if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
              txFailed = true;
              logPoolTxRejected('USDC pool', statusLower, tx, {
                action,
                program: USDC_LENDING_POOL_PROGRAM_ID,
              });
              setStatusMessage(
                `Transaction ${statusLower} on-chain (not a vault step). Try a slightly lower amount, refresh caps, or repay any remaining borrow dust and retry.`,
              );
              setLoading(false);
              return;
            }
          } catch {
            // continue polling
          }
        }
      }
      if (txFailed) {
        setLoading(false);
        return;
      }
      if (!finalized) {
        setStatusMessage('Transaction not finalized in time. Please check the explorer. Backend will process vault transfer once it is finalized.');
        setLoading(false);
        return;
      }
      setTxFinalized(true);
      if (action === 'deposit' || action === 'repay') {
        if (publicKey) {
          saveTransactionToSupabase(
            publicKey,
            finalTxId,
            action,
            'usdc',
            amountToUse,
            USDC_LENDING_POOL_PROGRAM_ID
          )
            .then(() => fetchTransactionHistory())
            .catch(() => { });
        }
      }
      // Backend watcher picks up the row and performs vault transfer; no frontend call.
      if (action === 'withdraw' || action === 'borrow') {
        if (publicKey) {
          await saveTransactionToSupabase(publicKey, finalTxId, action, 'usdc', amountToUse, USDC_LENDING_POOL_PROGRAM_ID, null).catch(() => { });
          fetchTransactionHistory();
        }
      }
      setAmountUsdc(0);
      try {
        if (action === 'repay') {
          await Promise.all([
            refreshPoolState(true),
            refreshUsdcPoolState(true),
            refreshUsadPoolState(true),
          ]);
        } else {
        await refreshUsdcPoolState(true);
        }
        setStatusMessage('Transaction finalized! Pool refreshed.');
        if (!isDevAppEnv) setTimeout(() => setStatusMessage(''), 2500);
      } catch {
        setStatusMessage('Transaction finalized. Click Refresh to update pool.');
      }
    } catch (e: any) {
      const displayMsg = getErrorMessage(e);
      setStatusMessage(displayMsg);
      const errorLower = displayMsg.toLowerCase();
      const isLiquidityOrLimit =
        errorLower.includes('withdraw at most') ||
        errorLower.includes('available pool liquidity') ||
        errorLower.includes('free for withdrawal') ||
        errorLower.includes('exceeds available') ||
        errorLower.includes('insufficient liquidity');
      if (isLiquidityOrLimit) setAmountErrorUsdc(displayMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleActionUsad = async (
    action: 'deposit' | 'borrow' | 'repay' | 'withdraw',
    amountOverride?: number,
  ) => {
    if (!connected || !publicKey || !executeTransaction || !requestRecords) {
      setStatusMessage('Please connect your wallet.');
      return;
    }
    try {
      setLoading(true);
      setStatusMessage(`Executing USAD ${action}...`);
      setAmountErrorUsad(null);
      const amountToUse = typeof amountOverride === 'number' ? amountOverride : amountUsad;
      if (amountToUse <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      if (action === 'repay') {
        if (portfolioDebtUsdForRepay <= 1e-9) {
          const msg = 'No outstanding debt to repay.';
          setAmountErrorUsad(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
        if (
          !repayAmountAssetWithinTotalDebtUsd(amountToUse, USAD_PRICE_USD, portfolioDebtUsdForRepay)
        ) {
          const cap =
            USAD_PRICE_USD > 0 ? portfolioDebtUsdForRepay / USAD_PRICE_USD : 0;
          const msg = `Repay exceeds total portfolio debt (~$${portfolioDebtUsdForRepay.toFixed(
            2,
          )}). At current prices, pay at most ~${cap.toFixed(4)} USAD (any asset can pay down total debt).`;
          setAmountErrorUsad(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      // Vault liquidity check (USAD withdrawals/borrows are paid by backend vault).
      if (action === 'borrow' || action === 'withdraw') {
        const vault = await fetchVaultHumanBalancesFromBackend();
        if (vault && amountToUse > (vault.usad ?? 0)) {
          const max = Math.max(0, vault.usad ?? 0);
          const msg = `Insufficient vault liquidity. You can ${action} at most ${max.toFixed(2)} USAD right now (vault wallet balance).`;
          setAmountErrorUsad(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      const amountMicro = Math.round(amountToUse * 1_000_000);
      const USAD_SCALE = 1_000_000;
      const netSuppliedMicro = effectiveMicroOrWalletAggregate(effectiveUserSuppliedUsad, userSuppliedUsad);
      const netBorrowedMicro = effectiveMicroOrWalletAggregate(effectiveUserBorrowedUsad, userBorrowedUsad);
      const poolSuppliedMicro = Number(totalSuppliedUsad) || 0;
      const poolBorrowedMicro = Number(totalBorrowedUsad) || 0;

      const netSuppliedHuman = netSuppliedMicro / USAD_SCALE;
      const netBorrowedHuman = netBorrowedMicro / USAD_SCALE;
      const maxRepayHuman = netBorrowedHuman;
      const availableLiquidityHuman = Math.max(0, (poolSuppliedMicro - poolBorrowedMicro) / USAD_SCALE);
      const poolStateLoadedUsad = poolSuppliedMicro > 0 || poolBorrowedMicro > 0;
      const maxWithdrawUsadByLtv = Math.max(0, netSuppliedHuman - netBorrowedHuman / 0.85);
      const maxWithdrawHuman = poolStateLoadedUsad
        ? Math.min(netSuppliedHuman, availableLiquidityHuman, maxWithdrawUsadByLtv)
        : Math.min(netSuppliedHuman, maxWithdrawUsadByLtv);

      const effectiveMaxWithdrawUsad = withdrawMaxUsadUi;

      if (action === 'withdraw' && amountToUse > effectiveMaxWithdrawUsad) {
        const msg = `You can withdraw at most ${effectiveMaxWithdrawUsad.toFixed(
          2,
        )} USAD (frontend estimate from on-chain caps). Final limit is enforced on-chain by cross-collateral portfolio checks.`;
        setAmountErrorUsad(msg);
        setStatusMessage(msg);
        setLoading(false);
        return;
      }
      // Repay supports cross-asset debt reduction on-chain.
      // Program clamps the USD repayment to total debt, so we only restrict by user balance above.
      if (action === 'borrow' && amountToUse > availableBorrowUsad) {
        const msg = `Borrow exceeds your available borrow (${availableBorrowUsad.toFixed(2)} USAD, frontend estimate). Final limit is enforced on-chain by cross-collateral portfolio checks.`;
        setAmountErrorUsad(msg);
        setStatusMessage(msg);
        setLoading(false);
        return;
      }

      if (action === 'deposit' || action === 'repay') {
        let balance = privateUsadBalance;
        if (balance === null && requestRecords) {
          balance = await getPrivateUsadBalance(requestRecords, decrypt);
          setPrivateUsadBalance(balance);
        }
        if (amountToUse > (balance ?? 0)) {
          const msg = `Insufficient private USAD. Your balance: ${(Math.floor((balance ?? 0) * 100) / 100).toFixed(2)} USAD.`;
          setAmountErrorUsad(msg);
          setStatusMessage(msg);
          setLoading(false);
          return;
        }
      }

      setActionModalSubmitted(true);
      let tx: string;

      switch (action) {
        case 'deposit': {
          let tokenRecord = await getSuitableUsadTokenRecord(requestRecords, amountMicro, publicKey, decrypt);
          if (!tokenRecord) {
            setAmountErrorUsad(
              'No single USAD record covers this amount (one private Token record must hold the full deposit). Consolidate balance or reduce the amount. See console (F12).',
            );
            setStatusMessage('No USAD record with sufficient balance.');
            setLoading(false);
            return;
          }
          if (!tokenRecord.plaintext && decrypt) {
            const cipher = tokenRecord.recordCiphertext ?? tokenRecord.record_ciphertext ?? tokenRecord.ciphertext;
            if (typeof cipher === 'string') {
              try {
                const plain = await decrypt(cipher);
                if (plain) tokenRecord = { ...tokenRecord, plaintext: plain };
              } catch (e) {
                privacyWarn('[USAD Deposit] Decrypt failed, using ciphertext:', e);
              }
            }
          }
          tx = await lendingDepositUsad(
            executeTransaction,
            amountToUse,
            tokenRecord,
            undefined,
            publicKey,
            requestRecords,
            decrypt,
          );
          break;
        }

        case 'repay': {
          privacyLog('[Dashboard][USAD repay] pre-submit context', {
            amountUsad,
            amountMicro,
            netBorrowedMicro,
            effectiveUserBorrowedUsad: effectiveUserBorrowedUsad ?? null,
            userBorrowedUsad,
            poolProgramResolved: USAD_LENDING_POOL_PROGRAM_ID,
            envNEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID:
              process.env.NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID ?? '(unset)',
          });
          let tokenRecord = await getSuitableUsadTokenRecord(requestRecords, amountMicro, publicKey, decrypt);
          if (!tokenRecord) {
            setAmountErrorUsad(
              'No single USAD record covers this repay amount. Consolidate private balance or reduce the amount. See console (F12).',
            );
            setStatusMessage('No USAD record with sufficient balance.');
            setLoading(false);
            return;
          }
          if (!tokenRecord.plaintext && decrypt) {
            const cipher = tokenRecord.recordCiphertext ?? tokenRecord.record_ciphertext ?? tokenRecord.ciphertext;
            if (typeof cipher === 'string') {
              try {
                const plain = await decrypt(cipher);
                if (plain) tokenRecord = { ...tokenRecord, plaintext: plain };
              } catch (e) {
                privacyWarn('[USAD Repay] Decrypt failed, using ciphertext:', e);
              }
            }
          }
          tx = await lendingRepayUsad(
            executeTransaction,
            amountToUse,
            tokenRecord,
            undefined,
            publicKey,
            requestRecords,
            decrypt,
          );
          break;
        }

        case 'withdraw': {
          tx = await lendingWithdrawUsad(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          break;
        }

        case 'borrow': {
          tx = await lendingBorrowUsad(
            executeTransaction,
            amountToUse,
            publicKey || undefined,
            requestRecords,
            decrypt,
          );
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      if (tx === '__CANCELLED__') {
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) setTimeout(() => setStatusMessage(''), 2500);
        setLoading(false);
        return;
      }

      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('Transaction submitted. Waiting for finalization…');

      let finalized = false;
      let txFailed = false;
      let finalTxId = tx;

      for (let attempt = 1; attempt <= 45; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (transactionStatus) {
          try {
            const statusResult = await transactionStatus(tx);
            const statusText = typeof statusResult === 'string' ? statusResult : (statusResult as any)?.status ?? '';
            const statusLower = (statusText || '').toLowerCase();

            if (statusLower === 'finalized' || statusLower === 'accepted') {
              finalized = true;
              finalTxId = (typeof statusResult === 'object' && (statusResult as any).transactionId) || tx;
              setTxId(isExplorerHash(finalTxId) ? finalTxId : null);
              break;
            }
            if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
              txFailed = true;
              logPoolTxRejected('USAD pool', statusLower, tx, {
                action,
                program: USAD_LENDING_POOL_PROGRAM_ID,
              });
              setStatusMessage(
                `Transaction ${statusLower} on-chain (not a vault step). Try a slightly lower amount, refresh caps, or repay any remaining borrow dust and retry.`,
              );
              setLoading(false);
              return;
            }
          } catch {
            // continue polling
          }
        }
      }

      if (txFailed) {
        setLoading(false);
        return;
      }

      if (!finalized) {
        setStatusMessage('Transaction not finalized in time. Please check the explorer. Backend will process vault transfer once it is finalized.');
        setLoading(false);
        return;
      }

      setTxFinalized(true);

      if (action === 'deposit' || action === 'repay') {
        if (publicKey) {
          saveTransactionToSupabase(publicKey, finalTxId, action, 'usad', amountToUse, USAD_LENDING_POOL_PROGRAM_ID)
            .then(() => fetchTransactionHistory())
            .catch(() => { });
        }
      }

      // Backend watcher picks up the row and performs vault transfer; no frontend call.
      if (action === 'withdraw' || action === 'borrow') {
        if (publicKey) {
          await saveTransactionToSupabase(publicKey, finalTxId, action, 'usad', amountToUse, USAD_LENDING_POOL_PROGRAM_ID, null).catch(() => { });
          fetchTransactionHistory();
        }
      }

      setAmountUsad(0);
      try {
        if (action === 'repay') {
          await Promise.all([
            refreshPoolState(true),
            refreshUsdcPoolState(true),
            refreshUsadPoolState(true),
          ]);
        } else {
          await refreshUsadPoolState(true);
        }
        setStatusMessage('Transaction finalized! Pool refreshed.');
        if (!isDevAppEnv) setTimeout(() => setStatusMessage(''), 2500);
      } catch {
        setStatusMessage('Transaction finalized. Click Refresh to update pool.');
      }
    } catch (e: any) {
      const displayMsg = getErrorMessage(e);
      setStatusMessage(displayMsg);
      const errorLower = displayMsg.toLowerCase();
      const isLiquidityOrLimit =
        errorLower.includes('withdraw at most') ||
        errorLower.includes('available pool liquidity') ||
        errorLower.includes('free for withdrawal') ||
        errorLower.includes('exceeds available') ||
        errorLower.includes('insufficient liquidity');
      if (isLiquidityOrLimit) setAmountErrorUsad(displayMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTestCredits = async () => {
    if (!connected || !publicKey || !requestTransaction) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }

    if (testCreditsAmount <= 0) {
      setStatusMessage('Amount must be greater than zero.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage(`Creating ${testCreditsAmount} test credits...`);

      const tx = await createTestCredits(requestTransaction, publicKey, testCreditsAmount);
      
      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('Test credits creation submitted. Waiting for finalization…');

      // Poll for transaction finalization using wallet's transactionStatus
      let finalized = false;
      const maxAttempts = 30; // 30 attempts
      const delayMs = 2000; // 2 seconds between attempts

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        
        if (transactionStatus) {
          try {
            const status = await transactionStatus(tx);
            privacyLog(`🧪 Create Test Credits: Poll attempt ${attempt}/${maxAttempts}, status:`, status);
            
            if (status && (status.status === 'Finalized' || (status as any).finalized)) {
              finalized = true;
              const resolvedId = (typeof status === 'object' && (status as any).transactionId) || tx;
              setTxId(isExplorerHash(resolvedId) ? resolvedId : null);
              setTxFinalized(true);
              setStatusMessage(`✅ Test credits created successfully! You should now have a Credits record with ${testCreditsAmount} credits (${testCreditsAmount * 1_000_000} microcredits) in your wallet.`);
              
              // Fetch records in background to update UI
              fetchRecordsInBackground();
              break;
            }
          } catch (statusError: any) {
            privacyWarn(`🧪 Create Test Credits: Status check failed (attempt ${attempt}):`, statusError?.message);
          }
        }
      }

      if (!finalized) {
        setStatusMessage(
          'Test credits creation submitted but not finalized within the expected time. The Credits record will appear in your wallet once the transaction is finalized.'
        );
      }
    } catch (e: any) {
      console.error('❌ ERROR in CREATE TEST CREDITS:', e);

      const errorMsg = String(e?.message || e || '').toLowerCase();
      const isCancelled =
        errorMsg.includes('cancel') ||
        errorMsg.includes('reject') ||
        errorMsg.includes('denied') ||
        errorMsg.includes('user rejected');

      if (isCancelled) {
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) {
          setTimeout(() => setStatusMessage(''), 2500);
        }
      } else {
        setStatusMessage(e?.message || 'Failed to create test credits. Check console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDepositTestReal = async () => {
    if (!connected || !publicKey || !requestTransaction || !requestRecords) {
      setStatusMessage('Please connect your wallet first and ensure record access is granted.');
      return;
    }

    if (amount <= 0) {
      setStatusMessage('Amount must be greater than zero.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage(`Testing deposit with ${amount} credits...`);

      const tx = await depositTestReal(requestTransaction, publicKey, amount, requestRecords);
      
      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('Deposit test submitted. Waiting for finalization…');

      // Poll for transaction finalization using wallet's transactionStatus
      let finalized = false;
      const maxAttempts = 30; // 30 attempts
      const delayMs = 2000; // 2 seconds between attempts

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        
        if (transactionStatus) {
          try {
            const status = await transactionStatus(tx);
            privacyLog(`🧪 Deposit Test Real: Poll attempt ${attempt}/${maxAttempts}, status:`, status);
            
            if (status && (status.status === 'Finalized' || (status as any).finalized)) {
              finalized = true;
              const resolvedId = (typeof status === 'object' && (status as any).transactionId) || tx;
              setTxId(isExplorerHash(resolvedId) ? resolvedId : null);
              setTxFinalized(true);
              setStatusMessage(`✅ Deposit test completed successfully! The test validates that real Aleo credits records work correctly. If this succeeded, your Credits record format is correct.`);
              
              // Fetch records in background to update UI
              fetchRecordsInBackground();
              break;
            }
          } catch (statusError: any) {
            privacyWarn(`🧪 Deposit Test Real: Status check failed (attempt ${attempt}):`, statusError?.message);
          }
        }
      }

      if (!finalized) {
        setStatusMessage(
          'Deposit test submitted but not finalized within the expected time. The transaction may still be processing.'
        );
      }
    } catch (e: any) {
      console.error('❌ ERROR in DEPOSIT TEST REAL:', e);

      const errorMsg = String(e?.message || e || '').toLowerCase();
      const isCancelled =
        errorMsg.includes('cancel') ||
        errorMsg.includes('reject') ||
        errorMsg.includes('denied') ||
        errorMsg.includes('user rejected');

      if (isCancelled) {
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) {
          setTimeout(() => setStatusMessage(''), 2500);
        }
      } else {
        setStatusMessage(e?.message || 'Failed to run deposit test. Check console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAccrueInterest = async () => {
    if (!connected || !executeTransaction) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Accruing interest...');

      const tx = await lendingAccrueInterest(executeTransaction);
      
      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('Interest accrual submitted. Waiting for finalization…');

      // Poll for transaction finalization using wallet's transactionStatus
      let finalized = false;
      const maxAttempts = 30; // 30 attempts
      const delayMs = 2000; // 2 seconds between attempts

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        
          try {
            const statusResult = await transactionStatus(tx);
            privacyLog(`📊 Accrue interest status (attempt ${attempt}):`, statusResult);

            const statusText =
              typeof statusResult === 'string'
                ? statusResult
                : (statusResult as any)?.status ?? '';
            const statusLower = (statusText || '').toLowerCase();

            if (statusLower === 'finalized' || statusLower === 'accepted') {
              finalized = true;
            const resolvedId =
              (typeof statusResult === 'object' && (statusResult as any).transactionId) || tx;
              setTxId(isExplorerHash(resolvedId) ? resolvedId : null);
              setTxFinalized(true);
              // Fetch records in background after interest accrual finalizes
              if (requestRecords && publicKey) {
                privacyLog('📋 Interest accrual finalized - fetching records in background...');
                fetchRecordsInBackground(LENDING_POOL_PROGRAM_ID);
              }
              break;
            }
            setStatusMessage(
              `Interest accrual ${statusText || 'pending'}... (attempt ${attempt}/${maxAttempts})`,
            );
          } catch (e) {
          // If transactionStatus fails, continue polling; assume finalized at max wait.
            privacyWarn('Failed to check transaction status:', e);
          if (attempt === maxAttempts) {
            finalized = true;
          }
        }
      }

      if (finalized) {
        setTxFinalized(true);
        // Refresh pool + user data once interest accrual is finalized
        try {
          privacyLog('📋 Interest accrual finalized - refreshing pool and user position...');
          await refreshPoolState(true);
          setStatusMessage('Interest accrued and finalized! Pool and position have been refreshed.');
          if (!isDevAppEnv) {
            setTimeout(() => setStatusMessage(''), 2500);
          }
        } catch (refreshError) {
          privacyWarn('⚠️ Failed to refresh after interest accrual:', refreshError);
          setStatusMessage(
            'Interest accrued and finalized, but automatic refresh failed. Please click Refresh.',
          );
        }
      } else {
        setStatusMessage(
          'Interest accrual submitted but not finalized within the expected time. It may still be processing. Pool state will update once finalized.'
        );
      }
    } catch (e: any) {
      console.error('Accrue interest error:', e);
      
      // Detect wallet cancellation/rejection
      const errorMsg = String(e?.message || e || '').toLowerCase();
      const isCancelled = errorMsg.includes('cancel') || errorMsg.includes('reject') || errorMsg.includes('denied') || errorMsg.includes('user rejected');
      
      if (isCancelled) {
        setStatusMessage('Transaction cancelled by user.');
        if (!isDevAppEnv) {
          setTimeout(() => setStatusMessage(''), 2500);
        }
      } else {
        setStatusMessage(e?.message || 'Failed to accrue interest. Check console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAccrueInterestUsdc = async () => {
    if (!connected || !executeTransaction) {
      setStatusMessage('Please connect your wallet first.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Accruing USDC interest...');

      const tx = await lendingAccrueInterestUsdc(executeTransaction);

      setTxId(null);
      setTxFinalized(false);
      setStatusMessage('USDC interest accrual submitted. Waiting for finalization…');

      let finalized = false;
      const maxAttempts = 30;
      const delayMs = 2000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (transactionStatus) {
          try {
            const statusResult = await transactionStatus(tx);
            const statusText =
              typeof statusResult === 'string'
                ? statusResult
                : (statusResult as any)?.status ?? '';
            const statusLower = (statusText || '').toLowerCase();
            if (statusLower === 'finalized' || statusLower === 'accepted') {
              finalized = true;
              const resolvedId = (typeof statusResult === 'object' && (statusResult as any).transactionId) || tx;
              setTxId(isExplorerHash(resolvedId) ? resolvedId : null);
              setTxFinalized(true);
              break;
            }
          } catch {
            // continue polling
          }
        }
      }

      if (!finalized) {
        setStatusMessage('USDC interest accrual submitted but not finalized in time. Please check the explorer.');
      } else {
        try {
          await refreshUsdcPoolState(true);
          setStatusMessage('USDC interest accrued and finalized! Pool state refreshed.');
          if (!isDevAppEnv) setTimeout(() => setStatusMessage(''), 2500);
        } catch {
          setStatusMessage('USDC interest accrued successfully. Click Refresh to update pool.');
        }
      }
    } catch (e: any) {
      setStatusMessage(e?.message || 'USDC accrue interest failed.');
    } finally {
      setLoading(false);
    }
  };

  // Catch wallet cancellation errors globally and show a toast instead of crashing the app
  useEffect(() => {
    const isWalletCancelMessage = (msg: string | undefined | null) => {
      const lower = String(msg || '').toLowerCase();
      return (
        lower.includes('operation was cancelled by the user') ||
        lower.includes('operation was canceled by the user') ||
        lower.includes('operation cancelled by user') ||
        lower.includes('transaction cancelled by user') ||
        lower.includes('transaction canceled by user')
      );
    };

    const showCancelToast = () => {
      setStatusMessage('Transaction cancelled by user.');
      if (!isDevAppEnv) {
        setTimeout(() => setStatusMessage(''), 2500);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      const msg = reason?.message || reason;

      if (isWalletCancelMessage(msg)) {
        // Prevent Next.js runtime error overlay
        event.preventDefault();
        showCancelToast();
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      const msg = event.message || event.error?.message;
      if (isWalletCancelMessage(msg)) {
        // Prevent default error handling (overlay) and just show toast
        event.preventDefault();
        showCancelToast();
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleWindowError);
    };
  }, [isDevAppEnv]);

  // Display values for merged Aave-style view (human units).
  // Prefer unified pool mappings via chain caps (same as finalize_*) — wallet records often lag after deposit.
  const MICRO = 1_000_000;
  const supplyAleoWallet = effectiveMicroOrWalletAggregate(effectiveUserSupplied, userSupplied) / MICRO;
  const supplyUsdcWallet = effectiveMicroOrWalletAggregate(effectiveUserSuppliedUsdc, userSuppliedUsdc) / MICRO;
  const supplyUsadWallet = effectiveMicroOrWalletAggregate(effectiveUserSuppliedUsad, userSuppliedUsad) / MICRO;
  const borrowAleoWallet = effectiveMicroOrWalletAggregate(effectiveUserBorrowed, userBorrowed) / MICRO;
  const borrowUsdcWallet = effectiveMicroOrWalletAggregate(effectiveUserBorrowedUsdc, userBorrowedUsdc) / MICRO;
  const borrowUsadWallet = effectiveMicroOrWalletAggregate(effectiveUserBorrowedUsad, userBorrowedUsad) / MICRO;
  const supplyBalanceAleo =
    chainMicroOrWalletMicro(chainBorrowCaps?.realSupplyMicroAleo, supplyAleoWallet * MICRO) / MICRO;
  const supplyBalanceUsdc =
    chainMicroOrWalletMicro(chainBorrowCaps?.realSupplyMicroUsdcx, supplyUsdcWallet * MICRO) / MICRO;
  const supplyBalanceUsad =
    chainMicroOrWalletMicro(chainBorrowCaps?.realSupplyMicroUsad, supplyUsadWallet * MICRO) / MICRO;
  const borrowDebtAleo =
    chainMicroOrWalletMicro(chainBorrowCaps?.realBorrowMicroAleo, borrowAleoWallet * MICRO) / MICRO;
  const borrowDebtUsdc =
    chainMicroOrWalletMicro(chainBorrowCaps?.realBorrowMicroUsdcx, borrowUsdcWallet * MICRO) / MICRO;
  const borrowDebtUsad =
    chainMicroOrWalletMicro(chainBorrowCaps?.realBorrowMicroUsad, borrowUsadWallet * MICRO) / MICRO;
  const totalSupplyBalance = supplyBalanceAleo + supplyBalanceUsdc + supplyBalanceUsad; // mixed units for count only
  const totalBorrowDebt = borrowDebtAleo + borrowDebtUsdc + borrowDebtUsad;
  // V2 cross-collateral portfolio estimates (UI-only; contract is source of truth).
  const ALEO_PRICE_USD =
    assetPriceAleo != null
      ? assetPriceAleo / 1_000_000
      : Number(process.env.NEXT_PUBLIC_ALEO_PRICE_USD ?? 1);
  const USDCX_PRICE_USD =
    assetPriceUsdc != null
      ? assetPriceUsdc / 1_000_000
      : Number(process.env.NEXT_PUBLIC_USDCX_PRICE_USD ?? 1);
  const USAD_PRICE_USD =
    assetPriceUsad != null
      ? assetPriceUsad / 1_000_000
      : Number(process.env.NEXT_PUBLIC_USAD_PRICE_USD ?? 1);
  const ALEO_PRICE_SOURCE = assetPriceAleo != null ? 'on-chain' : 'env';
  const USDCX_PRICE_SOURCE = assetPriceUsdc != null ? 'on-chain' : 'env';
  const USAD_PRICE_SOURCE = assetPriceUsad != null ? 'on-chain' : 'env';
  const LTV_ALEO = 0.75;
  const LTV_USDCX = 0.85;
  const LTV_USAD = 0.85;
  const collateralUsdAleo = supplyBalanceAleo * ALEO_PRICE_USD;
  const collateralUsdUsdc = supplyBalanceUsdc * USDCX_PRICE_USD;
  const collateralUsdUsad = supplyBalanceUsad * USAD_PRICE_USD;
  const totalCollateralUsd = collateralUsdAleo + collateralUsdUsdc + collateralUsdUsad;
  const weightedCollateralUsd =
    collateralUsdAleo * LTV_ALEO +
    collateralUsdUsdc * LTV_USDCX +
    collateralUsdUsad * LTV_USAD;
  const debtUsdAleo = borrowDebtAleo * ALEO_PRICE_USD;
  const debtUsdUsdc = borrowDebtUsdc * USDCX_PRICE_USD;
  const debtUsdUsad = borrowDebtUsad * USAD_PRICE_USD;
  const totalDebtUsd = debtUsdAleo + debtUsdUsdc + debtUsdUsad;
  // Prefer exact `finalize_borrow` headroom from chain mappings when available (avoids float vs u64 drift).
  const borrowableUsd =
    chainBorrowCaps != null
      ? Math.max(0, Number(chainBorrowCaps.headroomUsd) / 1_000_000)
      : Math.max(0, weightedCollateralUsd - totalDebtUsd);
  // Prefer chain-derived collateral/debt (same as finalize_borrow) so HF updates when records lag.
  const totalDebtUsdForHf =
    chainBorrowCaps != null
      ? Math.max(0, Number(chainBorrowCaps.totalDebtUsd) / 1_000_000)
      : totalDebtUsd;
  const weightedCollateralUsdForHf =
    chainBorrowCaps != null
      ? Math.max(0, Number(chainBorrowCaps.totalCollateralUsd) / 1_000_000)
      : weightedCollateralUsd;
  /** Ratio-style HF; `null` when no meaningful debt (or debt rounds to $0.00 in the UI). */
  const healthFactorFromUsd = (weightedUsd: number, debtUsd: number): number | null =>
    debtUsd > 1e-9 && Number(debtUsd.toFixed(2)) > 0 ? weightedUsd / debtUsd : null;
  const healthFactor = healthFactorFromUsd(weightedCollateralUsdForHf, totalDebtUsdForHf);

  const handleLiquidation = async () => {
    if (!connected || !publicKey || !executeTransaction || !requestRecords) {
      setLiqStatusMessage('Please connect your wallet.');
      return;
    }
    if (liquidationSubmitGate.disabled) {
      setLiqStatusMessage(liquidationSubmitGate.reason ?? 'Cannot submit liquidation.');
      return;
    }
    if (healthFactor != null && healthFactor >= 1) {
      setLiqStatusMessage(
        'Health factor is ≥ 1.0 on the dashboard. Self liquidation is only available when HF is below 1.0.',
      );
      return;
    }
    const repay = Number(liqRepayAmountInput);
    if (!Number.isFinite(repay) || repay <= 0) {
      setLiqStatusMessage('Enter a valid repay amount.');
      return;
    }
    try {
      setLiqLoading(true);
      setLiqStatusMessage('Submitting self-liquidation…');
      setLiqTxId(null);
      const tx = await lendingSelfLiquidateDebtCredits(
        executeTransaction,
        repay,
        liqSeizeAsset,
        publicKey,
        requestRecords,
        decrypt,
      );
      if (tx === '__CANCELLED__') {
        setLiqStatusMessage('Transaction cancelled by user.');
        return;
      }
      let finalTxId = tx;
      let finalized = false;
      const maxAttempts = 45;
      const delayMs = 2000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (!transactionStatus) continue;
        try {
          const statusResult = await transactionStatus(tx);
          const statusText =
            typeof statusResult === 'string'
              ? statusResult
              : (statusResult as { status?: string })?.status ?? '';
          const statusLower = (statusText || '').toLowerCase();
          if (statusLower === 'finalized' || statusLower === 'accepted') {
            finalized = true;
            const resolvedId =
              (typeof statusResult === 'object' && (statusResult as { transactionId?: string }).transactionId) || tx;
            finalTxId = resolvedId;
            setLiqTxId(isExplorerHash(resolvedId) ? resolvedId : null);
            break;
          }
          if (statusLower === 'rejected' || statusLower === 'failed' || statusLower === 'dropped') {
            setLiqStatusMessage(`Transaction ${statusLower}.`);
            return;
          }
          setLiqStatusMessage(`Transaction ${statusText || 'pending'}… (${attempt}/${maxAttempts})`);
        } catch {
          // continue polling
        }
      }
      if (!finalized) {
        setLiqStatusMessage('Transaction not finalized in time. Check explorer.');
        return;
      }
      const seizeAssetKey =
        liqSeizeAsset === '0field' ? 'aleo' : liqSeizeAsset === '1field' ? 'usdc' : 'usad';
      const seizeOutHuman = liqPreview?.seizeAmount ?? 0;
      const repayHuman = Number.isFinite(repay) && repay > 0 ? repay : null;
      if (seizeOutHuman > 0) {
        await saveTransactionToSupabase(
          publicKey,
          finalTxId,
          'self_liquidate_payout',
          seizeAssetKey,
          seizeOutHuman,
          LENDING_POOL_PROGRAM_ID,
          null,
          repayHuman,
        ).catch(() => { });
      }
      fetchTransactionHistory();
      setLiqStatusMessage('Liquidation finalized. Pool state refreshed.');
      await Promise.all([refreshPoolState(true), refreshUsdcPoolState(true), refreshUsadPoolState(true)]);
    } catch (e: unknown) {
      setLiqStatusMessage(getErrorMessage(e));
    } finally {
      setLiqLoading(false);
    }
  };

  // Suggested "repay max" per selected repay asset.
  // Repay is cross-asset; when chain-derived totals are unavailable, fall back to the UI's
  // own totalDebtUsd (computed from per-asset effective debt + prices).
  const portfolioDebtUsdForRepay =
    chainBorrowCaps != null
      ? Math.max(0, Number(chainBorrowCaps.totalDebtUsd) / 1_000_000)
      : Math.max(0, totalDebtUsd);

  const repaySuggestedAleoHuman =
    ALEO_PRICE_USD > 0 ? portfolioDebtUsdForRepay / ALEO_PRICE_USD : 0;
  const repaySuggestedUsdcHuman =
    USDCX_PRICE_USD > 0 ? portfolioDebtUsdForRepay / USDCX_PRICE_USD : 0;
  const repaySuggestedUsadHuman =
    USAD_PRICE_USD > 0 ? portfolioDebtUsdForRepay / USAD_PRICE_USD : 0;

  const hasScaledBorrowDebt =
    lendingPositionScaled != null &&
    (lendingPositionScaled.scaledBorNative > BigInt(0) ||
      lendingPositionScaled.scaledBorUsdcx > BigInt(0) ||
      lendingPositionScaled.scaledBorUsad > BigInt(0));

  const hasAnyDebt =
    chainBorrowCaps != null
      ? chainBorrowCaps.totalDebtUsd > BigInt(0)
      : borrowDebtAleo > 0 ||
        borrowDebtUsdc > 0 ||
        borrowDebtUsad > 0 ||
        hasScaledBorrowDebt ||
        totalDebtUsd > 1e-12;

  // Simple loading flags for balances (main dashboard only — other tabs don't wait on decrypt hydration)
  const walletBalancesLoading = connected && !userPositionInitialized && viewWantsFullLendingHydration;
  const dashboardDataReady =
    connected &&
    !walletBalancesLoading &&
    !isRefreshingState &&
    !isRefreshingUsdcState &&
    !isRefreshingUsadState &&
    totalSupplied !== null &&
    totalBorrowed !== null &&
    totalSuppliedUsdc !== null &&
    totalBorrowedUsdc !== null &&
    totalSuppliedUsad !== null &&
    totalBorrowedUsad !== null;

  /** No private `LendingPosition` yet — show onboarding before portfolio table and stats. */
  const needsDarkPoolPosition = dashboardDataReady && lendingPositionScaled === null;
  const availableAleo = Math.max(
    0,
    ((Number(totalSupplied) || 0) - (Number(totalBorrowed) || 0)) / 1_000_000,
  );
  const availableUsdc = Math.max(
    0,
    ((Number(totalSuppliedUsdc) || 0) - (Number(totalBorrowedUsdc) || 0)) / 1_000_000,
  );
  const availableUsad = Math.max(
    0,
    ((Number(totalSuppliedUsad) || 0) - (Number(totalBorrowedUsad) || 0)) / 1_000_000,
  );

  // Borrow availability is based on global portfolio USD headroom.
  // Program no longer hard-blocks by per-asset pool liquidity.
  const maxBorrowAleoByPortfolio = ALEO_PRICE_USD > 0 ? borrowableUsd / ALEO_PRICE_USD : 0;
  const maxBorrowUsdcByPortfolio = USDCX_PRICE_USD > 0 ? borrowableUsd / USDCX_PRICE_USD : 0;
  const maxBorrowUsadByPortfolio = USAD_PRICE_USD > 0 ? borrowableUsd / USAD_PRICE_USD : 0;
  const availableBorrowAleo = chainBorrowCaps
    ? Math.max(0, Number(chainBorrowCaps.maxBorrowMicroAleo) / 1_000_000)
    : Math.max(0, maxBorrowAleoByPortfolio);
  const availableBorrowUsdc = chainBorrowCaps
    ? Math.max(0, Number(chainBorrowCaps.maxBorrowMicroUsdcx) / 1_000_000)
    : Math.max(0, maxBorrowUsdcByPortfolio);
  const availableBorrowUsad = chainBorrowCaps
    ? Math.max(0, Number(chainBorrowCaps.maxBorrowMicroUsad) / 1_000_000)
    : Math.max(0, maxBorrowUsadByPortfolio);
  const availableBorrowAleoUsd = availableBorrowAleo * ALEO_PRICE_USD;
  const availableBorrowUsdcUsd = availableBorrowUsdc * USDCX_PRICE_USD;
  const availableBorrowUsadUsd = availableBorrowUsad * USAD_PRICE_USD;

  // Withdraw: chain caps mirror Leo `withdraw` (cross-asset burn ladder + health); treasury caps via `/vault-balances`.
  // Not gated by “user supplied this payout asset” — collateral is portfolio-wide.
  // LTV-style local estimates (below) are fallback hints when chain caps are missing.
  const maxWithdrawAleoByLtv = Math.max(0, supplyBalanceAleo - borrowDebtAleo / 0.75);
  const maxWithdrawUsdcByLtv = Math.max(0, supplyBalanceUsdc - borrowDebtUsdc / 0.75);
  const maxWithdrawUsadByLtv = Math.max(0, supplyBalanceUsad - borrowDebtUsad / 0.75);

  // Cross-asset fallback when chain withdraw caps aren't available.
  // `finalize_withdraw` caps `withdraw_usd` by total *raw* supply USD (sum of positions × prices),
  // not LTV-weighted collateral — so with zero debt the max withdraw USD ≈ totalCollateralUsd,
  // not borrowable (weightedCollateralUsd - totalDebtUsd). Using borrow headroom here made
  // withdraw MAX match "Borrowable (USD)" incorrectly.
  // Mirror on-chain withdraw: with any debt (including sub-cent dust), health uses weighted collateral vs raw debt USD.
  // Do not treat as "zero debt" when scaled bor is non-zero but float debt rounds to 0 — that overstated max cross-asset withdraw.
  const withdrawUsdFallback =
    !hasAnyDebt || (totalDebtUsd < 1e-9 && !hasScaledBorrowDebt)
      ? Math.max(0, totalCollateralUsd)
      : Math.max(0, weightedCollateralUsd - totalDebtUsd);
  // Cross-asset withdraw caps must come from the chain (mirrors `finalize_withdraw`).
  const availableWithdrawAleo = chainWithdrawCaps
    ? Math.max(
        0,
        Number(
          floorTokenMicroToDisplayDecimals(
            chainWithdrawCaps.maxWithdrawMicroAleo,
            WITHDRAW_MAX_DISPLAY_DECIMALS,
          ),
        ) / 1_000_000,
      )
    : ALEO_PRICE_USD > 0 ? withdrawUsdFallback / ALEO_PRICE_USD : 0;
  const availableWithdrawUsdc = chainWithdrawCaps
    ? Math.max(
        0,
        Number(
          floorTokenMicroToDisplayDecimals(
            chainWithdrawCaps.maxWithdrawMicroUsdcx,
            WITHDRAW_MAX_DISPLAY_DECIMALS,
          ),
        ) / 1_000_000,
      )
    : USDCX_PRICE_USD > 0 ? withdrawUsdFallback / USDCX_PRICE_USD : 0;
  const availableWithdrawUsad = chainWithdrawCaps
    ? Math.max(
        0,
        Number(
          floorTokenMicroToDisplayDecimals(
            chainWithdrawCaps.maxWithdrawMicroUsad,
            WITHDRAW_MAX_DISPLAY_DECIMALS,
          ),
        ) / 1_000_000,
      )
    : USAD_PRICE_USD > 0 ? withdrawUsdFallback / USAD_PRICE_USD : 0;

  const availableWithdrawAleoUsd = availableWithdrawAleo * ALEO_PRICE_USD;
  const availableWithdrawUsdcUsd = availableWithdrawUsdc * USDCX_PRICE_USD;
  const availableWithdrawUsadUsd = availableWithdrawUsad * USAD_PRICE_USD;

  /** True when effective ALEO withdraw &lt; portfolio-derived max (treasury, mapping fallback, or liquidity). */
  const aleoWithdrawCappedByPoolLiquidity =
    chainWithdrawCaps != null &&
    chainWithdrawCaps.maxWithdrawMicroAleoPortfolio > chainWithdrawCaps.maxWithdrawMicroAleo;

  // Cross-asset UX: shared USD from floored per-asset withdraw caps (2 dp; matches single-note tx path).
  const portfolioWithdrawUsd =
    chainWithdrawCaps != null
      ? Math.max(availableWithdrawAleoUsd, availableWithdrawUsdcUsd, availableWithdrawUsadUsd)
      : withdrawUsdFallback;

  /**
   * One `withdraw` tx spends a **single** `LendingPosition` record. `getAggregatedCrossCollateralWithdrawCapsFromWallet`
   * now composes caps from the **best note per payout asset** (same as `lendingWithdraw*`), not `max()` across mismatched notes.
   */
  const withdrawMaxUsdBudget = portfolioWithdrawUsd;
  const withdrawMaxAleoUi = chainWithdrawCaps
    ? availableWithdrawAleo
    : borrowMaxInputAmount(
        ALEO_PRICE_USD > 0 ? withdrawUsdFallback / ALEO_PRICE_USD : availableWithdrawAleo,
      );
  const withdrawMaxUsdcUi = chainWithdrawCaps
    ? availableWithdrawUsdc
    : borrowMaxInputAmount(
        USDCX_PRICE_USD > 0 ? withdrawUsdFallback / USDCX_PRICE_USD : availableWithdrawUsdc,
      );
  const withdrawMaxUsadUi = chainWithdrawCaps
    ? availableWithdrawUsad
    : borrowMaxInputAmount(
        USAD_PRICE_USD > 0 ? withdrawUsdFallback / USAD_PRICE_USD : availableWithdrawUsad,
  );

  const modalAmount = (() => {
    const n = Number(modalAmountInput);
    return Number.isNaN(n) ? 0 : n;
  })();

  const actionModalTitle =
    actionModalMode === 'withdraw'
      ? `Withdraw ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'
      }`
      : actionModalMode === 'deposit'
        ? `Deposit ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'
        }`
        : actionModalMode === 'borrow'
          ? `Borrow ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'
          }`
          : `Repay with ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'
          }`;

  const supplyBalanceModal =
    actionModalAsset === 'aleo' ? supplyBalanceAleo : actionModalAsset === 'usdc' ? supplyBalanceUsdc : supplyBalanceUsad;
  const debtBalanceModal =
    actionModalAsset === 'aleo' ? borrowDebtAleo : actionModalAsset === 'usdc' ? borrowDebtUsdc : borrowDebtUsad;
  const privateBalanceModal =
    actionModalAsset === 'aleo'
      ? (privateAleoBalance ?? 0)
      : actionModalAsset === 'usdc'
        ? (privateUsdcBalance ?? 0)
        : (privateUsadBalance ?? 0);
  // Borrow: same USD headroom as `finalize_borrow`, expressed in the selected asset (use chain caps when present).
  const modalBorrowPortfolioMax =
    actionModalAsset === 'aleo'
      ? availableBorrowAleo
      : actionModalAsset === 'usdc'
        ? availableBorrowUsdc
        : availableBorrowUsad;

  // Repay is cross-asset. In the repay modal we show portfolio debt expressed in the
  // currently selected repay asset, and clamp MAX by the user's private balance.
  const repaySuggestedModalHuman =
    actionModalAsset === 'aleo'
      ? repaySuggestedAleoHuman
      : actionModalAsset === 'usdc'
        ? repaySuggestedUsdcHuman
        : repaySuggestedUsadHuman;

  const selectedRepayPriceUsd =
    actionModalAsset === 'aleo'
      ? ALEO_PRICE_USD
      : actionModalAsset === 'usdc'
        ? USDCX_PRICE_USD
        : USAD_PRICE_USD;

  const repayPaymentUsd = selectedRepayPriceUsd > 0 ? modalAmount * selectedRepayPriceUsd : 0;
  // Use portfolio debt USD for cross-asset repay budgeting (prefer chain exact totals).
  const repayBudgetUsd = Math.min(portfolioDebtUsdForRepay, repayPaymentUsd);
  const remainingDebtUsdAfterRepay = Math.max(0, portfolioDebtUsdForRepay - repayBudgetUsd);
  const remainingDebtSelectedAssetAfterRepay =
    selectedRepayPriceUsd > 0 ? remainingDebtUsdAfterRepay / selectedRepayPriceUsd : 0;
  // Max amount constraints per action type (used to disable action button)
  const modalMaxAmount =
    actionModalMode === 'deposit'
      ? privateBalanceModal
      : actionModalMode === 'withdraw'
        ? actionModalAsset === 'aleo'
          ? withdrawMaxAleoUi
          : actionModalAsset === 'usdc'
            ? withdrawMaxUsdcUi
            : withdrawMaxUsadUi
        : actionModalMode === 'repay'
          ? Math.min(privateBalanceModal, repaySuggestedModalHuman)
        : actionModalMode === 'borrow'
            ? modalBorrowPortfolioMax
          : debtBalanceModal;

  const remainingSupply = actionModalMode === 'withdraw'
    ? Math.max(0, modalMaxAmount - modalAmount)
    : actionModalMode === 'deposit'
      ? supplyBalanceModal + modalAmount
      : actionModalMode === 'borrow'
        ? debtBalanceModal + modalAmount
        : actionModalMode === 'repay'
          ? remainingDebtSelectedAssetAfterRepay
        : Math.max(0, debtBalanceModal - modalAmount);

  // Estimated post-action portfolio for modal preview (V2 cross-collateral UX).
  const postSupplyAleo =
    actionModalMode === 'withdraw' && actionModalAsset === 'aleo'
      ? Math.max(0, supplyBalanceAleo - modalAmount)
      : actionModalMode === 'deposit' && actionModalAsset === 'aleo'
        ? supplyBalanceAleo + modalAmount
        : supplyBalanceAleo;
  const postSupplyUsdc =
    actionModalMode === 'withdraw' && actionModalAsset === 'usdc'
      ? Math.max(0, supplyBalanceUsdc - modalAmount)
      : actionModalMode === 'deposit' && actionModalAsset === 'usdc'
        ? supplyBalanceUsdc + modalAmount
        : supplyBalanceUsdc;
  const postSupplyUsad =
    actionModalMode === 'withdraw' && actionModalAsset === 'usad'
      ? Math.max(0, supplyBalanceUsad - modalAmount)
      : actionModalMode === 'deposit' && actionModalAsset === 'usad'
        ? supplyBalanceUsad + modalAmount
        : supplyBalanceUsad;

  // Repay preview is cross-asset. Allocate repayBudgetUsd across debts in the same
  // deterministic order as the program: ALEO -> USDCx -> USAD.
  const repayPayAleoUsd = actionModalMode === 'repay' ? Math.min(repayBudgetUsd, debtUsdAleo) : 0;
  const repayPayUsdcUsd = actionModalMode === 'repay'
    ? Math.min(repayBudgetUsd - repayPayAleoUsd, debtUsdUsdc)
    : 0;
  const repayPayUsadUsd = actionModalMode === 'repay'
    ? Math.max(0, repayBudgetUsd - repayPayAleoUsd - repayPayUsdcUsd)
    : 0;

  const repayPayAleoAsset =
    ALEO_PRICE_USD > 0 ? repayPayAleoUsd / ALEO_PRICE_USD : 0;
  const repayPayUsdcAsset =
    USDCX_PRICE_USD > 0 ? repayPayUsdcUsd / USDCX_PRICE_USD : 0;
  const repayPayUsadAsset =
    USAD_PRICE_USD > 0 ? repayPayUsadUsd / USAD_PRICE_USD : 0;

  const postDebtAleo =
    actionModalMode === 'repay'
      ? Math.max(0, borrowDebtAleo - repayPayAleoAsset)
      : actionModalMode === 'borrow' && actionModalAsset === 'aleo'
        ? borrowDebtAleo + modalAmount
        : borrowDebtAleo;
  const postDebtUsdc =
    actionModalMode === 'repay'
      ? Math.max(0, borrowDebtUsdc - repayPayUsdcAsset)
      : actionModalMode === 'borrow' && actionModalAsset === 'usdc'
        ? borrowDebtUsdc + modalAmount
        : borrowDebtUsdc;
  const postDebtUsad =
    actionModalMode === 'repay'
      ? Math.max(0, borrowDebtUsad - repayPayUsadAsset)
      : actionModalMode === 'borrow' && actionModalAsset === 'usad'
        ? borrowDebtUsad + modalAmount
        : borrowDebtUsad;

  const postWeightedCollateralUsd =
    postSupplyAleo * ALEO_PRICE_USD * LTV_ALEO +
    postSupplyUsdc * USDCX_PRICE_USD * LTV_USDCX +
    postSupplyUsad * USAD_PRICE_USD * LTV_USAD;
  const postTotalDebtUsd =
    actionModalMode === 'repay'
      ? remainingDebtUsdAfterRepay
      : postDebtAleo * ALEO_PRICE_USD +
      postDebtUsdc * USDCX_PRICE_USD +
      postDebtUsad * USAD_PRICE_USD;
  const postHealthFactor = healthFactorFromUsd(postWeightedCollateralUsd, postTotalDebtUsd);

  type ManageTab = 'Supply' | 'Withdraw' | 'Borrow' | 'Repay';
  type AssetKey = 'aleo' | 'usdc' | 'usad';

  const computeInlinePreview = (tab: ManageTab, assetKey: AssetKey, amountHuman: number) => {
    const amt = Number.isFinite(amountHuman) ? Math.max(0, amountHuman) : 0;

    const assetSymbol = assetKey === 'aleo' ? 'ALEO' : assetKey === 'usdc' ? 'USDCx' : 'USAD';
    const selectedPriceUsd = assetKey === 'aleo' ? ALEO_PRICE_USD : assetKey === 'usdc' ? USDCX_PRICE_USD : USAD_PRICE_USD;

    // Withdraw: per-asset UI max (2 dp), same as modal / `getInlineMaxAmount('Withdraw', ...)`.
    const modalMaxWithdraw =
      assetKey === 'aleo'
        ? withdrawMaxAleoUi
        : assetKey === 'usdc'
          ? withdrawMaxUsdcUi
          : withdrawMaxUsadUi;
    const selectedDebt = assetKey === 'aleo' ? borrowDebtAleo : assetKey === 'usdc' ? borrowDebtUsdc : borrowDebtUsad;
    const selectedSupply =
      assetKey === 'aleo' ? supplyBalanceAleo : assetKey === 'usdc' ? supplyBalanceUsdc : supplyBalanceUsad;

    // Repay preview is cross-asset. Allocate repayBudgetUsd across debts in the deterministic order:
    // ALEO -> USDCx -> USAD (same as modal).
    const repayPaymentUsd = selectedPriceUsd > 0 ? amt * selectedPriceUsd : 0;
    const repayBudgetUsd = Math.min(portfolioDebtUsdForRepay, repayPaymentUsd);
    const remainingDebtUsdAfterRepay = Math.max(0, portfolioDebtUsdForRepay - repayBudgetUsd);
    const remainingDebtSelectedAssetAfterRepay =
      selectedPriceUsd > 0 ? remainingDebtUsdAfterRepay / selectedPriceUsd : 0;

    const repayPayAleoUsd = tab === 'Repay' ? Math.min(repayBudgetUsd, debtUsdAleo) : 0;
    const repayPayUsdcUsd = tab === 'Repay' ? Math.min(repayBudgetUsd - repayPayAleoUsd, debtUsdUsdc) : 0;
    const repayPayUsadUsd = tab === 'Repay' ? Math.max(0, repayBudgetUsd - repayPayAleoUsd - repayPayUsdcUsd) : 0;

    const repayPayAleoAsset = ALEO_PRICE_USD > 0 ? repayPayAleoUsd / ALEO_PRICE_USD : 0;
    const repayPayUsdcAsset = USDCX_PRICE_USD > 0 ? repayPayUsdcUsd / USDCX_PRICE_USD : 0;
    const repayPayUsadAsset = USAD_PRICE_USD > 0 ? repayPayUsadUsd / USAD_PRICE_USD : 0;

    // Post-action supply (only changes for Supply/Withdraw in this UI preview).
    const postSupplyAleo =
      tab === 'Withdraw' && assetKey === 'aleo'
        ? Math.max(0, supplyBalanceAleo - amt)
        : tab === 'Supply' && assetKey === 'aleo'
          ? supplyBalanceAleo + amt
          : supplyBalanceAleo;
    const postSupplyUsdc =
      tab === 'Withdraw' && assetKey === 'usdc'
        ? Math.max(0, supplyBalanceUsdc - amt)
        : tab === 'Supply' && assetKey === 'usdc'
          ? supplyBalanceUsdc + amt
          : supplyBalanceUsdc;
    const postSupplyUsad =
      tab === 'Withdraw' && assetKey === 'usad'
        ? Math.max(0, supplyBalanceUsad - amt)
        : tab === 'Supply' && assetKey === 'usad'
          ? supplyBalanceUsad + amt
          : supplyBalanceUsad;

    // Post-action debt (changes for Borrow/Repay in this UI preview).
    const postDebtAleo =
      tab === 'Repay'
        ? Math.max(0, borrowDebtAleo - repayPayAleoAsset)
        : tab === 'Borrow' && assetKey === 'aleo'
          ? borrowDebtAleo + amt
          : borrowDebtAleo;
    const postDebtUsdc =
      tab === 'Repay'
        ? Math.max(0, borrowDebtUsdc - repayPayUsdcAsset)
        : tab === 'Borrow' && assetKey === 'usdc'
          ? borrowDebtUsdc + amt
          : borrowDebtUsdc;
    const postDebtUsad =
      tab === 'Repay'
        ? Math.max(0, borrowDebtUsad - repayPayUsadAsset)
        : tab === 'Borrow' && assetKey === 'usad'
          ? borrowDebtUsad + amt
          : borrowDebtUsad;

    const postWeightedCollateralUsd =
      postSupplyAleo * ALEO_PRICE_USD * LTV_ALEO +
      postSupplyUsdc * USDCX_PRICE_USD * LTV_USDCX +
      postSupplyUsad * USAD_PRICE_USD * LTV_USAD;

    const postTotalDebtUsd =
      tab === 'Repay'
        ? remainingDebtUsdAfterRepay
        : postDebtAleo * ALEO_PRICE_USD + postDebtUsdc * USDCX_PRICE_USD + postDebtUsad * USAD_PRICE_USD;

    const postHealthFactor = healthFactorFromUsd(postWeightedCollateralUsd, postTotalDebtUsd);

    const remainingAfter =
      tab === 'Supply'
        ? selectedSupply + amt
        : tab === 'Withdraw'
          ? Math.max(0, modalMaxWithdraw - amt)
          : tab === 'Borrow'
            ? selectedDebt + amt
            : remainingDebtSelectedAssetAfterRepay;

    const remainingAfterLabel =
      tab === 'Withdraw'
        ? 'Remaining withdrawable'
        : tab === 'Supply'
          ? 'Supply after'
          : tab === 'Borrow'
            ? 'Debt after'
            : 'Remaining debt';

    return {
      assetSymbol,
      remainingAfter,
      remainingAfterLabel,
      postWeightedCollateralUsd,
      postTotalDebtUsd,
      postHealthFactor,
    };
  };

  const getInlineMaxAmount = (tab: ManageTab, assetKey: AssetKey): number => {
    switch (tab) {
      case 'Supply':
        return assetKey === 'aleo'
          ? (privateAleoBalance ?? 0)
          : assetKey === 'usdc'
            ? (privateUsdcBalance ?? 0)
            : (privateUsadBalance ?? 0);
      case 'Withdraw':
        return assetKey === 'aleo'
          ? withdrawMaxAleoUi
          : assetKey === 'usdc'
            ? withdrawMaxUsdcUi
            : withdrawMaxUsadUi;
      case 'Borrow':
        return assetKey === 'aleo'
          ? availableBorrowAleo
          : assetKey === 'usdc'
            ? availableBorrowUsdc
            : availableBorrowUsad;
      case 'Repay': {
        const suggested =
          assetKey === 'aleo' ? repaySuggestedAleoHuman : assetKey === 'usdc' ? repaySuggestedUsdcHuman : repaySuggestedUsadHuman;
        const priv =
          assetKey === 'aleo'
            ? privateAleoBalance
            : assetKey === 'usdc'
              ? privateUsdcBalance
              : privateUsadBalance;
        // Cross-asset repay: max = min(wallet in this asset, total portfolio debt expressed in this asset).
        // If wallet balance not loaded yet, use suggested so Repay is not stuck at 0.
        if (priv == null) return suggested;
        return Math.min(priv, suggested);
      }
      default:
        return 0;
    }
  };

  const resolveInlineMaxAmount = async (tab: ManageTab, assetKey: AssetKey): Promise<number> => {
    // Supply: MAX depends on private balance, which might still be null (USDC/USAD need record scan).
    if (tab === 'Supply') {
      if (assetKey === 'aleo') {
        let bal = privateAleoBalance;
        if (bal == null && requestRecords) {
          try {
            bal = await getPrivateCreditsBalance(requestRecords, decrypt);
            setPrivateAleoBalance(bal);
          } catch { }
        }
        return bal ?? 0;
      }
      if (assetKey === 'usdc') {
        let bal = privateUsdcBalance;
        if (bal == null && requestRecords) {
          try {
            bal = await getPrivateUsdcBalance(requestRecords, decrypt);
            setPrivateUsdcBalance(bal);
          } catch { }
        }
        return bal ?? 0;
      }
      // usad
      let bal = privateUsadBalance;
      if (bal == null && requestRecords) {
        try {
          bal = await getPrivateUsadBalance(requestRecords, decrypt);
          setPrivateUsadBalance(bal);
        } catch { }
      }
      return bal ?? 0;
    }
    if (tab === 'Borrow') return getInlineMaxAmount(tab, assetKey);
    if (tab === 'Withdraw') return getInlineMaxAmount(tab, assetKey);

    // Repay: MAX depends on private token balance (USDC/USAD may still be null until fetched).
    if (tab === 'Repay') {
      const suggested =
        assetKey === 'aleo' ? repaySuggestedAleoHuman : assetKey === 'usdc' ? repaySuggestedUsdcHuman : repaySuggestedUsadHuman;

      if (assetKey === 'aleo') {
        let bal = privateAleoBalance;
        if (bal == null && requestRecords) {
          try {
            bal = await getPrivateCreditsBalance(requestRecords, decrypt);
            setPrivateAleoBalance(bal);
          } catch { }
        }
        return bal == null ? suggested : Math.min(bal, suggested);
      }

      if (assetKey === 'usdc') {
        let bal = privateUsdcBalance;
        if (bal == null && requestRecords) {
          try {
            bal = await getPrivateUsdcBalance(requestRecords, decrypt);
            setPrivateUsdcBalance(bal);
          } catch { }
        }
        // If balance is still unknown, fall back to suggested so UI doesn't show 0.
        return bal == null ? suggested : Math.min(bal, suggested);
      }

      // usad
      let bal = privateUsadBalance;
      if (bal == null && requestRecords) {
        try {
          bal = await getPrivateUsadBalance(requestRecords, decrypt);
          setPrivateUsadBalance(bal);
        } catch { }
      }
      return bal == null ? suggested : Math.min(bal, suggested);
    }

    return getInlineMaxAmount(tab, assetKey);
  };

  useEffect(() => {
    if (!connected || !dashboardDataReady) return;
    privacyLog('[Portfolio pricing] resolved prices', {
      aleo: { usd: ALEO_PRICE_USD, source: ALEO_PRICE_SOURCE, raw: assetPriceAleo },
      usdcx: { usd: USDCX_PRICE_USD, source: USDCX_PRICE_SOURCE, raw: assetPriceUsdc },
      usad: { usd: USAD_PRICE_USD, source: USAD_PRICE_SOURCE, raw: assetPriceUsad },
    });
  }, [
    connected,
    dashboardDataReady,
    ALEO_PRICE_USD,
    USDCX_PRICE_USD,
    USAD_PRICE_USD,
    ALEO_PRICE_SOURCE,
    USDCX_PRICE_SOURCE,
    USAD_PRICE_SOURCE,
    assetPriceAleo,
    assetPriceUsdc,
    assetPriceUsad,
  ]);

  /** UI-row estimate only (per-asset supplied × price). Hero metrics use `chainBorrowCaps` when set. */
  useEffect(() => {
    if (!connected || !dashboardDataReady) return;
    privacyLog('[Portfolio estimate] per-asset USD from displayed supply/borrow (chain-backed when caps loaded)', {
      totalCollateralUsd,
      weightedCollateralUsd,
      breakdown: {
        aleo: {
          supply: supplyBalanceAleo,
          priceUsd: ALEO_PRICE_USD,
          collateralUsd: collateralUsdAleo,
          ltv: LTV_ALEO,
          weightedUsd: collateralUsdAleo * LTV_ALEO,
        },
        usdcx: {
          supply: supplyBalanceUsdc,
          priceUsd: USDCX_PRICE_USD,
          collateralUsd: collateralUsdUsdc,
          ltv: LTV_USDCX,
          weightedUsd: collateralUsdUsdc * LTV_USDCX,
        },
        usad: {
          supply: supplyBalanceUsad,
          priceUsd: USAD_PRICE_USD,
          collateralUsd: collateralUsdUsad,
          ltv: LTV_USAD,
          weightedUsd: collateralUsdUsad * LTV_USAD,
        },
      },
    });
  }, [
    connected,
    dashboardDataReady,
    totalCollateralUsd,
    weightedCollateralUsd,
    supplyBalanceAleo,
    supplyBalanceUsdc,
    supplyBalanceUsad,
    ALEO_PRICE_USD,
    USDCX_PRICE_USD,
    USAD_PRICE_USD,
    collateralUsdAleo,
    collateralUsdUsdc,
    collateralUsdUsad,
  ]);

  // Inject dashboard dark styles — must run on every render path (before any view early return).
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      .dash-glass {
        background: linear-gradient(145deg, rgba(15,23,42,0.4) 0%, rgba(3,7,18,0.6) 100%);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.05);
      }
      .dash-gradient-text {
        background: linear-gradient(to right, #22d3ee, #818cf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  if (view === 'flash') {
    const principal = Number(flashAmountInput || '0');
    const principalMicro = Math.max(0, Math.round((Number.isFinite(principal) ? principal : 0) * 1_000_000));
    const flashFeeMicroPreview = aleoFlashFeeMicro(principalMicro);
    const flashTotalPreview = (principalMicro + flashFeeMicroPreview) / 1_000_000;
    const flashUnitLabel = flashAsset === '0field' ? 'ALEO' : flashAsset === '1field' ? 'USDCx' : 'USAD';
    const flashSettleUnitLabel =
      flashSettleAsset === '0field' ? 'ALEO' : flashSettleAsset === '1field' ? 'USDCx' : 'USAD';
    const availHuman =
      flashAvailLiquidityMicro != null ? (Number(flashAvailLiquidityMicro) / 1_000_000).toFixed(6) : null;
    const minProfitNum = Number(flashMinProfitInput || '0');
    const openPrincipalError =
      !Number.isFinite(principal) || principal <= 0
        ? 'Enter a principal amount greater than 0.'
        : flashAvailLiquidityMicro != null && BigInt(principalMicro) > flashAvailLiquidityMicro
          ? `Principal is higher than available liquidity (${(Number(flashAvailLiquidityMicro) / 1_000_000).toFixed(6)} ${flashUnitLabel}).`
          : null;
    const openMinProfitError =
      !Number.isFinite(minProfitNum) || minProfitNum < 0 ? 'Min profit must be 0 or higher.' : null;
    const activeSettleSession = flashSessionId
      ? flashSessions.find((s) => s.id === flashSessionId)
      : [...flashSessions]
          .filter((s) => !FLASH_SESSION_TERMINAL_STATUSES.has(String(s.status || '').toLowerCase()))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const settleAid = String(activeSettleSession?.asset_id || flashSettleAsset);
    const settleUnitLabel =
      settleAid === '0field' ? 'ALEO' : settleAid === '1field' ? 'USDCx' : settleAid === '2field' ? 'USAD' : flashSettleUnitLabel;
    const settleExpectedMicro = (() => {
      if (!activeSettleSession) return null;
      const explicit = Number(activeSettleSession.expected_repay_micro ?? 0);
      if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
      const p = Math.round(Number(activeSettleSession.principal_micro || 0));
      const m = Math.round(Number(activeSettleSession.min_profit_micro || 0));
      if (!Number.isFinite(p) || p <= 0) return null;
      return p + aleoFlashFeeMicro(p) + (Number.isFinite(m) && m > 0 ? m : 0);
    })();
    const repayNum = Number(flashRepayInput || '0');
    const repayMicro = Math.round((Number.isFinite(repayNum) ? repayNum : 0) * 1_000_000);
    const settleRepayError =
      !flashRepayInput.trim()
        ? null
        : !Number.isFinite(repayNum) || repayNum <= 0
          ? 'Enter a repay amount greater than 0.'
          : settleExpectedMicro != null && repayMicro < settleExpectedMicro
            ? `Repay amount is below expected minimum (${(settleExpectedMicro / 1_000_000).toFixed(6)} ${settleUnitLabel}).`
            : null;
    return (
      <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-8 pt-8 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1324] via-[#0b1220] to-[#121a32] p-5 sm:p-8 mb-6">
          <div className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 mb-2">Liquidity Strategy</p>
              <h1 className="text-3xl sm:text-5xl font-semibold text-white leading-tight">Flash Loan</h1>
              <div className="mt-3 w-full space-y-1.5 text-sm text-slate-300/90">
                <p>Take a short-term loan, run your action, and pay it back in the same flow.</p>
                <p className="text-slate-400">- Pick an asset and open a flash loan session.</p>
                <p className="text-slate-400">- You can borrow only up to the amount currently available in the pool.</p>
                <p className="text-slate-400">- Your wallet gets funded from the vault with that same asset.</p>
                <p className="text-slate-400">- Repay the amount plus fee (and your chosen minimum profit target).</p>
                <p className="text-slate-400">- If you do not settle the current session successfully, it stays active and you cannot open the next flash loan session.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refreshFlashHero()}
              disabled={flashHeroRefreshing}
              title="Refresh pool liquidity and flash sessions"
              className="shrink-0 self-end sm:self-start px-4 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-white transition-colors disabled:opacity-40 border border-white/10 bg-slate-900/60"
            >
              {flashHeroRefreshing ? 'Loading…' : 'REFRESH'}
            </button>
          </div>
        </div>
        {!connected && (connecting || !allowShowConnectCTA) && (
          <div className="rounded-[32px] p-20 flex flex-col items-center justify-center text-center mb-6 border border-white/10 bg-slate-900/60">
            <span className="loading loading-spinner loading-lg text-cyan-400 mb-4" />
            <p className="text-sm text-slate-400">Loading wallet…</p>
          </div>
        )}

        {!connected && !connecting && allowShowConnectCTA && (
          <div className="rounded-[32px] p-20 flex flex-col items-center justify-center text-center mb-6 border border-white/10 bg-slate-900/60 relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle at center, rgba(6,182,212,0.05) 0%, transparent 70%)' }}
            />
            <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
              <h2 className="text-2xl font-bold mb-3 text-white">Please, connect your wallet</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-10">
                Connect your Aleo wallet to open and settle flash loan sessions.
              </p>
              <div className="w-full flex justify-center">
                <WalletModalButton
                  disabled={connecting}
                  className="!m-0 !min-h-0 !h-auto !rounded-xl !border !border-white/10 !bg-[#0B1221] !px-6 !py-2 !text-sm !font-semibold !text-white !shadow-none hover:!border-white/20 hover:!bg-[#111827] disabled:!cursor-wait disabled:!opacity-60"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </WalletModalButton>
              </div>
            </div>
          </div>
        )}

        {connected && !dashboardDataReady && (
          <div className="space-y-6 animate-pulse mb-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <div className="h-4 w-40 rounded mb-4 bg-white/10" />
              <div className="h-3 w-full rounded mb-2 bg-white/10" />
              <div className="h-3 w-5/6 rounded bg-white/10" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                <div className="h-4 w-36 rounded mb-4 bg-white/10" />
                <div className="space-y-3">
                  <div className="h-10 rounded-xl bg-white/10" />
                  <div className="h-10 rounded-xl bg-white/10" />
                  <div className="h-10 rounded-xl bg-white/10" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                <div className="h-4 w-36 rounded mb-4 bg-white/10" />
                <div className="space-y-3">
                  <div className="h-10 rounded-xl bg-white/10" />
                  <div className="h-10 rounded-xl bg-white/10" />
                  <div className="h-10 rounded-xl bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        )}

        {connected && dashboardDataReady && (
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-2xl p-5 border border-white/10 bg-slate-900/60">
              <h2 className="text-lg font-semibold text-white mb-3">Open Flash Session</h2>
              <p className="text-xs text-slate-400 mb-4">
                Reserve pool liquidity for a selected asset and start your flash session. Fee model:{' '}
                {ALEO_FLASH_PREMIUM_BPS} bps of principal.
              </p>
              <div className="space-y-3">
                <label className="block text-xs text-slate-500 uppercase tracking-wide">Asset</label>
                <select
                  value={flashAsset}
                  onChange={(e) => setFlashAsset(e.target.value as FlashLendingAssetId)}
                  disabled={flashLoading}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                >
                  <option value="0field">ALEO (credits)</option>
                  <option value="1field">USDCx</option>
                  <option value="2field">USAD</option>
                </select>
                {availHuman != null && (
                  <div className="text-xs text-slate-400">
                    On-chain available liquidity: <span className="text-slate-200 font-mono">{availHuman}</span>{' '}
                    {flashUnitLabel}
                  </div>
                )}
                <input
                  type="text"
                  value={flashStrategyIdInput}
                  onChange={(e) => setFlashStrategyIdInput(e.target.value)}
                  placeholder="Strategy id (e.g. 1field)"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={flashAmountInput}
                  onChange={(e) => setFlashAmountInput(e.target.value)}
                  placeholder={`Principal (${flashUnitLabel})`}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                />
                {flashOpenAttempted && openPrincipalError && <p className="text-xs text-rose-300">{openPrincipalError}</p>}
                <p className="text-[11px] text-slate-500">
                  Principal = the amount you want to borrow for this flash loan.
                </p>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={flashMinProfitInput}
                  onChange={(e) => setFlashMinProfitInput(e.target.value)}
                  placeholder={`Min profit (${flashUnitLabel})`}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                />
                {flashOpenAttempted && openMinProfitError && <p className="text-xs text-rose-300">{openMinProfitError}</p>}
                <p className="text-[11px] text-slate-500">
                  Min profit = the minimum extra amount you want to keep after repaying loan + fee.
                </p>
                <div className="text-xs text-slate-400">
                  Fee: {(flashFeeMicroPreview / 1_000_000).toFixed(6)} {flashUnitLabel} | Min repay hint:{' '}
                  {flashTotalPreview.toFixed(6)} {flashUnitLabel} (principal + fee; plus min profit on-chain)
                </div>
                <button
                  type="button"
                  disabled={flashLoading}
                  onClick={handleFlashLoan}
                  className="w-full rounded-xl bg-cyan-500/20 border border-cyan-400/30 px-3 py-2 text-cyan-300 disabled:opacity-50"
                >
                  {flashLoading ? 'Submitting…' : 'Open Flash Session'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl p-5 border border-white/10 bg-slate-900/60">
              <h2 className="text-lg font-semibold text-white mb-3">Settle Flash Session</h2>
              <p className="text-xs text-slate-400 mb-4">
                Repay and finalize an active funded session. If a funded session is found, its asset is used automatically.
              </p>
              <div className="space-y-3">
                <label className="block text-xs text-slate-500 uppercase tracking-wide">Settle Asset (fallback)</label>
                <select
                  value={flashSettleAsset}
                  onChange={(e) => setFlashSettleAsset(e.target.value as FlashLendingAssetId)}
                  disabled={flashLoading}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                >
                  <option value="0field">ALEO (credits)</option>
                  <option value="1field">USDCx</option>
                  <option value="2field">USAD</option>
                </select>
                <input
                  type="text"
                  value={flashStrategyIdInput}
                  onChange={(e) => setFlashStrategyIdInput(e.target.value)}
                  placeholder="Strategy id (e.g. 1field)"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={flashRepayInput}
                  onChange={(e) => setFlashRepayInput(e.target.value)}
                  placeholder={`Repay Amount (e.g. 1 = 1 ${flashSettleUnitLabel})`}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white outline-none"
                />
                {settleRepayError && <p className="text-xs text-rose-300">{settleRepayError}</p>}
                <p className="text-[11px] text-slate-500">
                  Repay amount = how much you are paying back to close this flash session.
                </p>
                <p className="text-[11px] text-slate-500">
                  If a live session is found, we use that session&apos;s asset automatically. Otherwise, we use the settle asset you selected.
                </p>
                <button
                  type="button"
                  disabled={flashLoading}
                  onClick={handleFlashSettle}
                  className="w-full rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-3 py-2 text-emerald-300 disabled:opacity-50"
                >
                  {flashLoading ? 'Submitting…' : 'Submit flash settle'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-5 border border-white/10 bg-slate-900/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Flash Loan History</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
                  <button
                    type="button"
                    onClick={() => setFlashHistoryFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      flashHistoryFilter === 'all'
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlashHistoryFilter('active')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      flashHistoryFilter === 'active'
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Active only
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchFlashSessions()}
                  disabled={flashSessionsLoading || !address}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 border border-white/10 bg-white/5 disabled:opacity-50"
                >
                  {flashSessionsLoading ? 'Loading...' : 'REFRESH'}
                </button>
              </div>
            </div>
            {flashSessionsLoading ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-white/10">
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Asset</th>
                      <th className="py-2 pr-4">Principal</th>
                      <th className="py-2 pr-4">Min Profit</th>
                      <th className="py-2 pr-4">Strategy</th>
                      <th className="py-2 pr-4">Open</th>
                      <th className="py-2 pr-4">Fund</th>
                      <th className="py-2 pr-4">Settle</th>
                      <th className="py-2 pr-4">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2].map((i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-3 pr-4"><div className="h-6 w-24 rounded bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-7 w-24 rounded-full bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-4 w-24 rounded bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-4 w-24 rounded bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-4 w-24 rounded bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-6 w-16 rounded-lg bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-6 w-16 rounded-lg bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-6 w-16 rounded-lg bg-white/10 animate-pulse" /></td>
                        <td className="py-3 pr-4"><div className="h-4 w-40 rounded bg-white/10 animate-pulse" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : flashSessionsError ? (
              <div className="text-sm text-amber-300">{flashSessionsError}</div>
            ) : flashSessions.length === 0 ? (
              <div className="text-sm text-slate-500">No flash sessions found.</div>
            ) : displayedFlashSessions.length === 0 ? (
              <div className="text-sm text-slate-500">
                No active flash sessions. Switch to &quot;All&quot; to see completed or expired sessions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-white/10">
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Asset</th>
                      <th className="py-2 pr-4">Principal</th>
                      <th className="py-2 pr-4">Min Profit</th>
                      <th className="py-2 pr-4">Strategy</th>
                      <th className="py-2 pr-4">Open</th>
                      <th className="py-2 pr-4">Fund</th>
                      <th className="py-2 pr-4">Settle</th>
                      <th className="py-2 pr-4">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedFlashSessions.map((s) => (
                      <tr key={s.id} className="border-b border-white/5 text-sm text-slate-300">
                        <td className="py-3 pr-4">
                          <StatusChip {...flashSessionStatusChipProps(s.status)} />
                        </td>
                        <td className="py-3 pr-4">
                          {s.asset_id === '0field' ? (
                            <AssetBadge asset="ALEO" compact />
                          ) : s.asset_id === '1field' ? (
                            <AssetBadge asset="USDCx" compact />
                          ) : s.asset_id === '2field' ? (
                            <AssetBadge asset="USAD" compact />
                          ) : (
                            <span>{s.asset_id}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono">{(Number(s.principal_micro || 0) / 1_000_000).toFixed(6)}</td>
                        <td className="py-3 pr-4 font-mono">{(Number(s.min_profit_micro || 0) / 1_000_000).toFixed(6)}</td>
                        <td className="py-3 pr-4 font-mono">{s.strategy_id_field}</td>
                        <td className="py-3 pr-4">
                          {s.flash_open_tx_id ? (
                            <a
                              href={getProvableExplorerTxUrl(s.flash_open_tx_id)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/[0.07] px-2 py-1 text-[11px] font-semibold tracking-wide text-cyan-300 hover:bg-cyan-500/15 transition-colors"
                            >
                              Open Tx
                            </a>
                          ) : '--'}
                        </td>
                        <td className="py-3 pr-4">
                          {s.vault_fund_tx_id ? (
                            <a
                              href={getProvableExplorerTxUrl(s.vault_fund_tx_id)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-2 py-1 text-[11px] font-semibold tracking-wide text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                            >
                              Fund Tx
                            </a>
                          ) : '--'}
                        </td>
                        <td className="py-3 pr-4">
                          {s.flash_settle_tx_id ? (
                            <a
                              href={getProvableExplorerTxUrl(s.flash_settle_tx_id)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/[0.07] px-2 py-1 text-[11px] font-semibold tracking-wide text-indigo-300 hover:bg-indigo-500/15 transition-colors"
                            >
                              Settle Tx
                            </a>
                          ) : '--'}
                        </td>
                        <td className="py-3 pr-4">{new Date(s.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
        )}
        {SHOW_SPRINT2_MIGRATION_UI && (
          <div className="mt-8 rounded-2xl p-5 border border-violet-500/25 bg-slate-900/60">
            <h2 className="text-lg font-semibold text-white mb-1">Sprint 2 — Private record migration (skeleton)</h2>
            <p className="text-xs text-slate-400 mb-4">
              Mints a <span className="font-mono text-violet-300">PositionNote</span> and sets on-chain{' '}
              <span className="font-mono text-violet-300">position_note_schema</span>. Requires a pool deployment that
              includes <span className="font-mono">mint_position_migration_note</span>. Does not move collateral or debt.
            </p>
            <div className="text-xs text-slate-300 space-y-2 mb-4">
              <div>
                <span className="text-slate-500">On-chain flag: </span>
                {describeOnChainSchemaVersion(chainPositionNoteSchema)}
              </div>
              {migrationRecSummary && (
                <div>
                  <span className="text-slate-500">Wallet records (heuristic): </span>
                  UserActivity-like {migrationRecSummary.userActivityLikeCount}, PositionNote-like{' '}
                  {migrationRecSummary.positionNoteLikeCount}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={
                posNoteLoading ||
                !connected ||
                chainPositionNoteSchema === POSITION_NOTE_SCHEMA_ON_CHAIN_V2
              }
              onClick={handleMintPositionMigrationNote}
              className="rounded-xl bg-violet-500/20 border border-violet-400/30 px-4 py-2 text-violet-200 text-sm disabled:opacity-50"
            >
              {posNoteLoading ? 'Submitting…' : 'Mint PositionNote (migration skeleton)'}
            </button>
            {posNoteStatus && <div className="text-sm text-slate-300 mt-3">{posNoteStatus}</div>}
            {posNoteTxId && (
              <a
                href={getProvableExplorerTxUrl(posNoteTxId)}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 text-xs underline mt-2 inline-block"
              >
                View migration tx
              </a>
            )}
          </div>
        )}

        {flashTxModalOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <div
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
              onClick={() => {
                if (!flashLoading) setFlashTxModalOpen(false);
              }}
            />
            <div
              className="relative rounded-[24px] p-8 w-full max-w-md"
              style={{
                background: 'linear-gradient(145deg, rgba(15,23,42,0.4) 0%, rgba(3,7,18,0.6) 100%)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {!flashLoading && (
                <button
                  type="button"
                  onClick={() => setFlashTxModalOpen(false)}
                  className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-slate-400 text-lg"
                  aria-label="Close flash transaction status"
                >
                  ×
                </button>
              )}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  {flashTxModalKind === 'open' ? 'Open Flash Session' : 'Settle Flash Session'}
                </h2>
              </div>
              <div className="space-y-4">
                {flashLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <span className="loading loading-spinner loading-lg text-cyan-400" />
                    <p className="text-sm text-slate-400">
                      {flashStatusMessage || 'Processing…'}
                    </p>
                  </div>
                ) : (
                  <>
                    {flashStatusMessage && <div className="text-sm text-slate-300">{flashStatusMessage}</div>}
                    {flashTxId && (
                      <a
                        href={getProvableExplorerTxUrl(flashTxId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 text-sm underline block"
                      >
                        View Flash Tx
                      </a>
                    )}
                    {flashVaultTxId && (
                      <a
                        href={getProvableExplorerTxUrl(flashVaultTxId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 text-sm underline block mt-1"
                      >
                        View Vault Funding Tx
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'liquidation') {
    const formatLiqAmount = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) return '--';
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    };
    const payoutSymbol = liqSeizeAsset === '0field' ? 'ALEO' : liqSeizeAsset === '1field' ? 'USDCx' : 'USAD';
    const enteredRepay = Number(liqRepayAmountInput);
    const enteredRepayDisplay = Number.isFinite(enteredRepay) && enteredRepay > 0 ? enteredRepay : 0;
    const effectiveMaxRepay = liqUiLimits?.ok ? liqUiLimits.effectiveMaxRepayAleo : 0;
    // Preview uses per-asset liquidation threshold; dashboard HF uses LTV-weighted collateral — align UX with HF < 1.
    const hfAllowsSelfLiquidation =
      healthFactor == null ? false : healthFactor < 1;
    const canSelfLiquidateNow = !!(liqPreview.ok && liqPreview.liquidatable && hfAllowsSelfLiquidation);
    const liquidationHistory = txHistory.filter((row) => {
      const t = String(row.type || '').toLowerCase();
      return t === 'liquidation' || t === 'self_liquidate_payout';
    });
    return (
      <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-8 pt-8 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1324] via-[#0b1220] to-[#121a32] p-5 sm:p-8 mb-6">
          <div className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 mb-2">Risk Management</p>
              <h1 className="text-3xl sm:text-5xl font-semibold text-white leading-tight">Self Liquidation</h1>
              <div className="mt-3 w-full space-y-1.5 text-sm text-slate-300/90">
                <p>Repay part of your ALEO loan and get one asset back as payout.</p>
                <p className="text-slate-400">- Self liquidation is available only when your Health Factor drops below 1 (liquidation zone).</p>
                <p className="text-slate-400">- Per transaction limit: up to 50% of current ALEO debt (and within one spendable credits note).</p>
                <p className="text-slate-400">- Enter amount, select payout asset, check estimate, then confirm.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refreshLiquidationHero()}
              disabled={
                liqHeroRefreshing ||
                !connected ||
                !requestRecords ||
                !publicKey?.trim().startsWith('aleo1')
              }
              title="Refresh liquidation preview, repay limits, and history"
              className="shrink-0 self-end sm:self-start px-4 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-white transition-colors disabled:opacity-40 border border-white/10 bg-slate-900/60"
            >
              {liqHeroRefreshing ? 'Loading…' : 'REFRESH'}
            </button>
          </div>
        </div>

        {!connected && (connecting || !allowShowConnectCTA) && (
          <div className="rounded-[32px] px-6 py-14 sm:p-20 flex flex-col items-center justify-center text-center border border-white/10 bg-slate-900/60">
            <span className="loading loading-spinner loading-lg text-cyan-400 mb-4" />
            <p className="text-sm text-slate-400">Loading wallet...</p>
          </div>
        )}

        {!connected && !connecting && allowShowConnectCTA && (
          <div className="rounded-[32px] px-6 py-14 sm:p-20 flex flex-col items-center justify-center text-center border border-white/10 bg-slate-900/60 relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle at center, rgba(6,182,212,0.05) 0%, transparent 70%)' }}
            />
            <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
              <h2 className="text-2xl font-bold mb-3 text-white">Please, connect your wallet</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-10">
                Connect your Aleo wallet to view liquidation preview and submit self liquidation.
              </p>
              <div className="w-full flex justify-center">
                <WalletModalButton
                  disabled={connecting}
                  className="!m-0 !min-h-0 !h-auto !rounded-xl !border !border-white/10 !bg-[#0B1221] !px-6 !py-2 !text-sm !font-semibold !text-white !shadow-none hover:!border-white/20 hover:!bg-[#111827] disabled:!cursor-wait disabled:!opacity-60"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </WalletModalButton>
              </div>
            </div>
          </div>
        )}

        {connected && !dashboardDataReady && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6 animate-pulse">
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="h-3 w-24 rounded mb-3 bg-white/10" />
                    <div className="h-5 w-36 rounded bg-white/10" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-4 w-48 rounded bg-white/10" />
                <div className="h-12 rounded-2xl bg-white/10" />
                <div className="h-12 rounded-2xl bg-white/10" />
                <div className="h-4 w-40 rounded bg-white/10" />
                <div className="h-12 rounded-2xl bg-white/10" />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
              <div className="h-16 rounded-2xl bg-white/10 mb-4" />
              <div className="space-y-3">
                <div className="h-20 rounded-2xl bg-white/10" />
                <div className="h-20 rounded-2xl bg-white/10" />
                <div className="h-20 rounded-2xl bg-white/10" />
              </div>
            </div>
          </div>
        )}

        {connected && dashboardDataReady && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-xl">
            {canSelfLiquidateNow && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-3">Liquidation flow</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-cyan-300/80">You repay</p>
                    <p className="mt-1 text-sm font-mono text-cyan-200">
                      {formatLiqAmount(enteredRepayDisplay)} ALEO
                    </p>
                  </div>
                  <div className="text-slate-500 text-lg">→</div>
                  <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-indigo-300/80">You receive (est.)</p>
                    <p className="mt-1 text-sm font-mono text-indigo-200">
                      {formatLiqAmount(liqPreview.seizeAmount ?? 0)} {payoutSymbol}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {canSelfLiquidateNow ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300">
                  In one self-liquidation, you can repay only up to the allowed part of your current debt.
                  <span className="text-cyan-200"> Use Max</span> to auto-fill the highest safe amount.
                </div>
                <div className="flex gap-2 items-stretch">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    max={effectiveMaxRepay > 0 ? effectiveMaxRepay : undefined}
                    value={liqRepayAmountInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n <= 0 || effectiveMaxRepay <= 0) {
                        setLiqRepayAmountInput(raw);
                        return;
                      }
                      const capped = Math.min(n, effectiveMaxRepay);
                      setLiqRepayAmountInput(String(capped));
                    }}
                    placeholder="Repay amount (ALEO)"
                    className="flex-1 min-w-0 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    disabled={!liqUiLimits?.ok || (liqUiLimits.effectiveMaxRepayAleo ?? 0) <= 0}
                    onClick={() => {
                      const v = liqUiLimits?.effectiveMaxRepayAleo;
                      if (v == null || !Number.isFinite(v) || v <= 0) return;
                      const s = v.toFixed(6).replace(/\.?0+$/, '');
                      setLiqRepayAmountInput(s || '0');
                    }}
                    className="shrink-0 rounded-2xl bg-white/10 border border-white/15 px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
                  >
                    Max
                  </button>
                </div>

                <select
                  value={
                    (() => {
                      const opts =
                        liqUiLimits?.ok === true
                          ? liqUiLimits.seizeOptions
                          : (['0field', '1field', '2field'] as const);
                      return opts.includes(liqSeizeAsset) ? liqSeizeAsset : opts[0] ?? '0field';
                    })()
                  }
                  onChange={(e) => setLiqSeizeAsset(e.target.value as '0field' | '1field' | '2field')}
                  disabled={liqUiLimits?.ok === true && liqUiLimits.seizeOptions.length === 0}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white outline-none disabled:opacity-50"
                >
                  {liqUiLimits?.ok === true && liqUiLimits.seizeOptions.length === 0 ? (
                    <option value="0field">No collateral available</option>
                  ) : (
                    (liqUiLimits?.ok === true ? liqUiLimits.seizeOptions : (['0field', '1field', '2field'] as const)).map((field) => (
                      <option key={field} value={field}>
                        {field === '0field' ? 'Payout in ALEO' : field === '1field' ? 'Payout in USDCx' : 'Payout in USAD'}
                      </option>
                    ))
                  )}
                </select>

                {!liqPreview.ok && liqPreview.reason && !liquidationSubmitGate.reason && (
                  <div className="text-xs text-amber-300">{liqPreview.reason}</div>
                )}
                {liquidationSubmitGate.disabled && !liqLoading && liquidationSubmitGate.reason && (
                  <div className="text-xs text-amber-300/90">{liquidationSubmitGate.reason}</div>
                )}

                <button
                  type="button"
                  disabled={liqLoading || liquidationSubmitGate.disabled}
                  onClick={handleLiquidation}
                  className="w-full rounded-2xl bg-gradient-to-r from-cyan-500/30 to-indigo-500/30 border border-cyan-300/30 px-4 py-3 text-cyan-100 font-medium disabled:opacity-50"
                >
                  {liqLoading ? 'Submitting...' : 'Execute Self Liquidation'}
                </button>
                {liqStatusMessage && <div className="text-sm text-slate-300">{liqStatusMessage}</div>}
                {liqTxId && (
                  <a
                    href={getProvableExplorerTxUrl(liqTxId)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 text-xs underline"
                  >
                    View Liquidation Tx
                  </a>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
                {liqPreview.loading ? (
                  <>
                    <p className="text-sm font-medium text-slate-200">Loading liquidation preview…</p>
                    <p className="text-xs text-slate-400/90 mt-1">Reading your position from the wallet.</p>
                  </>
                ) : liqPreview.ok && !liqPreview.liquidatable ? (
                  <>
                    <p className="text-sm font-medium text-emerald-200">Your position is not in the liquidation zone</p>
                    <p className="text-xs text-emerald-100/80 mt-1">
                      On-chain debt is at or below the liquidation threshold. Self liquidation is not available until
                      debt exceeds that threshold.
                    </p>
                  </>
                ) : liqPreview.ok && liqPreview.liquidatable && healthFactor != null && healthFactor >= 1 ? (
                  <>
                    <p className="text-sm font-medium text-emerald-200">Health factor is above the liquidation zone</p>
                    <p className="text-xs text-emerald-100/80 mt-1">
                      Your dashboard health factor is {healthFactor.toFixed(2)} (≥ 1.0). Self liquidation is only shown
                      when HF is below 1.0. The program can still flag debt above the{' '}
                      <span className="text-emerald-200/90">asset liquidation threshold</span>, which uses a different
                      weighting than HF — both can disagree briefly.
                    </p>
                  </>
                ) : liqPreview.ok && liqPreview.liquidatable && healthFactor == null ? (
                  <>
                    <p className="text-sm font-medium text-slate-200">Waiting for health factor</p>
                    <p className="text-xs text-slate-400/90 mt-1">
                      Debt or collateral is still loading for HF. Open the main dashboard or refresh, then return here.
                    </p>
                  </>
                ) : !liqPreview.ok ? (
                  <>
                    <p className="text-sm font-medium text-amber-200/95">Liquidation preview unavailable</p>
                    <p className="text-xs text-amber-100/75 mt-1">
                      {liqPreview.reason ||
                        'Connect your wallet and ensure a LendingPosition record is available, then try again.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-amber-200/95">Unable to show repayment form</p>
                    <p className="text-xs text-amber-100/75 mt-1">
                      Your position looks liquidatable in preview but the form is gated — check repay limits and try
                      refreshing.
                    </p>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard"
                    className="rounded-xl border border-emerald-300/35 bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-500/30 transition-colors"
                  >
                    Open Dashboard
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Position status</p>
              <p
                className={`mt-1 text-sm font-medium ${
                  liqPreview.ok && liqPreview.liquidatable && healthFactor != null && healthFactor >= 1
                    ? 'text-amber-200'
                    : liqPreview.liquidatable
                      ? 'text-rose-300'
                      : 'text-emerald-300'
                }`}
              >
                {liqPreview.ok
                  ? liqPreview.liquidatable
                    ? healthFactor != null && healthFactor >= 1
                      ? 'Threshold crossed (HF ≥ 1)'
                      : 'Liquidatable'
                    : 'Healthy'
                  : 'Unavailable'}
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Debt / Threshold (USD)</p>
                <p className="font-mono text-slate-200">
                  ${(liqPreview.totalDebtUsd ?? 0).toFixed(2)} / ${(liqPreview.thresholdCollateralUsd ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Liquidation bonus</p>
                <p className="font-mono text-slate-200">{liqPreview.liqBonusBps ?? 0} bps</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Mode</p>
                <p className="text-slate-300 text-sm">Owner-only self liquidation and payout</p>
              </div>
            </div>
          </div>
          </div>
        )}

        {connected && dashboardDataReady && (
          <section className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Liquidation History</h3>
              <div className="flex gap-2">
                <button
                  onClick={fetchTransactionHistory}
                  disabled={txHistoryLoading || !address}
                  className="px-4 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-white transition-colors disabled:opacity-40 border border-white/10 bg-slate-900/60"
                >
                  {txHistoryLoading ? 'Loading...' : 'REFRESH'}
                </button>
              </div>
            </div>

            {txHistoryError ? (
              <div className="rounded-2xl p-6 text-sm" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <p className="font-medium text-amber-400">Could not load transaction history</p>
                <p className="mt-1 text-amber-300/70">{txHistoryError}</p>
              </div>
            ) : (
              <div className="rounded-[32px] overflow-hidden border border-white/10 bg-slate-900/60">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left border-collapse">
                    <thead>
                      <tr className="font-mono text-xs text-slate-400 uppercase tracking-widest" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                        <th className="px-8 py-4 font-medium">Type</th>
                        <th className="px-8 py-4 font-medium min-w-[250px]">Asset</th>
                        <th className="px-8 py-4 font-medium">Amount</th>
                        <th className="px-8 py-4 font-medium">Date</th>
                        <th className="px-8 py-4 font-medium text-left">Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txHistoryLoading && liquidationHistory.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-500 text-sm">Loading transactions...</td></tr>
                      ) : liquidationHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-16 text-center text-slate-500 text-sm">
                            No liquidation transactions found
                          </td>
                        </tr>
                      ) : (() => {
                        const pageSize = 10;
                        const totalPages = Math.max(1, Math.ceil(liquidationHistory.length / pageSize));
                        const cur = Math.min(txHistoryPage, totalPages);
                        const start = (cur - 1) * pageSize;
                        return liquidationHistory.slice(start, start + pageSize).map((row) => (
                          <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-white/5 transition-colors">
                            <td className="px-8 py-5 text-slate-300">{txHistoryTypeText(String(row.type))}</td>
                            <td className="px-8 py-5 text-slate-300 min-w-[250px]">
                              {(() => {
                                const typeLower = String(row.type || '').toLowerCase();
                                const payoutLabel =
                                  row.asset === 'usdcx'
                                    ? 'USDCx'
                                    : row.asset === 'usad' || row.asset === 'usadx'
                                      ? 'USAD'
                                      : 'ALEO';
                                if (typeLower === 'self_liquidate_payout') {
                                  return (
                                    <div className="text-sm leading-5 space-y-1">
                                      <div className="flex items-center gap-2 text-slate-400 whitespace-nowrap">
                                        <img src="/logos/aleo-dark.svg" alt="ALEO" className="w-5 h-5 rounded-md" />
                                        <span>Repay: <span className="text-slate-200">ALEO</span></span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-400 whitespace-nowrap">
                                        <img
                                          src={row.asset === 'usdcx' ? '/logos/usdc.svg' : row.asset === 'usad' || row.asset === 'usadx' ? '/logos/usad.svg' : '/logos/aleo-dark.svg'}
                                          alt={payoutLabel}
                                          className="w-5 h-5 rounded-md"
                                        />
                                        <span>Payout: <span className="text-slate-200">{payoutLabel}</span></span>
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={
                                        row.asset === 'usdcx'
                                          ? '/logos/usdc.svg'
                                          : row.asset === 'usad' || row.asset === 'usadx'
                                            ? '/logos/usad.svg'
                                            : '/logos/aleo-dark.svg'
                                      }
                                      alt={payoutLabel}
                                      className="w-7 h-7 rounded-lg"
                                    />
                                    <span>{payoutLabel}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-8 py-5 font-mono text-slate-300">
                              {(() => {
                                const typeLower = String(row.type || '').toLowerCase();
                                const amountText = Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                if (typeLower === 'self_liquidate_payout') {
                                  const payoutSym = row.asset === 'usdcx' ? 'USDCx' : row.asset === 'usad' || row.asset === 'usadx' ? 'USAD' : 'ALEO';
                                  const repayText =
                                    row.repay_amount != null
                                      ? `${Number(row.repay_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ALEO`
                                      : '--';
                                  return (
                                    <div className="space-y-1 text-sm">
                                      <div className="text-slate-400">Repay: <span className="text-slate-200">{repayText}</span></div>
                                      <div className="text-slate-400">Payout: <span className="text-slate-200">{amountText} {payoutSym}</span></div>
                                    </div>
                                  );
                                }
                                return amountText;
                              })()}
                            </td>
                            <td className="px-8 py-5 text-slate-500 text-sm">{new Date(row.created_at).toLocaleString()}</td>
                            <td className="px-8 py-5 text-slate-300 align-top">
                              <TxHistoryTrxPills
                                txId={row.tx_id}
                                explorerUrl={row.explorer_url ?? null}
                                vaultExplorerUrl={row.vault_explorer_url ?? null}
                                type={row.type}
                                asset={row.asset}
                                getProvableExplorerTxUrl={getProvableExplorerTxUrl}
                              />
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const pageSize = 10;
                  const totalPages = Math.max(1, Math.ceil(liquidationHistory.length / pageSize));
                  if (totalPages <= 1) return null;
                  return (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 text-xs text-slate-400 font-mono">
                      <span>
                        Page {Math.min(txHistoryPage, totalPages)} / {totalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={txHistoryPage <= 1}
                          onClick={() => setTxHistoryPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1 rounded-md border border-white/15 disabled:opacity-40"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          disabled={txHistoryPage >= totalPages}
                          onClick={() => setTxHistoryPage((p) => Math.min(totalPages, p + 1))}
                          className="px-3 py-1 rounded-md border border-white/15 disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  if (view === 'markets') {
    return <MarketsView />;
  }

  if (view === 'docs') {
    // Reuse the docs page content inside the dashboard layout so wallet state is shared
    return <DocsPage />;
  }

  const dashGlass: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(15,23,42,0.4) 0%, rgba(3,7,18,0.6) 100%)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.05)',
  };
  const dashRadialGlow: React.CSSProperties = {
    background: 'radial-gradient(circle at center, rgba(6,182,212,0.05) 0%, transparent 70%)',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f8fafc', position: 'relative' }}>
      {/* Background effects */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -2, backgroundSize: '50px 50px', backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)' }} />
      <div style={{ position: 'fixed', borderRadius: '50%', filter: 'blur(120px)', zIndex: -1, opacity: 0.3, width: '600px', height: '600px', top: '-200px', right: '-100px', background: 'rgba(6,182,212,0.1)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', borderRadius: '50%', filter: 'blur(120px)', zIndex: -1, opacity: 0.3, width: '600px', height: '600px', bottom: '-200px', left: '-100px', background: 'rgba(99,102,241,0.1)', pointerEvents: 'none' }} />

      {/* Action modal — logic unchanged, new dark styling */}
      {actionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            const canClose = !actionModalSubmitted || (!loading && txFinalized);
            if (e.target === e.currentTarget && canClose) closeActionModal();
          }}
        >
          <div className="relative rounded-[24px] p-8 w-full max-w-md" style={dashGlass} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">{actionModalTitle}</h2>
              {(!actionModalSubmitted || (!loading && txFinalized)) && (
                <button type="button" onClick={closeActionModal} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-slate-400 text-lg">×</button>
              )}
            </div>
            <div className="space-y-4">
              {!actionModalSubmitted ? (
                <>
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Amount</label>
                    <div className="flex items-center gap-2 rounded-xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <input
                        type="number" min={0} step="any"
                        value={modalAmountInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setModalAmountInput(val);
                          const n = Number(val);
                          if (!Number.isNaN(n)) {
                            if (actionModalAsset === 'usdc') setAmountUsdc(n);
                            else if (actionModalAsset === 'usad') setAmountUsad(n);
                            else setAmount(n);
                          }
                        }}
                        placeholder="0.00"
                        className="flex-1 bg-transparent outline-none text-white font-mono text-lg"
                      />
                      <span className="font-medium text-cyan-400">
                        {actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-sm text-slate-500">
                      <span>
                      {actionModalMode === 'withdraw'
                          ? `Available Withdrawable: ${modalMaxAmount.toFixed(2)} ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'}`
                        : actionModalMode === 'deposit'
                            ? `Wallet: ${privateBalanceModal.toFixed(2)}`
                          : actionModalMode === 'borrow'
                              ? `Max borrow: ${modalBorrowPortfolioMax.toFixed(4)} ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'}`
                              : `Max repay: ${repaySuggestedModalHuman.toFixed(4)} ${actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'}`}
                      </span>
                        <button
                          type="button"
                        className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors ml-2"
                          onClick={() => {
                          const maxVal = actionModalMode === 'withdraw'
                            ? (actionModalAsset === 'aleo' ? withdrawMaxAleoUi : actionModalAsset === 'usdc' ? withdrawMaxUsdcUi : withdrawMaxUsadUi)
                            : actionModalMode === 'deposit' ? privateBalanceModal
                              : actionModalMode === 'repay' ? Math.min(privateBalanceModal, repaySuggestedModalHuman)
                                : actionModalMode === 'borrow' ? modalBorrowPortfolioMax
                                    : debtBalanceModal;
                          const adjusted =
                            actionModalMode === 'borrow' || actionModalMode === 'withdraw'
                              ? borrowMaxInputAmount(maxVal)
                              : floorAmountMicro(maxVal);
                          const displayStr =
                            actionModalMode === 'borrow' || actionModalMode === 'withdraw'
                              ? adjusted.toFixed(2)
                              : floorAmountMicroInputString(maxVal);
                          setModalAmountInput(displayStr);
                          if (actionModalAsset === 'usdc') setAmountUsdc(adjusted);
                          else if (actionModalAsset === 'usad') setAmountUsad(adjusted);
                          else setAmount(adjusted);
                        }}
                      >MAX</button>
                    </div>
                    {actionModalMode === 'withdraw' &&
                      actionModalAsset === 'aleo' &&
                      aleoWithdrawCappedByPoolLiquidity &&
                      chainWithdrawCaps && (
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                          Max ALEO withdraw uses min(collateral, treasury via backend vault). Collateral headroom up to{' '}
                          {(Number(chainWithdrawCaps.maxWithdrawMicroAleoPortfolio) / 1_000_000).toFixed(2)} ALEO; shown
                          cap is lower when vault or on-chain pool liquidity is tighter. Cross-asset: supply any asset,
                          withdraw another — same pattern as USDCx/USAD.
                        </p>
                      )}
                  </div>
                  <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-sm font-medium text-slate-300 mb-1">Transaction overview</div>
                    {(actionModalMode === 'withdraw' || actionModalMode === 'deposit') && (
                      <div className="flex justify-between text-sm text-slate-400">
                        <span>{actionModalMode === 'withdraw' ? 'Remaining withdrawable' : 'Supply after'}</span>
                        <span className="text-white font-mono">{remainingSupply.toFixed(2)} {actionModalAsset === 'aleo' ? 'ALEO' : actionModalAsset === 'usdc' ? 'USDCx' : 'USAD'}</span>
                      </div>
                    )}
                    {(actionModalMode === 'borrow' || actionModalMode === 'repay') && (
                      <div className="flex justify-between text-sm text-slate-400">
                        <span>{actionModalMode === 'borrow' ? 'Total debt after (USD est.)' : 'Remaining total debt (USD est.)'}</span>
                        <span className="text-white font-mono">
                          ${formatUsdDebtLabel(actionModalMode === 'borrow' ? postTotalDebtUsd : remainingDebtUsdAfterRepay)}
                      </span>
                    </div>
                    )}
                    <div className="flex justify-between text-sm text-slate-400">
                      <span>Est. weighted collateral (USD)</span>
                      <span className="text-white font-mono">${postWeightedCollateralUsd.toFixed(2)}</span>
                  </div>
                    {(actionModalMode !== 'borrow' && actionModalMode !== 'repay') && (
                      <div className="flex justify-between text-sm text-slate-400">
                        <span>Est. total debt (USD)</span>
                        <span className="text-white font-mono">${formatUsdDebtLabel(postTotalDebtUsd)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm text-slate-400">
                      <span>Est. health factor</span>
                      <span className={`font-mono font-medium ${postHealthFactor != null && postHealthFactor < 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {postHealthFactor == null ? '∞' : (postHealthFactor as number).toFixed(2)}
                      </span>
                    </div>
                    {postHealthFactor != null && postHealthFactor < 1 && (
                      <div className="rounded-lg px-3 py-2 text-xs text-red-400" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        Estimated health factor is below 1.0. This action is likely to fail on-chain.
                  </div>
                    )}
                    </div>
                  {(actionModalAsset === 'aleo' ? amountError : actionModalAsset === 'usdc' ? amountErrorUsdc : amountErrorUsad) && (
                    <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                      {actionModalAsset === 'aleo' ? amountError : actionModalAsset === 'usdc' ? amountErrorUsdc : amountErrorUsad}
                    </div>
                  )}
                  {statusMessage && !(actionModalAsset === 'aleo' ? amountError : actionModalAsset === 'usdc' ? amountErrorUsdc : amountErrorUsad) && (
                    <div className="text-sm text-slate-400 px-1">{statusMessage}</div>
                  )}
                  <button
                    type="button"
                    disabled={loading || !modalAmount || modalAmount <= 0 || !amountWithinMax(modalAmount, modalMaxAmount, actionModalMode === 'borrow' || actionModalMode === 'repay' ? BORROW_REPAY_MAX_TEST_SLACK_MICRO : 0)}
                    onClick={async () => {
                      if (actionModalAsset === 'usdc') await handleActionUsdc(actionModalMode);
                      else if (actionModalAsset === 'usad') await handleActionUsad(actionModalMode);
                      else await handleAction(actionModalMode);
                    }}
                    className="w-full py-3 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(to right, #22d3ee, #6366f1)', color: '#030712' }}
                  >
                    {loading ? <span className="loading loading-spinner loading-sm" /> : null}
                    {!modalAmount || modalAmount <= 0 ? 'Enter an amount' : !amountWithinMax(modalAmount, modalMaxAmount, actionModalMode === 'borrow' || actionModalMode === 'repay' ? BORROW_REPAY_MAX_TEST_SLACK_MICRO : 0) ? 'Amount too high' : actionModalTitle}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                      <span className="loading loading-spinner loading-lg text-cyan-400" />
                      <p className="text-sm text-slate-400">{statusMessage || 'Processing…'}</p>
                    </div>
                  ) : (
                    <>
                      {statusMessage && !txFinalized && (
                        <div className="rounded-lg px-4 py-3 text-sm text-center text-slate-400">{statusMessage}</div>
                      )}
                      {txFinalized && txId && (
                        <a href={getProvableExplorerTxUrl(txId ?? '')} target="_blank" rel="noopener noreferrer"
                          className="text-cyan-400 text-sm font-medium block text-center py-2 hover:text-cyan-300">
                          View in explorer ↗
                        </a>
                      )}
                      {txFinalized && (
                        <p className="text-sm text-slate-400 text-center">
                          {actionModalMode === 'withdraw' || actionModalMode === 'borrow'
                            ? 'Transaction finalized! Vault transfer will be done in 1–5 min.'
                            : 'Transaction finalized.'}
                        </p>
                      )}
                      <button type="button" onClick={closeActionModal}
                        className="w-full py-3 rounded-xl font-bold text-white border border-white/10 hover:bg-white/10 transition-all">
                        Close
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Dark Pool position — same modal pattern as Supply/Borrow (submit → poll → explorer) */}
      {openAccountModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            const canClose = !openAccountSubmitted || openAccountFlowDone;
            if (e.target === e.currentTarget && canClose) closeOpenAccountModal();
          }}
        >
          <div
            className="relative rounded-[24px] p-8 w-full max-w-md"
            style={dashGlass}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Create Dark Pool position</h2>
              {(!openAccountSubmitted || openAccountFlowDone) && (
                <button
                  type="button"
                  onClick={closeOpenAccountModal}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-slate-400 text-lg"
                  aria-label="Close"
                >
                  ×
                </button>
              )}
            </div>
            <div className="space-y-4">
              {!openAccountFlowDone && (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <span className="loading loading-spinner loading-lg text-cyan-400" />
                  <p className="text-sm text-slate-400 text-center">{openAccountStatusMsg || 'Processing…'}</p>
                </div>
              )}
              {openAccountFlowDone && openAccountStatusMsg && (
                <div className="rounded-lg px-4 py-3 text-sm text-center text-slate-300">{openAccountStatusMsg}</div>
              )}
              {openAccountFlowDone && (
                <button
                  type="button"
                  onClick={closeOpenAccountModal}
                  className="w-full py-3 rounded-xl font-bold text-white border border-white/10 hover:bg-white/10 transition-all"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-8 pb-20">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold mb-2 text-white">Private Dashboard</h1>
            <p className="font-mono text-sm tracking-wide" style={{ color: '#64748b' }}>SHIELDED OVERVIEW • ALEO TESTNET</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-6 md:mt-0 md:justify-end">
            {connected && (
              <>
                <button
                  type="button"
                  onClick={() => { refreshPoolState(true); refreshUsdcPoolState(true); refreshUsadPoolState(true); }}
                  disabled={loading || isRefreshingState || isRefreshingUsdcState || isRefreshingUsadState}
                  className="px-5 py-2 rounded-xl text-sm font-mono transition-all self-end disabled:opacity-50"
                  style={dashGlass}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block mr-2" />
                  {isRefreshingState || isRefreshingUsdcState || isRefreshingUsadState ? 'Refreshing...' : 'Refresh'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Not connected — loading spinner */}
        {!connected && (connecting || !allowShowConnectCTA) && (
          <div className="rounded-[32px] p-20 flex flex-col items-center justify-center text-center mb-12" style={dashGlass}>
            <span className="loading loading-spinner loading-lg text-cyan-400 mb-4" />
            <p className="text-sm text-slate-400">Loading wallet…</p>
          </div>
        )}

        {/* Not connected — CTA */}
        {!connected && !connecting && allowShowConnectCTA && (
          <div className="rounded-[32px] p-20 flex flex-col items-center justify-center text-center mb-12 relative overflow-hidden" style={dashGlass}>
            {/* pointer-events-none so this layer never steals clicks from the Connect control */}
            <div className="absolute inset-0 pointer-events-none z-0" style={dashRadialGlow} />
            <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-full border border-white/5 flex items-center justify-center" style={{ backgroundColor: 'rgba(30,41,59,0.3)', animation: 'float 6s ease-in-out infinite' }}>
                  <svg className="w-10 h-10" style={{ color: '#475569' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="23" y2="14" /><line x1="23" y1="8" x2="17" y2="14" /></svg>
            </div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full border border-cyan-500/30 flex items-center justify-center" style={{ ...dashGlass, backgroundColor: '#030712' }}>
                  <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
              </div>
              <h2 className="text-2xl font-bold mb-3 text-white">Please, connect your wallet</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-10">
                Connect your Aleo wallet to decrypt your private records and view your supplies, borrowings, and open positions in the Dark Pool.
              </p>
              <div className="w-full flex justify-center">
                {/* Same wiring as WalletMultiButton when no wallet: opens the adapter modal */}
                <WalletModalButton
                  disabled={connecting}
                  className="!m-0 !min-h-0 !h-auto !rounded-xl !border !border-white/10 !bg-[#0B1221] !px-6 !py-2 !text-sm !font-semibold !text-white !shadow-none hover:!border-white/20 hover:!bg-[#111827] disabled:!cursor-wait disabled:!opacity-60"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </WalletModalButton>
              </div>
            </div>
          </div>
        )}

        {/* Connected — full dashboard loading (stats + assets + tx history placeholders) */}
        {connected && !dashboardDataReady && (
          <div className="space-y-10 animate-pulse mb-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl p-6 relative overflow-hidden" style={dashGlass}>
                  <div className="absolute inset-0" style={dashRadialGlow} />
                  <div className="relative">
                    <div className="h-3 w-36 rounded mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    <div className="h-9 w-28 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[32px] overflow-hidden" style={dashGlass}>
              <div
                className="grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1fr] gap-4 items-center px-8 py-5"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-3 rounded ${i === 4 ? 'justify-self-end w-16' : 'w-20'}`} style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1fr] gap-4 items-center px-8 py-5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                    <div className="h-4 w-14 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                  </div>
                  <div className="h-4 w-12 rounded justify-self-start" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-14 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-3 w-20 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-14 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-3 w-20 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                  </div>
            <div className="flex justify-end">
                    <div className="h-9 w-20 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  </div>
                </div>
              ))}
              <div className="px-8 py-4 flex items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="h-3 w-52 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                </div>
              </div>

            <section className="mb-10">
              <div className="flex items-center justify-between mb-6">
                <div className="h-7 w-56 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                <div className="h-9 w-24 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div className="rounded-[32px] overflow-hidden" style={dashGlass}>
                <div className="grid grid-cols-5 gap-4 px-8 py-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-3 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                  ))}
                </div>
                {[0, 1, 2].map((r) => (
                  <div
                    key={r}
                    className="grid grid-cols-5 gap-4 px-8 py-5 items-center"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="h-4 w-16 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                      <div className="h-4 w-12 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    </div>
                    <div className="h-4 w-20 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-4 w-36 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    <div className="h-8 w-full max-w-[200px] rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Connected — create private position first (no LendingPosition record yet) */}
        {connected && dashboardDataReady && needsDarkPoolPosition && (
          <section className="mb-10">
            <div
              className="rounded-[32px] px-8 py-14 sm:px-12 sm:py-16 text-center max-w-2xl mx-auto"
              style={dashGlass}
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 border border-cyan-500/25 mx-auto"
                style={{ backgroundColor: 'rgba(6,182,212,0.08)' }}
              >
                <svg
                  className="w-8 h-8 text-cyan-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Create your Dark Pool position</h2>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
                One shielded transaction creates your private portfolio record on Aleo. After it finalizes, you can supply
                assets, borrow against collateral, and see balances and health here.
              </p>
              <button
                type="button"
                onClick={openOpenAccountModal}
                className="px-8 py-3.5 rounded-xl font-bold text-sm sm:text-base transition-all"
                style={{ background: 'linear-gradient(to right, #22d3ee, #6366f1)', color: '#030712' }}
              >
                Create position
              </button>
              <p className="mt-6 text-xs text-slate-500 font-mono">Required once per wallet before supply and borrow.</p>
            </div>
          </section>
        )}

        {/* Connected — full dashboard (portfolio + positions) */}
        {connected && dashboardDataReady && !needsDarkPoolPosition && (
          <>
            {healthFactor != null && healthFactor < 1 && (
              <div
                className="rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)' }}
              >
                <div>
                  <p className="text-sm font-semibold text-red-300">Position at liquidation risk</p>
                  <p className="text-sm text-red-200/90 mt-1">
                    Health Factor is below 1.0. Repay debt or run self-liquidation to move back to a safe range.
                  </p>
                </div>
                <Link
                  href="/liquidation"
                  className="px-4 py-2 rounded-xl text-sm font-mono transition-all border border-red-300/40 text-red-100 hover:bg-red-500/15 inline-flex items-center justify-center shrink-0"
                >
                  Open Self-liquidation
                </Link>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {[
                { label: 'Total Collateral (USD)', value: `$${totalCollateralUsd.toFixed(2)}`, color: 'text-white' },
                { label: 'Borrowable (USD)', value: `$${borrowableUsd.toFixed(2)}`, color: 'text-cyan-400' },
                { label: 'Total Debt (USD)', value: `$${formatUsdDebtLabel(totalDebtUsdForHf)}`, color: 'text-indigo-400' },
                { label: 'Health Factor', value: healthFactor == null ? '∞' : healthFactor.toFixed(2), color: healthFactor != null && healthFactor < 1 ? 'text-red-400' : 'text-emerald-400' },
              ].map(stat => (
                <div key={stat.label} className="rounded-2xl p-6 relative overflow-hidden" style={dashGlass}>
                  <div className="absolute inset-0" style={dashRadialGlow} />
                  <div className="relative">
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">{stat.label}</p>
                    <p className={`text-3xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Asset management table */}
            <div className="rounded-[32px] overflow-hidden mb-10" style={dashGlass}>
                <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1fr] gap-4 items-center px-8 py-5 font-mono text-xs text-slate-400 uppercase tracking-widest" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <div>Asset</div>
                    <div>Wallet Balance</div>
                    <div>Supplied</div>
                    <div>Borrowed</div>
                    <div className="text-right">Manage</div>
                  </div>
                  {[
                { id: 'aleo' as const, label: 'ALEO', wallet: privateAleoBalance ?? 0, supplied: supplyBalanceAleo, borrowed: borrowDebtAleo, sApy: supplyAPY, bApy: borrowAPY, image: '/logos/aleo-dark.svg' },
                { id: 'usdc' as const, label: 'USDCx', wallet: privateUsdcBalance ?? 0, supplied: supplyBalanceUsdc, borrowed: borrowDebtUsdc, sApy: supplyAPYUsdc, bApy: borrowAPYUsdc, image: '/logos/usdc.svg' },
                { id: 'usad' as const, label: 'USAD', wallet: privateUsadBalance ?? 0, supplied: supplyBalanceUsad, borrowed: borrowDebtUsad, sApy: supplyAPYUsad, bApy: borrowAPYUsad, image: '/logos/usad.svg' },
                  ].map((asset) => (
                <div key={asset.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div
                    className={`grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1fr] gap-4 items-center px-8 py-5 cursor-pointer transition-colors ${expandedAsset === asset.id ? '' : 'hover:bg-white/5'}`}
                    style={expandedAsset === asset.id ? { backgroundColor: 'rgba(255,255,255,0.04)' } : {}}
                    onClick={() => {
                      const next = expandedAsset === asset.id ? null : asset.id;
                      setExpandedAsset(next);
                      if (next) { setActiveManageTab('Supply'); setManageAmountInput(''); }
                    }}
                  >
                        <div className="flex items-center gap-3 min-w-0">
                          <img src={asset.image} alt={asset.label} className="w-8 h-8 rounded-lg shrink-0" />
                          <p className="font-semibold text-white truncate">{asset.label}</p>
                </div>
                    <div className="font-mono text-slate-300">{asset.wallet.toFixed(2)}</div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-cyan-400">{asset.supplied.toFixed(2)}</span>
                      <span className="font-mono text-xs text-cyan-400/75 tabular-nums normal-case tracking-normal">
                        APY: {(asset.sApy * 100).toFixed(2)}%
                      </span>
              </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-indigo-400">{asset.borrowed.toFixed(2)}</span>
                      <span className="font-mono text-xs text-indigo-400/75 tabular-nums normal-case tracking-normal">
                        APY: {(asset.bApy * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <button className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors" style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                        {expandedAsset === asset.id ? 'Close' : 'Manage'}
                      </button>
                    </div>
                  </div>
                  {expandedAsset === asset.id && (
                    <div className="px-6 py-10 sm:px-10 sm:py-12" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-12 lg:gap-14 xl:gap-16 items-start">
                        <div className="flex flex-col gap-8">
                          <div className="flex gap-1.5 p-1.5 rounded-2xl w-fit" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                            {(['Supply', 'Withdraw', 'Borrow', 'Repay'] as const).map((tab) => (
                              <button key={tab} onClick={() => { setActiveManageTab(tab); setManageAmountInput(''); }}
                                className={`px-6 py-3 rounded-xl text-base font-medium transition-all min-h-[48px] ${activeManageTab === tab ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                style={activeManageTab === tab ? { backgroundColor: 'rgba(255,255,255,0.12)' } : {}}>
                                {tab}
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                            <span className="text-base font-semibold text-slate-200 tracking-tight">
                              Amount to {activeManageTab}
                            </span>
                            {(() => {
                              const priceUsd =
                                asset.id === 'aleo'
                                  ? ALEO_PRICE_USD
                                  : asset.id === 'usdc'
                                    ? USDCX_PRICE_USD
                                    : USAD_PRICE_USD;
                              const walletUsd = asset.wallet * priceUsd;
                              const maxPayThisAssetUsd = Math.min(
                                portfolioDebtUsdForRepay,
                                walletUsd,
                              );
                              const repayWalletTip =
                                walletUsd < portfolioDebtUsdForRepay - 1e-6 && portfolioDebtUsdForRepay > 1e-6
                                  ? `Your ${asset.label} balance only covers about $${maxPayThisAssetUsd.toFixed(2)} toward debt in one transaction. Use Max, switch to another asset row, or repay in multiple steps.`
                                  : `Repay with any asset. Payments reduce debt in order: ALEO → USDCx → USAD. This row only uses your ${asset.label} wallet.`;

                              const totalDebtTip =
                                'Sum of borrowed principal across ALEO, USDCx, and USAD, valued in USD (on-chain totals when available). Sub-cent dust shows up to 4 decimals so it is not confused with zero.';
                              const withdrawOnlyTip = `You receive ${asset.label}. The program may reduce supplied collateral across reserves to keep your health factor safe.`;
                              const borrowOnlyTip = `How much more you can borrow in USD before hitting weighted collateral vs debt limits. You receive ${asset.label}; the program checks your full portfolio.`;
                              const supplyWalletTip =
                                'Private balance you can supply in one transaction. Some assets need one private record to cover the full amount.';

                              return (
                                <div className="text-right text-sm font-mono space-y-2 max-w-[min(100%,22rem)]">
                                  {activeManageTab === 'Supply' && (
                                    <div className="flex items-center justify-end gap-0.5 text-slate-400">
                                      <span>
                                        Wallet ({asset.label}):{' '}
                                        <span className="tabular-nums text-slate-200">{asset.wallet.toFixed(2)}</span>
                          </span>
                                      <InfoTooltip variant="onDark" tip={supplyWalletTip} />
                                    </div>
                                  )}
                                  {activeManageTab === 'Withdraw' && (
                                    <div className="flex items-center justify-end gap-0.5 text-slate-400">
                                      <span>
                                        Available Withdrawable (USD):{' '}
                                        <span className="tabular-nums text-slate-200">${withdrawMaxUsdBudget.toFixed(2)}</span>
                            </span>
                                      <InfoTooltip variant="onDark" tip={withdrawOnlyTip} />
                </div>
                                  )}
                                  {activeManageTab === 'Borrow' && (
                                    <div className="flex items-center justify-end gap-0.5 text-slate-400">
                                      <span>
                                        Available Borrowable (USD):{' '}
                                        <span className="tabular-nums text-cyan-300">${borrowableUsd.toFixed(2)}</span>
                            </span>
                                      <InfoTooltip variant="onDark" tip={borrowOnlyTip} />
                                    </div>
                                  )}
                                  {activeManageTab === 'Repay' && (
                                    <>
                                      <div className="flex items-center justify-end gap-0.5 text-slate-400">
                                        <span>
                                          Total Debt (USD):{' '}
                                          <span className="tabular-nums text-indigo-300">${formatUsdDebtLabel(totalDebtUsdForHf)}</span>
                            </span>
                                        <InfoTooltip variant="onDark" tip={totalDebtTip} />
                                      </div>
                                      <div className="flex items-center justify-end gap-0.5 text-slate-400">
                                        <span>
                                          Max repay with {asset.label} (USD):{' '}
                                          <span className="tabular-nums text-slate-200">${formatUsdDebtLabel(maxPayThisAssetUsd)}</span>
                                        </span>
                                        <InfoTooltip variant="onDark" tip={repayWalletTip} />
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-stretch rounded-3xl overflow-hidden min-h-[5.5rem] focus-within:ring-2 focus-within:ring-cyan-500/35 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <input
                              type="text" placeholder="0.00" value={manageAmountInput}
                              onChange={(e) => setManageAmountInput(e.target.value)}
                              className="w-full min-w-0 bg-transparent text-4xl sm:text-[2.5rem] font-mono text-white py-6 pl-8 pr-4 outline-none placeholder-slate-600 leading-tight"
                            />
                            <div className="flex items-center gap-3 shrink-0 pr-6 pl-2">
                              <button
                                onClick={async () => {
                                  const m = await resolveInlineMaxAmount(activeManageTab, asset.id);
                                  const fill =
                                    activeManageTab === 'Borrow' || activeManageTab === 'Withdraw'
                                      ? borrowMaxInputAmount(m)
                                      : floorAmountMicro(m);
                                  setManageAmountInput(
                                    activeManageTab === 'Borrow' || activeManageTab === 'Withdraw'
                                      ? fill.toFixed(2)
                                      : floorAmountMicroInputString(m),
                                  );
                                }}
                                type="button"
                                className="text-sm font-bold text-cyan-400 hover:text-cyan-300 px-4 py-2.5 rounded-xl transition-colors uppercase tracking-wide"
                                style={{ backgroundColor: 'rgba(6,182,212,0.12)' }}>
                                Max
                              </button>
                              <span className="font-semibold text-slate-300 text-base whitespace-nowrap">{asset.label}</span>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            {[25, 50, 75, 100].map((pct) => (
                              <button key={pct} type="button"
                                onClick={() => {
                                  (async () => {
                                    const m = await resolveInlineMaxAmount(activeManageTab, asset.id);
                                    const cap =
                                      activeManageTab === 'Borrow' || activeManageTab === 'Withdraw'
                                        ? borrowMaxInputAmount(m)
                                        : floorAmountMicro(m);
                                    const rawFrac = (cap * pct) / 100;
                                    if (activeManageTab === 'Borrow' || activeManageTab === 'Withdraw') {
                                      setManageAmountInput(borrowMaxInputAmount(rawFrac).toFixed(2));
                                    } else {
                                      setManageAmountInput(floorAmountMicroInputString(rawFrac));
                                    }
                                  })();
                                }}
                                className="flex-1 py-3.5 text-sm font-medium text-slate-400 rounded-xl hover:text-slate-200 transition-colors min-h-[48px]"
                                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                                {pct}%
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={async () => {
                              const raw = Number(manageAmountInput);
                              const inlineMax = getInlineMaxAmount(activeManageTab, asset.id);
                              const amountToUse = Number.isFinite(raw) && raw > 0 ? Math.min(raw, inlineMax) : 0;
                              if (!amountToUse) return;
                              setModalAmountInput(String(amountToUse));
                              if (asset.id === 'usdc') setAmountUsdc(amountToUse);
                              else if (asset.id === 'usad') setAmountUsad(amountToUse);
                              else setAmount(amountToUse);
                              setInlineTxContext({ tab: activeManageTab, asset: asset.id });
                              const txAction = activeManageTab === 'Supply' ? 'deposit' : activeManageTab === 'Withdraw' ? 'withdraw' : activeManageTab === 'Borrow' ? 'borrow' : 'repay';
                              if (asset.id === 'aleo') await handleAction(txAction as any, amountToUse);
                              else if (asset.id === 'usdc') await handleActionUsdc(txAction as any, amountToUse);
                              else await handleActionUsad(txAction as any, amountToUse);
                            }}
                            disabled={(() => {
                              const r = Number(manageAmountInput);
                              const m = getInlineMaxAmount(activeManageTab, asset.id);
                              const borrowRepaySlack =
                                activeManageTab === 'Borrow' || activeManageTab === 'Repay'
                                  ? BORROW_REPAY_MAX_TEST_SLACK_MICRO
                                  : 0;
                              const noDebtToRepay =
                                activeManageTab === 'Repay' &&
                                portfolioDebtUsdForRepay <= 1e-12 &&
                                !hasScaledBorrowDebt;
                              return (
                                loading ||
                                !Number.isFinite(r) ||
                                noDebtToRepay ||
                                !amountWithinMax(r, m, borrowRepaySlack)
                              );
                            })()}
                            className="w-full font-bold py-5 rounded-3xl text-xl sm:text-[1.35rem] transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[60px] shadow-lg shadow-cyan-950/20"
                            style={{ background: 'linear-gradient(to right, #22d3ee, #6366f1)', color: '#030712' }}
                          >
                            {activeManageTab} {asset.label}
                          </button>
                </div>
                        <div className="rounded-3xl p-8 lg:p-9 w-full" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <h3 className="text-base font-semibold text-slate-200 font-mono tracking-tight mb-8">Transaction Overview</h3>
                          {(() => {
                            const preview = computeInlinePreview(activeManageTab, asset.id, Number(manageAmountInput));
                            const isThisInline = inlineTxContext?.tab === activeManageTab && inlineTxContext?.asset === asset.id;
                            return (
                              <div className="space-y-7 text-sm">
                                {activeManageTab === 'Borrow' || activeManageTab === 'Repay' ? (
                                  <div>
                                    <p className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
                                      {activeManageTab === 'Borrow' ? 'Total debt after (USD est.)' : 'Remaining total debt (USD est.)'}
                                    </p>
                                    <p className="font-mono text-xl text-white tracking-tight">${preview.postTotalDebtUsd.toFixed(2)}</p>
              </div>
                                ) : (
                                  <div>
                                    <p className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">{preview.remainingAfterLabel}</p>
                                    <p className="font-mono text-xl text-white tracking-tight">{preview.remainingAfter.toFixed(2)} {preview.assetSymbol}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Est. weighted collateral (USD)</p>
                                  <p className="font-mono text-xl text-white tracking-tight">${preview.postWeightedCollateralUsd.toFixed(2)}</p>
                                </div>
                                {(activeManageTab !== 'Borrow' && activeManageTab !== 'Repay') && (
                                  <div>
                                    <p className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Est. total debt (USD)</p>
                                    <p className="font-mono text-xl text-white tracking-tight">${preview.postTotalDebtUsd.toFixed(2)}</p>
                                  </div>
                                )}
                                {isThisInline && loading && (
                                  <div className="flex items-center gap-2 text-sm text-slate-500 pt-2">
                                    <span className="loading loading-spinner loading-sm" />
                                    <span>{statusMessage || 'Processing...'}</span>
                                  </div>
                                )}
                                {isThisInline && txFinalized && txId && (
                                  <a href={getProvableExplorerTxUrl(txId)} target="_blank" rel="noopener noreferrer" className="text-cyan-400 text-sm font-mono block pt-2 hover:text-cyan-300">View in explorer ↗</a>
                                )}
                </div>
                            );
                          })()}
              </div>
            </div>
          </div>
                  )}
                </div>
                  ))}
                  <div className="px-8 py-4 text-xs text-slate-600 font-mono" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span>Showing 3 supported assets on Aleo</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Transaction History (same readiness gate as portfolio so the whole dashboard loads together) */}
        {connected && dashboardDataReady && !needsDarkPoolPosition && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Transaction History</h3>
              <div className="flex gap-2">
                <button onClick={fetchTransactionHistory} disabled={txHistoryLoading || !address}
                  className="px-4 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-white transition-colors disabled:opacity-40" style={dashGlass}>
                  {txHistoryLoading ? 'Loading…' : 'REFRESH'}
                </button>
          </div>
            </div>
          {txHistoryError ? (
              <div className="rounded-2xl p-6 text-sm" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <p className="font-medium text-amber-400">Could not load transaction history</p>
                <p className="mt-1 text-amber-300/70">{txHistoryError}</p>
            </div>
            ) : (
              <div className="rounded-[32px] overflow-hidden" style={dashGlass}>
              <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left border-collapse">
                  <thead>
                    <tr className="font-mono text-xs text-slate-400 uppercase tracking-widest" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <th className="px-8 py-4 font-medium">Type</th>
                      <th className="px-8 py-4 font-medium">Asset</th>
                      <th className="px-8 py-4 font-medium">Amount</th>
                      <th className="px-8 py-4 font-medium">Date</th>
                      <th className="px-8 py-4 font-medium text-left">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txHistoryLoading && txHistory.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-slate-500 text-sm">Loading transactions…</td></tr>
                    ) : txHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-xl border border-white/5 flex items-center justify-center" style={{ backgroundColor: 'rgba(30,41,59,0.2)' }}>
                              <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
                            </div>
                            <p className="text-slate-500 font-medium">No transactions found</p>
                            <p className="text-xs text-slate-600 font-mono">ENCRYPTED HISTORY WILL APPEAR ONCE WALLET IS CONNECTED</p>
                          </div>
                        </td>
                      </tr>
                    ) : (() => {
                      const pageSize = 10;
                      const totalPages = Math.max(1, Math.ceil(txHistory.length / pageSize));
                      const cur = Math.min(txHistoryPage, totalPages);
                      const start = (cur - 1) * pageSize;
                      return txHistory.slice(start, start + pageSize).map((row) => (
                        <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-5 text-slate-300">{txHistoryTypeText(String(row.type))}</td>
                          <td className="px-8 py-5 text-slate-300">
                            <div className="flex items-center gap-3">
                              <img
                                src={
                                  row.asset === 'usdcx'
                                    ? '/logos/usdc.svg'
                                    : row.asset === 'usad' || row.asset === 'usadx'
                                      ? '/logos/usad.svg'
                                      : '/logos/aleo-dark.svg'
                                }
                                alt={row.asset === 'usdcx' ? 'USDCx' : row.asset === 'usad' || row.asset === 'usadx' ? 'USAD' : 'ALEO'}
                                className="w-7 h-7 rounded-lg"
                              />
                              <span>{row.asset === 'usdcx' ? 'USDCx' : row.asset === 'usad' || row.asset === 'usadx' ? 'USAD' : 'ALEO'}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 font-mono text-slate-300">{Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                          <td className="px-8 py-5 text-slate-500 text-sm">{new Date(row.created_at).toLocaleString()}</td>
                          <td className="px-8 py-5 align-top text-left">
                            <TxHistoryTrxPills txId={row.tx_id} explorerUrl={row.explorer_url} vaultExplorerUrl={row.vault_explorer_url} type={row.type} asset={row.asset} getProvableExplorerTxUrl={getProvableExplorerTxUrl} />
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
                {txHistory.length > 10 && (() => {
                    const pageSize = 10;
                    const totalPages = Math.max(1, Math.ceil(txHistory.length / pageSize));
                  const cur = Math.min(txHistoryPage, totalPages);
                    return (
                    <div className="flex items-center justify-between px-8 py-4 text-xs text-slate-500 font-mono" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span>Showing {(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, txHistory.length)} of {txHistory.length}</span>
                      <div className="flex gap-2">
                        <button disabled={cur === 1} onClick={() => setTxHistoryPage(p => Math.max(1, p - 1))} className="px-3 py-1 rounded-lg disabled:opacity-40" style={dashGlass}>Prev</button>
                        <span className="px-2 py-1">Page {cur} of {totalPages}</span>
                        <button disabled={cur === totalPages} onClick={() => setTxHistoryPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded-lg disabled:opacity-40" style={dashGlass}>Next</button>
                        </div>
                    </div>
                    );
                  })()}
                </div>
              )}
          </section>
          )}

        {/* Dev diagnostics panel */}
      {isDevAppEnv && (
          <div className="rounded-2xl p-6 space-y-4 mb-10" style={{ ...dashGlass, border: '2px solid rgba(6,182,212,0.3)' }}>
            <h2 className="text-xl font-semibold text-white">📊 Frontend Diagnostics & Logs</h2>
          <div className="flex flex-wrap gap-2">
              {[
                { label: '📋 View Summary', onClick: () => { setLogsSummary(frontendLogger.getSummary()); setShowLogsPanel(true); } },
                { label: '💾 Download Logs (TXT)', onClick: () => frontendLogger.downloadLogsAsFile('text') },
                { label: '📦 Download Records (JSON)', onClick: () => frontendLogger.downloadRecordDiagnosticsAsFile('json') },
                { label: '📁 Download All (JSON)', onClick: () => frontendLogger.downloadAllAsFile('json') },
                { label: '🗑️ Clear Logs', onClick: () => { frontendLogger.clearLogs(); frontendLogger.clearRecordDiagnostics(); setLogsSummary(null); setStatusMessage('✅ Logs cleared'); } },
              ].map(btn => (
                <button key={btn.label} onClick={btn.onClick} className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:text-white transition-colors" style={dashGlass}>{btn.label}</button>
              ))}
              <button onClick={() => { if (requestRecords && publicKey) { debugAllRecords(requestRecords, publicKey).then(r => { privacyLog('Diagnostic results:', r); setStatusMessage('✅ Diagnostic complete.'); }); } else { setStatusMessage('❌ Wallet not connected'); } }} disabled={!connected} className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:text-white transition-colors disabled:opacity-40" style={dashGlass}>🔍 Run Diagnosis</button>
          </div>
          {showLogsPanel && logsSummary && (
              <div className="rounded-xl p-4 space-y-2 max-h-96 overflow-y-auto" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <h3 className="font-semibold text-white">📊 Session Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-400">
                  <div>Total Logs: <span className="text-white font-semibold">{logsSummary.totalLogs}</span></div>
                  <div>Errors: <span className="text-red-400 font-semibold">{logsSummary.errors}</span></div>
                  <div>Warnings: <span className="text-amber-400 font-semibold">{logsSummary.warnings}</span></div>
                  <div>Duration: <span className="text-white font-semibold">{(logsSummary.sessionDuration / 1000).toFixed(1)}s</span></div>
                </div>
            </div>
          )}
        </div>
      )}

        {/* Status / tx details */}
      {isDevAppEnv ? (
        <>
          {statusMessage && (
              <div className={`rounded-lg px-4 py-3 text-sm mb-4 ${statusMessage.includes('error') || statusMessage.includes('Failed') ? 'text-red-400 bg-red-500/10 border border-red-500/30' : 'text-slate-300 bg-white/5 border border-white/10'}`}>
                {statusMessage}
            </div>
          )}
          {txId && (
              <div className="rounded-xl p-4 max-w-xl mb-4" style={dashGlass}>
                <h3 className="font-semibold text-white mb-2">Last Transaction ID {txFinalized && <span className="ml-2 text-xs text-emerald-400 border border-emerald-400/30 px-2 py-0.5 rounded-full">Finalized</span>}</h3>
                <pre className="text-xs text-slate-400 break-all p-2 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>{txId}</pre>
                {txFinalized && isExplorerHash(txId) && (
                  <a href={getProvableExplorerTxUrl(txId)} target="_blank" rel="noopener noreferrer" className="text-cyan-400 text-sm mt-2 inline-block hover:text-cyan-300">View on Provable Explorer →</a>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {loading && (
              <div className="fixed inset-0 z-40 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <div
                  className="rounded-3xl px-12 py-12 sm:px-16 sm:py-14 flex flex-col items-center justify-center gap-6 min-w-[min(100%,22rem)] sm:min-w-[28rem] max-w-[90vw] shadow-2xl shadow-black/40 border border-white/10"
                  style={dashGlass}
                >
                  <span className="loading loading-spinner loading-lg text-cyan-400 scale-150" />
                  <p className="text-lg sm:text-xl font-semibold text-white tracking-tight text-center">Processing transaction…</p>
                  <p className="text-sm sm:text-base text-slate-400 text-center max-w-sm leading-relaxed">
                    Please confirm in your wallet if prompted. This may take a minute on Aleo.
                  </p>
              </div>
            </div>
          )}
          {statusMessage && !loading && (
              <div className="fixed bottom-4 right-4 z-40 rounded-xl px-4 py-2 text-sm text-slate-300" style={dashGlass}>
              {statusMessage}
            </div>
          )}
        </>
      )}
      </main>
    </div>
  );
};

DashboardPage.getLayout = (page) => <Layout>{page}</Layout>;

export default DashboardPage;

