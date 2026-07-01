# svg-style

[English](README.md) · [中文](README.zh-Hant.md) · **日本語**

**Claude が書き出す SVG 図を dark と light の両方に対応**させる単一ページツール。`.svg` をアップロードすると、SVG 自身の色から適応を**自動導出**します：ネイティブテーマを判定し、反対テーマ向けに各色の明度を反転（色相は保持）して、`@media (prefers-color-scheme)` オーバーライドと `@media print`（常にライト）ブロックを注入します。サンドボックス iframe でプレビュー（テーマ連動）し、「現在のファイルをダウンロード」で適応済み SVG を `.md` に inline `<svg>` として貼り付けます。バックエンドは軽量な Express（アップロード / 一覧 / クリア）。

- 🎨 **自動双方向適応（パレット非依存）** — SVG 自身のインライン色から dark↔light を導出（HSL 明度反転・色相/彩度を保持）。写像表の手動保守が不要で、SVG が light・dark どちらのネイティブでも対応
- 🖨️ **印刷は常にライト** — `@media print` ブロックも出力し、画面テーマに関わらず印刷はライト（SVG を **inline** 埋め込みする必要あり。`<img>` は不可）
- 👁️ **サンドボックスプレビュー** — `<iframe sandbox>`（`allow-scripts` なし）で描画；プレビューは**アプリテーマに連動**し media query を強制（OS 設定と独立）
- 📥 **ドラッグ＆ドロップ** — `.svg` をドロップ；**src**（`public/upload/svg-style/`）に保存；同名は上書き
- 🔁 **`<style>` 置換（任意）** — SVG が自前の `<style>` ブロックを持つ場合、side-tool でテンプレート（`svg-style-replace.txt`）に丸ごと置換
- 💾 **適応済み**の現在ファイルをダウンロード；🗂️ ファイル一覧；🧹 クリア
- 🌗 **アプリの light/dark テーマ**（SVG プレビューが連動）· 🌐 **多言語 UI**（繁體中文 / English / 日本語、既定は繁中）
- 🛡️ **パス安全性** — `..`・バックスラッシュ・`javascript:` / `file:`・protocol-relative `//`・許可リスト外の絶対パスを遮断

> Claude アーティファクト系ツール（例：[html-viewer](https://github.com/scottgfhong310/html-viewer)）と対になります。Claude の SVG 図はパレットが一定でなく light・dark どちらのネイティブもあり得ますが、svg-style は各 SVG 自身から適応を導出するため固定の写像表は不要です。フロントエンドのライブラリ（jQuery、Materialize、Lodash、Material Icons）は CDN から——ビルド不要。

## クイックスタート

Node.js 18+ が必要です。

```bash
npm install
npm start
# http://localhost:3000/apps/svg-style/ を開く
```

ポート変更は `PORT`：`PORT=8080 npm start`。

## ディレクトリ構成

```
svg-style/
├── app.js                          # スタンドアロン Express サーバ（static + API 2 本）
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=svg-style（multer・複数・上書き）→ src
│   └── svg-style.js                # 薄いバックエンド：GET /files、POST /clear（色適応はフロント）
└── public/
    ├── apps/svg-style/             # フロントエンド（/apps/svg-style/ で配信）
    │   ├── index.html · svg-style.css · svg-style.js · svg-style-lib.js
    │   ├── svg-style-replace.txt   # 任意「<style> 置換」テンプレート（フロントで fetch；placeholder）
    │   ├── materialize-dark.css · side-tool.css · thinking-dot.css
    │   ├── i18n.js · locales/{zh-Hant,en,ja}.js
    └── upload/svg-style/           # src（アップロードされた SVG；git 管理外、サンプル 1 つ同梱）
        └── dist/                   # 旧出力（本版では書き出さない；/clear が残りを削除；git 管理外）
```

## API

| Method / Path | 説明 |
|---|---|
| `POST /api/upload?folder=svg-style` | SVG を src にアップロード（form フィールド `myFiles`・複数・上書き）|
| `GET /api/svg-style/files` | src の SVG を一覧（新しい順）|
| `POST /api/svg-style/clear` | src（と残った dist）の可視 SVG をすべて削除 |

静的：src `/upload/svg-style/<name>`。すべて `{ ok }` エンベロープ。色の適応はブラウザ側で完結し、サーバ側の処理エンドポイントはありません。

## コアライブラリ（`SvgStyleLib`）

純ロジック・DOM 非依存。エンジンは `autoAdapt(svg)`——プレビューとダウンロードの単一の真実：

- `detectMode(svg)` — サーフェス（rect/path…）fill の明度からネイティブテーマを判定 → `'light'` / `'dark'`
- `buildAutoStyle(svg)` — インラインの paint 色を走査し、反対テーマ向けに各色を HSL 明度反転（色相保持）した `@media (prefers-color-scheme)` オーバーライド、加えて `@media print` の常時ライトを出力
- `autoAdapt(svg)` — 以前の自動ブロックを除去（**冪等**）し `<svg>` 直後に新規注入
- `buildPreviewSvg`（プレビュー用に `@media (prefers-color-scheme)` を強制）、`buildSrcdoc`（サンドボックス iframe HTML）
- `hasStyleBlock` / `replaceStyleBlock`（任意の「`<style>` 置換」経路）
- `isSafeLink`、`isUploadable`（`.svg`）、`fileUrl`、`fetchText`/`fetchReplaceStyle`、`uploadFile`/`listFiles`/`clearFolder`、`formatSize`/`timestamp`

## 備考

- 適応は要素の **インライン `style="…rgb()/#hex…"`** の色を読み取ります（Claude の図の配色方式）。色が class + `<style>` 由来の場合は **`<style>` 置換**経路を使用。presentation 属性（`fill="…"`）は写像しません。
- `@media print` の常時ライトは、SVG を **inline**（`<svg>…</svg>`）で埋め込んだ場合のみ有効。`<img>` 参照ではホストの print media が SVG に届きません。
- フロントエンドは API を**絶対パス**で呼ぶため、本 Node サーバが**サイトルート**から配信する必要があります。**GitHub Pages 非対応。**
- 本アプリは **nodeapp WebApp ファミリー**に属します。共通規約は [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family) を参照。

## ライセンス

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
