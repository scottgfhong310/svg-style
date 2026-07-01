# svg-style — 設計文件

> 開發者面向的設計與實作參考。使用說明見 [README](./README.md)；快速定位 / canon 重點見 [CLAUDE.md](./CLAUDE.md)；
> 家族共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)（`DESIGN_GUIDELINES.md` / `WORKFLOW.md` / `PLAYBOOK.md`）。
> 與 viewer 系列（`html-/docx-/xlsx-/pptx-viewer`）同骨架；但這支是**工具（轉換 + 寫回）**而非 viewer——見 §6。

---

## 1. 定位與目標

把 Claude 產的**深色 SVG 圖表加上「淺色自適應」**：在 `<svg>` 後注入一段 `@media (prefers-color-scheme: light)` 覆寫，讓圖在淺色環境也好看；深色原樣不動。零打包、薄後端、核心抽成可嵌入 lib。

## 2. 架構與資料流

```
使用者
  │  拖拉 / 點選 .svg
  ▼
svg-style.js（控制器，碰 DOM）
  ├─ SvgStyleLib.uploadFile(file)              // → src（共用 /api/upload?folder=svg-style）
  ├─ SvgStyleLib.fetchText(srcLink)            // 讀 src SVG 原文
  ├─ SvgStyleLib.autoAdapt(src)                // ★ 純字串：偵測原生主題→相反主題 @media 覆寫 + @media print，注入（冪等）
  ├─ SvgStyleLib.buildPreviewSvg(.., isLight)  // 強制 @media (prefers-color-scheme) 供預覽
  ├─ SvgStyleLib.buildSrcdoc(.., isLight)      // 包成 sandbox iframe HTML
  ▼
#ss-frame (iframe sandbox="") .srcdoc = ...    // 全 sandbox 渲染（無 script）

「下載目前檔」→ Blob(processedCurrent()) → <a download>   // 預覽 === 下載（皆走 processedCurrent）
```

顏色適配全在前端（無 src→dist 伺服器管線）；後端只做上傳 / 列表 / 清空。

- **依賴載入順序**：jQuery → Materialize → Lodash → `svg-style-lib.js` → `i18n.js` → `locales/*` → `svg-style.js`。
- **後端**：`/` 302 → `/apps/svg-style/`；絕對路徑 API → 不相容 GitHub Pages。

## 3. 後端（Express）

| 檔案 | 角色 |
|---|---|
| `app.js` | static + `/api/upload` + `/api/svg-style`、`/`→302、JSON 404、`PORT||3000` |
| `routes/upload.js` | 共用最小版：`POST /api/upload?folder=svg-style` → src（`public/upload/svg-style/`）|
| `routes/svg-style.js` | 薄後端：`GET /files`（列 src，新→舊）、`POST /clear`（清 src + 殘留 dist）。**`POST /process` 與 `svg-style.txt` 已退役**（顏色適配改為前端 `autoAdapt`）|

- `SRC_DIR = public/upload/svg-style`、`DIST_DIR = SRC_DIR/dist`（本版不再寫入；`/clear` 仍清殘留）。
- **安全**：操作目標寫死（src/dist），不收外部路徑；只處理可見 `.svg`。

## 4. 前端四件式

### 4.1 `index.html`（純結構）
- 防閃爍開機腳本（`localStorage('svg-style-theme')||'dark'`）。
- 結構：側欄（src 清單）、空狀態、`#ss-doc`（`.ss-toolbar`：icon + 檔名 + `#ss-doc-badge`「已處理」；`#ss-frame` sandbox iframe；`#ss-meta`）、loading、drop-overlay、`#file-picker`（accept `.svg`）、side-tools。預覽 深/淺 由 side-tools `#setting-mode` 控制（toolbar 不放預覽切換）。

### 4.2 `svg-style.css`（主題 token + 樣式）
- 家族標準 token（**只管外殼**）+ `--mz-*` 映射。
- `.ss-frame` 固定高（68vh）；`.ss-seg` 分段切換（active = accent）；`.ss-badge`（accent 框）；`.file-flag`（已處理小圓點）。
- 預覽 iframe 內的底色由 `buildSrcdoc` 自帶（依預覽模式），**不在本 CSS**。

