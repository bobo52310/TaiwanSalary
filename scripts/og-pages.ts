// Share cards for the section pages: 35 industry pages, the industry overview, and
// the 3 ranking pages (39 cards in all). Before these, every one of those pages shared
// the same og-default.png when posted to FB / Threads / LINE.
//
// Like the per-company cards (scripts/og-companies.ts), each card is built as an SVG and
// rasterised to a 1200×630 PNG via `rsvg-convert`. Every number and word on a card is
// computed here from the repo data and written as SVG <text> — the AI illustrations
// (docs/design/art/) only ever supply the text-free visual layer. The figures use the same
// definitions, labels and formatting as the pages themselves:
//   - industry cards   public/og/industry/{slug}.png   ← src/pages/industry/[name].astro
//   - industry overview public/og/industry/index.png    ← src/pages/industry/index.astro
//   - ranking cards    public/og/rank/{metric}.png      ← src/pages/rank/[metric].astro
//
// This is a LOCAL, committed generation step — Cloudflare Pages has no rsvg-convert, so
// the PNGs are generated here and committed like the static og-default.png. Re-run after
// the annual data refresh (or after the illustrations change):
//   pnpm exec tsx scripts/og-pages.ts            # all 39 cards
//   pnpm exec tsx scripts/og-pages.ts industry   # only the 35 industry cards
//   pnpm exec tsx scripts/og-pages.ts rank       # only the 3 ranking cards
//   pnpm exec tsx scripts/og-pages.ts index      # only the industry overview card
// (also runs as the last step of `pnpm art:build`)
//
// Requires: rsvg-convert (librsvg) and magick (ImageMagick, with webp) on PATH.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompaniesFile, IndustriesFile } from '../src/lib/types';
import { buildRanking, MIN_EMPLOYEES, type RankMetric, type RankRow } from '../src/lib/rank';
import { formatWan, formatPct, formatInt, rocToCe } from '../src/lib/format';
import { INDUSTRY_SLUGS, industryArtMaster } from '../src/lib/industry-art';

const ROOT = process.cwd();
const OUT_INDUSTRY = join(ROOT, 'public', 'og', 'industry');
const OUT_RANK = join(ROOT, 'public', 'og', 'rank');
const BG_DIR = join(ROOT, 'docs', 'design', 'art', 'rank-bg');
const FONT = 'Noto Sans TC, sans-serif';

// Footer rule + text baseline shared by every card (the company cards use 556 / 594).
const FOOT_LINE = 558;
const FOOT_TEXT = 596;
// The ranking backgrounds keep the right ~45% for the glass pillars: text stays left of this.
const RANK_TEXT_RIGHT = 640;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Text fitting. The cards are plain SVG, so there is no layout engine: width is
// estimated per character (CJK = 1em, Latin narrower) with a small safety margin, and
// the font size shrinks until the string fits its box. Visual check is still required.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared SVG pieces
// ---------------------------------------------------------------------------

const BASE_DEFS = `
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#132741"/>
      <stop offset="0.55" stop-color="#0e1d31"/>
      <stop offset="1" stop-color="#0a1524"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.25" r="0.75">
      <stop offset="0" stop-color="#2a6cb0" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#2a6cb0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="artglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#2a78d6" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#2a78d6" stop-opacity="0"/>
    </radialGradient>`;

const BG_RECTS = `<rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>`;

