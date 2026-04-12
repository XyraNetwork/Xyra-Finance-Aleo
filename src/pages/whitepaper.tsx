import React, { useEffect } from 'react';
import type { NextPageWithLayout } from '@/types';
import Layout from '@/layouts/_layout';
import { NextSeo } from 'next-seo';
import Link from 'next/link';
import { LENDING_POOL_PROGRAM_ID } from '@/components/aleo/rpc';

const SECTIONS: { id: string; num: string; title: string }[] = [
  { id: 'abstract', num: '0', title: 'Abstract' },
  { id: 'privacy', num: '1', title: 'Privacy, public state, and the Aleo model' },
  { id: 'architecture', num: '2', title: 'System architecture' },
  { id: 'state-model', num: '3', title: 'State model: mappings and LendingPosition' },
  { id: 'multi-asset', num: '4', title: 'Multi-asset unified pool' },
  { id: 'risk', num: '5', title: 'USD-normalized risk and health' },
  { id: 'core-flows', num: '6', title: 'Core lending transitions' },
  { id: 'interest', num: '7', title: 'Interest, indices, and protocol fees' },
  { id: 'liquidation', num: '8', title: 'Self-liquidation' },
  { id: 'flash', num: '9', title: 'Flash loans' },
  { id: 'vault', num: '10', title: 'Vault, backend, and operational flow' },
  { id: 'admin-oracle', num: '11', title: 'Admin, oracle updates, and automation' },
  { id: 'data', num: '12', title: 'Application data layer' },
  { id: 'security', num: '13', title: 'Security properties and trust boundaries' },
  { id: 'limitations', num: '14', title: 'Known limitations (testnet)' },
  { id: 'roadmap', num: '15', title: 'Roadmap' },
];

