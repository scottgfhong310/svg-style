# svg-style

[English](README.md) · **中文** · [日本語](README.ja.md)

把**深色 SVG 圖表加上淺色自適應**的單頁工具。上傳 `.svg`，它會在 `<svg>` 開標籤後注入 `svg-style.txt` 的 `<style>` 區塊——一段 `@media (prefers-color-scheme: light)` 覆寫，把深色 palette 對映成淺色等價值。在 sandbox iframe 預覽（強制深/淺），按「處理」把結果寫到 `dist/`。後端是輕量 Express（上傳 → 處理 → 清空）。

- 🎨 **淺色注入** — 加上 `@media (prefers-color-scheme: light)` 覆寫，讓深色 SVG 在淺色環境自適應；深色原樣不動
- 👁️ **sandbox 預覽** — 在 `<iframe sandbox>`（不給 `allow-scripts`）渲染；深/淺分段**強制**改寫 media query 供預覽，獨立於系統偏好與 app 主題
- 📥 **拖拉上傳** — 把 `.svg` 拖到任意位置；存為 **src**（`public/upload/svg-style/`）；同名覆寫
- ⚙️ **處理 src → dist** — 後端把樣式注入每個 src SVG、寫到 `dist/`（`public/upload/svg-style/dist/`）；**冪等**（不重複注入）
- 💾 下載目前已注入檔；🗂️ 檔案清單含「已處理」標記；🧹 清空（src + dist）
- 🌗 **app light/dark 主題**（與 SVG 預覽模式分開）· 🌐 **三語 UI**（繁體中文 / English / 日本語，預設繁中）
- 🛡️ **路徑安全** — 擋 `..`、反斜線、`javascript:` / `file:` 協定、protocol-relative `//`、非允許清單的絕對路徑

> 與 Claude artifact 工具配套（如 [html-viewer](https://github.com/scottgfhong310/html-viewer)）：Claude 的深色 SVG 圖表用固定 palette，`svg-style.txt` 精確對映該 palette 到淺色。前端庫（jQuery、Materialize、Lodash、Material Icons）走 CDN——零 build。

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
│   └── svg-style.js                # GET /files、POST /process（src→dist）、POST /clear
└── public/
    ├── apps/svg-style/             # 前端（服務於 /apps/svg-style/）
    │   ├── index.html · svg-style.css · svg-style.js · svg-style-lib.js
    │   ├── svg-style.txt           # 注入樣板（前後端共讀；preview === dist）
    │   ├── materialize-dark.css · side-tool.css · thinking-dot.css
    │   ├── i18n.js · locales/{zh-Hant,en,ja}.js
    └── upload/svg-style/           # src（上傳的 SVG；不進版控，附一個 sample）
        └── dist/                   # 處理產出（執行期建立；不進版控）
```

## API

| Method / Path | 說明 |
|---|---|
| `POST /api/upload?folder=svg-style` | 上傳 SVG 到 src（form 欄位 `myFiles`、多檔；覆寫）|
| `GET /api/svg-style/files` | 列出 src SVG（含 `processed` 旗標）|
| `POST /api/svg-style/process` | 把 `svg-style.txt` 注入每個 src SVG → 寫到 `dist/` |
| `POST /api/svg-style/clear` | 刪除 src 與 dist 下所有可見 SVG |

靜態：src `/upload/svg-style/<name>`、dist `/upload/svg-style/dist/<name>`。所有回應 `{ ok }` 信封。

## 核心 library（`SvgStyleLib`）

純邏輯、不碰 DOM。`injectStyle(svg, styleText)`（冪等）**與後端逐字一致**，確保預覽 === 寫入的 `dist`。另有：`buildPreviewSvg`（強制 `@media`）、`buildSrcdoc`（sandbox iframe HTML）、`isSafeLink`、`isUploadable`（`.svg`）、`fileUrl`/`distUrl`、`fetchText`/`fetchStyle`、`uploadFile`/`listFiles`/`processAll`/`clearFolder`、`formatSize`/`timestamp`。

## 備註

- 覆寫靠 SVG 內 inline 的**精確 `rgb(...)`** 比對（Claude 深色圖表 palette）。用其他顏色 / hex / 具名色的 SVG 不會自適應——`svg-style.txt` 是策劃式對映表，要擴充就編輯它。
- 前端以**絕對路徑**呼叫 API，須由本 Node 伺服器從**站台根**提供。**不相容 GitHub Pages。**
- 本 app 屬 **nodeapp WebApp 家族**；共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)。

## 授權

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
