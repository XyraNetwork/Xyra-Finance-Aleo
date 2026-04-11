# Xyra Finance – Private Lending & Borrowing on Aleo

**Live demo:** [https://xyra-finance.vercel.app/](https://xyra-finance.vercel.app/)

Xyra Finance is a **privacy-first lending and borrowing protocol** on Aleo—inspired by Aave and rebuilt for zero-knowledge execution. Supply, borrow, and manage capital with confidential positions, utilization-based interest, and vault-backed withdraw/borrow flows.

---

## Overview

- **Problem:** Public DeFi lending exposes balances and strategies, attracts MEV and liquidation sniping, and is unsuitable for institutions and regulated entities.
- **Solution:** Lending pools on Aleo where **deposits, borrows, repayments, withdrawals, and interest** are enforced on-chain, **user positions stay private** (Aleo records), and pool-level metrics (TVL, utilization, APY) stay queryable via RPC.
- **Current status:** **Native ALEO lending** (deposit, borrow, repay, withdraw, interest accrual) implemented in the main Leo program, with a **Node/Express vault backend** that releases **Aleo credits** (and related asset payouts) after on-chain finalization. The **Next.js** dApp provides a landing page, **Dashboard** (portfolio, **Liquidation**, **Flash loan** views), **Markets**, **Docs**, **`/admin`** operator console (when configured), and **transaction history** plus **flash session** tracking (Supabase) with Provable wallet (Shield) integration. **User-facing positions and caps** are read from **on-chain mappings** in line with finalize logic—so the UI matches pool state rather than relying on a looser record-only interpretation. Optional env wiring can point the UI at additional program IDs for extra market rows—the canonical on-chain lending logic lives under **`program/`**.

---

## Repository structure

| Path | Description |
|------|-------------|
| **`/`** | Next.js 15 frontend: landing, dashboard (incl. liquidation & flash tabs), `/liquidation` & `/flash` short links → dashboard, `/admin`, markets, docs, wallet, RPC helpers (`src/components/aleo/rpc.ts`) |
| **`program/`** | Leo program: ALEO lending pool (`src/main.leo`), lending math tests |
| **`backend/`** | Express server: vault transfers, optional vault watcher, CORS, Supabase updates |
| **`supabase/`** | SQL for `transaction_history`, `flash_sessions`, and related migrations |
| **`docs/`** | Submission notes, wave ideas; **`backend/docs/CONCURRENCY.md`** for vault queue |

Program IDs are configured via **`NEXT_PUBLIC_*`** env vars (see below), not hardcoded to a single deployment name.

---

## Features (current)

### Leo programs (`program/`)

- **Money-market core:** deposit, borrow, repay, withdraw, accrue interest, utilization-based borrow/supply dynamics—implemented in **`program/src/main.leo`** as **multiple reserves** (ALEO credits, USDCx, USAD) in one program with cross-collateral health checks.
- **Self-liquidation and flash:** on-chain transitions for **self-liquidation** (debt repayment and collateral release under protocol rules) and **flash loans** (open / settle per asset, premiums, caps, strategy allowlist)—surfaced in the dashboard and admin UI.
- **Public pool state:** totals, indices, utilization; on-chain mappings for caps, user position aggregates, and parameters—the app reads these mappings for **consistent position and cap display** alongside private records.
- **Private user activity:** shielded records for user flows on Aleo.
- **Lending math tests:** `program/lending_math_tests` with offline **`leo test`** for rate/index math.

### Frontend (Next.js + React 19)

- **Landing (`/`):** Hero, product narrative, CTA into the app.
- **Dashboard (`/dashboard`):** Portfolio summary (collateral, borrowable, debt, health factor), **per-asset rows** for configured markets with wallet balance, supplied/borrowed amounts, **Supply/Borrow APY** under position columns, expandable **Manage** (Supply / Withdraw / Borrow / Repay) with amount validation, previews, and transaction flow (empty state + wallet connect when disconnected).
- **Positions vs on-chain truth:** Portfolio, caps, and effective position math are driven from **program mappings** (and related RPC reads) so they stay aligned with how the pool finalizes state—replacing an older path that leaned more heavily on raw records without the same mapping-level consistency.
- **Liquidation (`/liquidation` → `?view=liquidation`):** Dedicated flow for **self-liquidation**: liquidatable state, on-chain-aligned **preview** before signing (`getLiquidationPreviewAleo` / UI limits), repay-and-reclaim under program rules, and history rows typed as self-liquidation / vault payout where applicable.
- **Flash loans (`/flash` → `?view=flash`):** **Open session** on-chain (`flash_open`), **vault-funded** principal via backend (`POST /flash/fund-session`), **settle** in one transaction per asset path (credits / USDCx / USAD), fee preview, optional strategy id, and **session list** (Supabase-backed) with active vs terminal statuses.
- **Admin (`/admin`):** Operator console gated by **`NEXT_PUBLIC_LENDING_ADMIN_ADDRESS`** (see `src/components/AdminView.tsx`): pool initialization, oracle refresh, interest accrual, risk and rate parameters, flash policy (params / allowed strategies), fee withdrawal when permitted—other wallets see an access-only message.
- **Markets (`/markets`):** Pool-facing metrics, APY, vault hints where relevant, **live network status** (latest block height and RPC endpoint via Aleo JSON-RPC).
- **Docs (`/docs`):** In-app documentation (including liquidation, flash, and admin sections).
- **Wallet:** Provable **Shield** adapter, modal-based connect, session persistence (`WalletPersistence`).
- **Transaction history:** Paginated history; Supabase-backed; explorer links and optional vault transfer metadata (including **flash_loan** and **self_liquidate_payout** types where used).
- **UX polish:** Full-page loading states on the dashboard, larger “processing transaction” overlay during submits, consistent pointer affordances (`src/assets/css/globals.css`), Tailwind CSS v4 + DaisyUI.

### Backend (Express, ESM)

- **Vault endpoints** that pay out **Aleo credits** (and other configured assets) after finalized on-chain steps—**borrow**, **withdraw**, and **flash fund** flows share consistent payout helpers where applicable (see `backend/src/server.js` and processors).
- **Flash:** Session funding and watcher paths integrate with the vault queue; see **`POST /flash/fund-session`** and flash session APIs used by the dashboard.
- **Queue:** Serialized vault work with configurable concurrency; see **`backend/docs/CONCURRENCY.md`**.
- **Optional:** Vault watcher, price hooks (`backend/.env.example`).
- **CORS:** `CORS_ORIGIN` for split frontend/backend deploys.

### Data (Supabase)

- **`transaction_history`:** wallet, tx id, type (`deposit`, `withdraw`, `borrow`, `repay`, `flash_loan`, `self_liquidate_payout`, …), asset tag, amounts, explorer URLs, optional `vault_tx_id` / `vault_explorer_url`. Client reads use the publishable key; inserts/updates that need elevated trust go through the backend with the service role.
- **`flash_sessions`:** Tracks flash open / vault fund / settle linkage, status, and timestamps for dashboard history and recovery flows—see **`supabase/FLASH_SESSIONS_SCHEMA.sql`** and migrations under **`supabase/migrations/`**.

---

## Tech stack

| Layer | Stack |
|--------|--------|
| **App** | Next.js 15, React 19, TypeScript, Tailwind CSS 4, DaisyUI, next-seo, react-query |
| **Wallet** | `@provablehq/aleo-wallet-adaptor-react`, Shield adapter, wallet modal UI |
| **Chain** | Aleo **Testnet** (`CURRENT_NETWORK` in `src/types/index.ts`), JSON-RPC (`latest/height`, `getMappingValue`, etc.) |
| **Programs** | Leo, `leo build` / `leo test` |
| **Backend** | Node.js, Express, `@provablehq/sdk`, optional Supabase service role |
| **Data** | Supabase (Postgres, RLS) |

---

## Setup & run

### 1. Frontend

```bash
cp .env.example .env
# Fill NEXT_PUBLIC_SUPABASE_* , NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID, etc.
npm install
npm run dev
# → http://localhost:3000
```

The default **`npm run dev`** script clears `.next` via **Yarn** (`yarn delete-local-modules && next dev`). If you do not have Yarn, use: `npm run delete-local-modules && npx next dev`, or install Yarn and run `yarn install && yarn dev`.

### 2. Backend (vault server)

```bash
cd backend
cp .env.example .env
# ALEO_RPC_URL, VAULT_*, SUPABASE_* , RECORD_TRANSACTION_SECRET, CORS_ORIGIN for production
npm install
npm run dev
# default port from server config (often 4000)
```

### 3. Leo programs

```bash
cd program && leo build
```

**Lending math tests** (CI-friendly):

```bash
npm run test:lending-math
# or: cd program/lending_math_tests && leo test --offline
```

### 4. Supabase

- Run **`supabase/schema.sql`** in the SQL Editor, then apply **`supabase/FLASH_SESSIONS_SCHEMA.sql`** and any **`supabase/migrations/*.sql`** your deployment expects (flash history and newer columns).
- Frontend: Project URL + **publishable** key.
- Backend: **service role** key for updates that the browser must not perform alone.

---

## Environment variables

### Frontend (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUB_KEY` | Yes | Publishable (anon) key for client reads |
| `NEXT_PUBLIC_BACKEND_URL` | Recommended | Backend base URL (vault + APIs) |
| `NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID` | Recommended | Deployed ALEO pool program id |
| `NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID` | Optional | Extra program id for an additional market row; omit if unused or same as main lending id |
| `NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID` | Optional | Same pattern for another market slot; omit if unused |
| `RECORD_TRANSACTION_SECRET` | Recommended (prod) | Shared secret for server routes that call backend `/record-transaction` |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Optional | Shown in Markets / explorer links |
| `NEXT_PUBLIC_LENDING_ADMIN_ADDRESS` | Optional | **Required for `/admin`:** only this wallet sees the operator console (falls back to `ADMIN_ADDRESS` in `src/types` if set in code) |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | Optional | Legacy / secondary admin hint in types; prefer **`NEXT_PUBLIC_LENDING_ADMIN_ADDRESS`** for the admin page |
| `NEXT_PUBLIC_APP_ENV` | Optional | e.g. `prod` |

See **`.env.example`** for the full list and comments.

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ALEO_RPC_URL` | Yes | Aleo / Provable-compatible RPC |
| `VAULT_ADDRESS` | Yes | Vault public address |
| `VAULT_PRIVATE_KEY` | Yes | **Secret** — never commit |
| `SUPABASE_URL` | Recommended | Same project as frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Server-side updates |
| `RECORD_TRANSACTION_SECRET` | Recommended | Must match frontend server secret |
| `CORS_ORIGIN` | Yes (split deploy) | Comma-separated allowed origins |
| `VAULT_QUEUE_CONCURRENCY` | Optional | Default `1`; see concurrency doc |

---

## Deployment

- **Frontend (e.g. Vercel):** Set all `NEXT_PUBLIC_*` and server-only secrets (e.g. `RECORD_TRANSACTION_SECRET`) in the host dashboard. Point `NEXT_PUBLIC_BACKEND_URL` at your live API.
- **Backend:** Set `CORS_ORIGIN` to your frontend origin(s). Redeploy after changing secrets or queue settings.

---

## Concurrency (many users at once)

Vault work runs through an **in-process queue** (default concurrency **1**) to protect the RPC and a single vault key. Tune only if you understand RPC limits—see **`backend/docs/CONCURRENCY.md`**.

---

## Roadmap

- **Shipped in this repo:** Testnet lending loop end-to-end, **mapping-aligned** portfolio and caps, vault-backed payouts, **self-liquidation** UX, **multi-asset flash loans** with vault funding and Supabase session tracking, **`/admin`** operator tools, dashboard + markets + history + docs, Shield wallet flows.
- **Product direction:** Harden **multi-asset, cross-collateral** money-market behavior (ALEO, USDCx, USAD), utilization-based rates, and index accrual on Aleo; keep UI and off-chain services strictly aligned with on-chain finalization.
- **Next:** Third-party **liquidator** marketplace (beyond self-liquidation), stronger **oracles**, **governance**, more assets / pool types, mainnet readiness—see notes under **`docs/`** and in-app **`/docs`** changelog.

---

## Contributing

- Run **`npm run lint`** and **`npm run test:lending-math`** (and `leo build` in `program/` when contracts change).
- Do not commit `.env`, private keys, or service-role keys.

---

## Links

- **App:** [xyra-finance.vercel.app](https://xyra-finance.vercel.app/)
- **Backend concurrency:** `backend/docs/CONCURRENCY.md`
- **Supabase client notes:** `src/utils/supabase/README.md`