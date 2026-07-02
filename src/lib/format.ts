// Display formatting for salary figures. All amounts arrive in 仟元 (thousands of
// NT$) as published by MOPS; the UI shows 萬 (ten-thousands) because that is how
// Taiwanese readers talk about annual salary. 1 萬 = 10 仟, so 仟元 ÷ 10 = 萬.

const NULL_DISPLAY = '—';

const wanFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const intFmt = new Intl.NumberFormat('en-US');

const pctFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const yiFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 仟元 → 萬, one decimal, thousands-grouped. 4072 → "407.2". null → "—". */
export function formatWan(k: number | null | undefined): string {
  if (k === null || k === undefined || !Number.isFinite(k)) return NULL_DISPLAY;
  return wanFmt.format(k / 10);
}

/** Same as formatWan but with the 萬 unit appended: 4072 → "407.2萬". */
export function formatWanUnit(k: number | null | undefined): string {
  const s = formatWan(k);
  return s === NULL_DISPLAY ? s : `${s}萬`;
}

/**
 * A percentage already expressed as a number (19.55 means 19.55%) → an explicitly
 * signed string with a real minus sign: 20.08 → "+20.08%", -10.26 → "−10.26%",
 * 0 → "0.00%", null → "—".
 */
export function formatPct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return NULL_DISPLAY;
  if (p === 0) return '0.00%';
  const sign = p > 0 ? '+' : '−'; // U+2212 minus for negatives
  return `${sign}${pctFmt.format(Math.abs(p))}%`;
}

/** Headcount with thousands separators. 74988 → "74,988". null → "—". */
export function formatEmployees(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NULL_DISPLAY;
  return intFmt.format(n);
}

/** Plain integer with thousands separators (row counts, company totals). */
export function formatInt(n: number): string {
  return intFmt.format(n);
}

/**
 * Total-payroll amount (仟元) → a human 億 / 萬 string. 1 億元 = 10^5 仟元, so a
 * payroll of ≥ 1 億 reads as "3,053.6億"; smaller sums fall back to the 萬 unit.
 * null → "—". Used for a company's 薪資總額, where the raw figure is unwieldy.
 */
export function formatPayroll(k: number | null | undefined): string {
  if (k === null || k === undefined || !Number.isFinite(k)) return NULL_DISPLAY;
  if (Math.abs(k) >= 100000) return `${yiFmt.format(k / 100000)}億`;
  return formatWanUnit(k);
}

/** ROC (民國) year → Common Era year. Matches normalize.ts rocToCe (roc + 1911). */
export function rocToCe(rocYear: number): number {
  return rocYear + 1911;
}

/** Common Era year → ROC (民國) year. Matches normalize.ts ceToRoc (ce − 1911). */
export function ceToRoc(ceYear: number): number {
  return ceYear - 1911;
}

/** Data-year label: 114 → "114 年度（2025）". */
export function rocYearLabel(rocYear: number): string {
  return `${rocYear} 年度（${rocToCe(rocYear)}）`;
}
