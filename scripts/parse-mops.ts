// CLI to parse cached MOPS HTML into per-year-market JSON.
//
// Reads scripts/.cache/mops/{year}_{market}.html and writes
// src/data/years/{year}-{market}.json. Company rows are identified by their exact
// <td> count (per the year's layout); the market-total row ("全體…合計") is
// captured separately; header and footnote rows are ignored.
//
// Usage:
//   tsx scripts/parse-mops.ts --year 114 --market sii
//   tsx scripts/parse-mops.ts --year 114            # both markets, if cached
//   tsx scripts/parse-mops.ts --all                 # every cached file

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as cheerio from 'cheerio';
import { MARKETS, type Market, type MarketTotal, type YearFile, type YearFileRow } from '../src/lib/types';
import { getLayout, hasLayout, type Layout } from './lib/layouts';
import { cleanCell, parseFlag, parseFloatSafe, parseIntK, parsePercent, parseText } from './lib/normalize';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '.cache', 'mops');
const OUT_DIR = join(HERE, '..', 'src', 'data', 'years');

const CACHE_FILE_RE = /^(\d+)_(sii|otc)\.html$/;

interface FileTarget {
  year: number;
  market: Market;
  path: string;
}

function cachePath(year: number, market: Market): string {
  return join(CACHE_DIR, `${year}_${market}.html`);
}

function asMarket(value: string): Market {
  if (value === 'sii' || value === 'otc') return value;
  throw new Error(`Invalid --market: ${value} (use sii or otc)`);
}

function discoverAll(): FileTarget[] {
  if (!existsSync(CACHE_DIR)) return [];
  const targets: FileTarget[] = [];
  for (const name of readdirSync(CACHE_DIR)) {
    const match = CACHE_FILE_RE.exec(name);
    if (!match) continue;
    targets.push({ year: Number(match[1]), market: match[2] as Market, path: join(CACHE_DIR, name) });
  }
  return targets.sort((a, b) => a.year - b.year || a.market.localeCompare(b.market));
}

function resolveTargets(year: string | undefined, market: string | undefined, all: boolean): FileTarget[] {
  if (all) return discoverAll();
  if (year === undefined) throw new Error('Specify --year N [--market sii|otc] or --all.');
  const y = Number(year);
  if (!Number.isInteger(y)) throw new Error(`Invalid --year: ${year}`);
  const markets: Market[] = market !== undefined ? [asMarket(market)] : [...MARKETS];
  return markets.map((m) => ({ year: y, market: m, path: cachePath(y, m) }));
}

/** Pull cleaned cell text for every row that has at least one <td>. */
function extractRowsFromHtml(html: string): string[][] {
  const $ = cheerio.load(html);
  const rows: string[][] = [];
  // The company table is the first <table>; the footnote table is a sibling.
  $('table')
    .first()
    .find('tr')
    .each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length === 0) return; // header rows use <th>
      const cells: string[] = [];
      tds.each((__, td) => {
        cells.push(cleanCell($(td).text()));
      });
      rows.push(cells);
    });
  return rows;
}

/** Most frequent td count across rows — the company-row shape — plus a sample. */
function dominantShape(rows: string[][]): { tdCount: number; sampleCells: string[] } {
  const histogram = new Map<number, number>();
  const sampleByCount = new Map<number, string[]>();
  for (const cells of rows) {
    histogram.set(cells.length, (histogram.get(cells.length) ?? 0) + 1);
    if (!sampleByCount.has(cells.length)) sampleByCount.set(cells.length, cells);
  }
  let tdCount = 0;
  let best = -1;
  for (const [count, freq] of histogram) {
    if (freq > best) {
      best = freq;
      tdCount = count;
    }
  }
  return { tdCount, sampleCells: sampleByCount.get(tdCount) ?? [] };
}

function cellAt(cells: string[], idx: number): string {
  return cells[idx] ?? '';
}

