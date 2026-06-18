# svg-style — Session context

把**深色 SVG 圖表加上淺色自適應**的單頁工具：上傳 `.svg` → 在 `<svg>` 後注入 `svg-style.txt` 的 `@media (prefers-color-scheme: light)` 覆寫 → **sandbox iframe** 預覽（強制深/淺）→「處理」把結果寫到 `dist/`。輕量 Express 後端（上傳 → 處理 → 清空）。由 `html-viewer` 起手式複製改名而來（Path A），共用家族 canon（主題 / i18n / 四件式 / side-tool）。與 Claude artifact 工具配套（Claude 深色 SVG 圖表 palette → 淺色）。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程、`PLAYBOOK.md` 逐步劇本）。**改動前請先讀那幾份，照其中 canon 做。**

**設計細節（架構 / 逐模組 / 決策 / 限制）見 [DESIGN.md](./DESIGN.md)。**

## 結構

```
app.js                              # Express 入口：port 3000；/ → 302 /apps/svg-style/
routes/upload.js                    # POST /api/upload?folder=svg-style（共用最小版）→ src
routes/svg-style.js                 # GET /files、POST /process（src→dist）、POST /clear
public/apps/svg-style/              # 前端（服務於 /apps/svg-style/）
├─ index.html · svg-style.css · svg-style.js · svg-style-lib.js
├─ svg-style.txt                    # 注入樣板（前端 fetch、後端讀同一份）
├─ materialize-dark.css · side-tool.css · thinking-dot.css
├─ i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/svg-style/            # src（上傳的 SVG；不進版控，附一個 sample）
└─ dist/                            # 處理產出（執行期 mkdir；不進版控）
```

## 執行 / 驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/svg-style/
```

## 本 app 的 canon 重點

- **核心：樣式注入（src→dist 管線）**。`svg-style.txt` 是一段 `@media (prefers-color-scheme: light)` 覆寫，用**精確 `rgb(...)`** 比對 SVG 內 inline style，把深色 palette 對映到淺色。`injectStyle` 在 `<svg>` 開標籤後插入該段。
- **lib 邊界（引擎回字串 → 進 lib）**：`svg-style-lib.js`（`window.SvgStyleLib`，純邏輯、不碰 DOM）裝 `injectStyle`（**冪等**：已含同段樣式則跳過）、`buildPreviewSvg`（把 `@media (prefers-color-scheme:light)` 改寫成 `@media all`/`@media not all` 供強制預覽）、`buildSrcdoc`（sandbox iframe 用 HTML）、`isSafeLink`、`isUploadable(.svg)`、`fileUrl`/`distUrl`、`fetchText`/`fetchStyle`、`uploadFile`/`listFiles`/`processAll`/`clearFolder`、`formatSize`/`timestamp`。
  - **前端 `injectStyle` 與後端 `routes/svg-style.js` 的 `injectStyle` 逐字一致**（同 regex + 同冪等判斷）→ 確保**預覽 === 寫入的 dist**（同 §4.6 thinking-dot 原則）。
- **控制器** `svg-style.js`（碰 DOM）：上傳 / 拖拉 / 清空、選檔→預覽、批次處理（`/process`）、下載目前檔、app 主題、i18n。
- **預覽（sandbox）**：`<iframe sandbox>`（**空值＝全 sandbox，不給 allow-scripts**；SVG 不需 script）。`srcdoc` 由 `buildSrcdoc(buildPreviewSvg(injectStyle(src,style), isLight), isLight)` 組出（自帶底色）。預覽 **深/淺 跟隨 app 主題**（side-tools `#setting-mode`）——`isLight = state.theme==='light'`；`toggleTheme` 後呼叫 `renderPreview()` 重建 srcdoc。（無獨立預覽切換。）
- **主題**：CSS 變數 light/dark，**預設 dark**（`localStorage('svg-style-theme')`）；防閃爍 + materialize-dark。SVG 預覽 深/淺 **跟隨**此主題（同一個 `#setting-mode` 控制）。
- **side-tool**：`#setting-menu` / `#setting-mode`（app 主題）/ `#setting-lang` / `#setting-process`（`auto_fix_high`，src→dist）/ `#setting-download`（只在開檔時顯示）/ `#setting-clear`（清空，hover 轉紅）；〔正統〕flex `.side-tools`。
- **i18n**：`i18n.js` + `locales/*.js`，`data-i18n`，預設 `zh-Hant`。SVG 內容是 **data，永不翻譯**。
- **安全**：sandbox `""` 渲染（擋 SVG 內 script）；上傳白名單 `.svg`；`isSafeLink`；後端操作目標寫死（src/dist）、`{ ok }` 信封、`confirm`；jQuery 3.7.1、後端不依賴 lodash。
- **限制**：覆寫綁 Claude 深色 palette 的精確 `rgb()`；其他配色不會自適應（`svg-style.txt` 為策劃式對映表，要擴充就編輯）。
- **InProgress 鏡像**：同名前端回灌到 `InProgress/public/apps/svg-style/`，route 掛在 InProgress 的 `/api/svg-style`；上傳沿用 InProgress 共用 `/api/upload?folder=svg-style`（雙鍵 `{ ok, success }`，前端查 `resp.ok`）。
- **preview**：`GitHub/.claude/launch.json` 有一筆 `svg-style`（`node svg-style/app.js`，port 3000）。
