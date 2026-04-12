import type { NextApiRequest, NextApiResponse } from 'next';

function getSecret(): string | undefined {
  return process.env.RECORD_TRANSACTION_SECRET?.trim() || undefined;
}

/**
 * Server-only proxy to GET /flash/sessions.
 * Sends RECORD_TRANSACTION_SECRET so session rows are not enumerable without your app server.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') ||
    process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = getSecret();
  if (!backendUrl) return res.status(503).json({ error: 'Backend URL not configured' });
  if (!secret) {
    return res.status(503).json({
      error: 'RECORD_TRANSACTION_SECRET not set. Add it to frontend .env and restart Next.js (same as /api/record-transaction).',
    });
  }

  const walletRaw = req.query.wallet;
  const wallet = typeof walletRaw === 'string' ? walletRaw.trim() : '';
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query param is required' });
  }

  const limitQ = req.query.limit;
  const limitStr = Array.isArray(limitQ) ? limitQ[0] : limitQ;
  const limitRaw = Number(limitStr ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.round(limitRaw))) : 50;

  try {
    const url = `${backendUrl}/flash/sessions?${new URLSearchParams({
      wallet,
      limit: String(limit),
    })}`;
    const backendRes = await fetch(url, {
      method: 'GET',
      headers: {
        'x-record-transaction-secret': secret,
      },
    });
    const data = await backendRes.json().catch(() => ({}));
    if (!backendRes.ok) {
      if (backendRes.status === 401) {
        return res.status(401).json({
          error:
            'Backend rejected secret. Match RECORD_TRANSACTION_SECRET in backend/.env and frontend .env, then restart both.',
        });
      }
      return res.status(backendRes.status).json(
        typeof data === 'object' && data !== null && 'error' in data
          ? { error: (data as { error?: string }).error || 'Backend error' }
          : { error: 'Backend error' },
      );
    }
    return res.status(200).json(data);
  } catch (e) {
    console.error('[api/flash-sessions]', e);
    return res.status(500).json({ error: 'Failed to load flash sessions' });
  }
}
