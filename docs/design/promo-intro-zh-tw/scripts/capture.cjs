#!/usr/bin/env node
/**
 * 哪家給最多｜台灣上市櫃薪資查詢 - 33s intro promo - real product capture.
 *
 * Every frame is the real built site (Astro static output, served by `astro preview`),
 * opened in Chrome for Testing in DARK mode (prefers-color-scheme: dark), because the
 * film's background is the site's dark page colour #0d0d0d - the PNGs melt into it with
 * no frame. Nothing is mocked: the search box is typed into with real key events, so the
 * homepage's own table-enhance.ts does the filtering.
 *
 * Usage
 *   node scripts/capture.cjs                         # every step
 *   node scripts/capture.cjs --only=search,company   # selected steps only
 *       steps: home | search | company | rank
 *       manifest.json is merged with whatever already exists, so partial re-runs
 *       keep the other shots.
 *
 * Output   assets/shots/*.png + assets/shots/manifest.json
 *   home.png            homepage, first viewport (1280x800 css px)
 *   search-0/1/2.png    the SAME clip: .controls down to the 8th table row, with the
 *                       search box empty / "台" / "台積" (identical size => cross-fade safe)
 *   company-head.png    /company/2330/ title block + the four headline stat cards
 *   company-trend.png   same page, 7-year salary trend (the TrendChart section)
 *   company-gender.png  same page, GenderCard
 *   company-pctl.png    same page, PercentileBar
 *   rank-median.png     /rank/median/ table, header + first 10 rows
 *   All PNGs are 2x (deviceScaleFactor 2). manifest.json lists, per shot, the file,
 *   pixel size, clip (css px), dsf and the key element boxes in IMAGE pixels relative
 *   to the image's top-left, so the composition can line overlays up with the screenshot.
 *
 * Puppeteer resolution (the repo has no node_modules for this folder by design)
 *   1. $PUPPETEER_DIR   directory that contains node_modules/puppeteer
 *   2. plain require('puppeteer')
 *   Install once:  mkdir -p $DIR && cd $DIR && npm init -y && npm i puppeteer@25.16.0
 *   (installs Chrome for Testing into ~/.cache/puppeteer)
 *
 * Env
 *   BASE_URL       site to shoot (default http://localhost:4329).
 *                  Typical:  pnpm build && pnpm preview --port 4329
 *                  Shoot a build of the commit you want in the film, not a dirty tree:
 *                  the homepage hero/chips layout decides every y-coordinate here.
 *   PUPPETEER_DIR  see above
 *   HEADFUL=1      show the browser window (default: headless)
 *
 * Fonts: the site uses a system stack (-apple-system, "PingFang TC", ...). Shoot on
 * macOS to get the same glyphs as the committed PNGs; other OSes will render a
 * different CJK face and shift widths slightly.
 */

const fs = require('fs');
const path = require('path');

// ───────────────────────────── configuration ─────────────────────────────

const PROMO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROMO_ROOT, 'assets/shots');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4329').replace(/\/+$/, '');

// Content column is --maxw: 1160px, so a 1280 viewport leaves 60px gutters and the
// column fills exactly. 2x so the 1080p film can scale the shots up without softness.
const VIEW = { width: 1280, height: 800, deviceScaleFactor: 2 };
const PAD = 16; // css px of page colour around element shots
const DARK_PAGE_RGB = 'rgb(13, 13, 13)'; // --page in the dark theme (#0d0d0d)

const SEARCH_DEBOUNCE_MS = 100; // src/scripts/table-enhance.ts: debounce(..., 100)
const SEARCH_ROWS = 8; // rows kept in the search-N clip
const RANK_ROWS = 10; // rows kept in rank-median.png
const COMPANY = '2330';

const ALL_STEPS = ['home', 'search', 'company', 'rank'];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// ───────────────────────────── bootstrap ─────────────────────────────────

function loadPuppeteer() {
  if (process.env.PUPPETEER_DIR) {
    try {
      return require(require.resolve('puppeteer', { paths: [process.env.PUPPETEER_DIR] }));
    } catch (_) {
      /* fall through */
    }
  }
  try {
    return require('puppeteer');
  } catch (_) {
    throw new Error(
      'puppeteer not found. Set PUPPETEER_DIR to a folder containing node_modules/puppeteer (see header of this script).'
    );
  }
}

