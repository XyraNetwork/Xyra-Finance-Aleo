import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';

/**
 * Server-only proxy to backend POST /record-transaction.
 * Sends RECORD_TRANSACTION_SECRET so only your app can add transaction rows.
 * Frontend must call this API (same origin), not the backend directly.
 */
type Body = {
  wallet_address: string;
  tx_id: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'flash_loan';
  asset: 'aleo' | 'usdcx' | 'usad';
  amount: number;
  program_id?: string | null;
};

function getRecordTransactionSecret(): string | undefined {
  const secret = process.env.RECORD_TRANSACTION_SECRET?.trim();
  return secret || undefined;
}

function logSecretStatus(secret: string | undefined) {
  if (secret) {
    console.log('[record-transaction] RECORD_TRANSACTION_SECRET: loaded (length=%d)', secret.length);
  } else {
    console.warn('[record-transaction] RECORD_TRANSACTION_SECRET: not set');
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = getRecordTransactionSecret();

  // GET: allow checking env status before making a tx (logs to server console, returns status in response)
  if (req.method === 'GET') {
    logSecretStatus(secret);
    return res.status(200).json({
      secretConfigured: !!secret,
      backendUrlConfigured: !!backendUrl,
      ok: !!secret && !!backendUrl,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  logSecretStatus(secret);

  if (!backendUrl) {
    return res.status(503).json({ error: 'Backend URL not configured' });
  }
  if (!secret) {
    return res.status(503).json({
      error: 'RECORD_TRANSACTION_SECRET not set. Add it to the frontend .env (Aave-Aleo/.env) and restart the Next.js dev server.',
    });
  }

  const body = req.body as Body;
  const { wallet_address, tx_id, type, asset, amount, program_id } = body || {};

  if (!wallet_address || typeof wallet_address !== 'string' || !wallet_address.trim()) {
    return res.status(400).json({ error: 'Missing or invalid wallet_address' });
  }
  if (!tx_id || typeof tx_id !== 'string' || !tx_id.trim()) {
    return res.status(400).json({ error: 'Missing or invalid tx_id' });
  }
  const validTypes = ['deposit', 'withdraw', 'borrow', 'repay', 'flash_loan'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  const validAssets = ['aleo', 'usdcx', 'usad'];
  if (!validAssets.includes(asset)) {
    return res.status(400).json({ error: 'Invalid asset' });
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 0) {
    return res.status(400).json({ error: 'Missing or invalid amount' });
  }

  try {
    const backendRes = await fetch(`${backendUrl}/record-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-record-transaction-secret': secret,
      },
      body: JSON.stringify({
        wallet_address: wallet_address.trim(),
        tx_id: tx_id.trim(),
        type,
        asset,
        amount: amountNum,
        program_id: program_id ?? null,
      }),
    });
    const data = await backendRes.json().catch(() => ({}));
    if (!backendRes.ok) {
      if (backendRes.status === 401) {
        return res.status(401).json({
          error: 'Backend rejected secret. Ensure RECORD_TRANSACTION_SECRET in backend/.env exactly matches the value in frontend .env (or .env.local), then restart the backend.',
        });
      }
      return res.status(backendRes.status).json(data?.error ? { error: data.error } : { error: 'Backend error' });
    }
    return res.status(201).json(data);
  } catch (e: unknown) {
    console.error('[api/record-transaction]', e);
    return res.status(500).json({ error: 'Failed to record transaction' });
  }
}
