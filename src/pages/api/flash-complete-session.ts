import type { NextApiRequest, NextApiResponse } from 'next';

type Body = {
  session_id?: string;
  flash_settle_tx_id?: string;
  actual_repay_micro?: number | null;
  profit_micro?: number | null;
};

function getSecret(): string | undefined {
  return process.env.RECORD_TRANSACTION_SECRET?.trim() || undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') ||
    process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = getSecret();
  if (!backendUrl) return res.status(503).json({ error: 'Backend URL not configured' });
  if (!secret) return res.status(503).json({ error: 'RECORD_TRANSACTION_SECRET is not set' });

  const body = req.body as Body;
  if (!body?.session_id?.trim()) {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const backendRes = await fetch(`${backendUrl}/flash/complete-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-record-transaction-secret': secret,
      },
      body: JSON.stringify({
        session_id: body.session_id.trim(),
        flash_settle_tx_id: body.flash_settle_tx_id?.trim() ?? '',
        actual_repay_micro: body.actual_repay_micro == null ? null : Number(body.actual_repay_micro),
        profit_micro: body.profit_micro == null ? null : Number(body.profit_micro),
      }),
    });
    const data = await backendRes.json().catch(() => ({}));
    if (!backendRes.ok) {
      if (backendRes.status === 401) {
        return res.status(401).json({
          error:
            'Backend rejected secret. Match RECORD_TRANSACTION_SECRET in backend/.env and frontend .env, then restart both.',
        });
      }
      return res.status(backendRes.status).json(data?.error ? { error: data.error } : { error: 'Backend error' });
    }
    return res.status(200).json(data);
  } catch (e) {
    console.error('[api/flash-complete-session]', e);
    return res.status(500).json({ error: 'Failed to complete flash session' });
  }
}
