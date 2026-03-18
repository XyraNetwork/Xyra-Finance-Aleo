'use client';

import React, { useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { LENDING_POOL_PROGRAM_ID } from '@/components/aleo/rpc';
import { lendingInitializeAleoPool } from '@/components/aleo/rpc';
import { ADMIN_ADDRESS } from '@/types';

export function AdminView() {
  const { address, connected, executeTransaction } = useWallet();
  const [initLoading, setInitLoading] = useState(false);
  const [initMessage, setInitMessage] = useState<string | null>(null);
  const [initTxId, setInitTxId] = useState<string | null>(null);

  const isAdmin =
    typeof address === 'string' &&
    typeof ADMIN_ADDRESS === 'string' &&
    ADMIN_ADDRESS.length > 0 &&
    address === ADMIN_ADDRESS;

  const handleInitialize = async () => {
    if (!executeTransaction || !isAdmin) return;
    setInitLoading(true);
    setInitMessage(null);
    setInitTxId(null);
    try {
      const txId = await lendingInitializeAleoPool(executeTransaction);
      if (txId === '__CANCELLED__') {
        setInitMessage('Transaction cancelled.');
        return;
      }
      setInitTxId(txId);
      setInitMessage('Transaction submitted. Wait for confirmation.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Initialize failed';
      setInitMessage(msg);
    } finally {
      setInitLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="rounded-2xl bg-base-200/80 border border-base-300 p-6 max-w-xl mx-auto">
        <h2 className="text-xl font-bold text-base-content mb-2">Admin</h2>
        <p className="text-base-content/70 text-sm">Connect your wallet to access the admin panel.</p>
      </div>
    );
  }

  if (!ADMIN_ADDRESS || ADMIN_ADDRESS.length === 0) {
    return (
      <div className="rounded-2xl bg-base-200/80 border border-base-300 p-6 max-w-xl mx-auto">
        <h2 className="text-xl font-bold text-base-content mb-2">Admin</h2>
        <p className="text-base-content/70 text-sm">
          Admin is not configured. Set <span className="font-mono text-xs">NEXT_PUBLIC_ADMIN_ADDRESS</span> in .env to enable.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-base-200/80 border border-base-300 p-6 max-w-xl mx-auto">
        <h2 className="text-xl font-bold text-base-content mb-2">Admin</h2>
        <p className="text-base-content/70 text-sm">
          This tab is only visible to the configured admin wallet. Your connected address does not match the admin.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-base-200/80 border border-base-300 p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-base-content mb-1">Admin</h2>
      <p className="text-base-content/70 text-sm mb-6">
        You are connected as the pool admin. Use the actions below to manage the ALEO lending pool.
      </p>

      <div className="space-y-4">
        <div className="rounded-lg bg-base-300/50 p-4 border border-base-300">
          <div className="font-medium text-base-content mb-1">Initialize ALEO pool</div>
          <p className="text-sm text-base-content/70 mb-3">
            One-time setup: seeds pool mappings (indices, liquidity, APY). Program: <span className="font-mono text-xs">{LENDING_POOL_PROGRAM_ID}</span>
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleInitialize}
            disabled={initLoading}
          >
            {initLoading ? 'Submitting…' : 'Initialize ALEO pool'}
          </button>
          {initMessage && (
            <p className={`mt-3 text-sm ${initTxId ? 'text-success' : 'text-error'}`}>
              {initMessage}
            </p>
          )}
          {initTxId && initTxId !== '__CANCELLED__' && (
            <p className="mt-1 text-xs text-base-content/60 font-mono break-all">{initTxId}</p>
          )}
        </div>
      </div>
    </div>
  );
}
