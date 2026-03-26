import type { NextPageWithLayout } from '@/types';
import Layout from '@/layouts/_layout';
import {
  LENDING_POOL_PROGRAM_ID,
  USDC_LENDING_POOL_PROGRAM_ID,
  USAD_LENDING_POOL_PROGRAM_ID,
} from '@/components/aleo/rpc';

const DocsPage: NextPageWithLayout = () => {
  const unifiedPools =
    LENDING_POOL_PROGRAM_ID === USDC_LENDING_POOL_PROGRAM_ID &&
    LENDING_POOL_PROGRAM_ID === USAD_LENDING_POOL_PROGRAM_ID;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-12 pt-16 sm:pt-20 space-y-10 text-primary-content">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
          Documentation
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary-content">
          Xyra Finance — unified lending &amp; docs
        </h1>
        <p className="text-base text-primary-content/80 max-w-2xl">
          This page describes the current testnet app: a <strong>single</strong> lending program (
          <span className="font-mono">xyra_lending_v6.aleo</span> by default) with{' '}
          <strong>three assets</strong> (ALEO credits, USDCx, USAD),{' '}
          <strong>cross‑asset collateral and borrowing</strong> in USD terms on-chain, the
          dashboard/Markets UX, wallet permissions, Supabase history, and the vault backend for
          payouts.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">1. High-level overview</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <p>
            The app is an Aave-style experience on Aleo testnet, wired to one pool program that
            tracks multiple assets and enforces a single health constraint across them.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <span className="font-semibold">Views:</span>{' '}
              <span className="font-mono">Dashboard</span>, <span className="font-mono">Markets</span>, and{' '}
              <span className="font-mono">Docs</span> as tabs on <span className="font-mono">/dashboard</span>{' '}
              (via <span className="font-mono">DashboardViewProvider</span>).
            </li>
            <li>
              <span className="font-semibold">Wallet:</span> Shield wallet (Provable adapter) — connect
              from the header on any route except the landing page.
            </li>
            <li>
              <span className="font-semibold">Assets in one program:</span> deposits and borrows for{' '}
              <span className="font-mono">credits.aleo</span> (ALEO),{' '}
              <span className="font-mono">test_usdcx_stablecoin.aleo</span> (USDCx), and{' '}
              <span className="font-mono">test_usad_stablecoin.aleo</span> (USAD), each keyed as{' '}
              <span className="font-mono">0field</span>, <span className="font-mono">1field</span>,{' '}
              <span className="font-mono">2field</span> in the pool.
            </li>
            <li>
              <span className="font-semibold">Cross-asset lending:</span> borrow and repay checks use{' '}
              <strong>oracle prices</strong> (<span className="font-mono">asset_price</span> mapping,{' '}
              <span className="font-mono">PRICE_SCALE</span> = 1e6) and per-asset LTV so total debt (USD)
              must stay within total weighted collateral (USD). The frontend mirrors caps with helpers
              like <span className="font-mono">getCrossCollateralBorrowCapsFromChain</span> / withdraw caps.
            </li>
            <li>
              <span className="font-semibold">Private data UX:</span> shield icons and tooltips on
              sensitive columns and actions.
            </li>
            <li>
              <span className="font-semibold">Transaction history:</span> Supabase{' '}
              <span className="font-mono">transaction_history</span> by wallet address; optional vault tx
              links after the pool tx finalizes.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">2. Wallet behavior</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <ul className="list-disc list-inside space-y-1">
            <li>
              Integration via{' '}
              <span className="font-mono">@provablehq/aleo-wallet-adaptor-react</span> and{' '}
              <span className="font-mono">WalletMultiButton</span>.
            </li>
            <li>
              <span className="font-semibold">Programs permission list</span> comes from{' '}
              <span className="font-mono">getWalletConnectProgramIds()</span> in{' '}
              <span className="font-mono">src/types/index.ts</span>: pool program id(s), USDCx stack
              programs (merkle tree, multisig, freezelist, token), USAD token, and{' '}
              <span className="font-mono">credits.aleo</span>. The list is <strong>deduplicated</strong> so
              when USDC/USAD pools default to the same ID as the main lending program, the wallet does not
              show duplicates.
            </li>
            <li>
              <span className="font-mono">decryptPermission</span> is set for automatic record decryption
              where the adapter supports it (e.g. <span className="font-mono">UserActivity</span> records).
            </li>
            <li>
              Connected <span className="font-mono">address</span> is used for RPC position reads,{' '}
              <span className="font-mono">executeTransaction</span>, and Supabase history filters.
            </li>
            <li>
              <span className="font-mono">WalletPersistence</span> uses{' '}
              <span className="font-mono">sessionStorage</span> so navigating between Dashboard/Markets/Docs
              does not drop the connection in normal use.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">3. Dashboard &amp; Markets</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <ul className="list-disc list-inside space-y-1">
            <li>
              <span className="font-semibold">Dashboard</span> shows a unified summary (total collateral,
              borrowable estimate, total debt, health factor) and <strong>per-asset</strong> panels for
              ALEO, USDCx, and USAD: supplies, borrows, APYs, wallet balances, and actions (Supply,
              Withdraw, Borrow, Repay). Actions use the same pool program; stablecoin flows use Merkle
              proofs where the token program requires them.
            </li>
            <li>
              <span className="font-semibold">Cross-asset checks:</span> before borrow/withdraw, the UI can
              consult on-chain caps and optional <span className="font-mono">/vault-balances</span> so users
              do not submit transactions that would fail for liquidity or health.
            </li>
            <li>
              <span className="font-semibold">Markets</span> shows public on-chain aggregates (totals,
              utilization, APYs) and a reserve overview table including vault wallet balances and USD
              estimates from on-chain <span className="font-mono">asset_price</span> when available.
            </li>
            <li>
              Wallet remains available from the global header while on <span className="font-mono">/dashboard</span>.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">
          4. Lending program: <span className="font-mono">xyra_lending_v6.aleo</span>
        </h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <p>
            <span className="font-semibold">Source:</span>{' '}
            <span className="font-mono">program/src/main.leo</span> (deploy name{' '}
            <span className="font-mono">xyra_lending_v6.aleo</span>). The live ID is configured with{' '}
            <span className="font-mono">NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID</span> (see{' '}
            <span className="font-mono">src/types/index.ts</span> as <span className="font-mono">BOUNTY_PROGRAM_ID</span>
            ).
          </p>
          <p>
            <span className="font-semibold">Single program, three logical assets:</span> mappings are keyed
            by <span className="font-mono">asset_id</span> (<span className="font-mono">0field</span> ALEO,{' '}
            <span className="font-mono">1field</span> USDCx, <span className="font-mono">2field</span> USAD).
            Each asset has its own supply/borrow indices, utilization, fees, LTV, liquidation parameters,
            and price for USD normalization.
          </p>
          <p>
            <span className="font-semibold">Cross-asset borrow health (on-chain):</span>{' '}
            <span className="font-mono">finalize_borrow</span> loads all three positions, converts supplies
            to <strong>weighted collateral USD</strong> and borrows to <strong>debt USD</strong> using{' '}
            <span className="font-mono">asset_price</span> and LTV, then requires{' '}
            <span className="font-mono">total_debt + new_borrow ≤ total_weighted_collateral</span>.{' '}
            <span className="font-mono">finalize_repay_any</span> similarly aggregates debt across assets for
            repay routing.
          </p>
          <p>
            <span className="font-semibold">Frontend program IDs:</span>
          </p>
          <ul className="list-disc list-inside ml-2 space-y-1 font-mono text-xs break-all">
            <li>
              ALEO pool: <span className="text-base-content">{LENDING_POOL_PROGRAM_ID}</span>
            </li>
            <li>
              USDCx pool: <span className="text-base-content">{USDC_LENDING_POOL_PROGRAM_ID}</span>
            </li>
            <li>
              USAD pool: <span className="text-base-content">{USAD_LENDING_POOL_PROGRAM_ID}</span>
            </li>
          </ul>
          {unifiedPools ? (
            <p className="pt-1 text-xs text-base-content/80">
              All three resolve to the <strong>same</strong> program ID (unified deployment). Optional env{' '}
              <span className="font-mono">NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID</span> /{' '}
              <span className="font-mono">NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID</span> exists only if you
              split deployments; otherwise omit them to avoid duplicate wallet permissions.
            </p>
          ) : (
            <p className="pt-1 text-xs text-base-content/80">
              USDC/USAD IDs differ from the main ID — you are using separate deployments for some routes.
            </p>
          )}

          <p className="pt-2">
            <span className="font-semibold">APY model:</span> utilization-based rates per asset (see{' '}
            <span className="font-mono">program/docs/INTEREST_APY_DESIGN.md</span>). The frontend computes
            display APYs in <span className="font-mono">src/components/aleo/rpc.ts</span> (e.g.{' '}
            <span className="font-mono">computeAleoPoolAPY</span>,{' '}
            <span className="font-mono">computeUsdcPoolAPY</span>,{' '}
            <span className="font-mono">computeUsadPoolAPY</span>) from on-chain totals and parameters.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">5. Privacy model in the UI</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <ul className="list-disc list-inside space-y-1">
            <li>
              Columns such as wallet balance, available, position balance, and debt are labeled as private
              where appropriate.
            </li>
            <li>
              <span className="font-mono">PrivateDataColumnHeader</span> adds a shield icon and tooltip.
            </li>
            <li>
              <span className="font-mono">PrivateActionButton</span> styles supply/borrow/withdraw/repay with a
              consistent private-transaction affordance.
            </li>
            <li>
              <span className="font-mono">InfoTooltip</span> explains APY and other fields without cluttering
              every row.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">6. Transaction lifecycle</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <ol className="list-decimal list-inside space-y-2">
            <li>User starts an action from the modal (Supply / Borrow / Repay / Withdraw) for the selected asset.</li>
            <li>
              <span className="font-mono">components/aleo/rpc.ts</span> builds the transition and calls the
              wallet&apos;s <span className="font-mono">executeTransaction</span>; a temporary tx id is returned.
            </li>
            <li>
              The UI polls <span className="font-mono">transactionStatus</span> until finalized, then uses the
              final on-chain id for explorer links and Supabase.
            </li>
            <li>
              For <strong>borrow</strong> and <strong>withdraw</strong> of tokens paid from the protocol vault,
              the pool transaction may finalize first; the app records the row in Supabase (optionally with{' '}
              <span className="font-mono">vault_tx_id</span> pending). The backend watcher completes vault
              transfers (ALEO credits, USDCx, USAD) and updates Supabase.
            </li>
            <li>
              Accrue-interest actions call <span className="font-mono">accrue_interest</span> with the correct{' '}
              <span className="font-mono">asset_id</span> field literal per asset.
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">7. Supabase transaction history</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <h3 className="font-semibold">Schema (summary)</h3>
          <p>
            Table <span className="font-mono">transaction_history</span> — key columns:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li><span className="font-mono">wallet_address</span> — Aleo address.</li>
            <li><span className="font-mono">tx_id</span> — main pool transaction hash.</li>
            <li>
              <span className="font-mono">type</span> — <span className="font-mono">deposit</span> |{' '}
              <span className="font-mono">withdraw</span> | <span className="font-mono">borrow</span> |{' '}
              <span className="font-mono">repay</span>.
            </li>
            <li>
              <span className="font-mono">asset</span> — <span className="font-mono">aleo</span>,{' '}
              <span className="font-mono">usdcx</span>, or <span className="font-mono">usad</span>.
            </li>
            <li><span className="font-mono">amount</span>, <span className="font-mono">explorer_url</span>.</li>
            <li>
              <span className="font-mono">vault_tx_id</span> / <span className="font-mono">vault_explorer_url</span>{' '}
              when the vault payout completes.
            </li>
            <li><span className="font-mono">created_at</span>.</li>
          </ul>
          <p>
            RLS and publishable key usage are documented in <span className="font-mono">supabase/schema.sql</span>.
          </p>

          <h3 className="font-semibold pt-3">Environment</h3>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li><span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span></li>
            <li><span className="font-mono">NEXT_PUBLIC_SUPABASE_PUB_KEY</span> (publishable)</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">8. Vault backend</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <p>
            The Node server in <span className="font-mono">backend/</span> (Express) holds the vault wallet and
            sends user payouts from on-chain token/credit programs after the pool records the borrow/withdraw
            intent.
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>
              <span className="font-semibold">Vault transfers</span> for ALEO (<span className="font-mono">credits.aleo</span>
              ), USDCx (<span className="font-mono">test_usdcx_stablecoin.aleo</span>), and USAD (
              <span className="font-mono">test_usad_stablecoin.aleo</span>) via Provable SDK (
              <span className="font-mono">processWithdrawal.js</span>).
            </li>
            <li>
              <span className="font-semibold">GET /vault-balances</span> — public vault balances per token program
              (used by the Markets UI and liquidity checks).
            </li>
            <li>
              <span className="font-semibold">Vault watcher</span> — polls Supabase for rows needing a vault tx
              and completes them.
            </li>
            <li>
              <span className="font-semibold">Optional oracle</span> — backend can poll spot prices and broadcast{' '}
              <span className="font-mono">set_asset_price</span> when configured (admin key + env); see{' '}
              <span className="font-mono">backend/src/aleoPricePoller.js</span> and{' '}
              <span className="font-mono">setAssetPriceOnChain.js</span>.
            </li>
          </ul>
          <p className="text-xs text-base-content/70">
            Configure <span className="font-mono">NEXT_PUBLIC_BACKEND_URL</span> on the frontend and{' '}
            <span className="font-mono">CORS_ORIGIN</span> / vault env vars in <span className="font-mono">backend/.env</span>.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-primary-content">9. Development &amp; environment</h2>
        <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3 text-sm leading-relaxed text-base-content">
          <ul className="list-disc list-inside space-y-1">
            <li>
              <span className="font-semibold">Pool program:</span>{' '}
              <span className="font-mono">NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID=xyra_lending_v6.aleo</span> for the
              unified deployment described here.
            </li>
            <li>
              <span className="font-semibold">Optional split USDC/USAD program IDs</span> — only if you deploy
              separate programs; otherwise leave unset so the app and wallet list stay single-ID.
            </li>
            <li>
              <span className="font-mono">NEXT_PUBLIC_APP_ENV</span> toggles minor UX (e.g. status message timing).
            </li>
            <li>
              Next.js Pages router, Tailwind + DaisyUI, layout in <span className="font-mono">layouts/_layout.tsx</span>.
            </li>
            <li>
              All integrations target Aleo testnet unless you change RPC/network constants.
            </li>
          </ul>

          <p className="text-xs text-base-content/60 pt-2">
            Implementation entry points:{' '}
            <span className="font-mono">src/pages/dashboard.tsx</span>,{' '}
            <span className="font-mono">src/components/aleo/rpc.ts</span>,{' '}
            <span className="font-mono">backend/src/server.js</span>,{' '}
            <span className="font-mono">supabase/schema.sql</span>.
          </p>
        </div>
      </section>
    </div>
  );
};

DocsPage.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

export default DocsPage;