function parseSteps() {
  const a = process.argv.find((x) => x.startsWith('--only='));
  const steps = new Set(a ? a.slice(7).split(',').filter(Boolean) : ALL_STEPS);
  for (const s of steps) if (!ALL_STEPS.includes(s)) throw new Error(`unknown step "${s}"`);
  return steps;
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

/** PNG width/height straight from the IHDR chunk (no image library needed). */
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert(b.toString('latin1', 1, 4) === 'PNG', `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// ───────────────────────────── page helpers ──────────────────────────────

/**
 * Open a page of the site in dark mode and wait until it is really rendered:
 * HTTP 200, fonts loaded, every <img> decoded (the logo is loading="lazy").
 */
async function open(page, urlPath, expectH1) {
  const res = await page.goto(BASE_URL + urlPath, { waitUntil: 'load' });
  assert(res && res.status() === 200, `${urlPath} answered ${res && res.status()}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((img) =>
        img.complete && img.naturalWidth > 0
          ? null
          : new Promise((ok, no) => {
              img.addEventListener('load', ok, { once: true });
              img.addEventListener('error', () => no(new Error('image failed: ' + img.src)), { once: true });
              img.loading = 'eager';
            })
      )
    )
  );
  const info = await page.evaluate(() => ({
    h1: (document.querySelector('h1') || {}).textContent || '',
    bg: getComputedStyle(document.body).backgroundColor,
    scheme: matchMedia('(prefers-color-scheme: dark)').matches,
  }));
  assert(info.scheme && info.bg === DARK_PAGE_RGB, `${urlPath} is not in dark mode (body bg ${info.bg})`);
  if (expectH1) assert(info.h1.includes(expectH1), `${urlPath} h1 "${info.h1.trim()}" lacks "${expectH1}"`);
  await page.mouse.move(0, 0); // keep any :hover state off the rows
  await delay(150);
  return info;
}

/**
 * In-page measuring helper, exposed as window.__m. Everything is in PAGE css px
 * (viewport rect + scroll offset), which is also what page.screenshot({clip}) wants.
 */
const MEASURE_SRC = `
window.__m = {
  r(el) {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) return null;
    const round = (v) => Math.round(v * 100) / 100;
    return { x: round(b.x + scrollX), y: round(b.y + scrollY), width: round(b.width), height: round(b.height) };
  },
  text(el) { return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; },
  box(sel, root) {
    const el = (root || document).querySelector(sel);
    return el ? { text: this.text(el), rect: this.r(el) } : null;
  },
  all(sel, root) {
    return [...(root || document).querySelectorAll(sel)].map((el) => ({ text: this.text(el), rect: this.r(el) }));
  },
  /** Visible <tr> of a table with every cell labelled by its column header. */
  rows(tableSel) {
    const table = document.querySelector(tableSel);
    const heads = [...table.tHead.rows[0].cells].map((th) => this.text(th));
    return [...table.tBodies[0].rows]
      .filter((tr) => !tr.hidden && !tr.hasAttribute('data-empty'))
      .map((tr) => ({
        code: tr.cells[1] ? this.text(tr.cells[1]) : null,
        name: tr.dataset.n || this.text(tr.querySelector('.c-name a')),
        rect: this.r(tr),
        cells: [...tr.cells].map((td, i) => ({ col: heads[i], text: this.text(td), rect: this.r(td) })),
      }));
  },
};
`;

async function injectMeasure(page) {
  await page.evaluate(MEASURE_SRC);
}

/** A page-coordinate rect -> image pixels relative to the clip's top-left. */
function toImg(rect, clip, dsf) {
  if (!rect) return null;
  const f = (v) => Math.round(v * dsf);
  return {
    x: f(rect.x - clip.x),
    y: f(rect.y - clip.y),
    width: f(rect.width),
    height: f(rect.height),
  };
}
const imgBox = (b, clip, dsf) => (b ? { ...b, rect: toImg(b.rect, clip, dsf) } : null);
const imgBoxes = (arr, clip, dsf) => arr.map((b) => imgBox(b, clip, dsf));

