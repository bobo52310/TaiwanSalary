// Derive the Taiwan choropleth used by the TaxMap cross-promotion banner
// (docs/design/art/cross/taxmap-map.svg) from the sister repo TaxMap-TW's real data.
// Nothing here is drawn by AI: polygons are the 內政部 village boundaries TaxMap ships,
// colours are TaxMap's 2024 village median income on TaxMap's YlGnBu brand ramp.
//
//   pnpm exec tsx docs/design/art/cross/build-map.ts [path/to/TaxMap-TW]
//   (default: ../TaxMap-TW next to this repo; then run docs/design/art/cross/render.sh)
//
// Inputs (read-only, all inside TaxMap-TW):
//   data-raw/villages.simplified.geojson  7,953 village polygons (NLSC, keyed by VILLCODE).
//                                         Gitignored there: produced by its `pnpm build:geojson`.
//   public/data/map/code-to-key.json      VILLCODE → "縣市|鄉鎮|村里" (the map's own join table)
//   public/data/map/metrics-<year>.json   "縣市|鄉鎮|村里" → [mean, median, q1, q3] in 千元
// Tooling: mapshaper (TaxMap-TW has it in node_modules; override with MAPSHAPER=...).
//
// Choices (see docs/design/art/README.md):
//   - metric/year = TaxMap's default view: median (中位數), 2024 (初步核定).
//   - classes: 8 log-spaced bins, each 1.15× the previous (350 千元 · 1.15^k). TaxMap's own
//     legend uses 7 coarser absolute bins (30/50/80/130/200/350 萬); at banner size those put
//     ~97% of villages in two classes, i.e. a flat one-colour island. Finer log bins keep the
//     scale monotonic and value-proportional while showing the urban/rural contrast.
//   - on the navy banner the ramp runs dark → light (brighter = higher median), so the top
//     classes don't sink into the background. Unjoined / unnamed polygons get a muted no-data fill.
//   - Kinmen and Matsu are left out (fitting them in would shrink the main island ~30%); far-off islets
//     outside 119.25–122.05°E, 21.85–25.35°N (Diaoyutai, Pratas, Taiping, Pengjia…) are clipped.
//     Penghu, Green Island, Orchid Island and Guishan Island stay at their true positions.
//   - projection: TWD97 / TM2 (EPSG:3826), north up.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const YEAR = 2024; // TaxMap DEFAULT_YEAR (= LAST_YEAR) in its src/lib/types.ts
const MEDIAN = 1; // index into metrics-<year>.json value arrays: [mean, median, q1, q3]
const EXCLUDED_COUNTIES = new Set(['金門縣', '連江縣']);
const CLIP_BBOX = '119.25,21.85,122.05,25.35';
const TM2 = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const WIDTH = 440; // px width of the exported SVG; height follows the projection
const SIMPLIFY_M = 300; // simplification interval in metres (~0.5 px at this width)

/** Lower bound (千元) of classes 1..7; class 0 is below 350. */
const BREAKS = Array.from({ length: 7 }, (_, k) => 350 * 1.15 ** k);
/** TaxMap YlGnBu brand ramp (src/styles/globals.css brand-700 → brand-50), dark → light. */
const RAMP = ['#253494', '#225ea8', '#1d91c0', '#41b6c4', '#7fcdde', '#c1e6ee', '#e0f3f7', '#f7fcfd'];
const NO_DATA = '#33415c';

interface Feature {
  type: 'Feature';
  geometry: unknown;
  properties: Record<string, string | number | null>;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const taxmap = resolve(process.argv[2] ?? process.env.TAXMAP_DIR ?? join(repoRoot, '../TaxMap-TW'));
const mapshaper = process.env.MAPSHAPER ?? join(taxmap, 'node_modules/.bin/mapshaper');
const out = join(here, 'taxmap-map.svg');

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(taxmap, rel), 'utf8')) as T;
const geo = readJson<{ features: Feature[] }>('data-raw/villages.simplified.geojson');
const codeToKey = readJson<Record<string, string>>('public/data/map/code-to-key.json');
const metrics = readJson<Record<string, number[]>>(`public/data/map/metrics-${YEAR}.json`);

const classify = (v: number): number => {
  const i = BREAKS.findIndex((b) => v < b);
  return i < 0 ? BREAKS.length : i;
};

