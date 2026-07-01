# svg-style

[English](README.md) · **中文** · [日本語](README.ja.md)

讓 **Claude 匯出的 SVG 圖表同時適應 dark 與 light** 的單頁工具。上傳 `.svg`，它會**從 SVG 自身顏色自動推導**適配：偵測原生主題、對相反主題把每個顏色做 HSL 明度翻轉（保留色相），注入 `@media (prefers-color-scheme)` 覆寫與 `@media print`（一律淺色）。在 sandbox iframe 預覽（跟隨主題），按「下載目前檔」把適配後的 SVG 貼進 `.md`（inline `<svg>`）。後端是薄 Express（上傳 / 列表 / 清空）。

- 🎨 **自動雙向適配（palette-agnostic）** — 從 SVG 自身 inline 顏色推導 dark↔light（HSL 明度翻轉、保留色相/彩度）；不需手維護對映表，且不論 SVG 原生 light 或 dark 都適用
- 🖨️ **列印一律淺色** — 另出一段 `@media print`，不論螢幕主題列印都是淺色（需 SVG 以 **inline** 方式嵌入，非 `<img>`）
- 👁️ **sandbox 預覽** — 在 `<iframe sandbox>`（不給 `allow-scripts`）渲染；預覽**跟隨 app 主題**並強制改寫 media query，獨立於系統偏好
- 📥 **拖拉上傳** — 把 `.svg` 拖到任意位置；存為 **src**（`public/upload/svg-style/`）；同名覆寫
- 🔁 **替換 `<style>`（選用）** — 若 SVG 自帶 `<style>` 區塊，可用 side-tool 整段替換成樣板（`svg-style-replace.txt`）
- 💾 下載目前**適配後**檔；🗂️ 檔案清單；🧹 清空
- 🌗 **app light/dark 主題**（SVG 預覽跟隨它）· 🌐 **三語 UI**（繁體中文 / English / 日本語，預設繁中）
- 🛡️ **路徑安全** — 擋 `..`、反斜線、`javascript:` / `file:` 協定、protocol-relative `//`、非允許清單的絕對路徑

> 與 Claude artifact 工具配套（如 [html-viewer](https://github.com/scottgfhong310/html-viewer)）：Claude 的 SVG 圖表 palette 不一、且可能 light 或 dark 起始；svg-style 從每張圖自身推導適配，不需固定對映表。前端庫（jQuery、Materialize、Lodash、Material Icons）走 CDN——零 build。

## 快速開始

需要 Node.js 18+。

```bash
npm install
npm start
# 開啟 http://localhost:3000/apps/svg-style/
```

以 `PORT` 改 port：`PORT=8080 npm start`。

## 目錄結構

```
svg-style/
├── app.js                          # 獨立 Express 伺服器（static + 兩支 API）
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=svg-style（multer、多檔、覆寫）→ src
│   └── svg-style.js                # 薄後端：GET /files、POST /clear（顏色適配全在前端）
└── public/
    ├── apps/svg-style/             # 前端（服務於 /apps/svg-style/）
    │   ├── index.html · svg-style.css · svg-style.js · svg-style-lib.js
    │   ├── svg-style-replace.txt   # 選用「替換 <style>」樣板（純前端 fetch；placeholder）
    │   ├── materialize-dark.css · side-tool.css · thinking-dot.css
    │   ├── i18n.js · locales/{zh-Hant,en,ja}.js
    └── upload/svg-style/           # src（上傳的 SVG；不進版控，附一個 sample）
        └── dist/                   # 舊產出（本版不再寫入；由 /clear 清殘留；不進版控）
```

## API

| Method / Path | 說明 |
|---|---|
| `POST /api/upload?folder=svg-style` | 上傳 SVG 到 src（form 欄位 `myFiles`、多檔；覆寫）|
| `GET /api/svg-style/files` | 列出 src SVG（新→舊）|
| `POST /api/svg-style/clear` | 刪除 src（與殘留 dist）下所有可見 SVG |

靜態：src `/upload/svg-style/<name>`。所有回應 `{ ok }` 信封。顏色適配全在瀏覽器端，無伺服器處理端點。

## 核心 library（`SvgStyleLib`）

純邏輯、不碰 DOM。引擎是 `autoAdapt(svg)`——預覽與下載的唯一真相：

- `detectMode(svg)` — 以面板（rect/path…）fill 明度判原生主題 → `'light'` / `'dark'`
- `buildAutoStyle(svg)` — 掃 inline paint 顏色，對相反主題逐色以 HSL 明度翻轉（保留色相）生成 `@media (prefers-color-scheme)` 覆寫，另出 `@media print` 一律淺色
- `autoAdapt(svg)` — 移除舊自動區塊（**冪等**）後在 `<svg>` 後注入新區塊
- `buildPreviewSvg`（強制 `@media (prefers-color-scheme)` 供預覽）、`buildSrcdoc`（sandbox iframe HTML）
- `hasStyleBlock` / `replaceStyleBlock`（選用的「替換 `<style>`」路徑）
- `isSafeLink`、`isUploadable`（`.svg`）、`fileUrl`、`fetchText`/`fetchReplaceStyle`、`uploadFile`/`listFiles`/`clearFolder`、`formatSize`/`timestamp`

## 備註

- 適配讀取元素上 **inline `style="…rgb()/#hex…"`** 的顏色（Claude 圖表的配色方式）。若 SVG 顏色來自 class + `<style>`，改走**替換 `<style>`** 路徑。presentation 屬性（`fill="…"`）不對映。
- `@media print` 一律淺色只在 SVG 以 **inline**（`<svg>…</svg>`）嵌入時生效；以 `<img>` 引用時 host 的 print media 不會傳進 SVG。
- 前端以**絕對路徑**呼叫 API，須由本 Node 伺服器從**站台根**提供。**不相容 GitHub Pages。**
- 本 app 屬 **nodeapp WebApp 家族**；共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)。

## 授權

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
