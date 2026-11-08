// Page-size industry icons, derived from the 512px AI illustrations.
//
// For every industry in INDUSTRY_SLUGS this downsizes docs/design/art/industries/{slug}.webp
// into public/industry-art/{slug}-{64,160}.webp (webp q80, metadata stripped). 64px backs the
// 28px table icon on /industry/, 160px backs the 80px icon on /industry/{name}/ — each 2× its
// CSS size for retina. A missing master only logs a warning and is skipped, so a partial art
// set never fails the run; the pages simply render no icon for that industry.
//
// This is a LOCAL, committed generation step — Cloudflare Pages has no ImageMagick, so the
// outputs are generated here and committed under public/. Re-run after adding or replacing a
// master illustration, or after INDUSTRY_SLUGS / ICON_SIZES change:
//   pnpm exec tsx scripts/industry-icons.ts      (or: pnpm art:build, which also builds OG cards)
//
// Requires: magick (ImageMagick 7) on PATH.

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ICON_SIZES, INDUSTRY_SLUGS, industryArtMaster } from '../src/lib/industry-art';

const OUT_DIR = join(process.cwd(), 'public', 'industry-art');

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  const missing: string[] = [];
  for (const [name, slug] of Object.entries(INDUSTRY_SLUGS)) {
    const master = industryArtMaster(name);
    if (!master) {
      console.warn(`WARN no master illustration for ${name} (${slug}) — skipped`);
      missing.push(slug);
      continue;
    }
    for (const size of ICON_SIZES) {
      execFileSync('magick', [
        master,
        '-resize',
        `${size}x${size}`,
        '-strip',
        '-define',
        'webp:method=6',
        '-quality',
        '80',
        join(OUT_DIR, `${slug}-${size}.webp`),
      ]);
      written++;
    }
  }

  const total = Object.keys(INDUSTRY_SLUGS).length;
  console.log(
    `Generated ${written} icon(s) for ${total - missing.length}/${total} industries → public/industry-art/` +
      (missing.length ? `  (missing masters: ${missing.join(', ')})` : ''),
  );
}

main();
