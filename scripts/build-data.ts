// CLI to merge all per-year-market JSON in src/data/years/ into the site's
// canonical data files, then validate the result (hard gate: exits 1 on failure).
//
// Outputs:
//   src/data/companies.json     — one record per company, all years, with percentiles
//   src/data/industries.json    — per-industry per-year aggregates
//   src/data/market-stats.json  — per-year sii/otc/all market statistics
//
// Usage: tsx scripts/build-data.ts

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKETS,
  type CompaniesFile,
  type CompanyRecord,
  type CompanyYearData,
  type IndustriesFile,
  type IndustryYearStat,
  type Market,
  type MarketScopeStats,
  type MarketStatsFile,
  type MarketTotal,
  type YearFile,
} from '../src/lib/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'src', 'data');
const YEARS_DIR = join(DATA_DIR, 'years');

const YEAR_FILE_RE = /^\d+-(sii|otc)\.json$/;

// ---------- small math helpers ----------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Year-over-year change percent, matching MOPS's own rounding (2 dp). Returns null
 * when either value is missing or the base is zero. Used to backfill 108-112, which
 * have no change-% columns (verified: 4072 vs 3391 -> 20.08%).
 */
function deriveChangePct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return round2(((cur - prev) / prev) * 100);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return hi;
  const lo = sorted[mid - 1] ?? hi;
  return Math.round((lo + hi) / 2);
}

/** Value at quantile q (0..1) via linear interpolation over a sorted-asc array. */
function quantile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0] ?? null;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sortedAsc[base] ?? 0;
  const hi = sortedAsc[base + 1] ?? lo;
  return Math.round(lo + (hi - lo) * rest);
}

/** Percent (0-100, 1 dp) of scope values strictly below `value`; scope includes self. */
function shareStrictlyLower(sortedAsc: number[], value: number): number {
  if (sortedAsc.length === 0) return 0;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sortedAsc[mid] ?? 0) < value) lo = mid + 1;
    else hi = mid;
  }
  return round1((lo / sortedAsc.length) * 100);
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

function pushTo(map: Map<string, number[]>, key: string, value: number): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

// ---------- load ----------

function readYearFiles(): YearFile[] {
  if (!existsSync(YEARS_DIR)) return [];
  return readdirSync(YEARS_DIR)
    .filter((name) => YEAR_FILE_RE.test(name))
    .map((name) => JSON.parse(readFileSync(join(YEARS_DIR, name), 'utf-8')) as YearFile)
    .sort((a, b) => a.year - b.year || a.market.localeCompare(b.market));
}

// ---------- assemble companies ----------

function assembleCompanies(yearFiles: YearFile[]): Record<string, CompanyRecord> {
  const companies: Record<string, CompanyRecord> = {};

  for (const yf of yearFiles) {
    for (const row of yf.rows) {
      let rec = companies[row.code];
      if (!rec) {
        rec = { code: row.code, name: row.name, industry: row.industry, market: yf.market, years: {} };
        companies[row.code] = rec;
      }
      const yearData: CompanyYearData = {
        ...row,
        market: yf.market,
        medianPctlMarket: null,
        medianPctlIndustry: null,
      };
      // Backfill change-% for years whose source table lacks those columns.
      if (yearData.avgChangePct === null) {
        yearData.avgChangePct = deriveChangePct(yearData.avgK, yearData.avgPrevK);
      }
      if (yearData.medianChangePct === null) {
        yearData.medianChangePct = deriveChangePct(yearData.medianK, yearData.medianPrevK);
      }
      rec.years[String(yf.year)] = yearData;
    }
  }

  // Canonical name/industry/market come from the newest year the company appears in.
  for (const rec of Object.values(companies)) {
    const newest = Object.keys(rec.years)
      .map(Number)
      .sort((a, b) => b - a)[0];
    if (newest === undefined) continue;
    const nd = rec.years[String(newest)];
    if (nd) {
      rec.name = nd.name;
      rec.industry = nd.industry;
      rec.market = nd.market;
    }
  }

  return companies;
}

