// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Pure static site deployed to Cloudflare Pages — no adapter.
// `site` is a placeholder until the final domain is decided; every absolute URL
// (canonical, OG, sitemap, robots, JSON-LD) derives from it, so a domain change
// is a one-line edit here.
export default defineConfig({
  site: 'https://salary.bobochen.dev',
  trailingSlash: 'always',
  output: 'static',
  integrations: [sitemap()],
});
