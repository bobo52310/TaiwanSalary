// One-off / refreshable tool: download company logos from Wikimedia into public/logos/.
//
// Source of truth is Wikidata property P154 ("logo image"): for each curated company
// we resolve its zhwiki article → Wikidata entity → P154 Commons filename, then pull a
// rasterised PNG via Special:FilePath?width= (so SVG logos come back as clean PNGs and
// need no local SVG renderer). Only well-known brands are listed here; every other
// company falls back to the monogram tile (see src/lib/logo.ts), so misses are harmless.
//
// Wikimedia asks for a descriptive User-Agent and polite request rates, so this runs
// SERIALLY with a delay between companies. It is idempotent: a code whose logo already
// exists in public/logos/ is skipped, so you can re-run to fill only the gaps.
//
//   npx tsx scripts/fetch-logos.ts            # fetch all missing
//   npx tsx scripts/fetch-logos.ts --force    # re-fetch even if present
//
// After running, regenerate the cards:  npm run og:build
// NOTE: needs network (run outside any network sandbox) + magick on PATH.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'TaiwanSalary-logo-fetcher/1.0 (https://salary.bobochen.dev; personal project)';
const OUT = join(process.cwd(), 'public', 'logos');
const FORCE = process.argv.includes('--force');

// code → zh.wikipedia article title. Curated for recognisable top-100 brands.
const TITLES: Record<string, string> = {
  '2330': '台積電', '2454': '聯發科技', '2317': '鴻海精密', '2308': '台達電子',
  '2382': '廣達電腦', '2357': '華碩', '2303': '聯華電子', '2412': '中華電信',
  '2379': '瑞昱半導體', '3034': '聯詠科技', '8299': '群聯電子', '2345': '智邦科技',
  '2344': '華邦電子', '2388': '威盛電子', '2458': '義隆電子', '2603': '長榮海運',
  '2618': '長榮航空', '2610': '中華航空', '2615': '萬海航運',
  // 2609 陽明海運 intentionally omitted: its only Wikidata/infobox image is an HQ photo,
  // not a clean logo — it falls back to a monogram tile instead.
  '2606': '裕民航運', '2207': '和泰汽車', '2882': '國泰金融控股', '2881': '富邦金融控股',
  '2891': '中國信託金融控股', '2886': '兆豐金融控股', '2885': '元大金融控股',
  '2385': '群光電子', '3005': '神基科技', '6669': '緯穎科技', '3293': '鈊象電子',
  '3443': '創意電子', '3529': '力旺電子', '3227': '原相科技', '3035': '智原科技',
  '3515': '華擎科技', '3260': '威剛科技', '5434': '崇越科技', '6561': '是方電訊',
  '6757': '臺灣虎航', '4915': '致伸科技', '2404': '漢唐集成', '1519': '華城電機',
  '5522': '遠雄建設', '2548': '華固建設', '2013': '中鋼構股份有限公司',
};

