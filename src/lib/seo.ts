// Typed JSON-LD builders. Each returns a plain object that a page serializes with
// JSON.stringify into a <script type="application/ld+json" slot="head">. Keeping
// the shapes here (not inline in .astro) means the breadcrumb/list structure is
// written once and every page stays consistent.
//
// `site` is Astro.site (always set in astro.config.mjs, but typed URL | undefined);
// all URLs are resolved against it so nothing hardcodes the domain.

import type { Faq } from './faq';

type JsonLd = Record<string, unknown>;

function abs(site: URL | undefined, path: string): string {
  return new URL(path, site).href;
}

export interface Crumb {
  name: string;
  /** Site-relative path, e.g. "/industry/半導體業/". */
  path: string;
}

/** BreadcrumbList: 首頁 → … → current page. */
export function breadcrumbList(site: URL | undefined, crumbs: Crumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(site, c.path),
    })),
  };
}

export interface ListEntry {
  name: string;
  path: string;
}

/** ItemList of named links (e.g. a ranking's top N companies). */
export function itemList(site: URL | undefined, entries: ListEntry[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.name,
      url: abs(site, e.path),
    })),
  };
}

/** FAQPage built from the shared faqs array. */
export function faqPage(faqs: Faq[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/**
 * WebSite for the homepage. Includes a SearchAction pointing at `/?q=…` — the
 * homepage reads ?q on load and pre-filters the company table, so this is a real
 * query entry point, not a decorative one.
 */
export function website(
  site: URL | undefined,
  opts: { name: string; description: string },
): JsonLd {
  const home = abs(site, '/');
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: opts.name,
    url: home,
    description: opts.description,
    inLanguage: 'zh-Hant',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${home}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
