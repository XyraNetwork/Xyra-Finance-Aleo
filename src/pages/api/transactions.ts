import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import { getSupabaseClient } from '@/lib/supabase';

type InsertBody = {
  wallet_address: string;
  tx_id: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'flash_loan';
  asset: 'aleo' | 'usdcx' | 'usad';
  amount: number;
  program_id?: string;
  explorer_url?: string;
};

function getMissingSupabaseEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.SUPABASE_PUB_KEY?.trim()) missing.push('SUPABASE_PUB_KEY');
  return missing;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Load .env from project root so API routes see NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PUB_KEY
  try {
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  } catch {
    // dotenv optional
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    const missing = getMissingSupabaseEnv();
    const envPath = path.resolve(process.cwd(), '.env');
    return res.status(503).json({
      error: 'Supabase not configured.',
      missing_env: missing.length ? missing : ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_PUB_KEY'],
      hint: 'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PUB_KEY to .env in the project root and restart the dev server.',
      debug: {
        cwd: process.cwd(),
        env_file_exists: fs.existsSync(envPath),
        url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
        pub_key_set: !!process.env.SUPABASE_PUB_KEY?.trim(),
      },
    });
  }

  if (req.method === 'GET') {
    const wallet = (req.query.wallet as string)?.trim();
    if (!wallet) {
      return res.status(400).json({ error: 'Query parameter "wallet" (wallet address) is required.' });
    }
    const { data, error } = await supabase
      .from('transaction_history')
      .select('id, wallet_address, tx_id, type, asset, amount, program_id, explorer_url, created_at')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[api/transactions] GET error:', error);
      return res.status(500).json({ error: error.message });
    }
    const list = Array.isArray(data) ? data : [];
    return res.status(200).json(list);
  }

  if (req.method === 'POST') {
    const body = req.body as InsertBody;
    const { wallet_address, tx_id, type, asset, amount, program_id, explorer_url } = body;
    if (!wallet_address || !tx_id || !type || !asset || amount == null) {
      return res.status(400).json({
        error: 'Missing required fields: wallet_address, tx_id, type, asset, amount.',
      });
    }
    const validTypes = ['deposit', 'withdraw', 'borrow', 'repay', 'flash_loan'];
    const validAssets = ['aleo', 'usdcx', 'usad'];
    if (!validTypes.includes(type) || !validAssets.includes(asset)) {
      return res.status(400).json({ error: 'Invalid type or asset.' });
    }
    const { data, error } = await supabase.from('transaction_history').insert({
      wallet_address,
      tx_id,
      type,
      asset,
      amount: Number(amount),
      program_id: program_id || null,
      explorer_url: explorer_url || null,
    }).select('id')
      .single();
    if (error) {
      console.error('[api/transactions] POST error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