// Manual filename overrides: companies whose logo has no Wikidata P154 and whose file
// isn't named "…logo…", so auto-detection can't find it. Values are Commons/zhwiki filenames.
const OVERRIDES: Record<string, string> = {
  '2881': 'Fubon Financial Holding.svg',
  '2886': 'Mega Holdings.svg',
  '2891': 'China Trust.svg',
  '6669': 'Wiwynn NAME Blue Green.svg',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * zhwiki title → Wikidata P154 Commons filename (or null).
 * Two steps because wbgetentities matches titles against Wikidata *sitelinks* (canonical
 * article titles) and won't follow wiki redirects — but many short brand names ARE
 * redirects. zhwiki's own API resolves the redirect for us (redirects=1), giving the
 * canonical entity id, which we then query for P154.
 */
async function qidForTitle(title: string): Promise<string | null> {
  const url =
    `https://zh.wikipedia.org/w/api.php?action=query&format=json&redirects=1` +
    `&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(title)}`;
  const j: any = await (await fetch(url, { headers: { 'user-agent': UA } })).json();
  const page = Object.values(j.query?.pages ?? {})[0] as any;
  return page?.pageprops?.wikibase_item ?? null;
}

async function p154Filename(title: string): Promise<string | null> {
  const qid = await qidForTitle(title);
  if (!qid) return null;
  await sleep(400);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${qid}&property=P154`;
  const j: any = await (await fetch(url, { headers: { 'user-agent': UA } })).json();
  const v = j.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' ? v : null;
}

/**
 * Fallback when P154 is empty: scan the zhwiki article's images for a logo-named file.
 * Coarse but effective for company infoboxes ("… logo.svg"); wrong picks are caught in
 * the montage QA and deleted (reverting to a monogram).
 */
async function articleLogoFilename(title: string): Promise<string | null> {
  const url =
    `https://zh.wikipedia.org/w/api.php?action=query&format=json&redirects=1` +
    `&prop=images&imlimit=200&titles=${encodeURIComponent(title)}`;
  const j: any = await (await fetch(url, { headers: { 'user-agent': UA } })).json();
  const page = Object.values(j.query?.pages ?? {})[0] as any;
  const names: string[] = (page?.images ?? []).map((i: any) => String(i.title).replace(/^(File|檔案|文件):/, ''));
  const isChrome = (n: string) =>
    /commons-logo|wikimedia|wiki\.png|edit-|OOjs|Ambox|Question_|Symbol|Flag_of|Red_x|padlock|Increase|Decrease|Wikinews|Crystal|磁盤|Emblem/i.test(n);
  const cand = names.filter((n) => /(logo|標誌|logotype|wordmark)/i.test(n) && /\.(svg|png)$/i.test(n) && !isChrome(n));
  return cand[0] ?? null;
}

async function logoFilename(title: string): Promise<string | null> {
  const p154 = await p154Filename(title);
  if (p154) return p154;
  await sleep(400);
  return articleLogoFilename(title);
}

/**
 * Download a file rasterised to ~800px; return a PNG/image buffer or null.
 * Tries zhwiki first because non-free company logos are uploaded LOCALLY to zhwiki
 * (Commons bans non-free), and zhwiki's FilePath also resolves Commons files via the
 * foreign-repo link — so one host covers both. Commons is kept as a backstop.
 */
async function fetchLogoPng(filename: string): Promise<Buffer | null> {
  for (const host of ['https://zh.wikipedia.org', 'https://commons.wikimedia.org']) {
    const url = `${host}/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=800`;
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
      return Buffer.from(await res.arrayBuffer());
    }
  }
  return null;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const codes = Object.keys(TITLES);
  let saved = 0;
  const misses: string[] = [];

  for (const code of codes) {
    if (!FORCE && existsSync(join(OUT, `${code}.png`))) {
      continue;
    }
    const title = TITLES[code];
    try {
      const fn = OVERRIDES[code] ?? (await logoFilename(title));
      if (!fn) { misses.push(`${code} ${title} (no P154)`); await sleep(1200); continue; }
      await sleep(500);
      const buf = await fetchLogoPng(fn);
      if (!buf) { misses.push(`${code} ${title} (download failed: ${fn})`); await sleep(1200); continue; }
      // Normalise to a trimmed, alpha PNG so tiles are consistent regardless of source padding.
      const png = execFileSync(
        'magick',
        ['-', '-fuzz', '6%', '-trim', '+repage', '-resize', '512x512', '-background', 'none', '-strip', 'png:-'],
        { input: buf, maxBuffer: 64 * 1024 * 1024 },
      );
      writeFileSync(join(OUT, `${code}.png`), png);
      saved++;
      console.log(`✓ ${code} ${title} → ${fn}`);
    } catch (e) {
      misses.push(`${code} ${title} (error: ${(e as Error).message})`);
    }
    await sleep(1300); // be polite to Wikimedia
  }

  console.log(`\nSaved ${saved} logo(s) to public/logos/. ${misses.length} miss(es):`);
  for (const m of misses) console.log(`  · ${m}`);
  console.log('\nMisses fall back to a monogram tile. Next: npm run og:build');
}

main();
