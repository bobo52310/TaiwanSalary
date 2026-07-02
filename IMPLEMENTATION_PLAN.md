# TaiwanSalary 實作計畫

台灣上市櫃公司薪資查詢網站 — Astro 7 純靜態,部署 Cloudflare Pages。
資料:公開資訊觀測站 t100sb15「非擔任主管職務之全時員工薪資資訊」,民國 108–114 年,上市+上櫃。

完整設計文件見 session 計畫檔;本檔追蹤各階段狀態。

## Stage 1: Astro 骨架 + 資料管線(114 年)
**Goal**: 專案可 build;fetch/parse/build-data 以快取樣本跑通
**Success Criteria**: `npm run build` 綠;2330 spot-check 過;companies.json 1,826 家(114 年)
**Status**: ✅ Complete(commit 32af439)

## Stage 2: 回補 108–113 年資料
**Goal**: 14 個年度檔全量合併(7 年 × 2 市場)
**Success Criteria**: 1,847 家公司(含下市);三代版面(16/19/31 td)對照表;百分位/產業彙總齊全
**Status**: ✅ Complete(commit 32af439)
**Notes**: 旗標編碼 108–109 用 V/空白、110+ 用 Y/N;108 年無 medianPrev(107 未揭露);108–112 變動% 由 build-data 推導

## Stage 3: 查詢頁(SSR 表格 + 即時搜尋)
**Goal**: 首頁一頁查詢 1,826 家(最新年度),搜尋/排序/篩選全在前端
**Success Criteria**: 全列 SSR;搜尋排序 <50ms;頁面 gzip ≤~120KB;關 JS 表格仍可讀
**Status**: In Progress

## Stage 4: 個股頁 + 產業頁
**Goal**: /company/[code]/(~1,847 頁,含下市 badge)+ /industry/[name]/(~35 頁)
**Success Criteria**: /company/2330/ 與 MOPS 數值一致(7 年趨勢、性別、同業);build <2 分鐘
**Status**: Not Started

## Stage 5: 排行榜 + about + 404
**Goal**: /rank/{median,average,raise}/(top 100,員工數 ≥30 門檻)+ /about/ + 404
**Success Criteria**: 排行與手動排序一致;門檻在頁面聲明;about 含方法論/授權/FAQ/免責
**Status**: Not Started

## Stage 6: SEO + polish
**Goal**: meta/OG/canonical/JSON-LD、sitemap、robots、_headers、手機審視
**Success Criteria**: sitemap ~1,900 URL;JSON-LD 驗證通過;Lighthouse mobile ≥95
**Status**: Not Started

## Stage 7: 部署 + 文件
**Goal**: CF Pages git integration 設定說明;README 重寫(zh-TW,含年度更新 runbook)
**Success Criteria**: production URL 上線;/company/2330/ 正確;快取 header 生效
**Status**: Not Started

## 年度更新 Runbook(每年 6 月底)
1. `npm run data:fetch -- --year 115`(兩市場,自動間隔 90s)
2. 若 parse 因 tdCount 不符 loud-fail → 依錯誤訊息在 `scripts/lib/layouts.ts` 加新年度對照表(115 年已預告新增「資本額 ≥100 億」揭露欄位)
3. `npm run data:parse -- --all && npm run data:build`
4. `git diff --stat` 目視檢查 → commit → push → CF Pages 自動部署
