/**
 * svg-style
 * ---------
 * 後端 handler，搭配 public/apps/svg-style 前端使用。薄後端：只做「列出 src」「清空」。
 *
 * 顏色適配（雙向 dark/light + @media print）已改為**前端** autoAdapt（見 svg-style-lib.js）：
 * 預覽即成品、由「下載目前檔」交付；不再有 src→dist 的伺服器處理管線（/process 與 svg-style.txt 已退役）。
 *   - src：public/upload/svg-style/（沿用共用上傳 /api/upload?folder=svg-style）
 *
 * API：
 *   GET  /api/svg-style/files    → 列出 src 下的 .svg（新→舊）
 *   POST /api/svg-style/clear    → 清空 src（與殘留的 dist/）下所有可見 .svg（保留資料夾與隱藏檔）
 *
 * 安全限制：操作目標固定為 public/upload/svg-style，不接受任何外部路徑參數；只處理 .svg 一般檔。
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

const SRC_DIR = path.join(__dirname, '..', 'public', 'upload', 'svg-style');
const DIST_DIR = path.join(SRC_DIR, 'dist');   // 舊 dist：本版不再寫入，但 /clear 仍一併清掉殘留

// 只處理可見的 .svg 一般檔
function isSvg(name) {
  return typeof name === 'string' && name.length > 0 && name[0] !== '.' && /\.svg$/i.test(name);
}

async function listSrc() {
  let entries;
  try {
    entries = await fs.readdir(SRC_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile() || !isSvg(ent.name)) continue;
    const stat = await fs.stat(path.join(SRC_DIR, ent.name));
    files.push({ name: ent.name, size: stat.size, mtime: stat.mtimeMs });
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

// POST /api/svg-style/clear — 清空 src（與殘留 dist）下所有可見 .svg
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