const svgOpen = (defs: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${FONT}">
  <defs>${defs}
  </defs>`;

/** Brand lockup — identical to the company cards. */
const BRAND = `<g transform="translate(64,60)">
    <rect width="48" height="48" rx="11" fill="#2a78d6"/>
    <text x="24" y="25" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="30" font-weight="700">薪</text>
    <text x="64" y="25" dominant-baseline="central" fill="#c3c2b7" font-size="25" font-weight="700" letter-spacing="3">TAIWANSALARY</text>
  </g>`;

const yearText = (rocYear: number): string => `民國 ${rocYear} 年度（${rocToCe(rocYear)}）`;

/** Top-right data-year label (industry cards; the ranking cards keep it in the left half). */
const yearTopRight = (rocYear: number, x = 1136, size = 24): string =>
  `<text x="${x}" y="84" text-anchor="end" fill="#8ea1b8" font-size="${size}" font-weight="500">${yearText(rocYear)}</text>`;

/** Rounded chip, text-width driven (same look as the company cards' industry chip). */
function chip(x: number, y: number, label: string, size = 26, fill = '#1c3a5e', color = '#bcd3ee'): { svg: string; width: number } {
  const width = Math.ceil(44 + emWidth(label) * size);
  const svg = `<g transform="translate(${x},${y})" font-size="${size}" font-weight="600">
    <rect width="${width}" height="42" rx="21" fill="${fill}"/>
    <text x="${width / 2}" y="22" text-anchor="middle" dominant-baseline="central" fill="${color}">${esc(label)}</text>
  </g>`;
  return { svg, width };
}

/** Rounded-corner illustration with a hairline border, from an already-embedded data URI. */
function artTile(id: string, x: number, y: number, size: number, rx: number, uri: string): string {
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}"/></clipPath>
  <image x="${x}" y="${y}" width="${size}" height="${size}" href="${uri}" clip-path="url(#${id})"/>
  <rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" rx="${rx}" fill="none" stroke="#ffffff" stroke-opacity="0.13"/>`;
}

