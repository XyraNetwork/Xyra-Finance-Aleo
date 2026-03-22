import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function loadEnv(): void {
  try {
    const dotenv = require('dotenv');
    // Try project root (cwd)
    let dir = process.cwd();
    for (let i = 0; i < 5 && dir; i++) {
      const envPath = path.join(dir, '.env');
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        return;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Fallback: cwd
    dotenv.config({ path: path.join(process.cwd(), '.env') });
  } catch {
    // dotenv optional
  }
}

/**
 * Server-side Supabase client using the Publishable key (sb_publishable_...).
 * Low privilege; RLS applies. Safe to use from API routes when RLS policies allow access.
 * See: https://supabase.com/docs/guides/api/api-keys
 */
export function getSupabaseClient(): SupabaseClient | null {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pubKey = process.env.SUPABASE_PUB_KEY;
  if (!supabaseUrl?.trim() || !pubKey?.trim()) return null;
  return createClient(supabaseUrl, pubKey);
}

export type TransactionRow = {
  id: string;
  wallet_address: string;
  tx_id: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay';
  asset: 'aleo' | 'usdcx' | 'usad';
  amount: number;
  program_id: string | null;
  explorer_url: string | null;
  created_at: string;
};
