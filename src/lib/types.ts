// Shared types for the MOPS salary data pipeline and the site.
// Salary amounts are in 仟元 (thousands of NT$) as published by MOPS, unless noted.

export type Market = 'sii' | 'otc';

export const MARKETS: readonly Market[] = ['sii', 'otc'];

/**
 * One non-manager-salary company row parsed from a MOPS t100sb15 table.
 * Numeric fields are `null` when the source cell is a null marker (不適用, -, empty).
 * Gender fields are optional: they are omitted (not set to null) for years whose
 * layout has no gender breakdown (see layouts.ts `hasGender`).
 */
export interface YearFileRow {
  code: string;
  name: string;
  industry: string;
  totalPayrollK: number | null;
  employees: number | null;
  avgK: number | null;
  avgPrevK: number | null;
  avgChangePct: number | null;
  medianK: number | null;
  medianPrevK: number | null;
  medianChangePct: number | null;
  eps: number | null;
  maleAvgK?: number | null;
  femaleAvgK?: number | null;
  maleMedianK?: number | null;
  femaleMedianK?: number | null;
  peerAvgK: number | null;
  peerEps: number | null;
  flagLowPay: boolean | null;
  flagEpsHighPayLow: boolean | null;
  flagEpsUpPayDown: boolean | null;
  note: string | null;
  improvement: string | null;
}

/** Market-total ("全體上市/上櫃公司合計") row for one year+market. */
export interface MarketTotal {
  label: string;
  totalPayrollK: number | null;
  employees: number | null;
  avgK: number | null;
  /** Raw cleaned cells, kept for debugging / future layout changes. */
  rawCells: string[];
}

/** Parsed output for a single year+market: src/data/years/{year}-{market}.json */
export interface YearFile {
  year: number;
  market: Market;
  /** ISO timestamp derived from the cache file mtime. */
  fetchedAt: string;
  marketTotal: MarketTotal | null;
  rows: YearFileRow[];
}

/** Per-year data stored inside a CompanyRecord, enriched with percentiles. */
export interface CompanyYearData extends YearFileRow {
  market: Market;
  /** 0-100, 1 decimal: share of same-year same-market companies with strictly lower medianK. Null if medianK null. */
  medianPctlMarket: number | null;
  /** 0-100, 1 decimal: share of same-year same-industry companies with strictly lower medianK. Null if medianK null. */
  medianPctlIndustry: number | null;
}

/** One company across all years it appears in. Canonical fields come from the newest year. */
export interface CompanyRecord {
  code: string;
  name: string;
  industry: string;
  market: Market;
  years: Record<string, CompanyYearData>;
}

export interface CompaniesMeta {
  latestYear: number;
  generatedAt: string;
  counts: {
    companies: number;
    byMarket: Record<Market, number>;
    byYear: Record<string, number>;
  };
}

/** src/data/companies.json */
export interface CompaniesFile {
  meta: CompaniesMeta;
  companies: Record<string, CompanyRecord>;
}

export interface IndustryYearStat {
  count: number;
  avgOfAvgK: number | null;
  medianOfMediansK: number | null;
  /** Up to 5 company codes with the highest medianK that year (merged across markets). */
  topCodes: string[];
}

/** src/data/industries.json : { [industry]: { [year]: IndustryYearStat } } */
export type IndustriesFile = Record<string, Record<string, IndustryYearStat>>;

export interface MarketScopeStats {
  /** Official market-total row (for `all`, the summed sii+otc totals). Null when unavailable. */
  official: MarketTotal | null;
  companyCount: number;
  /** Percentile *values* of company medianK within this scope+year. Null when too few data points. */
  medianP25: number | null;
  medianP50: number | null;
  medianP75: number | null;
  medianP90: number | null;
}

export interface MarketStatsYear {
  sii: MarketScopeStats;
  otc: MarketScopeStats;
  all: MarketScopeStats;
}

/** src/data/market-stats.json : { [year]: MarketStatsYear } */
export type MarketStatsFile = Record<string, MarketStatsYear>;

/** One row rendered in the homepage salary table, derived from a CompanyYearData. */
export interface SalaryTableRow {
  code: string;
  name: string;
  industry: string;
  market: Market;
  medianK: number | null;
  avgK: number | null;
  medianChangePct: number | null;
  employees: number | null;
}
