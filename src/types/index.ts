import type { NextPage } from 'next';
import type { ReactElement, ReactNode } from 'react';
import { Network } from '@provablehq/aleo-types';

//Change to Network.MAINNET for mainnet or Network.TESTNET for testnet
export const CURRENT_NETWORK: Network = Network.TESTNET;


// Default Aleo RPC host for testnet-beta used by the starter template.
// This is the endpoint that supports the custom JSON-RPC methods used in `rpc.ts`
// such as `executeTransition`, `getMappingValue`, and `aleoTransactionsForProgram`.
export const CURRENT_RPC_URL = "https://testnetbeta.aleorpc.com";

export type NextPageWithLayout<P = {}> = NextPage<P> & {
  authorization?: boolean;
  getLayout?: (page: ReactElement) => ReactNode;
};

// src/types/index.ts
export type ProposalData = {
  bountyId: number;
  proposalId: number;
  proposerAddress: string;
  proposalText?: string;
  fileName?: string;
  fileUrl?: string;
  status?: string;
  rewardSent?: boolean;
};

export type BountyData = {
  id: number;
  title: string;
  reward: string;
  deadline: string;
  creatorAddress: string;
  proposals?: ProposalData[];
};

// Aleo program ID for the first lending pool.
// Read from NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID so we can switch pools via env.
export const BOUNTY_PROGRAM_ID =
  process.env.NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID || 'xyra_lending_v2.aleo';

// USDC pool program ID.
// Read from NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID so we can switch pools via env.
export const USDC_POOL_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID || BOUNTY_PROGRAM_ID;

// USDCx token program (Provable testnet): required for Token records used in USDC pool deposit/repay/withdraw/borrow.
export const USDC_TOKEN_PROGRAM_ID = 'test_usdcx_stablecoin.aleo';

/** Stablecoin stack imports — register with wallet so transitions resolve correctly. */
export const USDCX_STACK_PROGRAM_IDS = [
  'merkle_tree.aleo',
  'test_usdcx_multisig_core.aleo',
  'test_usdcx_freezelist.aleo',
  USDC_TOKEN_PROGRAM_ID,
] as const;

// USAD pool program ID.
// Read from NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID so we can deploy/switch USAD pools via env.
export const USAD_POOL_PROGRAM_ID =
  process.env.NEXT_PUBLIC_USAD_LENDING_POOL_PROGRAM_ID || BOUNTY_PROGRAM_ID;

// USAD token program (Provable testnet): required for Token records used in USAD pool deposit/repay.
export const USAD_TOKEN_PROGRAM_ID = 'test_usad_stablecoin.aleo';

// Admin wallet allowed to initialize/admin-manage the pool from frontend.
export const ADMIN_ADDRESS = (process.env.NEXT_PUBLIC_ADMIN_ADDRESS || '').trim();

/**
 * Program IDs passed to `AleoWalletProvider` `programs` (wallet connect permissions).
 * Deduped: when USDC/USAD pools default to `BOUNTY_PROGRAM_ID`, the same ID was listed 3×.
 * `lending_pool_usdce_v86.aleo` only appears if you set `NEXT_PUBLIC_USDC_LENDING_POOL_PROGRAM_ID` — not hardcoded in app code.
 * Legacy `lending_pool_usdcx_v18.aleo` is not registered (unified pool / no separate transfer demo).
 */
export function getWalletConnectProgramIds(): string[] {
  const raw: string[] = [
    BOUNTY_PROGRAM_ID,
    USDC_POOL_PROGRAM_ID,
    ...USDCX_STACK_PROGRAM_IDS,
    USAD_POOL_PROGRAM_ID,
    USAD_TOKEN_PROGRAM_ID,
    'credits.aleo',
  ];
  const cleaned = raw.map((id) => String(id).trim()).filter(Boolean);
  return [...new Set(cleaned)];
}