/** Round a page-coordinate rect outward to whole css px, so 2x output is whole pixels. */
function snapClip(r) {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  return { x, y, width: Math.ceil(r.x + r.width) - x, height: Math.ceil(r.y + r.height) - y };
}
function padClip(r, pad = PAD) {
  return snapClip({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
}
function unionRect(...rs) {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.width));
  const y1 = Math.max(...rs.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

async function shoot(page, ctx, name, clip, extra) {
  const file = `${name}.png`;
  const abs = path.join(OUT_DIR, file);
  await page.screenshot({ path: abs, clip, captureBeyondViewport: true });
  const size = pngSize(abs);
  assert(
    size.width === clip.width * VIEW.deviceScaleFactor && size.height === clip.height * VIEW.deviceScaleFactor,
    `${file} is ${size.width}x${size.height}, expected ${clip.width * 2}x${clip.height * 2}`
  );
  const entry = {
    file,
    width: size.width,
    height: size.height,
    clip,
    deviceScaleFactor: VIEW.deviceScaleFactor,
    ...extra,
  };
  ctx.shots[name] = entry;
  log(`   ${file.padEnd(20)} ${size.width}x${size.height}px  clip=${JSON.stringify(clip)}`);
  return entry;
}

/** Hide the given elements while shooting a neighbour (padding would otherwise show their edge). */
async function withHidden(page, sels, fn) {
  await page.evaluate((s) => s.forEach((q) => document.querySelectorAll(q).forEach((e) => (e.style.visibility = 'hidden'))), sels);
  try {
    return await fn();
  } finally {
    await page.evaluate((s) => s.forEach((q) => document.querySelectorAll(q).forEach((e) => (e.style.visibility = ''))), sels);
  }
}

// ───────────────────────────── steps ─────────────────────────────────────

/** Homepage, first viewport exactly as a visitor lands on it. */
async function stepHome(page, ctx) {
  log('[home]');
  await open(page, '/', '哪家給最多');
  await injectMeasure(page);
  const clip = { x: 0, y: 0, width: VIEW.width, height: VIEW.height };
  const m = await page.evaluate((vh) => {
    const rows = window.__m.rows('[data-salary-table]').filter((r) => r.rect.y + r.rect.height <= vh);
    return {
      siteHeader: window.__m.box('.site-header'),
      brand: window.__m.box('.site-brand'),
      nav: window.__m.box('.site-nav'),
      yearBadge: window.__m.box('.year-badge'),
      h1: window.__m.box('.hero h1'),
      tagline: window.__m.box('.tagline'),
      chips: [...document.querySelectorAll('.chip')].map((c) => ({
        label: window.__m.box('.chip-label', c),
        value: window.__m.box('.chip-value', c),
        sub: window.__m.box('.chip-sub', c),
        rect: window.__m.r(c),
      })),
      controls: window.__m.box('.controls'),
      searchBox: window.__m.box('#q'),
      industrySelect: window.__m.box('#ind'),
      marketSeg: window.__m.box('.seg'),
      count: window.__m.box('.count'),
      tableWrap: { rect: window.__m.r(document.querySelector('.salary-table')) }, // rect only: its text is the whole table
      tableHead: window.__m.box('.salary-table thead'),
      rows,
    };
  }, VIEW.height);
  const d = VIEW.deviceScaleFactor;
  const boxes = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'chips')
      boxes.chips = v.map((c) => ({
        label: imgBox(c.label, clip, d),
        value: imgBox(c.value, clip, d),
        sub: imgBox(c.sub, clip, d),
        rect: toImg(c.rect, clip, d),
      }));
    else if (k === 'rows')
      boxes.rows = v.map((r) => ({
        code: r.code,
        name: r.name,
        rect: toImg(r.rect, clip, d),
        cells: r.cells.map((c) => ({ col: c.col, text: c.text, rect: toImg(c.rect, clip, d) })),
      }));
    else boxes[k] = imgBox(v, clip, d);
  }
  await shoot(page, ctx, 'home', clip, {
    page: '/',
    note: 'First viewport of the homepage (header, hero, KPI chips, search row, first table rows).',
    visibleRowCount: boxes.rows.length,
    rowNames: boxes.rows.map((r) => r.name),
    boxes,
  });
}