/** Stand-in when an industry has no illustration: a monogram tile, text from the data. */
function monogramTile(x: number, y: number, size: number, rx: number, name: string): string {
  const ch = [...name][0] ?? '';
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="#12203a" stroke="#ffffff" stroke-opacity="0.13"/>
  <text x="${x + size / 2}" y="${y + size / 2}" text-anchor="middle" dominant-baseline="central" fill="#3987e5" font-size="${Math.round(size * 0.5)}" font-weight="800">${esc(ch)}</text>`;
}

const footLine = (x2 = 1136): string =>
  `<line x1="64" y1="${FOOT_LINE}" x2="${x2}" y2="${FOOT_LINE}" stroke="#ffffff" stroke-opacity="0.08"/>`;

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const uriCache = new Map<string, string>();

/**
 * Industry master (webp) → PNG data URI resized to exactly `px`, so the 1:1 raster in the
 * card is sharp (Lanczos here instead of rsvg's resampler). rsvg-convert can't be relied
 * on to decode inline webp, hence the magick hop.
 */
function artDataUri(file: string, px: number): string {
  const key = `${file}@${px}`;
  let uri = uriCache.get(key);
  if (!uri) {
    const png = execFileSync(
      'magick',
      [file, '-filter', 'Lanczos', '-resize', `${px}x${px}`, '-strip', 'png:-'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    uri = `data:image/png;base64,${png.toString('base64')}`;
    uriCache.set(key, uri);
  }
  return uri;
}

function render(svg: string, outFile: string): void {
  execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', '-f', 'png', '-o', outFile], {
    input: svg,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------------------
// Industry data — mirrors src/pages/industry/index.astro and [name].astro exactly:
// headline figures come from the site's latest year if the industry has it, otherwise
// from the industry's newest year; the list is sorted by 中位數的中位數 descending with
// nulls last (stable, so ties keep industries.json order).
// ---------------------------------------------------------------------------

interface IndustryRow {
  name: string;
  count: number;
  medianOfMediansK: number | null;
  avgOfAvgK: number | null;
  year: number;
  /** 1-based rank by 中位數的中位數; null when the value is null or the year isn't the site's latest. */
  rank: number | null;
  /** Another industry has exactly the same 中位數的中位數 (rendered as 並列). */
  tied: boolean;
}

interface IndustryData {
  rocYear: number;
  /** Page order (index.astro): highest 中位數的中位數 first. */
  rows: IndustryRow[];
}

function loadIndustryData(): IndustryData {
  const companies = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'companies.json'), 'utf8')) as CompaniesFile;
  const industries = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'industries.json'), 'utf8')) as IndustriesFile;
  const latest = companies.meta.latestYear;

  const rows: IndustryRow[] = [];
  for (const name of Object.keys(industries)) {
    const years = industries[name]!;
    const newest = Object.keys(years)
      .map(Number)
      .sort((a, b) => b - a)[0];
    const key = years[String(latest)] ? latest : newest;
    const s = key != null ? years[String(key)] : undefined;
    if (key == null || !s) {
      console.warn(`skip industry "${name}": no yearly data`);
      continue;
    }
    rows.push({
      name,
      count: s.count,
      medianOfMediansK: s.medianOfMediansK,
      avgOfAvgK: s.avgOfAvgK,
      year: key,
      rank: null,
      tied: false,
    });
  }

  rows.sort((a, b) => {
    if (a.medianOfMediansK == null) return b.medianOfMediansK == null ? 0 : 1;
    if (b.medianOfMediansK == null) return -1;
    return b.medianOfMediansK - a.medianOfMediansK;
  });

  // Rank = 1 + number of industries strictly higher (equal values share a rank and are
  // flagged `tied`, since the page's table order between equal values is arbitrary).
  // Rows from an older data year are not comparable with the latest-year ranking: no rank.
  for (const r of rows) {
    if (r.medianOfMediansK == null || r.year !== latest) continue;
    r.rank = 1 + rows.filter((o) => o.medianOfMediansK != null && o.medianOfMediansK > r.medianOfMediansK!).length;
    r.tied = rows.some((o) => o !== r && o.medianOfMediansK === r.medianOfMediansK);
  }

  return { rocYear: latest, rows };
}

// ---------------------------------------------------------------------------
// Industry card
// ---------------------------------------------------------------------------

/** `127.9` + 萬, or a bare "—" (no unit) when the value is null. */
function wanSpan(k: number | null, unitSize: number, unitColor: string, weight = 800): string {
  const s = formatWan(k);
  if (k == null) return `${s}`;
  return `${s}<tspan fill="${unitColor}" font-size="${unitSize}" font-weight="${weight - 100}" dx="6">萬</tspan>`;
}

function industryCardSvg(r: IndustryRow, total: number): string {
  const nameSize = fitSize(r.name, 96, 620);
  const countChip = chip(64, 258, `${formatInt(r.count)} 家上市櫃公司`);

  const primaryW = emWidth(formatWan(r.medianOfMediansK)) * 104 + 56;
  const x2 = Math.max(430, Math.ceil(64 + primaryW + 40));
  // The secondary figure must stay clear of the illustration tile (starts at x=736).
  const avgSize = fitSize(`${formatWan(r.avgOfAvgK)}萬`, 80, 736 - 24 - x2);

  const rankLine =
    r.rank != null
      ? `<text x="64" y="530" fill="#9fb3cc" font-size="26" font-weight="600">${total} 種產業中${r.tied ? '並列' : ''}第 ${r.rank} 名（依中位數的中位數）</text>`
      : '';

  const master = industryArtMaster(r.name);
  const tile = master
    ? artTile('art', 736, 132, 400, 44, artDataUri(master, 400))
    : monogramTile(736, 132, 400, 44, r.name);

  return `${svgOpen(BASE_DEFS)}
  ${BG_RECTS}
  ${BRAND}
  ${yearTopRight(r.year)}

  <circle cx="936" cy="332" r="300" fill="url(#artglow)"/>
  ${tile}

  <text x="64" y="224" fill="#ffffff" font-size="${nameSize}" font-weight="800">${esc(r.name)}</text>
  ${countChip.svg}

  <g transform="translate(64,380)">
    <text x="0" y="0" fill="#8ea1b8" font-size="27" font-weight="600">中位數的中位數</text>
    <text x="0" y="92" fill="#3987e5" font-size="104" font-weight="800">${wanSpan(r.medianOfMediansK, 46, '#7fb0ea')}</text>
  </g>
  <g transform="translate(${x2},380)">
    <text x="0" y="0" fill="#8ea1b8" font-size="27" font-weight="600">平均數的平均數</text>
    <text x="0" y="88" fill="#e8edf4" font-size="${avgSize}" font-weight="700">${wanSpan(r.avgOfAvgK, 38, '#8ea1b8', 700)}</text>
  </g>
  ${rankLine}

  ${footLine()}
  <text x="64" y="${FOOT_TEXT}" fill="#7f93ab" font-size="22" font-weight="500">非主管全時員工　·　公司層級統計　·　資料來源：公開資訊觀測站 MOPS　·　salary.bobochen.dev</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Industry overview card
// ---------------------------------------------------------------------------

/** How many illustrations the overview collage shows (3 × 3). */
const COLLAGE = 9;

function indexCardSvg(data: IndustryData): string {
  const { rows, rocYear } = data;
  const ranked = rows.filter((r) => r.medianOfMediansK != null);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];

  // Fixed, reproducible collage: the 9 industries with the highest 中位數的中位數, in the
  // same order as the page table (left→right, top→bottom). Art-less industries are skipped.
  const tiles: string[] = [];
  const TILE = 128;
  const GAP = 14;
  const X0 = 1136 - (3 * TILE + 2 * GAP);
  const Y0 = 126;
  const withArt = ranked.map((r) => ({ r, file: industryArtMaster(r.name) })).filter((x) => x.file != null);
  withArt.slice(0, COLLAGE).forEach((x, i) => {
    const cx = X0 + (i % 3) * (TILE + GAP);
    const cy = Y0 + Math.floor(i / 3) * (TILE + GAP);
    tiles.push(artTile(`t${i}`, cx, cy, TILE, 24, artDataUri(x.file!, TILE)));
  });

  const colX2 = 410;
  const extreme = (r: IndustryRow | undefined, x: number, label: string, valueColor: string, unitColor: string): string => {
    if (!r) return '';
    const nameSize = fitSize(`${r.name} ${formatInt(r.count)} 家`, 38, 300);
    return `<g transform="translate(${x},380)">
    <text x="0" y="0" fill="#8ea1b8" font-size="26" font-weight="600">${label}</text>
    <text x="0" y="54" fill="#ffffff" font-size="${nameSize}" font-weight="700">${esc(r.name)}<tspan fill="#8ea1b8" font-size="${Math.round(nameSize * 0.62)}" font-weight="600" dx="12">${formatInt(r.count)} 家</tspan></text>
    <text x="0" y="140" fill="${valueColor}" font-size="84" font-weight="800">${wanSpan(r.medianOfMediansK, 40, unitColor)}</text>
  </g>`;
  };

  return `${svgOpen(BASE_DEFS)}
  ${BG_RECTS}
  ${BRAND}
  ${yearTopRight(rocYear)}

  <circle cx="${X0 + 206}" cy="${Y0 + 206}" r="330" fill="url(#artglow)"/>
  ${tiles.join('\n  ')}

  <text x="64" y="224" fill="#ffffff" font-size="96" font-weight="800">產業薪資總覽</text>
  ${chip(64, 258, `${rows.length} 種產業`).svg}

  ${extreme(top, 64, '中位數的中位數　最高', '#3987e5', '#7fb0ea')}
  ${top !== bottom ? extreme(bottom, colX2, '最低', '#e8edf4', '#8ea1b8') : ''}

  ${footLine()}
  <text x="64" y="${FOOT_TEXT}" fill="#7f93ab" font-size="22" font-weight="500">非主管全時員工　·　公司層級統計　·　資料來源：公開資訊觀測站 MOPS　·　salary.bobochen.dev</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Ranking cards — wording mirrors src/pages/rank/[metric].astro and RankTable.astro
// ---------------------------------------------------------------------------

interface RankCopy {
  /** The page's <h1>, verbatim. Split at the first space into two display lines. */
  h1: string;
  /** Label of the headline figure (page intro / table header). */
  label: string;
}

const RANK_COPY: Record<RankMetric, RankCopy> = {
  median: { h1: '員工薪資中位數 Top 100', label: '薪資中位數' },
  average: { h1: '員工薪資平均數 Top 100', label: '薪資平均數' },
  raise: { h1: '員工調薪幅度 Top 100', label: '中位數年增幅' },
};

function rankCardSvg(metric: RankMetric, first: RankRow, rocYear: number): string {
  const copy = RANK_COPY[metric];
  const cut = copy.h1.indexOf(' ');
  const line1 = copy.h1.slice(0, cut);
  const line2 = copy.h1.slice(cut + 1);
  const maxW = RANK_TEXT_RIGHT - 64;

  const bgUri = `data:image/jpeg;base64,${readFileSync(join(BG_DIR, `${metric}.jpg`)).toString('base64')}`;

  // Row A: rank chip + the eligibility definition printed on the page.
  const rankChip = chip(64, 296, '第 1 名');
  const defText = `非主管全時員工　·　員工數 ≥ ${MIN_EMPLOYEES} 人`;

  // Row B: company name + stock code.
  const nameText = `${first.name} ${first.code}`;
  const nameSize = fitSize(nameText, 62, maxW);
  const codeSize = Math.round(nameSize * 0.55);

  // Row C: headline value (page table formatting) + a secondary figure from the same table.
  let primary: string;
  let secondary: string;
  const primarySize = metric === 'raise' ? 72 : 80;
  if (metric === 'raise') {
    // formatPct → "+193.28%": the % sign is set smaller, like the 萬 unit elsewhere.
    const pct = formatPct(first.medianChangePct);
    const num = pct.endsWith('%') ? pct.slice(0, -1) : pct;
    primary = `${esc(num)}${pct.endsWith('%') ? '<tspan font-size="40" font-weight="700" fill="#7fb0ea" dx="4">%</tspan>' : ''}`;
    const sx = Math.ceil(64 + emWidth(num) * primarySize + 48 + 28);
    // Same two numbers as the page table's 中位數 / 前一年中位數 columns.
    const cur = `中位數　${formatWan(first.medianK)}萬`;
    const prev = `前一年　${formatWan(first.medianPrevK)}萬`;
    const fs = Math.min(fitSize(cur, 26, RANK_TEXT_RIGHT - sx), fitSize(prev, 26, RANK_TEXT_RIGHT - sx));
    const row = (y: number, label: string, v: number | null): string =>
      `<text x="${sx}" y="${y}" fill="#8ea1b8" font-size="${fs}" font-weight="600">${label}<tspan fill="#e8edf4" font-weight="700" dx="14">${formatWan(v)}萬</tspan></text>`;
    secondary = `${row(498, '中位數', first.medianK)}
  ${row(538, '前一年', first.medianPrevK)}`;
  } else {
    const main = metric === 'median' ? first.medianK : first.avgK;
    const other = metric === 'median' ? first.avgK : first.medianK;
    primary = `${formatWan(main)}<tspan font-size="40" font-weight="700" fill="#7fb0ea" dx="6">萬</tspan>`;
    const sx = Math.ceil(64 + emWidth(formatWan(main)) * primarySize + 52 + 36);
    const val = `${formatWan(other)}萬`;
    const vs = fitSize(val, 52, RANK_TEXT_RIGHT - sx);
    secondary = `<text x="${sx}" y="462" fill="#8ea1b8" font-size="24" font-weight="600">${metric === 'median' ? '平均數' : '中位數'}</text>
  <text x="${sx}" y="538" fill="#e8edf4" font-size="${vs}" font-weight="700">${esc(val)}</text>`;
  }

  return `${svgOpen('')}
  <image x="0" y="0" width="1200" height="630" href="${bgUri}" preserveAspectRatio="xMidYMid slice"/>
  ${BRAND}
  <text x="${RANK_TEXT_RIGHT}" y="84" text-anchor="end" fill="#8ea1b8" font-size="22" font-weight="500">${yearText(rocYear)}</text>

  <text x="64" y="188" fill="#ffffff" font-size="68" font-weight="800">${esc(line1)}</text>
  <text x="64" y="258" fill="#3987e5" font-size="68" font-weight="800">${esc(line2)}</text>

  ${rankChip.svg}
  <text x="${64 + rankChip.width + 18}" y="318" dominant-baseline="central" fill="#9fb3cc" font-size="23" font-weight="500">${esc(defText)}</text>

  <text x="64" y="408" fill="#ffffff" font-size="${nameSize}" font-weight="800">${esc(first.name)}<tspan fill="#8ea1b8" font-size="${codeSize}" font-weight="600" dx="16">${esc(first.code)}</tspan></text>

  <text x="64" y="462" fill="#8ea1b8" font-size="25" font-weight="600">${esc(copy.label)}</text>
  <text x="64" y="538" fill="#3987e5" font-size="${primarySize}" font-weight="800">${primary}</text>
  ${secondary}

  ${footLine(RANK_TEXT_RIGHT)}
  <text x="64" y="${FOOT_TEXT}" fill="#7f93ab" font-size="21" font-weight="500">資料來源：公開資訊觀測站 MOPS · salary.bobochen.dev</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const TARGETS = ['industry', 'rank', 'index'] as const;
type Target = (typeof TARGETS)[number];

function genIndustry(data: IndustryData): number {
  mkdirSync(OUT_INDUSTRY, { recursive: true });
  let n = 0;
  for (const r of data.rows) {
    const slug = INDUSTRY_SLUGS[r.name];
    if (!slug) {
      console.warn(`skip industry "${r.name}": no slug in INDUSTRY_SLUGS`);
      continue;
    }
    if (slug === 'index') throw new Error('an industry slug must not be "index" (collides with the overview card)');
    if (!industryArtMaster(r.name)) console.warn(`industry "${r.name}": no illustration, using a monogram tile`);
    render(industryCardSvg(r, data.rows.length), join(OUT_INDUSTRY, `${slug}.png`));
    n++;
  }
  return n;
}

function genIndex(data: IndustryData): number {
  mkdirSync(OUT_INDUSTRY, { recursive: true });
  render(indexCardSvg(data), join(OUT_INDUSTRY, 'index.png'));
  return 1;
}

function genRank(): number {
  const file = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'companies.json'), 'utf8')) as CompaniesFile;
  const rocYear = file.meta.latestYear;
  mkdirSync(OUT_RANK, { recursive: true });
  let n = 0;
  for (const metric of Object.keys(RANK_COPY) as RankMetric[]) {
    const { rows } = buildRanking(file, metric);
    const first = rows[0];
    if (!first) {
      console.warn(`skip rank "${metric}": empty ranking`);
      continue;
    }
    // The h1 says "Top 100"; flag it if the ranking ever stops having exactly 100 rows.
    if (rows.length !== 100) console.warn(`rank "${metric}": ${rows.length} rows, but the page title says Top 100`);
    render(rankCardSvg(metric, first, rocYear), join(OUT_RANK, `${metric}.png`));
    n++;
  }
  return n;
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const bad = args.filter((a) => !(TARGETS as readonly string[]).includes(a));
  if (bad.length) {
    console.error(`Unknown target: ${bad.join(', ')}\nUsage: tsx scripts/og-pages.ts [${TARGETS.join('|')}]...  (no argument = all)`);
    process.exit(1);
  }
  const want = new Set<Target>(args.length ? (args as Target[]) : TARGETS);

  const industryData = want.has('industry') || want.has('index') ? loadIndustryData() : null;
  if (want.has('industry')) console.log(`Generated ${genIndustry(industryData!)} industry card(s) → public/og/industry/`);
  if (want.has('index')) console.log(`Generated ${genIndex(industryData!)} overview card → public/og/industry/index.png`);
  if (want.has('rank')) console.log(`Generated ${genRank()} ranking card(s) → public/og/rank/`);
}

main();
