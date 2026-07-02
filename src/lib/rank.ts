// Ranking logic shared by the three /rank/ pages. All three rank latest-year
// (114) companies by a single metric, keep only companies with a reported
// headcount of at least 30, and take the top 100. Kept out of the .astro page so
// the eligibility rule and the excluded-count live in one place.

import type { CompaniesFile, CompanyRecord, CompanyYearData, Market } from './types';

export type RankMetric = 'median' | 'average' | 'raise';

/** Companies with fewer than this many employees are too small to rank meaningfully. */
export const MIN_EMPLOYEES = 30;

export interface RankRow {
  rank: number;
  code: string;
  name: string;
  industry: string;
  market: Market;
  medianK: number | null;
  avgK: number | null;
  /** Real YoY change (already normalized to null for first-appearance years). */
  medianChangePct: number | null;
  /** Prior-year median (仟元), for the 調薪 page's 前一年中位數 column. */
  medianPrevK: number | null;
  /** Non-null: rows without a reported headcount are filtered out before ranking. */
  employees: number;
}

export interface Ranking {
  /** Top 100, highest metric first; ties break by ascending code for a stable order. */
  rows: RankRow[];
  /** Companies that carry the metric but are dropped by the ≥30-employee rule. */
  excluded: number;
}

/** The value a page ranks by. Null means the company can't be ranked on this page. */
function metricValue(y: CompanyYearData, metric: RankMetric): number | null {
  switch (metric) {
    case 'median':
      return y.medianK;
    case 'average':
      return y.avgK;
    case 'raise':
      return y.medianChangePct;
  }
}

export function buildRanking(file: CompaniesFile, metric: RankMetric): Ranking {
  const latest = String(file.meta.latestYear);

  // Every latest-year company that has a value to rank on this page.
  const candidates: { c: CompanyRecord; y: CompanyYearData; v: number }[] = [];
  for (const c of Object.values(file.companies)) {
    const y = c.years[latest];
    if (!y) continue;
    const v = metricValue(y, metric);
    if (v == null) continue;
    candidates.push({ c, y, v });
  }

  const eligible = candidates.filter(
    (x) => x.y.employees != null && x.y.employees >= MIN_EMPLOYEES,
  );
  const excluded = candidates.length - eligible.length;

  eligible.sort((a, b) => b.v - a.v || a.c.code.localeCompare(b.c.code));

  const rows: RankRow[] = eligible.slice(0, 100).map((x, i) => ({
    rank: i + 1,
    code: x.c.code,
    name: x.c.name,
    industry: x.c.industry,
    market: x.c.market,
    medianK: x.y.medianK,
    avgK: x.y.avgK,
    medianChangePct: x.y.medianChangePct,
    medianPrevK: x.y.medianPrevK,
    employees: x.y.employees as number, // guaranteed by the filter above
  }));

  return { rows, excluded };
}