/**
 * Same clip, three states: empty -> "台" -> "台積". The clip is derived ONCE (from the empty
 * state: .controls top-left padded by PAD, bottom at the 8th row) and reused verbatim, so
 * the three PNGs are pixel-identical in size and every static pixel lines up for cross-fades.
 * Focus stays in #q for all three (focus ring on, caret hidden so no blink phase leaks in).
 */
async function stepSearch(page, ctx) {
  log('[search]');
  await open(page, '/', '哪家給最多');
  await injectMeasure(page);
  await page.addStyleTag({ content: '#q { caret-color: transparent; }' });
  await page.focus('#q');
  await delay(200);

  const base = await page.evaluate((n) => {
    const rows = window.__m.rows('[data-salary-table]');
    return { controls: window.__m.r(document.querySelector('.controls')), chips: window.__m.r(document.querySelector('.chips')), row: rows[n - 1].rect };
  }, SEARCH_ROWS);
  const left = base.controls.x - PAD;
  const top = base.controls.y - PAD;
  assert(top >= base.chips.y + base.chips.height, 'search clip top would overlap the KPI chips');
  const clip = snapClip({
    x: left,
    y: top,
    width: base.controls.width + PAD * 2,
    height: base.row.y + base.row.height - top,
  });
  const d = VIEW.deviceScaleFactor;

  const states = [
    { name: 'search-0', typed: '', type: null },
    { name: 'search-1', typed: '台', type: '台' },
    { name: 'search-2', typed: '台積', type: '積' },
  ];
  for (const st of states) {
    if (st.type) {
      const before = await page.evaluate(() => document.querySelector('[data-count]').textContent);
      await page.type('#q', st.type, { delay: 80 });
      // debounce (100ms) + the filter re-render; the count chip changing proves table-enhance ran
      await delay(SEARCH_DEBOUNCE_MS + 150);
      await page.waitForFunction((b) => document.querySelector('[data-count]').textContent !== b, { timeout: 5000 }, before);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await delay(250);
    }
    const m = await page.evaluate(() => ({
      query: document.querySelector('#q').value,
      url: location.search,
      count: window.__m.text(document.querySelector('.count')),
      countRect: window.__m.r(document.querySelector('.count')),
      searchBox: window.__m.box('#q'),
      controls: window.__m.box('.controls'),
      tableWrap: { rect: window.__m.r(document.querySelector('.salary-table')) }, // rect only: its text is the whole table
      tableHead: window.__m.box('.salary-table thead'),
      note: window.__m.box('.table-note'),
      rows: window.__m.rows('[data-salary-table]'),
    }));
    assert(m.query === st.typed, `#q holds "${m.query}", expected "${st.typed}"`);
    const inClip = m.rows.filter((r) => r.rect.y + r.rect.height <= clip.y + clip.height + 0.5);
    for (const r of m.rows) {
      assert(st.typed === '' || r.name.includes(st.typed) || r.code.startsWith(st.typed), `row "${r.name}" does not match "${st.typed}"`);
    }
    if (st.typed === '台積') assert(inClip.length > 0 && inClip.every((r) => r.name.includes('台積')), 'search-2 rows must all contain 台積');
    await shoot(page, ctx, st.name, clip, {
      page: '/',
      note: 'Same clip in all three search shots: .controls through the 8th row of the unfiltered table.',
      query: st.typed,
      countText: m.count,
      visibleRowCountTotal: m.rows.length,
      visibleRowCountInClip: inClip.length,
      rowNames: inClip.map((r) => r.name),
      boxes: {
        searchBox: imgBox(m.searchBox, clip, d),
        controls: imgBox(m.controls, clip, d),
        count: toImg(m.countRect, clip, d),
        tableWrap: imgBox(m.tableWrap, clip, d),
        tableHead: imgBox(m.tableHead, clip, d),
        tableNote: imgBox(m.note, clip, d),
        rows: inClip.map((r) => ({
          code: r.code,
          name: r.name,
          rect: toImg(r.rect, clip, d),
          cells: r.cells.map((c) => ({ col: c.col, text: c.text, rect: toImg(c.rect, clip, d) })),
        })),
      },
    });
  }
  const sizes = new Set(states.map((s) => `${ctx.shots[s.name].width}x${ctx.shots[s.name].height}`));
  assert(sizes.size === 1, `search shots differ in size: ${[...sizes].join(' vs ')}`);
}