/** Fill medianPctlMarket / medianPctlIndustry on every company-year (mutates). */
function computePercentiles(companies: Record<string, CompanyRecord>): void {
  const marketScope = new Map<string, number[]>(); // `${year}|${market}`
  const industryScope = new Map<string, number[]>(); // `${year}|${industry}`

  for (const rec of Object.values(companies)) {
    for (const [year, yd] of Object.entries(rec.years)) {
      if (yd.medianK === null) continue;
      pushTo(marketScope, `${year}|${yd.market}`, yd.medianK);
      pushTo(industryScope, `${year}|${yd.industry}`, yd.medianK);
    }
  }
  for (const arr of marketScope.values()) arr.sort((a, b) => a - b);
  for (const arr of industryScope.values()) arr.sort((a, b) => a - b);

  for (const rec of Object.values(companies)) {
    for (const [year, yd] of Object.entries(rec.years)) {
      if (yd.medianK === null) continue;
      yd.medianPctlMarket = shareStrictlyLower(marketScope.get(`${year}|${yd.market}`) ?? [], yd.medianK);
      yd.medianPctlIndustry = shareStrictlyLower(industryScope.get(`${year}|${yd.industry}`) ?? [], yd.medianK);
    }
  }
}

// ---------- industries ----------

interface IndustryAccum {
  industry: string;
  year: string;
  count: number;
  avgKs: number[];
  medianKs: number[];
  byMedian: Array<{ code: string; medianK: number }>;
}

function buildIndustries(companies: Record<string, CompanyRecord>): IndustriesFile {
  const acc = new Map<string, IndustryAccum>();
  for (const rec of Object.values(companies)) {
    for (const [year, yd] of Object.entries(rec.years)) {
      const key = `${yd.industry}|${year}`;
      let a = acc.get(key);
      if (!a) {
        a = { industry: yd.industry, year, count: 0, avgKs: [], medianKs: [], byMedian: [] };
        acc.set(key, a);
      }
      a.count++;
      if (yd.avgK !== null) a.avgKs.push(yd.avgK);
      if (yd.medianK !== null) {
        a.medianKs.push(yd.medianK);
        a.byMedian.push({ code: rec.code, medianK: yd.medianK });
      }
    }
  }

  const industries: IndustriesFile = {};
  for (const a of acc.values()) {
    const topCodes = [...a.byMedian]
      .sort((x, y) => y.medianK - x.medianK)
      .slice(0, 5)
      .map((e) => e.code);
    const stat: IndustryYearStat = {
      count: a.count,
      avgOfAvgK: mean(a.avgKs),
      medianOfMediansK: median(a.medianKs),
      topCodes,
    };
    (industries[a.industry] ??= {})[a.year] = stat;
  }
  return industries;
}

// ---------- market stats ----------

