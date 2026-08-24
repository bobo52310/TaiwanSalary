import type { APIRoute } from 'astro';

// Emitted to /robots.txt at build time. This is a route rather than a static
// file in public/ because public/ can't template the domain.
//
// The `Sitemap:` line is deliberately omitted. This host shares the
// sc-domain:bobochen.dev Search Console property with the blog and ~10 other
// subdomains, and its sitemap lists ~1,888 generated company pages — more than
// five times the blog's 353. Declaring it here makes Google re-discover and
// re-list that sitemap even after it is removed in Search Console, which is
// exactly what happened on 2026-08-24.
//
// Crawling still works: the site is fully internally linked from its index
// pages. If this site ever needs sitemap-driven indexing of its own, give it a
// separate URL-prefix property first, then restore the Sitemap line — it was
// built from `new URL('sitemap-index.xml', site).href` off the APIRoute's
// `site` param.
export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
