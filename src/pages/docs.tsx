import React, { useState, useEffect } from 'react';
import type { NextPageWithLayout } from '@/types';
import Layout from '@/layouts/_layout';
import {
  LENDING_POOL_PROGRAM_ID,
  USDC_LENDING_POOL_PROGRAM_ID,
  USAD_LENDING_POOL_PROGRAM_ID,
} from '@/components/aleo/rpc';

const customStyles: Record<string, React.CSSProperties> = {
  glassPanel: {
    background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.4) 0%, rgba(3, 7, 18, 0.6) 100%)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  sidebarLinkActive: {
    color: '#22d3ee',
    background: 'rgba(34, 211, 238, 0.05)',
    borderRight: '2px solid #22d3ee',
  },
  textGradientCyan: {
    background: 'linear-gradient(to right, #22d3ee, #818cf8)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
};

const BookOpenIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

const LayersIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
);

const UserIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const CpuIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <line x1="9" y1="1" x2="9" y2="4"/>
    <line x1="15" y1="1" x2="15" y2="4"/>
    <line x1="9" y1="20" x2="9" y2="23"/>
    <line x1="15" y1="20" x2="15" y2="23"/>
    <line x1="20" y1="9" x2="23" y2="9"/>
    <line x1="20" y1="14" x2="23" y2="14"/>
    <line x1="1" y1="9" x2="4" y2="9"/>
    <line x1="1" y1="14" x2="4" y2="14"/>
  </svg>
);

const ShieldIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const CodeIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </svg>
);

const LayoutIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="9" y1="21" x2="9" y2="9"/>
  </svg>
);

const TrendingUpIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

const RefreshCwIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

