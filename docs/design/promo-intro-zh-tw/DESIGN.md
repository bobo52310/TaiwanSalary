# 哪家給最多 簡介動畫 — Design Baseline

## 品牌來源
完全沿用本站 dark mode tokens：`src/styles/global.css` 的 `@media (prefers-color-scheme: dark)`。
場景底色＝截圖的頁面底色，真站截圖不加框、直接融進畫面。流程與檔案結構沿用 Extension-Jetpack／EagleToc 簡介動畫。

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#0d0d0d` | 場景底（＝截圖頁面底色） |
| `--surface` | `#1a1a19` | 卡片、pill、手刻下拉選單 |
| `--surface-alt` | `#201f1e` | 次要面（「查詢」鈕） |
| `--text` | `#ffffff` | 主文字 |
| `--text-secondary` | `#c3c2b7` | 次文字、eyebrow、軸標（在 `--bg` 上 9.7:1） |
| `--text-muted` | `#898781` | 只當裝飾（長尾括號、下拉箭頭），不當小字 |
| `--border` / `--border-strong` | `#2c2c2a` / `#383835` | 地平線、基準線、選單框、右側轉灰的長條 |
| `--accent` | `#3987e5` | 唯一 accent：P50 線與左半長條、`.hl`、CTA 網址框、搜尋結果框 |
| `--brand-tile` | `#2a78d6` | 「薪」字磚（`public/favicon.svg`：圓角方塊＋白「薪」） |

單一 accent 治理照官網：不加第二個 accent。`.hl` 為 accent 系漸層 `#8ab8f2 → #3987e5`（兩端在 `#0d0d0d` 上皆過 AA）。
`--pos` / `--neg` 不用。真實截圖內的顏色（漲跌綠紅、tsmc logo）不受此限。

## 字型
- 數字／Latin：Inter（Google Fonts，`display=block`），跳動數字用 `font-variant-numeric: tabular-nums`。
- CJK：`"PingFang TC", "Noto Sans TC"`。`@font-face { src: local("PingFang TC") }` 照姊妹作保留；實測 Chrome 不認 family 名的
  `local()`，但會落回系統的 PingFang TC（700 → Semibold），渲染結果相同。lint 對此只出 `font_face_local_only` 警告；
  在非 macOS 機器 render 會改用 Noto Sans TC。
- 字級（1080p 樓地板）：數字看板 300px、h2 96px、Heart 兩拍 104px、主句 56px、wordmark 188px、副標 56px、
  eyebrow 28–40px、軸標 26px、小字 24–26px。zh-TW label 不用 uppercase、letter-spacing ≤ 0.06em。

## 敘事核心（34s，Hook → Twist → Mechanic → Range → Heart）
- 隱喻：**看板上的平均數 vs. 地上的「你」**。S1 巨大的 144.7 萬掛在上面，畫面底部只有一個小點「你」；
  S5 收尾句「看看你在中位數的哪一邊」回答 S1 的「你有嗎？」。
- 全片記憶點：S2 真實直方圖，一條 P50 線掃進 78.2 萬，左半亮成 accent、右邊長尾轉灰；
  S3 一層層灰色下拉選單塌縮成一條線，落位成真站的搜尋框，打「台積」表格只剩一列。
- S4 以台積電（2330）為範例公司：趨勢線用 clip-path 由左往右「畫出來」，筆尖沿 manifest 的真實座標走。

## 真實性與定位
- 產品畫面一律真實擷取（`scripts/capture.cjs`，dark mode、2x），不手刻假 UI；疊圖對位座標來自 `assets/shots/manifest.json`
  （搜尋框 `#q`、台積電那一列、趨勢線各點）。S3 的灰色下拉選單是示意，不模仿公開資訊觀測站外觀。
- **截圖要從 `git archive HEAD` 的快照建站拍**：工作區首頁已加「33 秒看懂本站」按鈕，直接從 repo 拍 home 會拍到它。
  快照放 scratchpad `site/`，`node_modules/.bin/astro build && astro preview --port 4329`，再 `BASE_URL=http://localhost:4329 npm run capture`。
- 畫面上每個數字都由 `index.html` 內嵌的 `assets/data.json`（`<script id="promo-data">`）在執行時填入；
  `npm run data` 會重算 data.json 並重新嵌入。不手打數字。
  - 144.7 萬 ← `sii114.officialAvgK`（1447 仟元）；1,164,410 人 ← `sii114.officialEmployees`；「全體上市公司合計」← `sii114.officialLabel`
  - 直方圖 18 格 ← `sii114Hist.bins[].count`；978 家 ← `sii114Hist.total`；P50 78.2 萬 ← `sii114.medianP50`（782 仟元）
  - 1,847 家公司 ← `all114.totalCompanies`；35 個產業 ← `industryCount`；民國 108–114 年 ← `all114.firstYear` / `lastYear`
  - 民國 114 年度 ← `sii114.year` / `sii114Hist.year`
- 144.7 萬（全體上市公司總薪資 ÷ 總人數）與 78.2 萬（978 家上市公司各自中位數的中位數）是兩群不同的數，
  **不放在同一條軸、不同框**：S1 只有平均，S2 只有中位數分布。
- 不暗示自有伺服器、即時 API、會員；不用「快、簡單、強大」；不說「官方」網站（資料來自公開資訊觀測站，網站是非官方，收尾小字註明）。
