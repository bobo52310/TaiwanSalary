import type { APIRoute } from 'astro';

// Emitted to /robots.txt at build time. The Sitemap line is derived from the
// configured `site` (astro.config.mjs) so the domain lives in exactly one place;
// files in public/ can't template, which is why this is a route, not a static file.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site).href;
  const body = `User-agent: *
Allow: /

Sitemap: ${sitemap}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