function buildMarketStats(companies: Record<string, CompanyRecord>, yearFiles: YearFile[]): MarketStatsFile {
  const years = [...new Set(yearFiles.map((yf) => yf.year))].sort((a, b) => a - b);
  const totalByKey = new Map<string, MarketTotal | null>();
  for (const yf of yearFiles) totalByKey.set(`${yf.year}|${yf.market}`, yf.marketTotal);

  const medianKsForScope = (year: number, markets: readonly Market[]): number[] => {
    const out: number[] = [];
    for (const rec of Object.values(companies)) {
      const yd = rec.years[String(year)];
      if (yd && markets.includes(yd.market) && yd.medianK !== null) out.push(yd.medianK);
    }
    return out.sort((a, b) => a - b);
  };

  const companyCountForScope = (year: number, markets: readonly Market[]): number => {
    let n = 0;
    for (const rec of Object.values(companies)) {
      const yd = rec.years[String(year)];
      if (yd && markets.includes(yd.market)) n++;
    }
    return n;
  };

  const buildScope = (year: number, markets: readonly Market[], official: MarketTotal | null): MarketScopeStats => {
    const meds = medianKsForScope(year, markets);
    return {
      official,
      companyCount: companyCountForScope(year, markets),
      medianP25: quantile(meds, 0.25),
      medianP50: quantile(meds, 0.5),
      medianP75: quantile(meds, 0.75),
      medianP90: quantile(meds, 0.9),
    };
  };

  const combinedOfficial = (year: number): MarketTotal | null => {
    const parts = MARKETS.map((m) => totalByKey.get(`${year}|${m}`) ?? null).filter(
      (t): t is MarketTotal => t !== null,
    );
    if (parts.length === 0) return null;
    const totalPayrollK = sumNullable(parts.map((p) => p.totalPayrollK));
    const employees = sumNullable(parts.map((p) => p.employees));
    const avgK =
      totalPayrollK !== null && employees !== null && employees > 0
        ? Math.round(totalPayrollK / employees)
        : null;
    return { label: '全體上市櫃公司合計(推算)', totalPayrollK, employees, avgK, rawCells: [] };
  };

  const stats: MarketStatsFile = {};
  for (const year of years) {
    stats[String(year)] = {
      sii: buildScope(year, ['sii'], totalByKey.get(`${year}|sii`) ?? null),
      otc: buildScope(year, ['otc'], totalByKey.get(`${year}|otc`) ?? null),
      all: buildScope(year, MARKETS, combinedOfficial(year)),
    };
  }
  return stats;
}

// ---------- validation gate ----------

function withinPct(n: number, target: number, pct: number): boolean {
  return Math.abs(n - target) <= target * pct;
}

// Expected company-row counts per year+market (from empirical td-distribution scans).
// Validated with ±5% tolerance to allow for future re-fetches / minor listing churn.
const EXPECTED_ROW_COUNTS: Record<string, number> = {
  '108|sii': 853, '108|otc': 704,
  '109|sii': 864, '109|otc': 724,
  '110|sii': 881, '110|otc': 754,
  '111|sii': 897, '111|otc': 775,
  '112|sii': 922, '112|otc': 789,
  '113|sii': 951, '113|otc': 816,
  '114|sii': 978, '114|otc': 848,
};

function expectedRowCountOk(year: number, market: Market, n: number): boolean {
  const target = EXPECTED_ROW_COUNTS[`${year}|${market}`];
  if (target !== undefined) return withinPct(n, target, 0.05);
  return n > 600;
}

// 台積電 (2330) reference values per year — the canonical spot-check anchors.
const SPOT_CHECKS: ReadonlyArray<{ year: string; code: string; avgK: number; medianK: number }> = [
  { year: '108', code: '2330', avgK: 1981, medianK: 1596 },
  { year: '113', code: '2330', avgK: 3391, medianK: 2645 },
  { year: '114', code: '2330', avgK: 4072, medianK: 3162 },
];

