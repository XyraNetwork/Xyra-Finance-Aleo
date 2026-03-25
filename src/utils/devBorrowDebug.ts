/**
 * Development-only helpers to inspect cross-collateral borrow limits against live chain state.
 * No program redeploy: reads mappings via the same RPC path as the app.
 *
 * In the browser console (localhost, after `npm run dev`):
 *
 *   await window.__xyraBorrowDebug.diagnoseBorrow('aleo1...', 'aleo', 1_000_000n)
 *
 * Or call `getCrossCollateralBorrowCapsFromChain`, `computeLendingPositionMappingKey`, etc.
 */

import { BOUNTY_PROGRAM_ID } from '@/types';
import {
  getCrossCollateralBorrowCapsFromChain,
  computeLendingPositionMappingKey,
  computeUserKeyFieldFromAddress,
  getAleoPoolUserEffectivePosition,
} from '@/components/aleo/rpc';

export type XyraBorrowDebug = {
  programId: string;
  computeUserKeyFieldFromAddress: typeof computeUserKeyFieldFromAddress;
  computeLendingPositionMappingKey: typeof computeLendingPositionMappingKey;
  getCrossCollateralBorrowCapsFromChain: typeof getCrossCollateralBorrowCapsFromChain;
  getAleoPoolUserEffectivePosition: typeof getAleoPoolUserEffectivePosition;
  /** Compare a candidate borrow (micro-units of native asset) to chain-derived max. */
  diagnoseBorrow: (
    walletAddress: string,
    borrowAsset: 'aleo' | 'usdcx' | 'usad',
    borrowAmountMicro: bigint,
  ) => Promise<void>;
};

declare global {
  interface Window {
    __xyraBorrowDebug?: XyraBorrowDebug;
  }
}

export function installDevBorrowDebug(): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;

  const programId = BOUNTY_PROGRAM_ID;

  const diagnoseBorrow = async (
    walletAddress: string,
    borrowAsset: 'aleo' | 'usdcx' | 'usad',
    borrowAmountMicro: bigint,
  ) => {
    const caps = await getCrossCollateralBorrowCapsFromChain(programId, walletAddress);
    const field =
      borrowAsset === 'aleo' ? '0field' : borrowAsset === 'usdcx' ? '1field' : '2field';
    const pos = await getAleoPoolUserEffectivePosition(programId, walletAddress, field);

    /* eslint-disable no-console */
    console.groupCollapsed('[xyra] borrow diagnose', programId, walletAddress);
    if (!caps) {
      console.warn('getCrossCollateralBorrowCapsFromChain returned null (keys or RPC issue).');
    } else {
      console.table({
        totalCollateralUsd_micro: caps.totalCollateralUsd.toString(),
        totalDebtUsd_micro: caps.totalDebtUsd.toString(),
        headroomUsd_micro: caps.headroomUsd.toString(),
        maxBorrow_micro_aleo: caps.maxBorrowMicroAleo.toString(),
        maxBorrow_micro_usdcx: caps.maxBorrowMicroUsdcx.toString(),
        maxBorrow_micro_usad: caps.maxBorrowMicroUsad.toString(),
      });
    }
    const [pkA, pkU, pkD] = await Promise.all([
      computeLendingPositionMappingKey(walletAddress, '0field'),
      computeLendingPositionMappingKey(walletAddress, '1field'),
      computeLendingPositionMappingKey(walletAddress, '2field'),
    ]);
    console.log('mapping keys', { aleo: pkA, usdcx: pkU, usad: pkD });
    console.log('effective position (borrow asset)', field, pos);

    const maxFor =
      borrowAsset === 'aleo'
        ? caps?.maxBorrowMicroAleo
        : borrowAsset === 'usdcx'
          ? caps?.maxBorrowMicroUsdcx
          : caps?.maxBorrowMicroUsad;
    const ok = maxFor != null && borrowAmountMicro <= maxFor;
    console.log('requested borrow micro', borrowAmountMicro.toString());
    console.log('chain max borrowed micro (same asset)', maxFor?.toString() ?? 'n/a');
    console.log('within chain-derived max?', ok);
    if (!ok) {
      console.warn(
        'Amount is above computed max or caps missing. finalize_borrow assert will reject if on-chain state matches.',
      );
    }
    console.groupEnd();
    /* eslint-enable no-console */
  };

  window.__xyraBorrowDebug = {
    programId,
    computeUserKeyFieldFromAddress,
    computeLendingPositionMappingKey,
    getCrossCollateralBorrowCapsFromChain,
    getAleoPoolUserEffectivePosition,
    diagnoseBorrow,
  };
}