/** /company/2330/ - four shots of one page. */
async function stepCompany(page, ctx) {
  log('[company]');
  await open(page, `/company/${COMPANY}/`, '台積電');
  await injectMeasure(page);
  const d = VIEW.deviceScaleFactor;

  // ── head: crumb + logo + name + badges + subline + the four stat cards
  {
    const m = await page.evaluate(() => ({
      head: window.__m.r(document.querySelector('.c-head')),
      statsWrap: window.__m.r(document.querySelector('.stats')),
      statYear: window.__m.box('.stat-year'),
      crumb: window.__m.box('.crumb'),
      logo: window.__m.box('.c-logo'),
      logoKind: document.querySelector('.c-logo').tagName === 'IMG' ? 'logo-image' : 'monogram',
      h1: window.__m.box('.c-head h1'),
      code: window.__m.box('.c-head h1 .code'),
      badges: window.__m.all('.badges .badge'),
      subline: window.__m.box('.subline'),
      stats: [...document.querySelectorAll('.stats .stat')].map((s) => ({
        label: window.__m.box('.stat-label', s),
        value: window.__m.box('.stat-value', s),
        sub: window.__m.box('.stat-sub', s),
        rect: window.__m.r(s),
      })),
    }));
    const clip = padClip(unionRect(m.head, m.statsWrap));
    await shoot(page, ctx, 'company-head', clip, {
      page: `/company/${COMPANY}/`,
      note: 'c-head (crumb, logo, name, badges, subline) + stat-year label + the four .stat cards.',
      logoKind: m.logoKind,
      boxes: {
        head: toImg(m.head, clip, d),
        crumb: imgBox(m.crumb, clip, d),
        logo: imgBox(m.logo, clip, d),
        h1: imgBox(m.h1, clip, d),
        code: imgBox(m.code, clip, d),
        badges: imgBoxes(m.badges, clip, d),
        subline: imgBox(m.subline, clip, d),
        statYear: imgBox(m.statYear, clip, d),
        statsWrap: toImg(m.statsWrap, clip, d),
        stats: m.stats.map((s) => ({
          label: imgBox(s.label, clip, d),
          value: imgBox(s.value, clip, d),
          sub: imgBox(s.sub, clip, d),
          rect: toImg(s.rect, clip, d),
        })),
      },
    });
  }

  // ── trend: the whole <section class="block"> around figure.trend (h2 + SVG)
  {
    const m = await page.evaluate(() => {
      const fig = document.querySelector('figure.trend');
      const section = fig.closest('section.block');
      const svg = fig.querySelector('svg');
      const ctm = svg.getScreenCTM();
      const pt = (x, y) => {
        const p = svg.createSVGPoint();
        p.x = x;
        p.y = y;
        const q = p.matrixTransform(ctm);
        return { x: Math.round((q.x + scrollX) * 100) / 100, y: Math.round((q.y + scrollY) * 100) / 100 };
      };
      const grid = [...svg.querySelectorAll('.grid line')].map((l) => ({
        x1: +l.getAttribute('x1'),
        x2: +l.getAttribute('x2'),
        y: +l.getAttribute('y1'),
      }));
      const gx0 = Math.min(...grid.map((g) => g.x1));
      const gx1 = Math.max(...grid.map((g) => g.x2));
      const gy0 = Math.min(...grid.map((g) => g.y));
      const gy1 = Math.max(...grid.map((g) => g.y));
      const a = pt(gx0, gy0);
      const b = pt(gx1, gy1);
      const series = [...svg.querySelectorAll('.series')].map((g) => {
        const points = [...g.querySelectorAll('circle.dot')].map((c) => {
          const t = c.querySelector('title').textContent; // "<year> 年度：<label> <wan> 萬"
          const mm = t.match(/^(\d+) 年度：(.+?) ([\d,.]+) 萬$/);
          return { year: +mm[1], label: mm[2], valueWan: +mm[3].replace(/,/g, ''), ...pt(+c.getAttribute('cx'), +c.getAttribute('cy')) };
        });
        const poly = g.querySelector('polyline.line');
        return {
          label: points.length ? points[0].label : null,
          variant: g.classList.contains('is-primary') ? 'primary' : 'secondary',
          line: poly
            ? poly.getAttribute('points').trim().split(/\s+/).map((s) => {
                const [x, y] = s.split(',').map(Number);
                return pt(x, y);
              })
            : [],
          points,
        };
      });
      const tickPos = (t) => {
        const b2 = t.getBoundingClientRect();
        return {
          text: t.textContent.trim(),
          rect: { x: b2.x + scrollX, y: b2.y + scrollY, width: b2.width, height: b2.height },
        };
      };
      return {
        section: window.__m.r(section),
        h2: window.__m.box('h2', section),
        svg: window.__m.r(svg),
        plot: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
        yTicks: [...svg.querySelectorAll('.ytick')].map(tickPos),
        xTicks: [...svg.querySelectorAll('.xtick')].map(tickPos),
        endLabels: [...svg.querySelectorAll('.end-label')].map(tickPos),
        series,
      };
    });
    const clip = padClip(m.section);
    // a page-coordinate point -> image px
    const pt2 = (p) => {
      const q = toImg({ x: p.x, y: p.y, width: 0, height: 0 }, clip, d);
      return { x: q.x, y: q.y };
    };
    await shoot(page, ctx, 'company-trend', clip, {
      page: `/company/${COMPANY}/`,
      note: 'section.block holding h2 "歷年薪資趨勢" + figure.trend (760x240 viewBox SVG scaled to the column). Points/line are in image px.',
      boxes: {
        section: toImg(m.section, clip, d),
        h2: imgBox(m.h2, clip, d),
        svg: toImg(m.svg, clip, d),
        plotArea: toImg(m.plot, clip, d),
        yTicks: imgBoxes(m.yTicks, clip, d),
        xTicks: imgBoxes(m.xTicks, clip, d),
        endLabels: imgBoxes(m.endLabels, clip, d),
        series: m.series.map((s) => ({
          label: s.label,
          variant: s.variant,
          line: s.line.map(pt2),
          points: s.points.map((p) => ({ year: p.year, valueWan: p.valueWan, ...pt2(p) })),
        })),
      },
    });
  }

  // ── gender + percentile cards: shot one at a time, neighbour hidden (grid gap 14px < PAD)
  for (const [name, sel, other, note] of [
    ['company-gender', 'section.gender', 'section.pctl', 'GenderCard (男女薪資).'],
    ['company-pctl', 'section.pctl', 'section.gender', 'PercentileBar (薪資位置).'],
  ]) {
    const m = await page.evaluate(
      (s) => ({
        card: window.__m.r(document.querySelector(s)),
        h2: window.__m.box('h2', document.querySelector(s)),
        text: window.__m.text(document.querySelector(s)),
        parts: window.__m.all('.gcol, .grow, .gratio, .gcaveat, .pctl-row, .pctl-track, .pctl-fill, .pctl-num', document.querySelector(s)),
      }),
      sel
    );
    assert(m.card, `${sel} not found on /company/${COMPANY}/`);
    const clip = padClip(m.card);
    await withHidden(page, [other], () =>
      shoot(page, ctx, name, clip, {
        page: `/company/${COMPANY}/`,
        note,
        text: m.text,
        boxes: {
          card: toImg(m.card, clip, d),
          h2: imgBox(m.h2, clip, d),
          parts: imgBoxes(m.parts, clip, d),
        },
      })
    );
  }
}