function validate(yearFiles: YearFile[], companies: Record<string, CompanyRecord>): void {
  const problems: string[] = [];

  for (const yf of yearFiles) {
    if (!expectedRowCountOk(yf.year, yf.market, yf.rows.length)) {
      problems.push(`row count out of range: ${yf.year} ${yf.market} has ${yf.rows.length} rows`);
    }
    const seen = new Set<string>();
    for (const row of yf.rows) {
      if (!/^\d{4}$/.test(row.code)) problems.push(`bad code format: ${yf.year} ${yf.market} "${row.code}"`);
      if (seen.has(row.code)) problems.push(`duplicate code within file: ${yf.year} ${yf.market} ${row.code}`);
      seen.add(row.code);
    }
  }

  // A code must not appear in both markets in the same year — assembleCompanies
  // would silently keep only one row, so corrupt source data must fail here.
  const codeMarketByYear = new Map<string, Map<string, Market>>();
  for (const yf of yearFiles) {
    let byCode = codeMarketByYear.get(String(yf.year));
    if (!byCode) {
      byCode = new Map();
      codeMarketByYear.set(String(yf.year), byCode);
    }
    for (const row of yf.rows) {
      const prior = byCode.get(row.code);
      if (prior !== undefined && prior !== yf.market) {
        problems.push(`code ${row.code} appears in both markets in year ${yf.year}`);
      }
      byCode.set(row.code, yf.market);
    }
  }

  const presentYears = new Set(yearFiles.map((yf) => String(yf.year)));
  for (const sc of SPOT_CHECKS) {
    if (!presentYears.has(sc.year)) continue;
    const yd = companies[sc.code]?.years[sc.year];
    if (!yd) {
      problems.push(`spot-check: ${sc.code} missing in year ${sc.year}`);
      continue;
    }
    if (yd.avgK !== sc.avgK) problems.push(`spot-check: ${sc.code}@${sc.year} avgK=${yd.avgK} (expected ${sc.avgK})`);
    if (yd.medianK !== sc.medianK) {
      problems.push(`spot-check: ${sc.code}@${sc.year} medianK=${yd.medianK} (expected ${sc.medianK})`);
    }
  }

  for (const rec of Object.values(companies)) {
    if (Object.keys(rec.years).length === 0) problems.push(`company ${rec.code} has no year data`);
  }

  if (problems.length > 0) {
    console.error('\n[VALIDATION FAILED]');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

// ---------- main ----------

function main(): void {
  const yearFiles = readYearFiles();
  if (yearFiles.length === 0) {
    throw new Error(`No year files in ${YEARS_DIR}. Run data:parse first.`);
  }

  const companies = assembleCompanies(yearFiles);
  computePercentiles(companies);
  const industries = buildIndustries(companies);
  const marketStats = buildMarketStats(companies, yearFiles);

  const years = [...new Set(yearFiles.map((yf) => yf.year))].sort((a, b) => a - b);
  const byMarket: Record<Market, number> = { sii: 0, otc: 0 };
  for (const rec of Object.values(companies)) byMarket[rec.market]++;
  const byYear: Record<string, number> = {};
  for (const yf of yearFiles) byYear[String(yf.year)] = (byYear[String(yf.year)] ?? 0) + yf.rows.length;

  const companiesFile: CompaniesFile = {
    meta: {
      latestYear: Math.max(...years),
      generatedAt: new Date().toISOString(),
      counts: { companies: Object.keys(companies).length, byMarket, byYear },
    },
    companies,
  };

  validate(yearFiles, companies);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'companies.json'), JSON.stringify(companiesFile, null, 2) + '\n', 'utf-8');
  writeFileSync(join(DATA_DIR, 'industries.json'), JSON.stringify(industries, null, 2) + '\n', 'utf-8');
  writeFileSync(join(DATA_DIR, 'market-stats.json'), JSON.stringify(marketStats, null, 2) + '\n', 'utf-8');

  console.log('year files:');
  for (const yf of yearFiles) console.log(`  ${yf.year} ${yf.market}: ${yf.rows.length} rows`);
  console.log(`companies: ${Object.keys(companies).length} (sii ${byMarket.sii}, otc ${byMarket.otc})`);
  console.log(`industries: ${Object.keys(industries).length}`);
  console.log(`years: ${years.join(', ')}`);
  const tsmc = companies['2330'];
  if (tsmc) {
    console.log('spot 2330 across years:');
    for (const y of Object.keys(tsmc.years).sort()) {
      const yd = tsmc.years[y];
      if (!yd) continue;
      console.log(
        `  @${y}: avgK=${yd.avgK} medianK=${yd.medianK} avgChangePct=${yd.avgChangePct} ` +
          `medianChangePct=${yd.medianChangePct} pctlMkt=${yd.medianPctlMarket}`,
      );
    }
  }
  console.log('validation: passed');
  console.log('wrote companies.json, industries.json, market-stats.json');
}

main();
