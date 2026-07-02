// CLI to download MOPS non-manager-salary HTML into scripts/.cache/mops/.
//
// Runs at most once a year. MOPS is rate-limited, so requests are spaced 90s
// apart and each request retries 3x with 120/240/480s backoff. Existing valid
// cache files are skipped unless --force is given.
//
// Usage:
//   tsx scripts/fetch-mops.ts --year 114 --market sii
//   tsx scripts/fetch-mops.ts --year 114            # both markets
//   tsx scripts/fetch-mops.ts --all                 # all target years, both markets
//   tsx scripts/fetch-mops.ts --all --force         # re-download everything

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { MARKETS, type Market } from '../src/lib/types';
import { fetchYearMarket } from './lib/mops-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '.cache', 'mops');

// ROC years we intend to cover. Fetching is layout-agnostic (just downloads HTML);
// parsing a year additionally requires a layout in scripts/lib/layouts.ts.
const TARGET_YEARS = [108, 109, 110, 111, 112, 113, 114];

const SPACING_MS = 90_000;
const RETRY_BACKOFFS_MS = [120_000, 240_000, 480_000];
const MIN_VALID_BYTES = 100_000;

interface Target {
  year: number;
  market: Market;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePath(year: number, market: Market): string {
  return join(CACHE_DIR, `${year}_${market}.html`);
}

function isValidCache(path: string): boolean {
  return existsSync(path) && statSync(path).size >= MIN_VALID_BYTES;
}

function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value);
}

function resolveTargets(year: string | undefined, market: string | undefined, all: boolean): Target[] {
  if (all) {
    return TARGET_YEARS.flatMap((y) => MARKETS.map((m) => ({ year: y, market: m })));
  }
  if (year === undefined) {
    throw new Error('Specify --year N (optionally --market sii|otc) or --all.');
  }
  const y = Number(year);
  if (!Number.isInteger(y)) throw new Error(`Invalid --year: ${year}`);
  if (market !== undefined) {
    if (!isMarket(market)) throw new Error(`Invalid --market: ${market} (use sii or otc)`);
    return [{ year: y, market }];
  }
  return MARKETS.map((m) => ({ year: y, market: m }));
}

async function fetchWithRetry(target: Target): Promise<string> {
  const { year, market } = target;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchYearMarket(year, market);
    } catch (err) {
      const backoff = RETRY_BACKOFFS_MS[attempt];
      if (backoff === undefined) throw err; // out of retries
      console.warn(
        `retry ${year} ${market} (attempt ${attempt + 1} failed): ${String(err)}; waiting ${backoff / 1000}s`,
      );
      await sleep(backoff);
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      year: { type: 'string' },
      market: { type: 'string' },
      all: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });

  const targets = resolveTargets(values.year, values.market, values.all ?? false);
  mkdirSync(CACHE_DIR, { recursive: true });

  let failures = 0;
  let requestsMade = 0;
  for (const target of targets) {
    const { year, market } = target;
    const path = cachePath(year, market);

    if (!values.force && isValidCache(path)) {
      console.log(`skip ${year} ${market} (cached)`);
      continue;
    }

    if (requestsMade > 0) await sleep(SPACING_MS);
    requestsMade++;

    try {
      const html = await fetchWithRetry(target);
      writeFileSync(path, html, 'utf-8');
      console.log(`ok   ${year} ${market} bytes=${html.length}`);
    } catch (err) {
      failures++;
      console.error(`fail ${year} ${market}: ${String(err)}`);
    }
  }

  console.log(`done: ${requestsMade} request(s), ${failures} failure(s)`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
