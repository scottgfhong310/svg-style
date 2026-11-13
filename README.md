# svg-style

**English** · [中文](README.zh-Hant.md) · [日本語](README.ja.md)

A single-page tool that makes **Claude-exported SVG diagrams adapt to both dark and light**. Upload an `.svg`, and it **auto-derives** the adaptation from the SVG's own colors: it detects the native theme, flips each color's lightness (hue preserved) for the opposite theme, and injects a `@media (prefers-color-scheme)` override plus an `@media print` (always-light) block. Preview in a sandboxed iframe (follows the theme), then **download** the adapted file to paste inline into your `.md`. Backed by a lightweight Express server (upload / list / clear).

- 🎨 **Auto two-way adaptation (palette-agnostic)** — derives dark↔light from the SVG's own inline colors (HSL lightness flip, hue/saturation preserved); no hand-maintained palette map, and it works whether the SVG is light- or dark-native
- 🖨️ **Always-light printing** — also emits an `@media print` block so the diagram prints light regardless of screen theme (needs the SVG embedded **inline**, not via `<img>`)
- 👁️ **Sandboxed preview** — renders in an `<iframe sandbox>` (no `allow-scripts`); preview **follows the app theme** and forces the media query, independent of the OS setting
- 📥 **Drag & drop upload** — drop `.svg` anywhere; stored as **src** (`public/upload/svg-style/`); same name overwrites
- 🔁 **Replace `<style>` (optional)** — when an SVG ships its own `<style>` block, a side-tool can swap it for a template (`svg-style-replace.txt`)
- 💾 **Download** the adapted current file; 🗂️ file list; 🧹 clear
- 🌗 **Light / Dark app theme** (the SVG preview follows it) · 🌐 **Multilingual UI** (繁體中文 / English / 日本語, default 繁體中文)
- 🛡️ **Path safety** — blocks `..`, backslashes, `javascript:` / `file:` schemes, protocol-relative `//`, non-allow-listed absolute paths

> Pairs with the Claude-artifact tooling (e.g. [html-viewer](https://github.com/scottgfhong310/html-viewer)). Claude's SVG diagrams vary in palette and can be light- or dark-native; svg-style derives the adaptation from each SVG itself, so no fixed palette map is needed. Front-end libs (jQuery, Materialize, Lodash, Material Icons) load from CDN — no build step.

## Quick start

Requires Node.js 18+.

```bash
npm install
npm start
# open http://localhost:3000/apps/svg-style/
```

Set `PORT` to change the port: `PORT=8080 npm start`.

## Directory structure

```
svg-style/
├── app.js                          # Standalone Express server (static + 2 APIs)
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=svg-style (multer, multi-file, overwrite) → src
│   └── svg-style.js                # Thin backend: GET /files, POST /clear (color adaptation is front-end)
└── public/
    ├── apps/svg-style/             # Front end (served at /apps/svg-style/)
    │   ├── index.html · svg-style.css · svg-style.js · svg-style-lib.js
    │   ├── svg-style-replace.txt   # optional "replace <style>" template (front-end fetch; placeholder)
    │   ├── materialize-dark.css · side-tool.css · thinking-dot.css
    │   ├── i18n.js · locales/{zh-Hant,en,ja}.js
    └── upload/svg-style/           # src (uploaded SVGs; git-ignored, one sample shipped)
        └── dist/                   # legacy outputs (no longer written; cleared by /clear; git-ignored)
```

## API

| Method / Path | Description |
|---|---|
| `POST /api/upload?folder=svg-style` | Upload SVGs to src (form field `myFiles`, multi-file; overwrites) |
| `GET /api/svg-style/files` | List src SVGs (newest first) |
| `POST /api/svg-style/clear` | Delete all visible SVGs in src (and any leftover dist) |

Static: src `/upload/svg-style/<name>`. All responses use the `{ ok }` envelope. Color adaptation runs entirely in the browser — there is no server-side processing endpoint.

## Core library (`SvgStyleLib`)

Pure logic, no DOM. The engine is `autoAdapt(svg)` — the single source for both preview and download:

- `detectMode(svg)` — native theme from surface (rect/path…) fill lightness → `'light'` / `'dark'`
- `buildAutoStyle(svg)` — scans inline paint colors and emits, for the opposite theme, per-color `@media (prefers-color-scheme)` overrides via HSL lightness flip (hue preserved), plus an `@media print` always-light block
- `autoAdapt(svg)` — strips any prior auto block (idempotent) and injects a fresh one after `<svg>`
- `buildPreviewSvg` (force `@media (prefers-color-scheme)` for preview), `buildSrcdoc` (sandbox iframe HTML)
- `hasStyleBlock` / `replaceStyleBlock` (the optional "replace `<style>`" path)
- `isSafeLink`, `isUploadable` (`.svg`), `fileUrl`, `fetchText`/`fetchReplaceStyle`, `uploadFile`/`listFiles`/`clearFolder`, `formatSize`/`timestamp`

## Notes

- Adaptation reads colors from **inline `style="…rgb()/#hex…"`** on elements (how Claude's diagrams express color). If an SVG's colors come from a class + `<style>` block instead, use the **Replace `<style>`** path. Presentation attributes with a color value (`fill="#5C7894"`) are remapped too; for SVGs drawn with `currentColor`, the root `style="color:…"` foreground is flipped as well.
- The `@media print` always-light block only fires when the SVG is embedded **inline** (`<svg>…</svg>`) in the host document; via `<img>` the host's print media doesn't reach the SVG.
- The front end calls APIs with **absolute paths**, so it must be served from the **site root** by this Node server. **Not GitHub-Pages-compatible.**
- This app belongs to the **nodeapp WebApp family**; shared conventions live in [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family).

## License

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
