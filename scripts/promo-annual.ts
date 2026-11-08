// Annual "new year of data is live" key visual for social media.
//
// Every June listed companies file the previous year's salary data; once the site has
// the new year, this card announces it. Like the share cards (scripts/og-pages.ts), it
// is an SVG rasterised to a 1200×630 PNG via `rsvg-convert`: the background
// (docs/design/art/annual/bg.jpg) is a text-free Codex illustration, and every word and
// number on the card is computed here from the committed data, never typed in:
//   - latest year  = companies.json meta.latestYear
//   - first year   = smallest year that has any company row
//   - data years   = how many distinct years have company rows
//   - companies    = companies (上市 + 上櫃) with a row for the latest year
// Salary figures are deliberately left off this card: the site uses several different
// definitions (weighted market average vs. median of company medians), and a single
// headline number out of context would mix them up.
//
// Output: docs/promo/social/annual-{latestRocYear}.png (local, committed — not part of
// the Astro build). Re-run after the annual data refresh:
//   pnpm promo:annual
//
// Layout preview for a later year (labels only; the data is not touched):
//   pnpm exec tsx scripts/promo-annual.ts --preview-year 115 --out /path/to/preview.png
//
// Requires: rsvg-convert (librsvg) and the Noto Sans TC font.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { CompaniesFile, MarketStatsFile } from '../src/lib/types';
import { formatInt } from '../src/lib/format';

const ROOT = process.cwd();
const BG_FILE = join(ROOT, 'docs', 'design', 'art', 'annual', 'bg.jpg');
const OUT_DIR = join(ROOT, 'docs', 'promo', 'social');
const FONT = 'Noto Sans TC, sans-serif';

// Footer rule + text baseline, same as the page share cards.
const FOOT_LINE = 558;
const FOOT_TEXT = 596;
// The background keeps the right ~40% for the card stack: text stays left of this.
const TEXT_LEFT = 64;
const TEXT_RIGHT = 640;

// ---------------------------------------------------------------------------
// Helpers copied from scripts/og-pages.ts (each card script is self-contained; keep
// these in step with that file if the brand lockup or text metrics change).
// ---------------------------------------------------------------------------

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Estimated string width in em (CJK = 1em, Latin narrower) with a small safety margin. */
function emWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (/[0-9]/.test(ch)) w += 0.6;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[a-z]/.test(ch)) w += 0.58;
    else if (ch === '.' || ch === ',') w += 0.32;
    else if (ch === ' ') w += 0.28;
    else if (ch === '%') w += 0.9;
    else if (ch === '+' || ch === '−' || ch === '-') w += 0.6;
    else if (ch.charCodeAt(0) < 0x2e80) w += 0.7; // other Latin / punctuation, conservative
    else w += 1;
  }
  return w * 1.03;
}

/** Largest font size ≤ maxSize at which `text` stays within maxWidth px. */
function fitSize(text: string, maxSize: number, maxWidth: number): number {
  return Math.min(maxSize, Math.floor(maxWidth / emWidth(text)));
}

/** Brand lockup — identical to the share cards. */
const BRAND = `<g transform="translate(64,60)">
    <rect width="48" height="48" rx="11" fill="#2a78d6"/>
    <text x="24" y="25" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="30" font-weight="700">薪</text>
    <text x="64" y="25" dominant-baseline="central" fill="#c3c2b7" font-size="25" font-weight="700" letter-spacing="3">TAIWANSALARY</text>
  </g>`;

/** Rounded chip, text-width driven (same look as the share cards' chips). */
function chip(x: number, y: number, label: string, size = 26, fill = '#1c3a5e', color = '#bcd3ee'): { svg: string; width: number } {
  const width = Math.ceil(44 + emWidth(label) * size);
  const svg = `<g transform="translate(${x},${y})" font-size="${size}" font-weight="600">
    <rect width="${width}" height="42" rx="21" fill="${fill}"/>
    <text x="${width / 2}" y="22" text-anchor="middle" dominant-baseline="central" fill="${color}">${esc(label)}</text>
  </g>`;
  return { svg, width };
}

