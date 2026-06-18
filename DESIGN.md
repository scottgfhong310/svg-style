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
  ├─ SvgStyleLib.fetchStyle()                  // 讀 svg-style.txt（注入樣板）
  ├─ SvgStyleLib.injectStyle(src, style)       // ★ 純字串、冪等（== 後端）
  ├─ SvgStyleLib.buildPreviewSvg(.., isLight)  // 強制 @media 供預覽
  ├─ SvgStyleLib.buildSrcdoc(.., isLight)      // 包成 sandbox iframe HTML
  ▼
#ss-frame (iframe sandbox="") .srcdoc = ...    // 全 sandbox 渲染（無 script）

「處理」→ POST /api/svg-style/process
  後端讀 svg-style.txt、對每個 src injectStyle、寫到 dist/（== 前端 injectStyle 結果）
```

- **依賴載入順序**：jQuery → Materialize → Lodash → `svg-style-lib.js` → `i18n.js` → `locales/*` → `svg-style.js`。
- **後端**：`/` 302 → `/apps/svg-style/`；絕對路徑 API → 不相容 GitHub Pages。

## 3. 後端（Express）

| 檔案 | 角色 |
|---|---|
| `app.js` | static + `/api/upload` + `/api/svg-style`、`/`→302、JSON 404、`PORT||3000` |
| `routes/upload.js` | 共用最小版：`POST /api/upload?folder=svg-style` → src（`public/upload/svg-style/`）|
| `routes/svg-style.js` | `GET /files`（含 `processed` 旗標）、`POST /process`（src→dist）、`POST /clear`（src+dist）|

- `SRC_DIR = public/upload/svg-style`、`DIST_DIR = SRC_DIR/dist`、`STYLE_FILE = public/apps/svg-style/svg-style.txt`。
- `/process`：讀 `STYLE_FILE`，對每個 src `.svg` `injectStyle` → 寫 `DIST_DIR`（`mkdir -p`）。**後端 `injectStyle` 與前端 lib 逐字一致**（同 regex + 同冪等判斷）。
- **安全**：操作目標寫死（src/dist），不收外部路徑；只處理可見 `.svg`。

## 4. 前端四件式

### 4.1 `index.html`（純結構）
- 防閃爍開機腳本（`localStorage('svg-style-theme')||'dark'`）。
- 結構：側欄（src 清單）、空狀態、`#ss-doc`（`.ss-toolbar`：icon + 檔名 + `#ss-doc-badge`「已處理」+ `#ss-preview-seg` 深/淺分段；`#ss-frame` sandbox iframe；`#ss-meta`）、loading、drop-overlay、`#file-picker`（accept `.svg`）、side-tools。

### 4.2 `svg-style.css`（主題 token + 樣式）
- 家族標準 token（**只管外殼**）+ `--mz-*` 映射。
- `.ss-frame` 固定高（68vh）；`.ss-seg` 分段切換（active = accent）；`.ss-badge`（accent 框）；`.file-flag`（已處理小圓點）。
- 預覽 iframe 內的底色由 `buildSrcdoc` 自帶（依預覽模式），**不在本 CSS**。

### 4.3 `svg-style-lib.js`（核心 library，`window.SvgStyleLib`，純邏輯、不碰 DOM）

| 成員 | 說明 |
|---|---|
| `injectStyle(svg, styleText)` | 在 `<svg ...>` 後插入樣式；**冪等**（已含同段則跳過）。**與後端逐字一致 → preview === dist** |
| `buildPreviewSvg(processedSvg, isLight)` | 把 `@media (prefers-color-scheme:light)` 改寫成 `@media all` / `@media not all`，強制預覽某主題（不靠系統偏好）|
| `buildSrcdoc(svgMarkup, isLight)` | 包成 sandbox iframe 用的完整 HTML（依模式給底色、置中、`svg{max-width:100%}`）|
| `isSafeLink` / `isUploadable(.svg)` / `basename` / `encodePath` / `fileUrl` / `distUrl` | 路徑 / 白名單 / 編碼 |
| `fetchText` / `fetchStyle` | 讀 src SVG / 讀 svg-style.txt |
| `uploadFile` / `listFiles` / `processAll` / `clearFolder` | 伺服器溝通（`{ ok }`）|
| `formatSize` / `timestamp` / `escapeHtml` | 工具 |

### 4.4 `svg-style.js`（控制器，碰 DOM）
- `renderPreview()`：`injectStyle(src,style)` → `buildPreviewSvg(isLight)` → `buildSrcdoc` → `frame.srcdoc`；更新 meta。
- 預覽 深/淺：`#ss-preview-seg` 分段，`applyPreviewMode()` 重建 srcdoc，存 `localStorage('svg-style-preview')`（預設 light）。**獨立於 app 主題切換。**
- 上傳 / 拖拉 / 清單（含 processed 徽章）/ `processAll`（src→dist + 更新徽章）/ `downloadCurrent`（blob = `injectStyle` 結果 == dist）/ `clearFolder` / app 主題 / i18n。

## 5. 關鍵設計決策（與理由 / 替代方案）

1. **後端 src→dist 寫回（非純前端）。** 採標準上傳骨架並真的把處理結果寫回 `dist/`，兌現「src→dist 管線」、可持久化（owner 選定）。替代：純前端只下載（最簡、可上 Pages）；owner 寫回 svg-style.txt（調校台）。
2. **lib 放 `injectStyle`（引擎回字串那側）。** 注入是純字串運算 → 進 lib（同 xlsx `buildSheetTable`）。**前後端逐字一致**（含冪等判斷），確保 preview === dist（§4.6 thinking-dot 原則）。
3. **冪等注入。** 已含同段樣式（重跑 / 來源已處理）則跳過，避免重複 `<style>`。
4. **sandbox 預覽（比 html-viewer 更嚴）。** `<iframe sandbox="">`（不給 allow-scripts）；SVG 可含 script，全 sandbox 最安全。原型用 `innerHTML` 直接塞進本頁 DOM（XSS 風險）→ 收斂掉。
5. **強制 @media 預覽。** 把 `prefers-color-scheme:light` 改寫成 `@media all`/`not all`，預覽不靠系統偏好（沿用原型巧法）。
6. **預覽 深/淺 獨立於 app 主題。** 工具用途是「驗證淺色自適應」，需要與外殼主題分開切換；各自持久化。
7. **curated rgb 對映。** 覆寫綁 Claude 深色 palette 的精確 `rgb()`；通用深↔淺反轉會毀彩色圖，不採。

## 6. 與 viewer 系列的關係（家族 §4.7）

svg-style 與 `xlsx-viewer` 同屬「**核心是純字串運算 → 進 lib**」這側（`injectStyle` vs `buildSheetTable`），對照 `docx-/pptx-viewer`（引擎直接寫 DOM、留控制器）。差異：svg-style 是**轉換工具**（有 src→dist 寫回管線），viewer 是唯讀呈現；但骨架（上傳 / 清單 / 清空 / side-tool / 主題 / i18n / sandbox 預覽）一致。

## 7. 主題 / i18n / 安全

- **主題**：app 外殼 CSS 變數 light/dark（預設 dark）；**SVG 預覽 深/淺另存另切**。防閃爍 + materialize-dark。
- **i18n**：引擎 + locales×3，預設 `zh-Hant`；SVG 內容是 **data，永不翻譯**（meta 文字隨語系）。
- **安全**：sandbox `""`（擋 SVG script）；上傳白名單 `.svg`；`isSafeLink`；後端目標寫死、`{ ok }`、`confirm`。

## 8. 已知限制與取捨

- **綁 Claude palette**：只對命中 `svg-style.txt` 精確 `rgb()` 的 SVG 有效；其他配色不自適應。要擴充就編輯 `svg-style.txt`（前後端共讀同一份）。
- **svg-style.txt 不可線上編輯**（本版未做寫回；要改就改檔再部署）——若要 owner 調校台，屬後續增強。
- **dist 為執行期產物**（不進版控）；clear 會一併清掉。

## 9. 參考

- 家族規範：`DESIGN_GUIDELINES.md`（§4.1 拆分、§4.6 前後端逐字一致、§4.7 lib 邊界、§5 視覺、§6 i18n、§8 安全）。
- 流程：`WORKFLOW.md`、`PLAYBOOK.md`。
- 配套：[html-viewer](https://github.com/scottgfhong310/html-viewer)（Claude HTML 片段）；本工具處理 Claude 的深色 SVG 圖表。
