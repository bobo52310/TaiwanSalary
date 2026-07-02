// Per-year column layout for the MOPS t100sb15 non-manager-salary table.
//
// The table shape changes between years (columns added/removed, gender breakdown
// introduced, etc.), so every year that we parse must have an explicit entry here.
// Unknown years / unexpected column counts are a LOUD FAILURE by design: it is far
// better to stop and force a human to inspect a new layout than to silently
// misread columns and publish wrong salary numbers.

/**
 * Column indices into a company row's <td> cells. Fields that some years omit are
 * optional: gender (added in 114), the change-% columns (added in 113; earlier
 * years have them derived in build-data), and the improvement note (added in 113).
 */
export interface LayoutColumns {
  industry: number;
  code: number;
  name: number;
  totalPayrollK: number;
  employees: number;
  avgK: number;
  avgPrevK: number;
  avgChangePct?: number;
  medianK: number;
  medianPrevK: number;
  medianChangePct?: number;
  eps: number;
  maleAvgK?: number;
  femaleAvgK?: number;
  maleMedianK?: number;
  femaleMedianK?: number;
  peerAvgK: number;
  peerEps: number;
  flagLowPay: number;
  flagEpsHighPayLow: number;
  flagEpsUpPayDown: number;
  note: number;
  improvement?: number;
}

export interface Layout {
  /** Exact <td> count of a company row for this year. */
  tdCount: number;
  hasGender: boolean;
  columns: LayoutColumns;
}

/** What the parser actually observed, used to build a helpful error message. */
export interface ObservedShape {
  tdCount: number;
  sampleCells: string[];
}

// Year 114 (民國): 31 columns, includes gender breakdown. Verified empirically
// against 台積電 (2330). See the column comments below for the mapping.
const LAYOUT_114: Layout = {
  tdCount: 31,
  hasGender: true,
  columns: {
    industry: 0, // 產業類別
    code: 1, // 公司代號
    name: 2, // 公司名稱
    totalPayrollK: 3, // 員工薪資總額(仟元)
    employees: 4, // 員工人數-年度平均
    avgK: 5, // 平均數(當年)
    avgPrevK: 6, // 平均數(前年)
    avgChangePct: 7, // 平均數變動%
    medianK: 8, // 中位數(當年)
    medianPrevK: 9, // 中位數(前年)
    medianChangePct: 10, // 中位數變動%
    eps: 11, // EPS
    maleAvgK: 12, // 男性平均 (13=前年不適用, 14=變動-)
    femaleAvgK: 15, // 女性平均 (16=前年, 17=變動)
    maleMedianK: 18, // 男性中位 (19=前年, 20=變動)
    femaleMedianK: 21, // 女性中位 (22=前年, 23=變動)
    peerAvgK: 24, // 同業平均薪資
    peerEps: 25, // 同業平均EPS
    flagLowPay: 26, // 旗標: 平均數未達50萬
    flagEpsHighPayLow: 27, // 旗標: EPS優於同業但薪資低於同業
    flagEpsUpPayDown: 28, // 旗標: EPS成長但薪資減少
    note: 29, // 經營績效關聯說明
    improvement: 30, // 改善措施說明
  },
};

// Years 108-112 (民國): 16 columns, no gender, no change-% columns, note but no
// improvement column. Verified against 台積電 (2330). Flag encoding differs by year
// (108-109 use 'V'/blank, 110-112 use 'Y'/'N') but the columns are identical, so one
// layout serves all five years — parseFlag() absorbs the encoding difference.
const LAYOUT_108_112: Layout = {
  tdCount: 16,
  hasGender: false,
  columns: {
    industry: 0, // 產業類別
    code: 1, // 公司代號
    name: 2, // 公司名稱
    totalPayrollK: 3, // 員工薪資總額(仟元)
    employees: 4, // 員工人數
    avgK: 5, // 平均數(當年)
    avgPrevK: 6, // 平均數(前一年)
    medianK: 7, // 中位數(當年)
    medianPrevK: 8, // 中位數(前一年)
    eps: 9, // EPS
    peerAvgK: 10, // 同業平均薪資
    peerEps: 11, // 同業平均EPS
    flagLowPay: 12,
    flagEpsHighPayLow: 13,
    flagEpsUpPayDown: 14,
    note: 15, // 經營績效關聯說明
    // no change-% columns (derived in build-data), no improvement, no gender
  },
};

// Year 113 (民國): 19 columns, change-% columns present, improvement present, no gender.
// Verified against 台積電 (2330). Flags use 'Y'/'N'.
const LAYOUT_113: Layout = {
  tdCount: 19,
  hasGender: false,
  columns: {
    industry: 0,
    code: 1,
    name: 2,
    totalPayrollK: 3,
    employees: 4,
    avgK: 5, // 平均數(113)
    avgPrevK: 6, // 平均數(112)
    avgChangePct: 7, // 平均數變動%
    medianK: 8, // 中位數(113)
    medianPrevK: 9, // 中位數(112)
    medianChangePct: 10, // 中位數變動%
    eps: 11, // EPS
    peerAvgK: 12, // 同業平均薪資
    peerEps: 13, // 同業平均EPS
    flagLowPay: 14,
    flagEpsHighPayLow: 15,
    flagEpsUpPayDown: 16,
    note: 17, // 經營績效關聯說明
    improvement: 18, // 改善措施說明
  },
};

const LAYOUTS: Record<number, Layout> = {
  108: LAYOUT_108_112,
  109: LAYOUT_108_112,
  110: LAYOUT_108_112,
  111: LAYOUT_108_112,
  112: LAYOUT_108_112,
  113: LAYOUT_113,
  114: LAYOUT_114,
};

/** Whether a column layout is registered for a year (no throw). */
export function hasLayout(year: number): boolean {
  return year in LAYOUTS;
}

/**
 * Return the column layout for a ROC year. THROWS loudly (with the observed td
 * count and a sample row) when the year is unregistered or its table shape does
 * not match the registered layout — never guess.
 */
export function getLayout(year: number, observed?: ObservedShape): Layout {
  const layout = LAYOUTS[year];
  const seen = observed
    ? ` Observed dominant td count = ${observed.tdCount}; sample row cells = ${JSON.stringify(observed.sampleCells)}.`
    : '';

  if (!layout) {
    throw new Error(
      `No column layout registered for year ${year}.${seen} ` +
        `Add a Layout entry in scripts/lib/layouts.ts after inspecting the table.`,
    );
  }

  if (observed && observed.tdCount !== layout.tdCount) {
    throw new Error(
      `Year ${year} layout expects td count ${layout.tdCount} but parser observed ${observed.tdCount}.${seen} ` +
        `The MOPS table shape may have changed; verify and update scripts/lib/layouts.ts.`,
    );
  }

  return layout;
}