/** /rank/median/ - table header + first 10 rows. */
async function stepRank(page, ctx) {
  log('[rank]');
  await open(page, '/rank/median/', '員工薪資中位數 Top 100');
  await injectMeasure(page);
  const d = VIEW.deviceScaleFactor;
  const m = await page.evaluate((n) => {
    const rows = window.__m.rows('.rank-table table');
    return {
      wrap: window.__m.r(document.querySelector('.rank-table')),
      head: window.__m.box('.rank-table thead'),
      rows: rows.slice(0, n),
      total: rows.length,
    };
  }, RANK_ROWS);
  // top/left/right padded like the other shots; bottom cuts exactly at the end of row 10
  const last = m.rows[m.rows.length - 1].rect;
  const clip = snapClip({
    x: m.wrap.x - PAD,
    y: m.wrap.y - PAD,
    width: m.wrap.width + PAD * 2,
    height: last.y + last.height - (m.wrap.y - PAD),
  });
  // .rank-note sits only 14px above the table, so the 16px top padding would clip its last
  // pixels into the shot; hide it (and the tabs) while shooting.
  await withHidden(page, ['.rank-note', '.tabs'], () =>
    shoot(page, ctx, 'rank-median', clip, {
      page: '/rank/median/',
      note: `Ranking table (thead + first ${RANK_ROWS} of ${m.total} rows); page heading/tabs are not in the shot.`,
      rowNames: m.rows.map((r) => r.name),
      boxes: {
        tableWrap: toImg(m.wrap, clip, d),
        tableHead: imgBox(m.head, clip, d),
        rows: m.rows.map((r) => ({
          code: r.code,
          name: r.name,
          rect: toImg(r.rect, clip, d),
          cells: r.cells.map((c) => ({ col: c.col, text: c.text, rect: toImg(c.rect, clip, d) })),
        })),
      },
    })
  );
}