const Sidebar = ({ activeSection }: { activeSection: string }) => {
  const linkStyle = (id: string) => ({
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    borderRadius: '0.375rem',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    textDecoration: 'none',
    ...(activeSection === id ? customStyles.sidebarLinkActive : { color: '#94a3b8' }),
  });

  return (
    <aside className="w-64 hidden lg:block sticky top-32 pr-4" style={{ height: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div className="space-y-8">
        <div>
          <h5 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-widest font-sans">Introduction</h5>
          <nav className="flex flex-col gap-1">
            <a href="#overview" style={linkStyle('overview')}>
              <BookOpenIcon className="w-4 h-4" /> Overview
            </a>
            <a href="#features" style={linkStyle('features')}>
              <LayersIcon className="w-4 h-4" /> Features
            </a>
            <a href="#roadmap" style={linkStyle('roadmap')}>
              <TrendingUpIcon className="w-4 h-4" /> Roadmap
            </a>
            <a href="#wallet" style={linkStyle('wallet')}>
              <UserIcon className="w-4 h-4" /> Wallet Behavior
            </a>
            <a href="#dashboard" style={linkStyle('dashboard')}>
              <LayoutIcon className="w-4 h-4" /> Dash & Markets
            </a>
          </nav>
        </div>
        <div>
          <h5 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-widest font-sans">Technical Specs</h5>
          <nav className="flex flex-col gap-1">
            <a href="#lending" style={linkStyle('lending')}>
              <CodeIcon className="w-4 h-4" /> Lending Program
            </a>
            <a href="#privacy" style={linkStyle('privacy')}>
              <ShieldIcon className="w-4 h-4" /> Privacy Model
            </a>
            <a href="#transaction" style={linkStyle('transaction')}>
              <RefreshCwIcon className="w-4 h-4" /> TX Lifecycle
            </a>
          </nav>
        </div>
        <div>
          <h5 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-widest font-sans">Backend & Arch</h5>
          <nav className="flex flex-col gap-1">
            <a href="#supabase" style={linkStyle('supabase')}>
              <LayersIcon className="w-4 h-4" /> Supabase
            </a>
            <a href="#vault" style={linkStyle('vault')}>
              <CpuIcon className="w-4 h-4" /> Vault Backend
            </a>
            <a href="#development" style={linkStyle('development')}>
              <TrendingUpIcon className="w-4 h-4" /> Environment
            </a>
          </nav>
        </div>
      </div>
    </aside>
  );
};

const OnThisPage = () => (
  <aside className="w-48 hidden xl:block sticky top-32 h-fit">
    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 font-sans">On this page</h5>
    <nav className="flex flex-col gap-3 text-xs border-l border-white/5 pl-4 font-sans">
      <a href="#overview" className="text-slate-400 hover:text-cyan-400 transition-colors">Overview</a>
      <a href="#features" className="text-slate-400 hover:text-cyan-400 transition-colors">Features</a>
      <a href="#roadmap" className="text-slate-400 hover:text-cyan-400 transition-colors">Roadmap</a>
      <a href="#wallet" className="text-slate-400 hover:text-cyan-400 transition-colors">Wallet Behavior</a>
      <a href="#dashboard" className="text-slate-400 hover:text-cyan-400 transition-colors">Dash & Markets</a>
      <a href="#lending" className="text-slate-400 hover:text-cyan-400 transition-colors">Lending Program</a>
      <a href="#privacy" className="text-slate-400 hover:text-cyan-400 transition-colors">Privacy Model</a>
      <a href="#transaction" className="text-slate-400 hover:text-cyan-400 transition-colors">TX Lifecycle</a>
      <a href="#supabase" className="text-slate-400 hover:text-cyan-400 transition-colors">Supabase</a>
      <a href="#vault" className="text-slate-400 hover:text-cyan-400 transition-colors">Vault Backend</a>
      <a href="#development" className="text-slate-400 hover:text-cyan-400 transition-colors">Environment</a>
    </nav>
  </aside>
);

const DocsPage: NextPageWithLayout = () => {
  const [activeSection, setActiveSection] = useState('overview');

  const unifiedPools =
    LENDING_POOL_PROGRAM_ID === USDC_LENDING_POOL_PROGRAM_ID &&
    LENDING_POOL_PROGRAM_ID === USAD_LENDING_POOL_PROGRAM_ID;

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'features', 'roadmap', 'wallet', 'dashboard', 'lending', 'privacy', 'transaction', 'supabase', 'vault', 'development'];
      let current = 'overview';
      sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          const top = el.getBoundingClientRect().top;
          if (top <= 150) {
            current = id;
          }
        }
      });
      setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="max-w-[1440px] mx-auto px-6 pt-16 sm:pt-20 pb-20 flex gap-12 font-sans text-slate-300">
      <Sidebar activeSection={activeSection} />
      <main className="flex-1 max-w-4xl animate-fade-in-up">
        
        <section id="overview" className="scroll-mt-32 mb-20">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-0.5 rounded font-mono border" style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#22d3ee', fontSize: '0.625rem', borderColor: 'rgba(6, 182, 212, 0.2)' }}>
              V1.0.0-TESTNET
            </span>
          </div>
          <h1 className="text-5xl font-bold mb-8 text-white">
            High-level <span style={customStyles.textGradientCyan}>Overview</span>
        </h1>
          <p className="text-xl text-slate-400 leading-relaxed mb-8">
            This page describes the current testnet app. On-chain lending logic lives in{' '}
            <span className="font-mono text-cyan-400">program/src/main.leo</span> (deploy name varies; e.g.{' '}
            <span className="font-mono text-cyan-400">xyra_lending_v6.aleo</span>). The UI can show{' '}
            <strong>multiple reserve rows</strong> (ALEO, USDCx, USAD) when your env points at a{' '}
            <strong>unified multi-asset deployment</strong>—there are <strong>no separate USD-denominated Leo program folders</strong> in this repo; optional{' '}
            <span className="font-mono text-cyan-400">NEXT_PUBLIC_*</span> IDs exist so the wallet and Markets can list extra program names when you split deployments.
            Risk and health use the rate model and oracles implemented in the program, not a separate &quot;USD program&quot; tree.
          </p>

          <div className="p-8 rounded-2xl space-y-4" style={customStyles.glassPanel}>
            <p className="font-medium text-white mb-4">The app is an Aave-style experience on Aleo testnet: supply/borrow flows, utilization-based APY, and (when enabled) a single health constraint across reserves defined in the deployed program.</p>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-400">
              <li><span className="font-semibold text-white">Views:</span> Dashboard, Markets, and Docs as tabs on /dashboard.</li>
              <li><span className="font-semibold text-white">Wallet:</span> Shield wallet (Provable adapter) — connect from the header.</li>
              <li><span className="font-semibold text-white">Reserves in one program:</span> when unified, deposits and borrows for multiple assets share one pool contract; asset ids are defined in Leo (e.g. 0field, 1field, 2field).</li>
              <li><span className="font-semibold text-white">Cross-asset risk:</span> borrow/withdraw paths use <strong>oracle prices</strong>, per-asset LTV, and program rules so total debt stays within allowed collateral.</li>
              <li><span className="font-semibold text-white">Private data UX:</span> shield icons and tooltips on sensitive columns and actions.</li>
              <li><span className="font-semibold text-white">Transaction history:</span> Supabase transaction_history by wallet address; optional vault tx links after the pool tx finalizes.</li>
          </ul>
        </div>
      </section>

        <section id="features" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <LayersIcon className="w-8 h-8 text-cyan-400" />
            Current features
          </h2>
          <div className="p-8 rounded-2xl space-y-4" style={customStyles.glassPanel}>
            <ul className="list-disc list-inside space-y-3 text-sm text-slate-400">
              <li><span className="font-semibold text-white">Leo:</span> deposit, borrow, repay, withdraw, accrue interest, utilization-based rates in <span className="font-mono text-cyan-400">program/src/main.leo</span>; offline lending-math tests under <span className="font-mono text-cyan-400">program/lending_math_tests</span>.</li>
              <li><span className="font-semibold text-white">Dashboard:</span> portfolio summary, per-reserve rows with Supply/Borrow APY, expandable Manage flows, validation and processing overlay, loading skeletons.</li>
              <li><span className="font-semibold text-white">Markets:</span> on-chain aggregates, live RPC block height / network status.</li>
              <li><span className="font-semibold text-white">History:</span> Supabase-backed transaction history with explorer (and optional vault) links.</li>
              <li><span className="font-semibold text-white">Backend:</span> vault queue, credit payouts after finalized pool txs, CORS for split deploys.</li>
          </ul>
        </div>
      </section>

        <section id="roadmap" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <TrendingUpIcon className="w-8 h-8 text-indigo-400" />
            Roadmap
          </h2>
          <div className="p-8 rounded-2xl space-y-4" style={customStyles.glassPanel}>
            <ul className="list-disc list-inside space-y-3 text-sm text-slate-400">
              <li><span className="font-semibold text-white">Architecture:</span> <strong>multi-asset, cross-collateral, Aave-style</strong> money market—one program with separate reserves (ALEO, USDCx, USAD), per-reserve utilization and indices, and a linear base+slope borrow curve with reserve factor (see <span className="font-mono text-cyan-400">finalize_accrue</span>).</li>
              <li><span className="font-semibold text-white">Explore:</span> <strong>flash loan</strong> support (design and safety work TBD).</li>
              <li><span className="font-semibold text-white">Later:</span> liquidations, governance, richer oracles, and additional assets as the stack matures.</li>
          </ul>
        </div>
      </section>

        <section id="wallet" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <UserIcon className="w-8 h-8 text-indigo-400" />
            Wallet Behavior & Permissions
          </h2>
          <div className="p-8 rounded-2xl" style={customStyles.glassPanel}>
            <ul className="list-disc list-inside space-y-3 text-sm text-slate-400">
              <li>Integration via <span className="font-mono text-indigo-400">@provablehq/aleo-wallet-adaptor-react</span> and <span className="font-mono text-indigo-400">WalletMultiButton</span>.</li>
              <li><span className="font-semibold text-white">Programs permission list</span> comes from <span className="font-mono text-indigo-400">getWalletConnectProgramIds()</span> in src/types/index.ts. The list is deduplicated.</li>
              <li><span className="font-mono text-indigo-400">decryptPermission</span> is set for automatic record decryption where the adapter supports it.</li>
              <li>Connected <span className="font-mono text-indigo-400">address</span> is used for RPC reads, executeTransaction, and history filters.</li>
              <li><span className="font-mono text-indigo-400">WalletPersistence</span> uses sessionStorage so navigating between Dashboard/Markets/Docs does not drop the connection.</li>
          </ul>
        </div>
      </section>

        <section id="dashboard" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <LayoutIcon className="w-8 h-8 text-cyan-400" />
            Dashboard & Markets
          </h2>
          <div className="p-8 rounded-2xl space-y-4" style={customStyles.glassPanel}>
            <ul className="list-disc list-inside space-y-3 text-sm text-slate-400">
              <li><span className="font-semibold text-white">Dashboard</span> shows a unified summary (total collateral, borrowable estimate, total debt, health factor) and <strong>per-reserve</strong> rows for each configured market.</li>
              <li><span className="font-semibold text-white">Cross-asset checks:</span> before borrow/withdraw, the UI can consult on-chain caps and /vault-balances to prevent transaction failures.</li>
              <li><span className="font-semibold text-white">Markets</span> shows public on-chain aggregates (totals, utilization, APYs) and a reserve overview table.</li>
          </ul>
        </div>
      </section>

        <section id="lending" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <CodeIcon className="w-8 h-8 text-purple-400" />
            Lending Program
          </h2>
          <div className="p-8 rounded-2xl space-y-4" style={customStyles.glassPanel}>
            <p className="text-sm text-slate-400"><span className="font-semibold text-white">Source:</span> <span className="font-mono text-purple-400">program/src/main.leo</span> (deploy name <span className="font-mono text-purple-400">xyra_lending_v6.aleo</span>).</p>
            <p className="text-sm text-slate-400"><span className="font-semibold text-white">Single program, multiple logical reserves:</span> mappings are keyed by asset_id. Each reserve has its own supply/borrow indices, utilization, fees, LTV, liquidation parameters, and oracle price for risk normalization.</p>
            <p className="text-sm text-slate-400"><span className="font-semibold text-white">Cross-asset borrow health:</span> finalize_borrow loads positions, converts supplies to weighted collateral and borrows to debt using asset_price and LTV per the program&apos;s model.</p>
            
            <div className="mt-4 p-4 rounded-xl bg-black/20 text-sm font-mono text-slate-300">
              <span className="text-white">Frontend program IDs (env):</span>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-4 text-xs break-all">
                <li>Primary: {LENDING_POOL_PROGRAM_ID}</li>
                <li>USDCx slot: {USDC_LENDING_POOL_PROGRAM_ID}</li>
                <li>USAD slot: {USAD_LENDING_POOL_PROGRAM_ID}</li>
              </ul>
            </div>
            {unifiedPools ? (
              <p className="text-xs text-slate-500 italic mt-2">All three env vars resolve to the same program ID (unified deployment).</p>
            ) : (
              <p className="text-xs text-slate-500 italic mt-2">Optional slots differ from the primary ID — multiple program deployments or legacy wiring.</p>
            )}
            
            <p className="text-sm text-slate-400"><span className="font-semibold text-white">APY model:</span> utilization-based rates per asset computed from on-chain totals and parameters.</p>
          </div>
        </section>

        <section id="privacy" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <ShieldIcon className="w-8 h-8 text-cyan-400" />
            Privacy Model in UI
          </h2>
          <div className="p-8 rounded-2xl" style={customStyles.glassPanel}>
            <ul className="list-disc list-inside space-y-3 text-sm text-slate-400">
              <li>Columns such as wallet balance, available, position balance, and debt are labeled as private where appropriate.</li>
              <li><span className="font-mono text-cyan-400">PrivateDataColumnHeader</span> adds a shield icon and tooltip.</li>
              <li><span className="font-mono text-cyan-400">PrivateActionButton</span> styles supply/borrow/withdraw/repay with a consistent private-transaction affordance.</li>
            </ul>
          </div>
        </section>

        <section id="transaction" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <RefreshCwIcon className="w-8 h-8 text-indigo-400" />
            Transaction Lifecycle
          </h2>
          <div className="p-8 rounded-2xl" style={customStyles.glassPanel}>
             <ol className="list-decimal list-inside space-y-3 text-sm text-slate-400">
              <li>User starts an action from the modal (Supply / Borrow / Repay / Withdraw) for the selected asset.</li>
              <li><span className="font-mono text-indigo-400">components/aleo/rpc.ts</span> builds the transition and calls the wallet executeTransaction; a temporary tx id is returned.</li>
              <li>The UI polls transactionStatus until finalized, then uses the final on-chain id for explorer links and Supabase.</li>
              <li>For <strong>borrow</strong> and <strong>withdraw</strong>, the app records the row in Supabase and the backend watcher completes vault transfers.</li>
              <li>Accrue-interest actions call <span className="font-mono text-indigo-400">accrue_interest</span> with the correct literal per asset.</li>
          </ol>
        </div>
      </section>

        <section id="supabase" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <LayersIcon className="w-8 h-8 text-purple-400" />
            Supabase TX History
          </h2>
          <div className="p-8 rounded-2xl" style={customStyles.glassPanel}>
             <h3 className="font-semibold text-white mb-2">Schema (Summary)</h3>
             <p className="text-sm text-slate-400 mb-2">Table <span className="font-mono text-purple-400">transaction_history</span> key columns:</p>
             <ul className="list-disc list-inside space-y-1 mb-4 text-sm text-slate-400">
                <li><span className="font-mono">wallet_address</span> — Aleo address.</li>
                <li><span className="font-mono">tx_id</span> — main pool transaction hash.</li>
                <li><span className="font-mono">type</span> — deposit | withdraw | borrow | repay.</li>
                <li><span className="font-mono">asset</span> — aleo, usdcx, or usad.</li>
                <li><span className="font-mono">vault_tx_id</span> — when vault payout completes.</li>
          </ul>
             <h3 className="font-semibold text-white mb-2">Environment</h3>
             <ul className="list-disc list-inside space-y-1 text-sm text-slate-400">
                <li><span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span></li>
                <li><span className="font-mono">NEXT_PUBLIC_SUPABASE_PUB_KEY</span></li>
          </ul>
        </div>
      </section>

        <section id="vault" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <CpuIcon className="w-8 h-8 text-cyan-400" />
            Vault Backend
          </h2>
          <div className="p-8 rounded-2xl space-y-4" style={customStyles.glassPanel}>
            <p className="text-sm text-slate-400">The Node server in <span className="font-mono text-cyan-400">backend/</span> holds the vault wallet and sends user payouts from on-chain programs after the pool records the borrow/withdraw intent.</p>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-400">
               <li><span className="font-semibold text-white">Vault transfers</span> for supported asset types (e.g. Aleo credits / configured tokens) via Provable SDK.</li>
               <li><span className="font-semibold text-white">GET /vault-balances</span> — public vault balances per token program.</li>
               <li><span className="font-semibold text-white">Vault watcher</span> — polls Supabase for rows needing a vault tx.</li>
               <li><span className="font-semibold text-white">Optional oracle</span> — backend can poll spot prices and broadcast set_asset_price.</li>
          </ul>
             <p className="text-xs text-slate-500 mt-2">Configure NEXT_PUBLIC_BACKEND_URL on the frontend and CORS_ORIGIN / vault env vars in backend/.env.</p>
        </div>
      </section>

        <section id="development" className="scroll-mt-32 mb-20">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-white">
            <TrendingUpIcon className="w-8 h-8 text-indigo-400" />
            Development & Env
          </h2>
          <div className="p-8 rounded-2xl" style={customStyles.glassPanel}>
             <ul className="list-disc list-inside space-y-2 text-sm text-slate-400">
               <li><span className="font-semibold text-white">Pool program:</span> NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID.</li>
               <li>NEXT_PUBLIC_APP_ENV toggles minor UX (e.g. status message timing).</li>
               <li>Next.js Pages router, Tailwind, layout in layouts/_layout.tsx.</li>
               <li>All integrations target Aleo testnet unless changed.</li>
          </ul>
             <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-white/10">Implementation entry points: src/pages/dashboard.tsx, src/components/aleo/rpc.ts, backend/src/server.js, supabase/schema.sql.</p>
        </div>
      </section>

      </main>
      <OnThisPage />
    </div>
  );
};

DocsPage.getLayout = function getLayout(page: React.ReactElement) {
  return <Layout>{page}</Layout>;
};

export default DocsPage;
