# 哪家給最多｜台灣上市櫃薪資查詢(TaiwanSalary)

[![線上網址](https://img.shields.io/badge/%E7%B7%9A%E4%B8%8A%E7%B6%B2%E5%9D%80-salary.bobochen.dev-2ea44f?style=flat-square&logo=googlechrome&logoColor=white)](https://salary.bobochen.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Built with Astro](https://img.shields.io/badge/Astro-7-BC52EE?style=flat-square&logo=astro&logoColor=white)](https://astro.build)

查詢台灣 **1,847 家上市櫃公司**「非擔任主管職務之全時員工」年薪 — 中位數、平均數、調薪幅度、男女薪資 — 一頁搜尋,免下拉選單。

> 官方的[公開資訊觀測站查詢頁](https://mopsov.twse.com.tw/mops/web/t100sb15)要逐一選擇年度/市場別/產業別才能看到零碎結果;本站把 **民國 108–114 年(2019–2025)** 全部資料整理成好查、好比較的靜態網站。

## 功能特色

- **一頁查全部** — 首頁 SSR 全部 1,826 家(114 年度),即時搜尋公司名稱/代號、產業篩選、市場切換、點欄位排序,網址可分享(`/?q=台積&sort=median`)
- **個股頁 × 1,847** — 每家公司一頁:7 年薪資趨勢圖、歷年調薪幅度、男女薪資(114 年起揭露)、全市場/同業百分位、完整歷年明細、公司低薪申報說明;已下市公司保留歷史資料並標示
- **產業頁 × 35** — 各產業完整排行 + 產業別中位數趨勢;產業總覽一表比較 35 種產業
- **排行榜** — 中位數/平均數/調薪幅度 Top 100(員工數 ≥ 30 人門檻,避免小樣本失真)
- **個股社群分享卡** — 平均薪資前 100 名每家一張專屬 OG 圖:公司 logo + 平均/中位數年薪 + 全國排名,分享到 FB/Threads/LINE 直接顯示品牌與數字;知名公司用真實 logo(取自 Wikimedia),其餘以字母磚呈現。每家個股頁也在標題旁顯示該 logo
- **中位數優先** — 全站以中位數為主要指標並附說明,比平均數更能代表多數員工實況
- **零 JS 依賴的圖表** — 趨勢圖/長條圖為 build-time SVG,原生 tooltip;唯一的 client JS 是 3KB 的表格互動
- **快** — 純靜態 1,889 頁,首頁 gzip 後約 100KB,深/淺色主題自動適配

## 技術架構

- [Astro 7](https://astro.build) 純靜態輸出(無 adapter)+ TypeScript,無 UI framework、無 chart library
- 資料以 JSON 快照 commit 進 repo(`src/data/`),網站 build 不打任何 API
- 部署:Cloudflare Pages(GitHub git integration 自動部署)

```
scripts/          資料管線(本地執行,每年一次)
  fetch-mops.ts     從 MOPS 抓原始 HTML(限流 90s 間隔 + retry)
  parse-mops.ts     cheerio 解析 → src/data/years/*.json(每年度欄位對照表,未知版面 loud-fail)
  build-data.ts     合併 7 年 × 2 市場 → companies/industries/market-stats.json + 驗證關卡
  fetch-logos.ts    從 Wikimedia(Wikidata P154)取知名公司 logo → public/logos/*.png
  og-companies.ts   平均薪資前 100 名個股社群分享卡 → public/og/company/*.png(SVG → rsvg-convert)
src/
  data/             committed 資料快照(14 個年度檔 + 3 個彙總檔)
  pages/            index / company/[code] / industry/[name] / rank/[metric] / about / 404
  components/       SalaryTable, TrendChart(SVG), YoYBars, GenderCard, PercentileBar…
  scripts/          table-enhance.ts(搜尋/排序/篩選,唯一 client JS)
```

## 開發

需求:Node.js ≥ 22.12

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # 產出 dist/(約 1,889 頁,~3 秒)
npm run preview    # 本地預覽 build 結果
npm run lint       # astro check
npm run og:build   # 重新產出個股社群分享卡(需系統有 rsvg-convert 與 magick)
```

> 分享卡與 logo 是 **本地產生後 commit 進 repo** 的靜態檔(`public/og/`、`public/logos/`)—— Cloudflare Pages 建置環境沒有 `rsvg-convert`,故不在 `astro build` 期間產生,與現有的 `og-default.png` 同樣做法。

## 資料更新(每年 6 月底)

上市櫃公司依規定於每年 6 月底前申報前一年度薪資資訊。年度更新流程:

```bash
npm run data:fetch -- --year 115      # 抓上市+上櫃(自動間隔 90 秒防限流)
npm run data:parse -- --all           # 解析(若 MOPS 改版面會 loud-fail,依錯誤訊息補 scripts/lib/layouts.ts)
npm run data:build                    # 合併 + 驗證(台積電 spot-check、列數、代號唯一性)
npm run og:build                      # 依新數據重新產出前 100 名分享卡(排名/數字會變動)
git diff --stat                       # 目視檢查
git commit && git push                # CF Pages 自動部署
```

註:115 年度申報已預告新增揭露欄位(實收資本額 ≥ 100 億元公司),屆時 parse 會偵測到欄位數改變並提示補對照表。

## 社群分享卡與公司 logo

平均薪資前 100 名的個股頁各有一張 1200×630 OG 分享卡,由 `og-companies.ts` 以 **SVG 模板 → `rsvg-convert`** 產生(數字為文字渲染,像素級精準,非 AI 生圖)。卡片與個股頁標題旁的 logo 共用同一套規則(`src/lib/logo.ts`):

- **真實 logo**:`public/logos/{代號}.png` 存在時使用。由 `fetch-logos.ts` 從 Wikimedia 取得(優先 Wikidata `P154` 屬性,fallback 為條目 infobox 的 logo 檔),目前收錄約 34 家知名公司
- **字母磚 fallback**:其餘公司以公司名首字 + 依代號決定的顏色產生方塊,永遠有一致的品牌標記

新增/更新 logo:把圖檔放進 `public/logos/{代號}.png`(或 svg/webp),再跑 `npm run og:build` 重新產卡。`fetch-logos.ts` 具冪等性(已存在的代號會跳過),可重跑補齊;`--force` 可強制重抓。logo 為各公司商標,依編輯性/指示性合理使用原則呈現於該公司資訊旁。

> 需要系統安裝 `librsvg`(`rsvg-convert`)與 `ImageMagick`(`magick`):`brew install librsvg imagemagick`。

## 部署(Cloudflare Pages)

採 CF 原生 GitHub git integration(不用 GitHub Actions):

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Connect to Git**,選本 repo
2. Build 設定:
   - Framework preset:**Astro**
   - Build command:`npm install && npm run build`
   - Build output directory:`dist`
3. 環境變數(Production + Preview):`NODE_VERSION = 22`
4. Deploy。之後每次 push `main` 自動部署
5. (可選)綁定自訂網域後,更新 `astro.config.mjs` 的 `site` 並 push

`public/_headers`(靜態資源一年快取、安全標頭)與 `public/_redirects`(`/rank/` → `/rank/median/`)會隨 build 進 `dist/` 自動生效。

## 資料來源與授權

- 資料來源:[公開資訊觀測站](https://mopsov.twse.com.tw/mops/web/t100sb15)「非擔任主管職務之全時員工薪資資訊」(t100sb15),依政府資料開放精神使用;各數值以 MOPS 原始公告為準
- 範圍:本國上市/上櫃公司(KY 公司、TDR、興櫃不在申報範圍)
- 薪資為年薪(經常性 + 非經常性給與,含獎金紅利),原始單位仟元,本站顯示萬元
- 本站為非官方工具,僅供參考,不構成任何投資或求職建議

## License

程式碼 MIT;資料版權屬原公告單位。