### 4.3 `svg-style-lib.js`（核心 library，`window.SvgStyleLib`，純邏輯、不碰 DOM）

| 成員 | 說明 |
|---|---|
| `hasStyleBlock(svg)` | 偵測 SVG 是否含 `<style>…</style>` 區塊（給 UI 決定是否提供「替換」動作；共用 `STYLE_BLOCK_RE`）|
| `replaceStyleBlock(svg, block)` | 把**第一個** `<style>…</style>` 整段**取代**成 `block`（無則原樣回傳）。與 `injectStyle`「新增一段」不同，這是「換掉自帶的那段」 |
| `detectMode(svg)` | 依「面板類」(rect/path…) fill 平均明度偵測原生主題 → `'light'` / `'dark'` |
| `buildAutoStyle(svg)` | **palette-agnostic**：掃描 inline paint 顏色、對**相反主題**用 HSL 明度翻轉（保留色相/彩度）生成 `@media (prefers-color-scheme)` 覆寫；**並另出一段 `@media print`（一律淺色，放最後以 `!important`+源序蓋過深色覆寫）** → `<style data-svg-style-auto>` |
| `autoAdapt(svg)` | 移除舊自動區塊（**冪等**）後注入 `buildAutoStyle` 結果 → 同圖雙向 dark/light 自適應。**現為預覽/下載引擎**（取代寫死的 `injectStyle`+`svg-style.txt`）|
| `buildPreviewSvg(processedSvg, isLight)` | 把 `@media (prefers-color-scheme: light\|dark)` 改寫成 `@media all` / `@media not all`，強制預覽某主題（不靠系統偏好；**兩種 scheme 都處理**）|
| `buildSrcdoc(svgMarkup, isLight)` | 包成 sandbox iframe 用的完整 HTML（依模式給底色、置中、`svg{max-width:100%}`）|
| `isSafeLink` / `isUploadable(.svg)` / `basename` / `encodePath` / `fileUrl` / `distUrl` | 路徑 / 白名單 / 編碼 |
| `fetchText` / `fetchReplaceStyle` | 讀 src SVG / 讀 svg-style-replace.txt（替換樣板）|
| `uploadFile` / `listFiles` / `processAll` / `clearFolder` | 伺服器溝通（`{ ok }`）|
| `formatSize` / `timestamp` / `escapeHtml` | 工具 |

### 4.4 `svg-style.js`（控制器，碰 DOM）
- `renderPreview()`：`injectStyle(src,style)` → `buildPreviewSvg(isLight)` → `buildSrcdoc` → `frame.srcdoc`；更新 meta。
- 預覽 深/淺：**跟隨 app 主題**（side-tools `#setting-mode`）；`isLight = state.theme==='light'`，`toggleTheme` 後 `renderPreview()` 重建 srcdoc。無獨立預覽切換。
- `processedCurrent()`＝預覽/下載的單一真相：預設走 `autoAdapt(src)`（自動雙向適配）；「替換 `<style>`」toggle 開啟時改走 `replaceStyleBlock`。meta 標示偵測到的原生主題。
- 上傳 / 拖拉 / 清單 / `downloadCurrent`（blob = `processedCurrent()`）/ `clearFolder` / app 主題 / i18n。
- **替換 `<style>`（手動、純前端、即時）**：選/拖檔後 `hasStyleBlock(src)` → toolbar `#ss-style-badge`**含/無 `<style>` 兩種都顯示**（`含` 用 `.has` 提亮、`無` muted；文字由 JS 依偵測填入、隨語系更新）＋ side-tool `#setting-replace-style`（`find_replace`）**只在有 `<style>` 時顯示**（gate）。點按為 **toggle**：開＝`processedCurrent()` 改走 `replaceStyleBlock(src, replaceText)`、`.active`、meta 加「已替換 `<style>`」；再點還原為注入檢視。**只動目前檔、不寫 `dist/`**（決議：並存 / 即時預覽＋可下載 / 替換內容晚定）。切檔一律 `styleReplaced=false`。