// ───────────────────────────── main ──────────────────────────────────────

async function main() {
  const steps = parseSteps();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const puppeteer = loadPuppeteer();

  log(`哪家給最多 promo capture  (steps: ${[...steps].join(',')})`);
  log(`site:   ${BASE_URL}\noutput: ${OUT_DIR}`);

  const browser = await puppeteer.launch({
    headless: process.env.HEADFUL ? false : true,
    defaultViewport: null,
    args: ['--force-color-profile=srgb', '--hide-scrollbars', `--window-size=${VIEW.width},${VIEW.height + 120}`],
  });

  const ctx = { shots: {} };
  let chromeVersion = null;
  let chromePath = null;
  try {
    chromeVersion = await browser.version();
    chromePath = await puppeteer.executablePath();
    log(`chrome: ${chromeVersion}\n        ${chromePath}\n`);

    const page = await browser.newPage();
    await page.setViewport(VIEW);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.setCacheEnabled(false); // always a fresh 200, never a 304
    // Fail fast if the preview server is down, and keep the run offline-deterministic: the
    // production build adds a Cloudflare Web Analytics beacon, which must not be fetched.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith(BASE_URL) || req.url().startsWith('data:')) req.continue();
      else req.abort();
    });
    page.on('pageerror', (e) => log('   [pageerror]', e.message));

    if (steps.has('home')) await stepHome(page, ctx);
    if (steps.has('search')) await stepSearch(page, ctx);
    if (steps.has('company')) await stepCompany(page, ctx);
    if (steps.has('rank')) await stepRank(page, ctx);
  } finally {
    await browser.close();
  }

  // assemble manifest (merge so partial runs keep the other shots)
  const prev = readManifest();
  const manifest = {
    note:
      'Real 哪家給最多 site in DARK mode (body background #0d0d0d). PNGs are 2x. clip = css px of the page the PNG was cropped from; every box/rect/point is in IMAGE pixels relative to that PNG top-left (so overlay positions in the 1920x1080 film = box * film scale). Shots are not edited after capture.',
    capturedAt: new Date().toISOString().slice(0, 10),
    baseUrl: BASE_URL,
    chrome: chromeVersion, // version only: the local binary path is machine-specific
    colorScheme: 'dark',
    pageColor: '#0d0d0d',
    viewport: VIEW,
    padding: PAD,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
    shots: { ...(prev.shots || {}), ...ctx.shots },
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  let bytes = 0;
  for (const f of fs.readdirSync(OUT_DIR)) bytes += fs.statSync(path.join(OUT_DIR, f)).size;
  log(`\nmanifest: ${MANIFEST_PATH}`);
  log(`assets/shots total: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error('\ncapture failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