function Section({
  id,
  num,
  title,
  children,
}: {
  id: string;
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36 mb-16 sm:mb-20 border-b border-white/[0.06] pb-16 last:border-0">
      <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-400/90 mb-2 font-mono">Section {num}</p>
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 tracking-tight">{title}</h2>
      <div className="prose prose-invert prose-p:text-slate-300 prose-headings:text-white prose-strong:text-slate-100 prose-li:text-slate-300 max-w-none space-y-4 text-[15px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

const WhitepaperPage: NextPageWithLayout = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash?.slice(1);
    if (hash) {
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const programLine = `${LENDING_POOL_PROGRAM_ID} · credits.aleo · test_usdcx_stablecoin.aleo · test_usad_stablecoin.aleo`;

  return (
    <>
      <NextSeo
        title="Xyra Finance — Technical Whitepaper"
        description="Privacy-first multi-asset lending on Aleo: protocol design, risk model, liquidation, flash loans, vault integration, and roadmap."
      />
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pb-24 pt-4 sm:pt-6 text-slate-300">
        {/* Hero — ZKPerp-style metadata band */}
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a1324] via-[#0b1220] to-[#121a32] p-6 sm:p-10 lg:p-12 mb-10 lg:mb-14">
          <div className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/80 mb-3">Technical whitepaper</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white leading-tight max-w-4xl">
              Xyra Finance — Private multi-asset lending on Aleo
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-300/95 max-w-3xl leading-relaxed">
              A unified money-market program where deposits, borrows, repays, withdrawals, interest, self-liquidation, and
              flash liquidity are enforced on-chain. User positions are carried in private records; pool-level accounting,
              prices, and parameters live in public mappings — aligned at finalize so the dApp and the chain agree.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Protocol</p>
                <p className="text-slate-200 font-mono text-xs break-all leading-snug">{programLine}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Network</p>
                <p className="text-slate-200">Aleo testnet (deploy as configured)</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Stack</p>
                <p className="text-slate-200">Leo · Next.js · Shield wallet · Node vault API</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Version</p>
                <p className="text-slate-200">Wave 5 product · April 2026</p>
              </div>
            </div>

            <p className="mt-6 text-xs text-slate-500 leading-relaxed flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-cyan-400/90">●</span> Multi-asset pool (ALEO / USDCx / USAD)
              <span className="text-cyan-400/90">●</span> Cross-collateral USD risk
              <span className="text-cyan-400/90">●</span> Private position records
              <span className="text-cyan-400/90">●</span> Self-liquidation + flash loans
              <span className="text-cyan-400/90">●</span> Vault-funded payouts
              <span className="text-cyan-400/90">●</span> Admin + optional price poller
            </p>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-14 items-start">
          {/* TOC sidebar */}
          <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-32 lg:z-10 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:[scrollbar-gutter:stable] pr-1">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-4">Contents</p>
              <nav className="space-y-1.5">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block text-sm text-slate-400 hover:text-cyan-300 transition-colors py-1 border-l-2 border-transparent hover:border-cyan-500/50 pl-3 -ml-px"
                  >
                    <span className="font-mono text-cyan-500/80 mr-2">{s.num}</span>
                    {s.title}
                  </a>
                ))}
              </nav>
              <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
                <Link href="/docs" className="block text-sm text-indigo-300 hover:text-indigo-200">
                  In-app documentation →
                </Link>
                <Link href="/dashboard" className="block text-sm text-slate-400 hover:text-white">
                  Open app →
                </Link>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1 max-w-3xl">
            <Section id="abstract" num="0" title="Abstract">
              <p>
                Xyra Finance implements a <strong>single Leo lending program</strong> that treats ALEO (credits), USDCx, and
                USAD as separate reserves inside one pool. Users hold a private <code className="text-cyan-300/90">LendingPosition</code>{' '}
                record with <strong>scaled</strong> supply and borrow balances per asset. The chain exposes aggregate health
                through <strong>mappings</strong>: totals, indices, available liquidity, oracle prices, LTV, liquidation
                thresholds and bonuses, rate parameters, protocol fees, flash configuration, and (during an active flash) a
                compact per-user session keyed by a field hash of the caller.
              </p>
              <p>
                Transitions pass <strong>public witnesses</strong> (indices, prices, LTVs) into <code className="text-cyan-300/90">finalize</code> where they are
                asserted against mappings. That design keeps wallet-facing previews and caps consistent with what the
                program will accept, and lets a web client reconstruct portfolio metrics from RPC without trusting stale
                record interpretation alone.
              </p>
              <p>
                Liquidity that leaves the pool as <strong>credits or stablecoins</strong> after borrow, withdraw, or flash
                funding is delivered through a <strong>vault wallet</strong> operated off-chain with serialized queueing;
                the on-chain step authorizes accounting, the backend completes settlement.
              </p>
            </Section>

            <Section id="privacy" num="1" title="Privacy, public state, and the Aleo model">
              <p>
                Aleo distinguishes <strong>private records</strong> (visible to the owner via viewing key) from{' '}
                <strong>public mappings</strong> (globally readable). Xyra stores per-user supply and borrow exposure in a
                private <code className="text-cyan-300/90">LendingPosition</code>. Observers without the owner&apos;s keys do not see those balances directly.
              </p>
              <p>
                What necessarily remains <strong>public</strong> includes: pool aggregates (deposited, borrowed, available
                liquidity), interest indices, fee accumulators, APY snapshots used for display, oracle prices, risk parameters,
                flash flags, and the side effects of finalize (e.g. total delta per asset). This mirrors other privacy-preserving
                DeFi designs: <strong>market-level</strong> transparency with <strong>user-level</strong> confidentiality.
              </p>
              <p>
                The application minimizes sensitive logging in production builds; operators should still treat RPC and indexer
                metadata as a separate privacy surface from on-chain publication.
              </p>
            </Section>

            <Section id="architecture" num="2" title="System architecture">
              <pre className="text-xs sm:text-sm font-mono text-slate-400 bg-black/40 border border-white/10 rounded-2xl p-4 overflow-x-auto leading-relaxed whitespace-pre">
{`┌────────────────────────────────────────────────────────────────────┐
│  Frontend — Next.js / React / Tailwind (Vercel or self-hosted)      │
│  Dashboard · Liquidation · Flash · Markets · Docs · Admin · Whitepaper│
└───────────────────────────────┬────────────────────────────────────┘
                                │ JSON-RPC · wallet (Shield)
                                ▼
                    ┌───────────────────────┐
                    │  Provable Shield       │  Signs txs · requestRecords / decrypt
                    └───────────┬───────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  Aleo network (testnet by default)                                  │
│  Unified lending program + credits / USDCx / USAD imports           │
│  Private: LendingPosition (per user, updated each flow)             │
│  Public:  totals · indices · liquidity · prices · risk · flash     │
└───────────────────────────────┬────────────────────────────────────┘
                                ▲
           borrow / withdraw / flash fund (vault payout)
                                │
┌────────────────────────────────────────────────────────────────────┐
│  Backend — Node / Express                                           │
│  Vault queue · multi-asset payouts · flash session APIs             │
│  Optional: CoinGecko → set_asset_price · accrue scheduler · watcher │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  Supabase (optional, recommended)                                   │
│  transaction_history · flash_sessions · vault tx linkage            │
└────────────────────────────────────────────────────────────────────┘`}
              </pre>
              <p>
                The <strong>canonical lending logic</strong> lives in the Leo program under <code className="text-cyan-300/90">program/src/main.leo</code>. Deployed
                program names vary by version; the app reads <code className="text-cyan-300/90">NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID</code> (and related env slots for
                extra market rows when used).
              </p>
            </Section>

            <Section id="state-model" num="3" title="State model: mappings and LendingPosition">
              <p>
                <strong>Scaled balances.</strong> User debt and supply are not stored as raw token amounts that manually compound
                every block. They are stored as <strong>scaled</strong> integers; <code className="text-cyan-300/90">real = scaled × index / INDEX_SCALE</code>. Supply and
                borrow each have an index updated on <code className="text-cyan-300/90">accrue_interest</code>.
              </p>
              <p>
                <strong>Finalize alignment.</strong> User-facing transitions include public inputs that must equal mapping reads
                at finalize time (e.g. stale supply index after accrual causes revert). This ties private record updates to the
                same pool snapshot the RPC layer can query.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Pool liquidity:</strong> <code className="text-cyan-300/90">available_liquidity[asset]</code> is reduced on borrow and flash open, increased on
                  repay, certain withdraw paths, flash settle, and self-liquidation flows as defined in finalize.
                </li>
                <li>
                  <strong>Positions:</strong> one consolidated <code className="text-cyan-300/90">LendingPosition</code> carries six scalars (scaled sup/bor × 3 assets).
                </li>
              </ul>
            </Section>

            <Section id="multi-asset" num="4" title="Multi-asset unified pool">
              <p>
                Assets are identified by fields (e.g. <code className="text-cyan-300/90">0field</code> ALEO, <code className="text-cyan-300/90">1field</code> USDCx, <code className="text-cyan-300/90">2field</code> USAD). Deposits and withdrawals use the
                corresponding token program (credits or stablecoin interfaces). <strong>Cross-asset borrow</strong> is allowed:
                collateral valued in USD (with per-asset LTV) supports debt in another asset, subject to finalize checks.
              </p>
              <p>
                <strong>Repay</strong> supports paying with one stablecoin or credits while reducing debt across assets via a
                USD budget and programmatic waterfall (debt legs reduced in a fixed order with pricing from mappings).
              </p>
              <p>
                <strong>Withdraw</strong> enforces health using cross-asset collateral and debt; complex paths can burn
                supplied notionals across reserves to satisfy solvency and program rules (see Leo implementation for exact burn
                ladder and caps).
              </p>
            </Section>

            <Section id="risk" num="5" title="USD-normalized risk and health">
              <p>
                Risk uses <code className="text-cyan-300/90">PRICE_SCALE</code> and mapped <code className="text-cyan-300/90">asset_price</code> per reserve. <strong>Weighted collateral</strong> applies
                per-asset LTV in basis-point style limits. <strong>Debt</strong> is computed from scaled borrows and borrow
                indices, then converted to USD for aggregation.
              </p>
              <p>
                The web app exposes a <strong>health factor</strong> style ratio when debt is meaningful (otherwise shown as
                unbounded / “∞”). <strong>Self-liquidation</strong> is only valid when on-chain rules classify the position as
                underwater versus <strong>liquidation threshold</strong> collateral, distinct from raw LTV borrow headroom.
              </p>
            </Section>

            <Section id="core-flows" num="6" title="Core lending transitions">
              <ul className="list-disc pl-5 space-y-3">
                <li>
                  <strong>Open account</strong> — Mints an empty <code className="text-cyan-300/90">LendingPosition</code> for new users.
                </li>
                <li>
                  <strong>Deposit</strong> — Moves tokens into the pool vault; increases deposited and available liquidity;
                  updates scaled supply using the supply index.
                </li>
                <li>
                  <strong>Borrow</strong> — Checks USD headroom; increases scaled borrow and total borrowed; reduces available
                  liquidity; vault pays out after finalize.
                </li>
                <li>
                  <strong>Repay</strong> — Accepts asset-denominated payment; reduces scaled borrows across assets per USD
                  waterfall; increases available liquidity for the paid-in asset.
                </li>
                <li>
                  <strong>Withdraw</strong> — Reduces scaled supply subject to post-withdraw solvency; updates totals and
                  liquidity per asset path.
                </li>
              </ul>
            </Section>

            <Section id="interest" num="7" title="Interest, indices, and protocol fees">
              <p>
                <code className="text-cyan-300/90">accrue_interest(asset_id)</code> advances time-based accounting: utilization from borrowed/deposited drives a
                linear borrow rate (base + slope); supply rate shares borrow interest net of <strong>reserve factor</strong>; a
                portion flows to <code className="text-cyan-300/90">protocol_fees</code>. Supply and borrow indices compound; stored APY fields update for readers.
              </p>
              <p>
                <strong>Admin</strong> may <code className="text-cyan-300/90">withdraw_fees</code> up to mapped balances. Anyone can call accrue; parameter changes are
                admin-gated.
              </p>
            </Section>

            <Section id="liquidation" num="8" title="Self-liquidation">
              <p>
                The program exposes <strong>owner-only</strong> self-liquidation: the user repays <strong>ALEo debt</strong> up to
                a <strong>close factor</strong> (50% of current ALEo borrow per transaction, in bps) and selects a{' '}
                <strong>seized collateral asset</strong> (ALEO, USDCx, or USAD supplied). Seize size derives from USD value of
                repay, oracle price, and mapped <strong>liquidation bonus</strong> for the seized asset; finalize asserts bonus
                matches mapping.
              </p>
              <p>
                This deployment emphasizes <strong>self-service</strong> resolution of underwater positions. A generic
                third-party liquidator marketplace is not described here as a live on-chain feature of the same interface.
              </p>
            </Section>

            <Section id="flash" num="9" title="Flash loans">
              <p>
                <strong>Open:</strong> <code className="text-cyan-300/90">flash_open</code> requires flash enabled for the asset, principal within optional max, strategy ID
                on an allowlist, no active session for the user, and principal ≤ <code className="text-cyan-300/90">available_liquidity</code>. Mappings record principal,
                min profit, strategy, and reserve liquidity.
              </p>
              <p>
                <strong>Funding:</strong> The vault sends principal to the user after open finalizes (backend route); this is
                not implicit in the Leo transition alone.
              </p>
              <p>
                <strong>Settle:</strong> User repays via credits, USDCx, or USAD path; finalize requires repayment ≥ principal +
                fee where fee uses mapped premium bps; excess over principal+fee must meet <strong>min profit</strong>. Liquidity
                is restored; fee accrues to protocol fees; session cleared.
              </p>
            </Section>

            <Section id="vault" num="10" title="Vault, backend, and operational flow">
              <p>
                The <strong>vault</strong> is a dedicated Aleo address holding payout liquidity. After a finalized borrow,
                withdraw, or flash fund request, the backend enqueues work, respects <strong>concurrency limits</strong>, and
                submits transfers. <strong>USDCx/USAD</strong> paths use the same architectural pattern with asset-specific
                processors.
              </p>
              <p>
                <strong>Flash sessions</strong> are tracked in Supabase for UX: open tx, vault fund tx, settle tx, status, and
                timestamps — so users can resume or audit flows without scraping the chain alone.
              </p>
            </Section>

            <Section id="admin-oracle" num="11" title="Admin, oracle updates, and automation">
              <p>
                <strong>On-chain admin address</strong> (constructor-gated in Leo) may: set prices, set or batch-update risk and
                rate parameters, configure flash (enable, premium bps, caps), allow or deny strategy IDs, withdraw fees, and
                initialize the deployment.
              </p>
              <p>
                The <strong>optional price poller</strong> fetches ALEO/USD from CoinGecko and may broadcast{' '}
                <code className="text-cyan-300/90">set_asset_price</code> using a configured signer (pool admin private key or vault key when vault equals admin).
                A separate optional job may broadcast <code className="text-cyan-300/90">accrue_interest</code> on a schedule.
              </p>
              <p>
                The <strong>web admin console</strong> is gated by env-configured operator wallet; it mirrors these capabilities
                for testnet operations.
              </p>
            </Section>

            <Section id="data" num="12" title="Application data layer">
              <p>
                <strong>Supabase</strong> (recommended) stores <code className="text-cyan-300/90">transaction_history</code> for explorer links, types (deposit, borrow, flash_loan,
                self_liquidate_payout, …), optional vault transfer ids, and <code className="text-cyan-300/90">flash_sessions</code> for session lifecycle. The browser uses the
                publishable key for reads; trusted writes go through server routes with shared secrets / service role as
                appropriate.
              </p>
            </Section>

            <Section id="security" num="13" title="Security properties and trust boundaries">
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>On-chain rules</strong> are authoritative; the UI and backend must not assume looser limits than
                  finalize.
                </li>
                <li>
                  <strong>Vault key</strong> custody is a trust assumption: whoever controls the vault funds can move them
                  outside program rules if compromised.
                </li>
                <li>
                  <strong>Oracle/prices</strong> are admin-supplied in this design; market manipulation or stale prices affect
                  risk outcomes.
                </li>
                <li>
                  <strong>Testnet assets</strong> have no production guarantees; upgrade deployment and audit before mainnet.
                </li>
              </ul>
            </Section>

            <Section id="limitations" num="14" title="Known limitations (testnet)">
              <ul className="list-disc pl-5 space-y-2">
                <li>Third-party liquidator competition not part of core UI narrative.</li>
                <li>Oracle decentralization and governance are simplified vs production-grade deployments.</li>
                <li>RPC latency and wallet permission UX affect perceived performance.</li>
                <li>Program ID and parameter sets must match between frontend, backend, and chain.</li>
              </ul>
            </Section>

            <Section id="roadmap" num="15" title="Roadmap">
              <ul className="list-disc pl-5 space-y-2">
                <li>Stronger oracle stack and liquidator participation models.</li>
                <li>Governance and additional assets / pool types.</li>
                <li>Mainnet hardening, audits, and operational runbooks.</li>
                <li>Deeper privacy guarantees for off-chain telemetry and analytics.</li>
              </ul>
              <p className="text-sm text-slate-500 mt-6">
                For integration details and file references, see the in-app <Link href="/docs" className="text-cyan-400 hover:underline">Documentation</Link> and repository{' '}
                <code className="text-slate-500">README.md</code>.
              </p>
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

WhitepaperPage.getLayout = (page: React.ReactElement) => <Layout>{page}</Layout>;

export default WhitepaperPage;