let named = 0;
let joined = 0;
const counts = new Array<number>(RAMP.length).fill(0);
const features: Feature[] = [];
for (const f of geo.features) {
  const p = f.properties;
  if (EXCLUDED_COUNTIES.has(String(p.COUNTYNAME))) continue;
  let k = -1;
  if (p.VILLNAME) {
    named++;
    const key = codeToKey[String(p.VILLCODE)];
    const median = key ? metrics[key]?.[MEDIAN] : undefined;
    if (typeof median === 'number' && median > 0) {
      joined++;
      k = classify(median);
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  features.push({ type: 'Feature', geometry: f.geometry, properties: { k, county: p.COUNTYNAME ?? '' } });
}

/**
 * Rewrite mapshaper's absolute "M x y x y … Z" path data as relative moves rounded to
 * 0.1 px (plenty at banner scale; roughly halves the file). Coordinates are rounded
 * before differencing, so no error accumulates along a ring.
 */
function compactPath(d: string): string {
  const tokens = d.trim().split(/[\s,]+/);
  const num = (tenths: number): string => {
    const s = String(tenths / 10);
    return tenths < 0 ? s : ` ${s}`;
  };
  let out = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let startOfSubpath = false;
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    if (tok === 'M' || tok === 'L') {
      out += tok === 'M' ? 'm' : 'l';
      startOfSubpath = tok === 'M';
      i++;
      continue;
    }
    if (tok === 'Z' || tok === 'z') {
      out += 'z';
      cx = sx;
      cy = sy;
      i++;
      continue;
    }
    const x = Math.round(Number(tok) * 10);
    const y = Math.round(Number(tokens[i + 1]) * 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`unexpected path token "${tok}"`);
    out += num(x - cx) + num(y - cy);
    cx = x;
    cy = y;
    if (startOfSubpath) {
      sx = x;
      sy = y;
      startOfSubpath = false;
    }
    i += 2;
  }
  return out.replace(/^([ml]) /, '$1').replace(/([mlz]) /g, '$1');
}

const tmp = mkdtempSync(join(tmpdir(), 'taxmap-map-'));
try {
  const input = join(tmp, 'villages.json');
  writeFileSync(input, JSON.stringify({ type: 'FeatureCollection', features }));
  const fill = `k<0?'${NO_DATA}':${JSON.stringify(RAMP).replaceAll('"', "'")}[k]`;
  execFileSync(
    mapshaper,
    [
      '-i', input, 'name=villages',
      '-clip', `bbox=${CLIP_BBOX}`,
      '-proj', TM2,
      '-simplify', `interval=${SIMPLIFY_M}`, 'keep-shapes',
      // one multipolygon per colour class; the same-colour stroke hides anti-aliasing seams
      '-dissolve', 'k', '+', 'name=classes',
      '-style', 'target=classes', `fill=${fill}`, `stroke=${fill}`, 'stroke-width=0.4',
      // faint county borders for structure
      '-dissolve', 'county', 'target=villages', '+', 'name=counties',
      '-innerlines', 'target=counties',
      '-style', 'target=counties', 'stroke=#0b1526', 'stroke-width=0.6', 'stroke-opacity=0.5',
      // a dark coastline so the island reads against the glowing background
      '-dissolve', 'target=villages', '+', 'name=coast',
      '-style', 'target=coast', 'fill=none', 'stroke=#0b1526', 'stroke-width=0.8', 'stroke-opacity=0.7',
      '-o', 'format=svg', `width=${WIDTH}`, 'margin=0', 'target=classes,counties,coast', join(tmp, 'map.svg'),
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const svg = readFileSync(join(tmp, 'map.svg'), 'utf8')
    .replace(/^<\?xml[^>]*>\s*/, '')
    // 0.1 px is plenty at banner scale and roughly halves the file
    .replace(/ d="([^"]*)"/g, (_, d: string) => ` d="${compactPath(d)}"`);
  const header = `<!-- Generated by docs/design/art/cross/build-map.ts from TaxMap-TW data (do not edit by hand).
     ${YEAR} village median income (TaxMap metrics-${YEAR}.json, 千元), joined VILLCODE → code-to-key.json;
     ${joined} of ${named} named villages coloured (Kinmen/Matsu excluded). Classes: 350·1.15^k 千元 on
     TaxMap's YlGnBu ramp, dark → light; ${NO_DATA} = no data. Boundaries: 內政部 village polygons, TM2. -->\n`;
  writeFileSync(out, header + svg);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`joined ${joined}/${named} named villages (${named - joined} no data)`);
console.log(`class counts (${BREAKS.map((b) => Math.round(b)).join(' / ')} 千元): ${counts.join(', ')}`);
console.log(`wrote ${out.slice(repoRoot.length + 1)} (${Math.round(statSync(out).size / 1024)} KB)`);
