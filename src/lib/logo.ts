// Company-logo resolution shared by the OG-card generator (scripts/og-companies.ts)
// and the on-page <CompanyLogo> component. A real logo lives in public/logos/{code}.*
// (hand-curated for well-known companies); everything else falls back to a monogram
// tile derived deterministically from the company's name + code, so every company —
// famous or obscure — gets a consistent branded mark with zero external dependencies.
//
// resolveLogo() touches the filesystem, so it is build-time only (the OG script runs
// under tsx; the .astro components that call it run during `astro build`, never in the
// browser). Do not import this module from client-side scripts.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Logo file extensions we accept, best-quality first. */
const LOGO_EXTS = ['svg', 'png', 'webp', 'jpg', 'jpeg'] as const;

export interface ResolvedLogo {
  /** Absolute path on disk, for the OG script to read + embed. */
  file: string;
  /** Site-relative URL, for an <img src> on the page. */
  url: string;
  ext: string;
}

/**
 * Look for a hand-curated logo at public/logos/{code}.{svg,png,webp,jpg}.
 * Returns the first match (by LOGO_EXTS order) or null when the company has no
 * real logo and should fall back to a monogram tile. process.cwd() is the repo
 * root during both `tsx scripts/…` and `astro build`.
 */
export function resolveLogo(code: string): ResolvedLogo | null {
  const dir = join(process.cwd(), 'public', 'logos');
  for (const ext of LOGO_EXTS) {
    const file = join(dir, `${code}.${ext}`);
    if (existsSync(file)) return { file, url: `/logos/${code}.${ext}`, ext };
  }
  return null;
}

/**
 * Deterministic hue (0–359) from the stock code, so each monogram tile has its own
 * stable colour across regenerations. Same simple string hash the prototype used.
 */
export function hueForCode(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * The 1–2 glyphs shown on a monogram tile: the first two characters of the company
 * name (e.g. 台積電 → 台積, 信驊 → 信驊, M31 → M3). Chinese names read best with two
 * characters; the tile font size adapts to the length in the caller.
 */
export function monogramText(name: string): string {
  return [...name].slice(0, 2).join('');
}
