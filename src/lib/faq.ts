// Single source of truth for the About-page FAQ. Both the rendered <details>
// list in about.astro and the FAQPage JSON-LD read this array, so the questions
// and answers never drift apart. Answers are plain text (no markup) because
// schema.org Answer.text must be plain text.

import type { CompaniesFile } from './types';
import companiesData from '../data/companies.json';

const META_LATEST = (companiesData as unknown as CompaniesFile).meta.latestYear;

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: '為什麼查不到某家公司？',
    a: '資料僅涵蓋本國上市與上櫃公司。KY 公司、外國企業與 TDR（台灣存託憑證）不在申報範圍；興櫃公司也不在範圍內。若某公司在該年度尚未上市櫃，或已下市／下櫃，也可能查不到。',
  },
  {
    q: '金控／投控的員工數為什麼那麼多？',
    a: '依 MOPS 申報規定，金控、投控等公司的薪資資訊須納入合併報表之子公司，因此員工數會涵蓋整個集團，遠高於母公司本身。',
  },
  {
    q: '薪資包含哪些項目？',
    a: '為「非擔任主管職務之全時員工」的年度薪資，包含經常性薪資、加班費，以及獎金、紅利等非經常性給與。不含主管職員工，也不含非全時（兼職、部分工時）員工。單位為新台幣。',
  },
  {
    q: '為什麼有些公司沒有中位數年增？',
    a: '若該公司該年度為首次揭露（前一年度未上市櫃或未申報），沒有可比較的前一年數字，因此不計算中位數年增。',
  },
  {
    q: '男女薪資是什麼時候開始揭露的？',
    a: `自民國 ${META_LATEST} 年度起，MOPS 才要求揭露非主管全時員工的男女平均與中位數薪資，因此僅 ${META_LATEST} 年度（含）以後的資料才有性別分項。`,
  },
  {
    q: '數字跟新聞報導不一樣？',
    a: '最常見的原因是單位換算。MOPS 原始資料單位為「仟元」，本站一律換算為「萬元」顯示（仟元 ÷ 10）。此外新聞常以月薪估算，或採用不同年度、不同口徑，數字自然會有差異。',
  },
];
