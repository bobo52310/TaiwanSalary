// @ts-check
import { defineConfig } from 'astro/config';

// Pure static site deployed to Cloudflare Pages — no adapter.
// `site` is a placeholder until the final domain is decided.
export default defineConfig({
  site: 'https://taiwansalary.pages.dev',
  trailingSlash: 'always',
  output: 'static',
});