function render(svg: string, outFile: string): void {
  execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', '-f', 'png', '-o', outFile], {
    input: svg,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface AnnualFacts {
  /** Newest ROC year in the data (the year this card announces). */
  latestYear: number;
  /** Oldest ROC year with any company row. */
  firstYear: number;
  /** Number of distinct data years. */
  yearCount: number;
  /** Companies (上市 + 上櫃) with a row for the latest year. */
  companyCount: number;
}

function loadFacts(): AnnualFacts {
  const file = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'companies.json'), 'utf8')) as CompaniesFile;
  const marketStats = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'market-stats.json'), 'utf8')) as MarketStatsFile;
  const latestYear = file.meta.latestYear;

  // Count straight from the company records rather than trusting the precomputed meta,
  // then cross-check against the two places that also publish these numbers.
  const perYear = new Map<number, number>();
  for (const c of Object.values(file.companies)) {
    for (const y of Object.keys(c.years)) perYear.set(Number(y), (perYear.get(Number(y)) ?? 0) + 1);
  }
  const years = [...perYear.keys()].sort((a, b) => a - b);
  const firstYear = years[0];
  const newest = years[years.length - 1];
  if (firstYear == null || newest == null) throw new Error('companies.json has no yearly company rows');
  if (newest !== latestYear) throw new Error(`meta.latestYear is ${latestYear} but the newest company row is ${newest}`);

  const companyCount = perYear.get(latestYear) ?? 0;
  const metaCount = file.meta.counts.byYear[String(latestYear)];
  const statsCount = marketStats[String(latestYear)]?.all.companyCount;
  if (metaCount !== companyCount) console.warn(`warning: meta.counts.byYear[${latestYear}] = ${metaCount}, counted ${companyCount}`);
  if (statsCount !== companyCount) console.warn(`warning: market-stats[${latestYear}].all.companyCount = ${statsCount}, counted ${companyCount}`);

  // The card prints "民國 first–latest 年 · k 個年度": flag a gap, which would make the
  // range and the count disagree.
  if (years.length !== latestYear - firstYear + 1) {
    console.warn(`warning: data years are not contiguous (${years.join(', ')}); the range label spans gaps`);
  }

  return { latestYear, firstYear, yearCount: years.length, companyCount };
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function cardSvg(f: AnnualFacts): string {
  const maxW = TEXT_RIGHT - TEXT_LEFT;
  const bgUri = `data:image/jpeg;base64,${readFileSync(BG_FILE).toString('base64')}`;

  // Eyebrow: a chip with a small "live" dot in front of the label.
  const eyebrowLabel = '資料更新';
  const eyebrowW = Math.ceil(66 + emWidth(eyebrowLabel) * 24);
  const eyebrow = `<g transform="translate(${TEXT_LEFT},146)" font-size="24" font-weight="700">
    <rect width="${eyebrowW}" height="42" rx="21" fill="#173b66"/>
    <circle cx="26" cy="21" r="6" fill="#6ea8ee"/>
    <circle cx="26" cy="21" r="11" fill="#6ea8ee" fill-opacity="0.22"/>
    <text x="44" y="22" dominant-baseline="central" fill="#a9cdf7" letter-spacing="2">${esc(eyebrowLabel)}</text>
  </g>`;

  // Two-line headline; the year line carries the highlight. Both lines share one size,
  // fitted to the wider of the two so a different year can never push into the art.
  const yearLine = `民國 ${f.latestYear} 年度`;
  const titleLine = '薪資資料上線';
  const headSize = Math.min(fitSize(yearLine, 84, maxW), fitSize(titleLine, 84, maxW));
  const head1Y = 188 + 20 + Math.round(headSize * 0.9);
  const head2Y = head1Y + Math.round(headSize * 1.16);

  // Company count, then the range of years as chips.
  const countNum = formatInt(f.companyCount);
  const countRest = ' 家上市櫃公司';
  const countSize = fitSize(countNum + countRest, 36, maxW);
  const countY = head2Y + 70;

  const chipsY = countY + 26;
  const rangeChip = chip(TEXT_LEFT, chipsY, `民國 ${f.firstYear}–${f.latestYear} 年`, 23);
  const yearsChip = chip(TEXT_LEFT + rangeChip.width + 12, chipsY, `${f.yearCount} 個年度`, 23, '#243449', '#9fb3cc');
  if (chipsY + 42 > FOOT_LINE - 24) throw new Error('layout overflow: chips run into the footer');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${FONT}">
  <image x="0" y="0" width="1200" height="630" href="${bgUri}" preserveAspectRatio="xMidYMid slice"/>
  ${BRAND}

  ${eyebrow}
  <text x="${TEXT_LEFT}" y="${head1Y}" fill="#ffffff" font-size="${headSize}" font-weight="800">民國 <tspan fill="#3987e5">${f.latestYear}</tspan> 年度</text>
  <text x="${TEXT_LEFT}" y="${head2Y}" fill="#ffffff" font-size="${headSize}" font-weight="800">${esc(titleLine)}</text>

  <text x="${TEXT_LEFT}" y="${countY}" fill="#c9d4e5" font-size="${countSize}" font-weight="600"><tspan fill="#ffffff" font-weight="800">${countNum}</tspan>${esc(countRest)}</text>
  ${rangeChip.svg}
  ${yearsChip.svg}

  <line x1="${TEXT_LEFT}" y1="${FOOT_LINE}" x2="${TEXT_RIGHT}" y2="${FOOT_LINE}" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="${TEXT_LEFT}" y="${FOOT_TEXT}" fill="#7f93ab" font-size="21" font-weight="500">資料來源：公開資訊觀測站 MOPS · salary.bobochen.dev</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v == null || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

function main(): void {
  const args = process.argv.slice(2);
  const previewArg = flag(args, '--preview-year');
  const outArg = flag(args, '--out');

  if (!existsSync(BG_FILE)) throw new Error(`missing background ${relative(ROOT, BG_FILE)} (see docs/design/art/README.md)`);

  const facts = loadFacts();
  let card = facts;
  let outFile = join(OUT_DIR, `annual-${facts.latestYear}.png`);

  if (previewArg != null) {
    // Layout check only: pretend the data runs up to a later year. Never written to
    // docs/, so a preview can't be mistaken for (or overwrite) a real card.
    const y = Number(previewArg);
    if (!Number.isInteger(y) || y < facts.latestYear) throw new Error(`--preview-year must be a year ≥ ${facts.latestYear}`);
    if (!outArg) throw new Error('--preview-year requires --out <file> (previews are not written to docs/)');
    card = { ...facts, latestYear: y, yearCount: facts.yearCount + (y - facts.latestYear) };
  }
  if (outArg) {
    outFile = outArg;
    if (previewArg != null && relative(join(ROOT, 'docs'), outFile).split(/[\\/]/)[0] !== '..') {
      throw new Error('a preview must not be written under docs/');
    }
  }

  mkdirSync(dirname(outFile), { recursive: true });
  render(cardSvg(card), outFile);
  const shown = relative(ROOT, outFile);
  console.log(
    `民國 ${card.latestYear} 年度 · ${formatInt(card.companyCount)} 家 · 民國 ${card.firstYear}–${card.latestYear} 年 · ${card.yearCount} 個年度` +
      `${previewArg != null ? ' (preview)' : ''} → ${shown.startsWith('..') ? resolve(outFile) : shown}`,
  );
}

main();
