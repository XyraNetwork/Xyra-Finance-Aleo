# Xyra Finance – Private Lending & Borrowing on Aleo

**Live demo:** [https://xyra-finance.vercel.app/](https://xyra-finance.vercel.app/)

Xyra Finance is a **privacy-first lending and borrowing protocol** on Aleo—inspired by Aave and rebuilt for zero-knowledge execution. Supply, borrow, and manage capital with confidential positions, utilization-based interest, and vault-backed withdraw/borrow flows.

---

## Overview

- **Problem:** Public DeFi lending exposes balances and strategies, attracts MEV and liquidation sniping, and is unsuitable for institutions and regulated entities.
- **Solution:** A full lending protocol on Aleo where **deposits, borrows, repayments, withdrawals, and interest** are tracked on-chain, **user positions stay private** (Aleo records), and pool-level metrics (TVL, utilization, APY) remain provable.
- **Current status:** Two lending pools (ALEO and USDCx) with deposit, borrow, repay, withdraw, interest accrual, and a **vault backend** that sends credits/tokens to users after on-chain finalization. A **Next.js dApp** provides Dashboard, Markets, and Docs views with wallet connection, transaction history (Supabase), and APY tooltips.

---

## Repository structure

| Path | Description |
|------|-------------|
| **`/`** | Next.js frontend (dashboard, Markets, Docs, wallet integration, transaction history) |
| **`program/`** | Leo programs: ALEO pool and USDCx pool (e.g. `lending_pool_v86.aleo`, `lending_pool_usdce_v86.aleo`) |
| **`backend/`** | Express vault server: POST `/withdraw`, `/borrow`, `/withdraw-usdc`, `/borrow-usdc`; in-process queue for concurrency |
| **`supabase/`** | Schema for `transaction_history` (wallet, tx_id, type, asset, amount, vault_tx_id, vault_explorer_url) |
| **`docs/`** | Second-wave submission, Wave 3/4 ideas; **`backend/docs/CONCURRENCY.md`** for vault queue behavior |

---

## Features (current)

### Leo programs

- **ALEO pool** and **USDCx pool**: deposit, borrow, repay, withdraw, accrue interest, utilization-based rate model.
- **Public pool state:** total_supplied, total_borrowed, interest indices, utilization.
- **Private user activity:** UserActivity records (total_deposits, total_withdrawals, total_borrows, total_repayments) in private mappings.
- **Transitions:** deposit, borrow, repay, withdraw, accrue_interest, plus helpers (get_address_hash, get_user_activity).

### Frontend (Next.js)

- **Dashboard / Markets / Docs** views (single app; wallet state preserved across views).
- **Assets to supply & borrow:** ALEO and USDCx with Supply APY / Borrow APY and info tooltips.
- **Your supplies & borrows:** Private columns with loading spinners; Supply, Borrow, Withdraw, Repay with amount validation and “Available to borrow” for borrow modals.
- **Transaction modals:** Processing → “View in explorer” and “View vault transfer” (when vault tx is returned); no vault message before the program tx is confirmed.
- **Transaction history:** Paginated (10 per page), stored in Supabase with optional vault tx link; asset shown as ALEO / USDCx.
- **Markets:** Reserve overview table (total supplied, borrowed, liquidity, Supply APY, Borrow APY) with optional vault explorer link when `NEXT_PUBLIC_VAULT_ADDRESS` is set.
- **Docs:** In-app documentation (wallet, flows, APY, Supabase, vault backend, env).

### Backend (Express)

- **Vault endpoints:** POST `/withdraw`, `/borrow` (ALEO credits), `/withdraw-usdc`, `/borrow-usdc` (USDCx), `/withdraw-usad`, `/borrow-usad` (USAD).
- **In-process queue:** Vault operations run through a queue (default concurrency 1) to avoid RPC overload and vault key contention when many users hit at once. See **`backend/docs/CONCURRENCY.md`**.
- **CORS:** Configurable via `CORS_ORIGIN` (comma-separated) for production frontends (e.g. Vercel).

### Data (Supabase)

- **transaction_history:** wallet_address, tx_id, type (deposit/withdraw/borrow/repay), asset (aleo/usdcx/usad), amount, program_id, explorer_url, vault_tx_id, vault_explorer_url. RLS for anon SELECT/INSERT with publishable key.

---

## Tech stack

- **Frontend:** Next.js, React, `@provablehq/aleo-wallet-adaptor-react`, Supabase client.
- **Programs:** Leo (Aleo); target Aleo Testnet.
- **Backend:** Node.js, Express, `cors`, `dotenv`, Provable SDK.
- **Data:** Supabase (Postgres, RLS, publishable key for frontend).

---

## Setup & run

### 1. Frontend

```bash
cp .env.example .env
# Edit .env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUB_KEY;
# optional: NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_VAULT_ADDRESS
npm install
npm run dev
```

- **NEXT_PUBLIC_BACKEND_URL:** Backend base URL for vault calls. For production (e.g. Vercel), set to your deployed backend (e.g. `https://your-app.railway.app`).

### 2. Backend (vault server)

```bash
cd backend
cp .env.example .env
# Edit .env: ALEO_RPC_URL, VAULT_ADDRESS, VAULT_PRIVATE_KEY;
# for production frontend: CORS_ORIGIN=https://xyra-finance.vercel.app (or comma-separated list)
npm install
npm run dev
```

- **CORS_ORIGIN:** Required when the frontend is on a different domain (e.g. Vercel). Comma-separated for multiple origins.
- **VAULT_QUEUE_CONCURRENCY:** Default 1; optional 2–3 if RPC supports limited parallelism (see `backend/docs/CONCURRENCY.md`).

### 3. Leo programs

```bash
cd program
leo build
```

**Lending math unit tests** (no token dependencies; mirrors `finalize_borrow` USD checks in `src/main.leo`):

```bash
cd program/lending_math_tests
leo test --offline
# or from repo root: npm run test:lending-math
```

Running `leo test` from `program/` pulls `credits` / stablecoin deps and may fail while loading the local ledger; use `lending_math_tests` for CI-style checks.

### 4. Supabase

- Create a project and run **`supabase/schema.sql`** in the SQL Editor (creates `transaction_history`, indexes, RLS).
- Use Project → Settings → API for `NEXT_PUBLIC_SUPABASE_URL` and the publishable key (`NEXT_PUBLIC_SUPABASE_PUB_KEY`).

---

## Environment variables

### Frontend (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUB_KEY` | Yes | Supabase publishable (anon) key |
| `NEXT_PUBLIC_BACKEND_URL` | No | Vault backend URL (default `http://localhost:4000`) |
| `NEXT_PUBLIC_VAULT_ADDRESS` | No | Shown as vault explorer link on Markets page |
| `NEXT_PUBLIC_APP_ENV` | No | e.g. `prod` |

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ALEO_RPC_URL` | Yes | Aleo RPC endpoint (e.g. Provable) |
| `VAULT_ADDRESS` | Yes | Vault wallet address |
| `VAULT_PRIVATE_KEY` | Yes | Vault private key (never commit) |
| `CORS_ORIGIN` | Yes for prod | Allowed frontend origin(s), comma-separated |
| `VAULT_QUEUE_CONCURRENCY` | No | Default 1; 2–3 if RPC allows |
| `WITHDRAW_FEE_CREDITS` / `BORROW_FEE_CREDITS` | No | Optional fees for vault→user transfers |
| USDC block vars | No | Optional for USDC record search |

---

## Deployment

- **Frontend (Vercel):** Set `NEXT_PUBLIC_BACKEND_URL` to your deployed backend URL. Redeploy after adding env vars.
- **Backend:** Set `CORS_ORIGIN` to your frontend origin(s), e.g. `https://xyra-finance.vercel.app`. Multiple origins: comma-separated. Redeploy after changing CORS or queue settings.

---

## Concurrency (many users at once)

The vault backend uses an **in-process queue** so that many simultaneous withdraw/borrow requests do not overload the RPC or the single vault key. Requests are processed in order (default one at a time). For details and tuning, see **`backend/docs/CONCURRENCY.md`**.

---

## Roadmap

- **Phase 1 (current):** Single-asset-style ALEO and USDCx pools, over-collateralized borrowing, vault-backed transfers, dashboard + Markets + Docs, transaction history, APY and concurrency handling.
- **Phase 2+:** Multi-asset pools, liquidations, governance, flash loans, staking, oracles. See **`docs/WAVE_3_AND_WAVE_4_IDEAS.md`**.

---

## Contributing

- Run `leo build` and `leo test` in `program/` for contract changes.
- Keep backward compatibility in mind for upgrades.
- For larger changes (new modules, risk engine, position manager), keep contracts small and documented.

---

## Links

- **Live app:** [https://xyra-finance.vercel.app/](https://xyra-finance.vercel.app/)
- **Second-wave summary:** `docs/SECOND_WAVE_SUBMISSION.md`
- **Backend concurrency:** `backend/docs/CONCURRENCY.md`