## 5. 關鍵設計決策（與理由 / 替代方案）

1. **後端 src→dist 寫回（非純前端）。** 採標準上傳骨架並真的把處理結果寫回 `dist/`，兌現「src→dist 管線」、可持久化（owner 選定）。替代：純前端只下載（最簡、可上 Pages）。**〔已退役〕** 最終改為純前端 `autoAdapt` + 下載（見 #10）。
2. **lib 放 `injectStyle`（引擎回字串那側）。** 注入是純字串運算 → 進 lib（同 xlsx `buildSheetTable`）。**前後端逐字一致**，確保 preview === dist。**〔已退役〕** `injectStyle` / `svg-style.txt` / 後端 `/process` 均已移除（見 #10）；改由前端單一引擎，preview === 下載。
3. **冪等注入。** 已含同段樣式（重跑 / 來源已處理）則跳過，避免重複 `<style>`。
4. **sandbox 預覽（比 html-viewer 更嚴）。** `<iframe sandbox="">`（不給 allow-scripts）；SVG 可含 script，全 sandbox 最安全。原型用 `innerHTML` 直接塞進本頁 DOM（XSS 風險）→ 收斂掉。
5. **強制 @media 預覽。** 把 `prefers-color-scheme:light` 改寫成 `@media all`/`not all`，預覽不靠系統偏好（沿用原型巧法）。
6. **預覽 深/淺 跟隨 app 主題（side-tools display mode）。** 統一由 `#setting-mode` 控制，少一個控制項、心智更簡單；切主題即重建預覽。（曾做成獨立分段切換，後收斂為跟隨主題。）
7. **curated rgb 對映。** 覆寫綁 Claude 深色 palette 的精確 `rgb()`；通用深↔淺反轉會毀彩色圖，不採。
8. **「替換 `<style>`」是並存的第二條路、純前端、手動。** 自動適配（`autoAdapt`）對「colors 來自 inline `style="rgb(...)"`」的圖有效；對「自帶 `<style>`／用 class」的圖無效。故有 `replaceStyleBlock`：偵測既有 `<style>`（`hasStyleBlock`）後，由使用者按 side-tool 手動把那段**整段換掉**——只對目前檔即時套用、可下載。替換內容讀 `svg-style-replace.txt`（目前 placeholder，實際內容待提供；前端 `no-store` 即時 fetch）。純前端、不碰後端。
10. **自動適配（palette-agnostic）取代寫死的 `svg-style.txt`。** 起初 `svg-style.txt` 把「某組 dark palette + 固定 fill/text 角色」寫死；但 Claude 近期改出 **light-style、無 `<style>`、且 fill/text 角色對調** 的 SVG（文字用深色、面板用淡色），舊對映幾乎命中不到。改為從 SVG 自身顏色推導：`detectMode` 判原生主題 → `buildAutoStyle` 對**相反主題**逐色做 **HSL 明度翻轉（保留色相/彩度）**（非整圖 `invert()`，藍仍是藍、只深淺對調）→ `autoAdapt` 注入 `@media` 覆寫。原生主題顯示原圖、相反主題顯示翻轉版 → 任何 palette、不論起始 light/dark 都雙向適配。選擇器用 `[style*="fill:rgb(…)"]`（含 prop 前綴，比舊的 `tag[style*="rgb(…)"]` 精準）。**為預覽/下載的唯一引擎；舊 `injectStyle`／`svg-style.txt`／後端 `/process` 已退役（後端只剩 `/files`、`/clear`）。**
    另出 **`@media print` 一律淺色**（不論螢幕主題）：原生淺色→沿用原值、原生深色→用翻轉淺色值；放在 `<style>` 最後，列印時以同特異度 `!important`+源序蓋過 `@media (prefers-color-scheme: dark)`。**前提：SVG 以 inline 方式嵌入 `.md`/HTML**（以 `<img src=…svg>` 引用時，host 的 print media 不會傳進 SVG → 此時改靠「以淺色模式瀏覽器列印」走 prefers-color-scheme）。`buildPreviewSvg` 只改寫 prefers-color-scheme、**不動 `@media print`**（螢幕預覽不受影響）。
