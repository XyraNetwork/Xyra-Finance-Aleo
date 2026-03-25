import fetch from 'node-fetch';
import { runSetAssetPriceAleo, hasAdminKeyForPriceUpdate } from './setAssetPriceOnChain.js';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetches ALEO/USD (CoinGecko), logs it, and optionally broadcasts `set_asset_price` on the lending pool.
 *
 * Env:
 * - ALEO_PRICE_POLL_ENABLED: "false" to disable entire poller
 * - ALEO_PRICE_POLL_INTERVAL_MS: default 1800000 (30 min), min 60000 (legacy/general)
 * - ALEO_SET_ASSET_PRICE_INTERVAL_MS: overrides interval for set_asset_price flow
 * - ALEO_COINGECKO_ID: default "aleo"
 * - ALEO_PRICE_ONCHAIN_ENABLED: "false" to only log spot price (no tx). Default: on-chain update enabled when admin key resolves.
 * - POOL_ADMIN_PRIVATE_KEY: private key for program ADMIN (required for on-chain unless VAULT_ADDRESS === ADMIN and VAULT_PRIVATE_KEY is set)
 * - LENDING_POOL_PROGRAM_ID: default xyra_lending_v6.aleo
 * - LENDING_POOL_ADMIN_ADDRESS: override expected ADMIN address (must match deployed program)
 * - ALEO_PRICE_TX_FEE_CREDITS: priority fee for set_asset_price (default 0.2)
 */
export function startAleoPricePoller() {
  if (String(process.env.ALEO_PRICE_POLL_ENABLED || '').toLowerCase() === 'false') {
    console.log('[aleo-price] poller disabled (ALEO_PRICE_POLL_ENABLED=false)');
    return;
  }

  const intervalMs = Math.max(
    60_000,
    Number(process.env.ALEO_SET_ASSET_PRICE_INTERVAL_MS) ||
      Number(process.env.ALEO_PRICE_POLL_INTERVAL_MS) ||
      DEFAULT_INTERVAL_MS,
  );
  const coinId = (process.env.ALEO_COINGECKO_ID || 'aleo').trim();
  let onChain =
    String(process.env.ALEO_PRICE_ONCHAIN_ENABLED || '').toLowerCase() !== 'false';
  const assetIdField = (process.env.ALEO_ASSET_PRICE_FIELD || '0field').trim();

  if (onChain && !hasAdminKeyForPriceUpdate()) {
    console.warn(
      '[aleo-price] On-chain updates requested but no admin key: set POOL_ADMIN_PRIVATE_KEY, or set VAULT_ADDRESS to the program ADMIN address and use VAULT_PRIVATE_KEY. Logging spot price only.',
    );
    onChain = false;
  }

  const runOnce = async () => {
    const ts = new Date().toISOString();
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        coinId,
      )}&vs_currencies=usd`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const usd = data?.[coinId]?.usd;
      if (usd == null || !Number.isFinite(Number(usd))) {
        throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
      }
      const spot = Number(usd);
      console.log(`[aleo-price] ${ts} ALEO/USD (CoinGecko id=${coinId}): $${spot.toFixed(6)}`);

      if (onChain) {
        try {
          await runSetAssetPriceAleo({ usdSpot: spot, assetIdField });
        } catch (chainErr) {
          console.warn(`[aleo-price] ${ts} on-chain set_asset_price failed:`, chainErr?.message || chainErr);
        }
      }
    } catch (e) {
      console.warn(`[aleo-price] ${ts} fetch failed:`, e?.message || e);
    }
  };

  void runOnce();
  setInterval(() => {
    void runOnce();
  }, intervalMs);

  console.log(
    `[aleo-price] poller started: every ${Math.round(intervalMs / 60000)} min (CoinGecko id=${coinId}; on-chain=${onChain})`,
  );
}
