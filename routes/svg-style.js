/**
 * svg-style
 * ---------
 * 後端 handler，搭配 public/apps/svg-style 前端使用。
 *
 * 流程：上傳的 SVG（src）→ 在 <svg> 開標籤後注入 svg-style.txt 的 <style> 區塊 → 寫到 dist。
 *   - src： public/upload/svg-style/         （沿用共用上傳 /api/upload?folder=svg-style）
 *   - dist：public/upload/svg-style/dist/     （本 router 的 /process 寫入）
 *   - 注入樣板：public/apps/svg-style/svg-style.txt（前端 fetch 同一份，確保 preview === dist）
 *
 * API：
 *   GET  /api/svg-style/files    → 列出 src 下的 .svg（標示是否已有 dist 產出）
 *   POST /api/svg-style/process  → 把所有 src .svg 注入樣式、寫到 dist/（覆寫；mkdir 補層）
 *   POST /api/svg-style/clear    → 清空 src 與 dist 下所有可見檔（保留資料夾與隱藏檔）
 *
 * 安全限制：操作目標固定為 public/upload/svg-style（與其 dist 子夾），不接受任何外部路徑參數；
 *           只處理 .svg 一般檔，跳過隱藏檔與子目錄（dist 例外）。
 *
 * 注意：injectStyle 的演算法與前端 svg-style-lib.js 的 injectStyle **逐字一致**
 *       （同一條 regex），確保前端預覽與後端寫入的 dist 內容相同。
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

const SRC_DIR = path.join(__dirname, '..', 'public', 'upload', 'svg-style');
const DIST_DIR = path.join(SRC_DIR, 'dist');
const STYLE_FILE = path.join(__dirname, '..', 'public', 'apps', 'svg-style', 'svg-style.txt');

// 只處理可見的 .svg 一般檔
function isSvg(name) {
  return typeof name === 'string' && name.length > 0 && name[0] !== '.' && /\.svg$/i.test(name);
}

// 在第一個 <svg ...> 開標籤後插入樣式（與前端 lib 同一條 regex + 冪等判斷）。
// 冪等：若已含同一段樣式（重跑 / 來源已處理過）則不重複注入。
function injectStyle(svgContent, styleText) {
  var s = String(svgContent);
  var st = String(styleText || '');
  if (st && s.indexOf(st.trim()) !== -1) return s;
  return s.replace(/(<svg\b[^>]*>)/i, function (m) { return m + '\n' + st; });
}

async function listSrc() {
  let entries;
  try {
    entries = await fs.readdir(SRC_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  // dist 已存在哪些檔
  let distSet = new Set();
  try {
    const d = await fs.readdir(DIST_DIR);
    distSet = new Set(d.filter(isSvg));
  } catch (e) { /* dist 尚未建立 */ }

  const files = [];
  for (const ent of entries) {
    if (!ent.isFile() || !isSvg(ent.name)) continue;
    const stat = await fs.stat(path.join(SRC_DIR, ent.name));
    files.push({ name: ent.name, size: stat.size, mtime: stat.mtimeMs, processed: distSet.has(ent.name) });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

// GET /api/svg-style/files
router.get('/files', async (req, res) => {
  try {
    return res.json({ ok: true, files: await listSrc() });
  } catch (err) {
    console.error('[svg-style] GET /files failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/svg-style/process — 注入樣式、src → dist
router.post('/process', async (req, res) => {
  try {
    let styleText;
    try {
      styleText = await fs.readFile(STYLE_FILE, 'utf8');
    } catch (e) {
      return res.status(500).json({ ok: false, error: '讀取 svg-style.txt 失敗：' + e.message });
    }
    const src = await listSrc();
    if (!src.length) return res.json({ ok: true, processed: 0, files: [] });

    await fs.mkdir(DIST_DIR, { recursive: true });
    const done = [];
    for (const f of src) {
      const raw = await fs.readFile(path.join(SRC_DIR, f.name), 'utf8');
      await fs.writeFile(path.join(DIST_DIR, f.name), injectStyle(raw, styleText), 'utf8');
      done.push(f.name);
    }
    console.log('[svg-style] POST /process →', done.length, 'file(s) → dist/');
    return res.json({ ok: true, processed: done.length, files: done });
  } catch (err) {
    console.error('[svg-style] POST /process failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/svg-style/clear — 清空 src 與 dist 下所有可見 .svg
router.post('/clear', async (req, res) => {
  try {
    let removed = 0;
    async function clearDir(dir) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'ENOENT') return;
        throw err;
      }
      for (const ent of entries) {
        if (!ent.isFile() || !isSvg(ent.name)) continue;
        await fs.unlink(path.join(dir, ent.name));
        removed++;
      }
    }
    await clearDir(SRC_DIR);
    await clearDir(DIST_DIR);
    console.log('[svg-style] POST /clear → removed', removed, 'file(s)');
    return res.json({ ok: true, removed });
  } catch (err) {
    console.error('[svg-style] POST /clear failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