function extractCompanyRow(cells: string[], layout: Layout): YearFileRow {
  const c = layout.columns;
  const row: YearFileRow = {
    code: cellAt(cells, c.code),
    name: cellAt(cells, c.name),
    industry: cellAt(cells, c.industry),
    totalPayrollK: parseIntK(cellAt(cells, c.totalPayrollK)),
    employees: parseIntK(cellAt(cells, c.employees)),
    avgK: parseIntK(cellAt(cells, c.avgK)),
    avgPrevK: parseIntK(cellAt(cells, c.avgPrevK)),
    // Change-% columns exist only from year 113; earlier years get null here and
    // have the value derived from cur/prev in build-data.
    avgChangePct: c.avgChangePct !== undefined ? parsePercent(cellAt(cells, c.avgChangePct)) : null,
    medianK: parseIntK(cellAt(cells, c.medianK)),
    medianPrevK: parseIntK(cellAt(cells, c.medianPrevK)),
    medianChangePct: c.medianChangePct !== undefined ? parsePercent(cellAt(cells, c.medianChangePct)) : null,
    eps: parseFloatSafe(cellAt(cells, c.eps)),
    peerAvgK: parseIntK(cellAt(cells, c.peerAvgK)),
    peerEps: parseFloatSafe(cellAt(cells, c.peerEps)),
    flagLowPay: parseFlag(cellAt(cells, c.flagLowPay)),
    flagEpsHighPayLow: parseFlag(cellAt(cells, c.flagEpsHighPayLow)),
    flagEpsUpPayDown: parseFlag(cellAt(cells, c.flagEpsUpPayDown)),
    note: parseText(cellAt(cells, c.note)),
    improvement: c.improvement !== undefined ? parseText(cellAt(cells, c.improvement)) : null,
  };
  if (layout.hasGender) {
    row.maleAvgK = c.maleAvgK !== undefined ? parseIntK(cellAt(cells, c.maleAvgK)) : null;
    row.femaleAvgK = c.femaleAvgK !== undefined ? parseIntK(cellAt(cells, c.femaleAvgK)) : null;
    row.maleMedianK = c.maleMedianK !== undefined ? parseIntK(cellAt(cells, c.maleMedianK)) : null;
    row.femaleMedianK = c.femaleMedianK !== undefined ? parseIntK(cellAt(cells, c.femaleMedianK)) : null;
  }
  return row;
}

/**
 * The total row collapses the leading label columns (industry/code/name) into one
 * cell, so its numeric columns are shifted left relative to a company row. We derive
 * the shift from the width difference so it adapts if a year merges a different count.
 */
function extractMarketTotal(cells: string[], layout: Layout): MarketTotal {
  const shift = layout.tdCount - cells.length;
  const atCompanyIdx = (companyIdx: number): string => {
    const i = companyIdx - shift;
    return i >= 0 && i < cells.length ? cellAt(cells, i) : '';
  };
  return {
    label: cellAt(cells, 0),
    totalPayrollK: parseIntK(atCompanyIdx(layout.columns.totalPayrollK)),
    employees: parseIntK(atCompanyIdx(layout.columns.employees)),
    avgK: parseIntK(atCompanyIdx(layout.columns.avgK)),
    rawCells: cells,
  };
}

function parseFile(target: FileTarget): YearFile {
  const { year, market, path } = target;
  const html = readFileSync(path, 'utf-8');
  const rows = extractRowsFromHtml(html);
  const layout = getLayout(year, dominantShape(rows));

  const companyRows = rows.filter((cells) => cells.length === layout.tdCount);
  const totalCells = rows.find(
    (cells) => cells.length !== layout.tdCount && cellAt(cells, 0).includes('合計'),
  );

  const dataRows = companyRows.map((cells) => extractCompanyRow(cells, layout));
  const marketTotal = totalCells ? extractMarketTotal(totalCells, layout) : null;

  return {
    year,
    market,
    fetchedAt: statSync(path).mtime.toISOString(),
    marketTotal,
    rows: dataRows,
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      year: { type: 'string' },
      market: { type: 'string' },
      all: { type: 'boolean', default: false },
    },
  });

  const all = values.all ?? false;
  const targets = resolveTargets(values.year, values.market, all);
  const existing = targets.filter((t) => {
    if (existsSync(t.path)) return true;
    console.warn(`skip ${t.year} ${t.market}: no cache file at ${t.path}`);
    return false;
  });

  // In --all mode, silently roll past years without a registered layout so the
  // annual refresh works incrementally. An explicit --year for an unmapped year
  // still hits getLayout() and fails loudly, which is the intended safeguard.
  const parseable = existing.filter((t) => {
    if (all && !hasLayout(t.year)) {
      console.warn(`skip ${t.year} ${t.market}: no layout registered yet (add to scripts/lib/layouts.ts)`);
      return false;
    }
    return true;
  });

  if (parseable.length === 0) {
    throw new Error('No parseable cache files. Run data:fetch first, or check --year/--market/layouts.');
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const target of parseable) {
    const yearFile = parseFile(target);
    const outPath = join(OUT_DIR, `${target.year}-${target.market}.json`);
    writeFileSync(outPath, JSON.stringify(yearFile, null, 2) + '\n', 'utf-8');
    console.log(
      `parsed ${target.year} ${target.market}: ${yearFile.rows.length} rows, ` +
        `marketTotal=${yearFile.marketTotal ? 'yes' : 'no'} -> ${outPath}`,
    );
  }
}

main();
