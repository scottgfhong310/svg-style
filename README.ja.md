# svg-style

[English](README.md) · [中文](README.zh-Hant.md) · **日本語**

**ダーク配色の SVG 図にライトモード対応を付与**する単一ページツール。`.svg` をアップロードすると、`<svg>` 開始タグの直後に `svg-style.txt` の `<style>` ブロック——ダーク配色をライト相当へ写像する `@media (prefers-color-scheme: light)` オーバーライド——を注入します。サンドボックス iframe でプレビュー（ダーク/ライトを強制）し、「処理」で結果を `dist/` に書き出し。バックエンドは軽量な Express（アップロード → 処理 → クリア）。

- 🎨 **ライト注入** — `@media (prefers-color-scheme: light)` オーバーライドを追加し、ダーク SVG がライト環境で自動対応。ダーク原本はそのまま
- 👁️ **サンドボックスプレビュー** — `<iframe sandbox>`（`allow-scripts` なし）で描画；ダーク/ライトのセグメントが media query を**強制**（OS 設定・アプリテーマと独立）
- 📥 **ドラッグ＆ドロップ** — `.svg` をドロップ；**src**（`public/upload/svg-style/`）に保存；同名は上書き
- ⚙️ **処理 src → dist** — 各 src SVG にスタイルを注入し `dist/`（`public/upload/svg-style/dist/`）へ書き出し；**冪等**（二重注入しない）
- 💾 注入済みの現在ファイルをダウンロード；🗂️「処理済み」フラグ付きファイル一覧；🧹 クリア（src + dist）
- 🌗 **アプリの light/dark テーマ**（SVG プレビューモードとは別）· 🌐 **多言語 UI**（繁體中文 / English / 日本語、既定は繁中）
- 🛡️ **パス安全性** — `..`・バックスラッシュ・`javascript:` / `file:`・protocol-relative `//`・許可リスト外の絶対パスを遮断

> Claude アーティファクト系ツール（例：[html-viewer](https://github.com/scottgfhong310/html-viewer)）と対になります。Claude のダーク SVG 図は固定パレットを使い、`svg-style.txt` がそのパレットをライトへ正確に写像します。フロントエンドのライブラリ（jQuery、Materialize、Lodash、Material Icons）は CDN から——ビルド不要。

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
│   └── svg-style.js                # GET /files、POST /process（src→dist）、POST /clear
└── public/
    ├── apps/svg-style/             # フロントエンド（/apps/svg-style/ で配信）
    │   ├── index.html · svg-style.css · svg-style.js · svg-style-lib.js
    │   ├── svg-style.txt           # 注入テンプレート（前後で共有；preview === dist）
    │   ├── materialize-dark.css · side-tool.css · thinking-dot.css
    │   ├── i18n.js · locales/{zh-Hant,en,ja}.js
    └── upload/svg-style/           # src（アップロードされた SVG；git 管理外、サンプル 1 つ同梱）
        └── dist/                   # 処理出力（実行時に生成；git 管理外）
```

## API

| Method / Path | 説明 |
|---|---|
| `POST /api/upload?folder=svg-style` | SVG を src にアップロード（form フィールド `myFiles`・複数・上書き）|
| `GET /api/svg-style/files` | src の SVG を一覧（各 `processed` フラグ付き）|
| `POST /api/svg-style/process` | 各 src SVG に `svg-style.txt` を注入 → `dist/` に書き出し |
| `POST /api/svg-style/clear` | src と dist の可視 SVG をすべて削除 |

静的：src `/upload/svg-style/<name>`、dist `/upload/svg-style/dist/<name>`。すべて `{ ok }` エンベロープ。

## コアライブラリ（`SvgStyleLib`）

純ロジック・DOM 非依存。`injectStyle(svg, styleText)`（冪等）は**バックエンドとバイト一致**で、プレビュー＝書き出した `dist` を保証。ほかに：`buildPreviewSvg`（`@media` 強制）、`buildSrcdoc`（サンドボックス iframe HTML）、`isSafeLink`、`isUploadable`（`.svg`）、`fileUrl`/`distUrl`、`fetchText`/`fetchStyle`、`uploadFile`/`listFiles`/`processAll`/`clearFolder`、`formatSize`/`timestamp`。

## 備考

- オーバーライドは SVG 内インラインの**厳密な `rgb(...)`** 一致（Claude のダーク図パレット）。他の色 / hex / 名前付き色の SVG は対応しません——`svg-style.txt` はキュレートされた写像表で、拡張は編集で。
- フロントエンドは API を**絶対パス**で呼ぶため、本 Node サーバが**サイトルート**から配信する必要があります。**GitHub Pages 非対応。**
- 本アプリは **nodeapp WebApp ファミリー**に属します。共通規約は [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family) を参照。

## ライセンス

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