11. **預覽 iframe 永久 `pointer-events:none`（拖拉上傳的坑）。** 預覽是 sandbox `<iframe>`，會**攔截**落在其上的 drag/drop（另一份文件、又無 allow-scripts 無法回傳），導致「拖到已顯示的 SVG 上」無法上傳。只在 `dragenter` 時才關 iframe 指標事件**不夠**——「快速直接拖到圖上」的第一個事件已落入 iframe，父頁來不及關（慢拖先經空白處才有效，正是此 bug 的徵狀）。解法：iframe **永久** `pointer-events:none`（CSS），drop 一律穿透到父文件、冒泡到 `window`，無時序漏洞；預覽本就唯讀，關掉指標事件無損（下載走側鍵）。**此坑對所有「sandbox iframe 預覽 + 全頁拖拉上傳」的 viewer 類通用**，可考慮上收家族 §4.7。

## 6. 與 viewer 系列的關係（家族 §4.7）

svg-style 與 `xlsx-viewer` 同屬「**核心是純字串運算 → 進 lib**」這側（`autoAdapt` vs `buildSheetTable`），對照 `docx-/pptx-viewer`（引擎直接寫 DOM、留控制器）。差異：svg-style 是**轉換工具**（適配後由前端下載交付；無伺服器寫回），viewer 是唯讀呈現；但骨架（上傳 / 清單 / 清空 / side-tool / 主題 / i18n / sandbox 預覽）一致。

## 7. 主題 / i18n / 安全

- **主題**：app 外殼 CSS 變數 light/dark（預設 dark）；**SVG 預覽 深/淺跟隨此主題**（同一個 `#setting-mode`）。防閃爍 + materialize-dark。
- **i18n**：引擎 + locales×3，預設 `zh-Hant`；SVG 內容是 **data，永不翻譯**（meta 文字隨語系）。
- **安全**：sandbox `""`（擋 SVG script）；上傳白名單 `.svg`；`isSafeLink`；後端目標寫死、`{ ok }`、`confirm`。

## 8. 已知限制與取捨

- **顏色來源限 inline**：`autoAdapt` 掃 inline `style="…rgb()/#hex…"`；顏色若來自 class + `<style>`（非 inline）不會被適配 → 改走「替換 `<style>`」路徑。`fill="…"` 等 presentation 屬性（非 style）目前不處理。
- **明度翻轉的取捨**：中間明度（L≈0.5）翻轉後變化小；高彩度色在極端明度可能略顯生硬。微調（壓縮對比、跳過近黑/近白）屬後續。
- **`@media print` 需 inline 嵌入**：SVG 以 `<img>`／`![]()` 引用時，host 的 print media 不會傳進 SVG；只有整段 `<svg>` inline 進 `.md`/HTML 才會觸發列印淺色。
- **dist 為舊產物**：本版不再寫入 dist；殘留檔由 `/clear` 一併清掉（不進版控）。
- **`svg-style-replace.txt` 目前是 placeholder（空樣式）**：替換機制（偵測 + 按鈕 + 即時預覽/下載）已完成，實際要替換成什麼樣式待提供（應為「完整替換樣板」）。

## 9. 參考

- 家族規範：`DESIGN_GUIDELINES.md`（§4.1 拆分、§4.6 前後端逐字一致、§4.7 lib 邊界、§5 視覺、§6 i18n、§8 安全）。
- 流程：`WORKFLOW.md`、`PLAYBOOK.md`。
- 配套：[html-viewer](https://github.com/scottgfhong310/html-viewer)（Claude HTML 片段）；本工具處理 Claude 的深色 SVG 圖表。
