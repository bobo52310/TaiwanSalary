// HTTP client for the MOPS (公開資訊觀測站) t100sb15 non-manager-salary endpoint.
// Only reads public data. Rate-limited upstream — callers must space out requests.

import type { Market } from '../../src/lib/types';

const ENDPOINT = 'https://mopsov.twse.com.tw/mops/web/ajax_t100sb15';

// A realistic desktop UA; MOPS rejects some non-browser agents.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** MOPS `TYPEK` query value for a market. */
export function marketToTypek(market: Market): string {
  return market === 'sii' ? 'sii' : 'otc';
}

/**
 * Fetch the raw HTML for one year+market. Throws on non-200 or on a response
 * that fails a basic sanity check (missing header text / too few table rows).
 */
export async function fetchYearMarket(year: number, market: Market): Promise<string> {
  const body = new URLSearchParams({
    encodeURIComponent: '1',
    step: '1',
    firstin: '1',
    off: '1',
    TYPEK: marketToTypek(market),
    RYEAR: String(year),
    code: '',
  }).toString();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`MOPS ${year} ${market}: HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  if (!html.includes('公司代號')) {
    throw new Error(`MOPS ${year} ${market}: response missing "公司代號" header (unexpected page).`);
  }
  const trCount = (html.match(/<tr/g) ?? []).length;
  if (trCount < 500) {
    throw new Error(`MOPS ${year} ${market}: only ${trCount} <tr found (expected > 500).`);
  }

  return html;
}
