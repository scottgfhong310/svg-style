# svg-style

**English** · [中文](README.zh-Hant.md) · [日本語](README.ja.md)

A single-page tool that makes **dark-authored SVG diagrams light-mode adaptive**. Upload an `.svg`, and it injects a `<style>` block (from `svg-style.txt`) right after the opening `<svg>` tag — a `@media (prefers-color-scheme: light)` override that remaps the dark palette to light equivalents. Preview in a sandboxed iframe (force dark/light), then **Process** writes the styled output to `dist/`. Backed by a lightweight Express server (upload → process → clear).

- 🎨 **Light-mode injection** — adds `@media (prefers-color-scheme: light)` overrides so a dark SVG self-adapts when viewed in light mode; the dark original is untouched
- 👁️ **Sandboxed preview** — renders in an `<iframe sandbox>` (no `allow-scripts`); a Dark/Light segment **forces** the media query for preview, independent of the OS setting and of the app theme
- 📥 **Drag & drop upload** — drop `.svg` anywhere; stored as **src** (`public/upload/svg-style/`); same name overwrites
- ⚙️ **Process src → dist** — server injects the style into every src SVG and writes to `dist/` (`public/upload/svg-style/dist/`); idempotent (won't double-inject)
- 💾 **Download** the styled current file; 🗂️ file list with a "processed" flag; 🧹 clear (src + dist)
- 🌗 **Light / Dark app theme** (separate from the SVG preview mode) · 🌐 **Multilingual UI** (繁體中文 / English / 日本語, default 繁體中文)
- 🛡️ **Path safety** — blocks `..`, backslashes, `javascript:` / `file:` schemes, protocol-relative `//`, non-allow-listed absolute paths

> Pairs with the Claude-artifact tooling (e.g. [html-viewer](https://github.com/scottgfhong310/html-viewer)): Claude's dark SVG diagrams use a fixed palette, and `svg-style.txt` maps exactly that palette to light. Front-end libs (jQuery, Materialize, Lodash, Material Icons) load from CDN — no build step.

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
│   └── svg-style.js                # GET /files, POST /process (src→dist), POST /clear
└── public/
    ├── apps/svg-style/             # Front end (served at /apps/svg-style/)
    │   ├── index.html · svg-style.css · svg-style.js · svg-style-lib.js
    │   ├── svg-style.txt           # injection template (front + back both read; preview === dist)
    │   ├── materialize-dark.css · side-tool.css · thinking-dot.css
    │   ├── i18n.js · locales/{zh-Hant,en,ja}.js
    └── upload/svg-style/           # src (uploaded SVGs; git-ignored, one sample shipped)
        └── dist/                   # processed outputs (created at runtime; git-ignored)
```

## API

| Method / Path | Description |
|---|---|
| `POST /api/upload?folder=svg-style` | Upload SVGs to src (form field `myFiles`, multi-file; overwrites) |
| `GET /api/svg-style/files` | List src SVGs (each with a `processed` flag) |
| `POST /api/svg-style/process` | Inject `svg-style.txt` into every src SVG → write to `dist/` |
| `POST /api/svg-style/clear` | Delete all visible SVGs in src and dist |

Static: src `/upload/svg-style/<name>`, dist `/upload/svg-style/dist/<name>`. All responses use the `{ ok }` envelope.

## Core library (`SvgStyleLib`)

Pure logic, no DOM. `injectStyle(svg, styleText)` (idempotent) is **byte-identical to the backend** so the preview equals the written `dist`. Also: `buildPreviewSvg` (force `@media`), `buildSrcdoc` (sandbox iframe HTML), `isSafeLink`, `isUploadable` (`.svg`), `fileUrl`/`distUrl`, `fetchText`/`fetchStyle`, `uploadFile`/`listFiles`/`processAll`/`clearFolder`, `formatSize`/`timestamp`.

## Notes

- The override matches **exact `rgb(...)`** values inline in the SVG (Claude's dark diagram palette). SVGs using other colors / hex / named colors won't adapt — `svg-style.txt` is a curated map, edit it to extend.
- The front end calls APIs with **absolute paths**, so it must be served from the **site root** by this Node server. **Not GitHub-Pages-compatible.**
- This app belongs to the **nodeapp WebApp family**; shared conventions live in [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family).

## License

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
