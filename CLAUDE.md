# svg-style — Session context

讓 **Claude 匯出的 SVG 圖表同時適應 dark 與 light** 的單頁工具：上傳 `.svg` → 前端 `autoAdapt` 從 SVG 自身顏色推導、生成相反主題的 `@media (prefers-color-scheme)` 覆寫 + `@media print`（一律淺色）並注入 → **sandbox iframe** 預覽（跟隨主題）→「下載目前檔」交付（貼進 `.md` inline `<svg>`）。薄 Express 後端（上傳 / 列表 / 清空；顏色適配全在前端）。由 `html-viewer` 起手式複製改名而來（Path A），共用家族 canon（主題 / i18n / 四件式 / side-tool）。與 Claude artifact 工具配套。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程、`PLAYBOOK.md` 逐步劇本）。**改動前請先讀那幾份，照其中 canon 做。**

**設計細節（架構 / 逐模組 / 決策 / 限制）見 [DESIGN.md](./DESIGN.md)。**

## 結構

```
app.js                              # Express 入口：port 3000；/ → 302 /apps/svg-style/
routes/upload.js                    # POST /api/upload?folder=svg-style（共用最小版；含檔名消毒 sanitizeUploadName，§3.4）→ src
routes/svg-style.js                 # 薄後端：GET /files、POST /clear（顏色適配全在前端；/process 已退役）
public/apps/svg-style/              # 前端（服務於 /apps/svg-style/）
├─ index.html · svg-style.css · svg-style.js · svg-style-lib.js
├─ svg-style-replace.txt            # 替換樣板（整段換掉 SVG 自帶 <style>；純前端 fetch；placeholder，內容待補）
├─ materialize-dark.css · side-tool.css · thinking-dot.css
├─ i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/svg-style/            # src（上傳的 SVG；不進版控，附一個 sample）
└─ dist/                            # 舊產出（本版不再寫入；/clear 仍會清殘留）
```

## 執行 / 驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/svg-style/
```

## 本 app 的 canon 重點

- **核心：自動雙向適配（palette-agnostic）**。從 SVG 自身 inline 顏色推導：`detectMode` 判原生主題 → `buildAutoStyle` 對**相反主題**逐色做 HSL 明度翻轉（保留色相）→ `autoAdapt` 注入 `@media (prefers-color-scheme)` 覆寫（帶 `data-svg-style-auto`、冪等）。原生主題顯示原圖、相反主題顯示翻轉版 → 任何 Claude palette、light 或 dark 起始都雙向適配，**不需 SVG 自帶 `<style>`、也不需手維護對映表**。另出 **`@media print` 一律淺色**（不論螢幕主題；放最後以 `!important`+源序蓋過深色覆寫；需 SVG inline 嵌入才生效）。**是預覽/下載的唯一引擎**（純前端）。舊的 `injectStyle`+`svg-style.txt`+後端 `/process` 已**退役**，後端只剩 `/files`、`/clear`。
- **lib 邊界（引擎回字串 → 進 lib）**：`svg-style-lib.js`（`window.SvgStyleLib`，純邏輯、不碰 DOM）裝 `injectStyle`（**冪等**：已含同段樣式則跳過）、`buildPreviewSvg`（把 `@media (prefers-color-scheme:light)` 改寫成 `@media all`/`@media not all` 供強制預覽）、`buildSrcdoc`（sandbox iframe 用 HTML）、`isSafeLink`、`isUploadable(.svg)`、`fileUrl`/`distUrl`、`fetchText`/`fetchStyle`、`uploadFile`/`listFiles`/`processAll`/`clearFolder`、`formatSize`/`timestamp`。
  - **前端 `injectStyle` 與後端 `routes/svg-style.js` 的 `injectStyle` 逐字一致**（同 regex + 同冪等判斷）→ 確保**預覽 === 寫入的 dist**（同 §4.6 thinking-dot 原則）。
- **控制器** `svg-style.js`（碰 DOM）：上傳 / 拖拉 / 清空、選檔→預覽、批次處理（`/process`）、下載目前檔、**替換 `<style>`（手動 toggle）**、app 主題、i18n。
- **替換 `<style>`（並存的第二條路，純前端、手動、不寫 dist）**：選/拖檔後 `hasStyleBlock(src)` → toolbar 徽章**含/無 `<style>` 兩種都顯示**（`含` 提亮、`無` muted）＋ side-tool `#setting-replace-style`（`find_replace`）**只在有 `<style>` 時顯示**。點按 toggle：`processedCurrent()` 改用 `replaceStyleBlock(src, replaceText)`（整段換掉第一個 `<style>`）即時更新預覽/下載、`.active`；再點還原自動適配檢視。替換內容讀 `svg-style-replace.txt`（目前 placeholder）。決議：**與 autoAdapt 並存 / 即時預覽＋可下載 / 替換內容晚定**。
- **預覽（sandbox）**：`<iframe sandbox>`（**空值＝全 sandbox，不給 allow-scripts**；SVG 不需 script）。`srcdoc` 由 `buildSrcdoc(buildPreviewSvg(injectStyle(src,style), isLight), isLight)` 組出（自帶底色）。預覽 **深/淺 跟隨 app 主題**（side-tools `#setting-mode`）——`isLight = state.theme==='light'`；`toggleTheme` 後呼叫 `renderPreview()` 重建 srcdoc。（無獨立預覽切換。）
- **主題**：CSS 變數 light/dark，**預設 dark**（`localStorage('svg-style-theme')`）；防閃爍 + materialize-dark。SVG 預覽 深/淺 **跟隨**此主題（同一個 `#setting-mode` 控制）。
- **side-tool**：`#setting-menu` / `#setting-mode`（app 主題）/ `#setting-lang` / `#setting-replace-style`（`find_replace`，替換 `<style>`；只在目前檔有 `<style>` 時顯示，toggle `.active`）/ `#setting-download`（只在開檔時顯示）/ `#setting-clear`（清空，hover 轉紅）；〔正統〕flex `.side-tools`。（`#setting-process` 已隨 `/process` 退役移除。）
- **i18n**：`i18n.js` + `locales/*.js`，`data-i18n`，預設 `zh-Hant`。SVG 內容是 **data，永不翻譯**。
- **安全**：sandbox `""` 渲染（擋 SVG 內 script）；上傳白名單 `.svg`；`isSafeLink`；後端操作目標寫死（src/dist）、`{ ok }` 信封、`confirm`；jQuery 3.7.1、後端不依賴 lodash。
- **限制**：`autoAdapt` 掃 **inline `style="…rgb()/#hex…"`** 的顏色；若 SVG 顏色來自 class + `<style>`（非 inline），改走「替換 `<style>`」路徑。HSL 明度翻轉對中間明度（L≈0.5）變化小。`@media print` 淺色需 SVG **inline 嵌入**才生效（`<img>` 引用時 host print media 不傳進 SVG）。
- **InProgress 鏡像**：同名前端回灌到 `InProgress/public/apps/svg-style/`，route 掛在 InProgress 的 `/api/svg-style`；上傳沿用 InProgress 共用 `/api/upload?folder=svg-style`（雙鍵 `{ ok, success }`，前端查 `resp.ok`）。
- **preview**：`GitHub/.claude/launch.json` 有一筆 `svg-style`（`node svg-style/app.js`，port 3000）。
