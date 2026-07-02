// Per-company OG share cards for the top 100 companies by average salary.
//
// Each card is built as an SVG (exact salary figures rendered as text — never AI —
// so "407.2萬" is pixel-perfect) and rasterised to a 1200×630 PNG via `rsvg-convert`
// at public/og/company/{code}.png. A hand-curated logo (public/logos/{code}.*) is
// embedded when present; otherwise a deterministic monogram tile stands in.
//
// This is a LOCAL, committed generation step — Cloudflare Pages has no rsvg-convert,
// so the PNGs are generated here and committed like the static og-default.png. Re-run
// after the annual data refresh or after adding logos:  npm run og:build
// Quick iteration on a subset:  npm run og:build -- 2330 2454
//
// Requires: rsvg-convert (librsvg) and magick (ImageMagick) on PATH.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CompaniesFile } from '../src/lib/types';
import { buildRanking, type RankRow } from '../src/lib/rank';
import { formatWan, formatEmployees, rocToCe } from '../src/lib/format';
import { resolveLogo, hueForCode, monogramText } from '../src/lib/logo';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'og', 'company');
const FONT = 'Noto Sans TC, sans-serif';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Rasterise a logo (svg via rsvg-convert, raster via magick) to a trimmed,
 * alpha-preserving PNG data URI that fits a ~300px box — small enough to inline
 * in the card SVG, tight enough to fill the tile after xMidYMid meet.
 */
function logoDataUri(file: string, ext: string): string {
  const raw = ext === 'svg' ? execFileSync('rsvg-convert', ['-w', '400', file]) : readFileSync(file);
  // -fuzz+-trim strips the surrounding uniform border (whitespace / solid-white JPEG
  // backgrounds) so the mark isn't tiny inside its own padding; alpha is kept for PNG/SVG.
  const png = execFileSync(
    'magick',
    ['-', '-fuzz', '6%', '-trim', '+repage', '-resize', '300x300', '-background', 'none', '-strip', 'png:-'],
    { input: raw, maxBuffer: 64 * 1024 * 1024 },
  );
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** The 150×150 identity tile: real logo on a white rounded tile, else monogram. */
function tileSvg(row: RankRow): string {
  const logo = resolveLogo(row.code);
  if (logo) {
    const pad = 18;
    return `<rect x="64" y="168" width="150" height="150" rx="34" fill="#ffffff"/>
    <image x="${64 + pad}" y="${168 + pad}" width="${150 - 2 * pad}" height="${150 - 2 * pad}" href="${logoDataUri(logo.file, logo.ext)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const hue = hueForCode(row.code);
  const mono = monogramText(row.name);
  return `<rect x="64" y="168" width="150" height="150" rx="34" fill="url(#tile)" stroke="hsl(${hue} 45% 55%)" stroke-opacity="0.35"/>
    <text x="139" y="245" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${[...mono].length >= 2 ? 62 : 82}" font-weight="800">${esc(mono)}</text>`;
}

function cardSvg(row: RankRow, rocYear: number): string {
  const hue = hueForCode(row.code);
  const avg = formatWan(row.avgK);
  const med = formatWan(row.medianK);
  const emp = formatEmployees(row.employees);
  const market = row.market === 'sii' ? '上市' : '上櫃';
  const nameLen = [...row.name].length;
  const nameSize = nameLen <= 3 ? 94 : 78;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${FONT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#132741"/>
      <stop offset="0.55" stop-color="#0e1d31"/>
      <stop offset="1" stop-color="#0a1524"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.25" r="0.75">
      <stop offset="0" stop-color="#2a6cb0" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#2a6cb0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 42% 38%)"/>
      <stop offset="1" stop-color="hsl(${hue} 46% 28%)"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <g transform="translate(64,60)">
    <rect width="48" height="48" rx="11" fill="#2a78d6"/>
    <text x="24" y="25" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="30" font-weight="700">薪</text>
    <text x="64" y="25" dominant-baseline="central" fill="#c3c2b7" font-size="25" font-weight="700" letter-spacing="3">TAIWANSALARY</text>
  </g>
  <text x="1136" y="84" text-anchor="end" fill="#8ea1b8" font-size="24" font-weight="500">民國 ${rocYear} 年度（${rocToCe(rocYear)}）</text>

  ${tileSvg(row)}
  <text x="242" y="222" fill="#ffffff" font-size="${nameSize}" font-weight="800">${esc(row.name)}<tspan fill="#8ea1b8" font-size="46" font-weight="600" dx="18">${esc(row.code)}</tspan></text>
  <g transform="translate(244,268)" font-size="26" font-weight="600">
    <rect width="${44 + [...row.industry].length * 26}" height="42" rx="21" fill="#1c3a5e"/>
    <text x="${(44 + [...row.industry].length * 26) / 2}" y="22" text-anchor="middle" dominant-baseline="central" fill="#bcd3ee">${esc(row.industry)}</text>
    <rect x="${56 + [...row.industry].length * 26}" width="72" height="42" rx="21" fill="#243449"/>
    <text x="${56 + [...row.industry].length * 26 + 36}" y="22" text-anchor="middle" dominant-baseline="central" fill="#9fb3cc">${market}</text>
  </g>

  <g transform="translate(64,404)">
    <text x="0" y="0" fill="#8ea1b8" font-size="27" font-weight="600">平均年薪</text>
    <text x="0" y="86" fill="#3987e5" font-size="104" font-weight="800">${avg}<tspan fill="#7fb0ea" font-size="46" font-weight="700" dx="6">萬</tspan></text>
  </g>
  <g transform="translate(560,404)">
    <text x="0" y="0" fill="#8ea1b8" font-size="27" font-weight="600">中位數</text>
    <text x="0" y="82" fill="#e8edf4" font-size="88" font-weight="700">${med}<tspan fill="#8ea1b8" font-size="40" font-weight="600" dx="6">萬</tspan></text>
  </g>
  <g transform="translate(980,404)">
    <text x="0" y="0" fill="#8ea1b8" font-size="27" font-weight="600">平均薪資排名</text>
    <text x="0" y="80" fill="#e8edf4" font-size="80" font-weight="700">#${row.rank}</text>
  </g>

  <line x1="64" y1="556" x2="1136" y2="556" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="64" y="594" fill="#7f93ab" font-size="24" font-weight="500">員工 ${emp} 人　·　資料來源：公開資訊觀測站 MOPS　·　salary.bobochen.dev</text>
</svg>`;
}

function main(): void {
  const file = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'companies.json'), 'utf8')) as CompaniesFile;
  const rocYear = file.meta.latestYear;
  const { rows } = buildRanking(file, 'average');

  // Optional positional args restrict generation to specific codes (fast iteration).
  const onlyCodes = new Set(process.argv.slice(2).filter((a) => !a.startsWith('-')));
  const targets = onlyCodes.size ? rows.filter((r) => onlyCodes.has(r.code)) : rows;

  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = join(OUT_DIR, '.tmp.svg');
  let withLogo = 0;
  for (const row of targets) {
    if (resolveLogo(row.code)) withLogo++;
    writeFileSync(tmp, cardSvg(row, rocYear));
    execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', tmp, '-o', join(OUT_DIR, `${row.code}.png`)]);
  }
  rmSync(tmp, { force: true });

  console.log(
    `Generated ${targets.length} OG card(s) → public/og/company/  ` +
      `(${withLogo} real logo${withLogo === 1 ? '' : 's'}, ${targets.length - withLogo} monogram)`,
  );
}

main();
