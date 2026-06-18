/**
 * SvgStyleLib — svg-style 前端核心 library（可嵌入式、純邏輯、不碰 DOM）
 *
 * 把「樣式注入」「預覽用 @media 改寫」「sandbox 文件組裝」「路徑安全 / 編碼」
 * 「與伺服器溝通」等可重用邏輯抽成一支 library；index.html / svg-style.js 只負責 DOM。
 *
 * 設計重點：
 *   - 工具用途：把深色 SVG 加上「淺色自適應」——在 <svg> 開標籤後注入 svg-style.txt 的
 *     `@media (prefers-color-scheme: light)` 覆寫，讓圖在淺色環境也好看。
 *   - `injectStyle` 是純字串運算 → 放在 lib（同 xlsx 的 buildSheetTable 那側）。
 *     **其 regex 與後端 routes/svg-style.js 的 injectStyle 逐字一致**，確保 preview === dist。
 *   - 預覽在 **sandbox iframe**（`sandbox=""`，不給 allow-scripts）；SVG 不需 script，全 sandbox 最安全。
 *
 * 後端對應：
 *   - 上傳： POST /api/upload?folder=svg-style   （form 欄位 myFiles，多檔）→ src
 *   - 處理： POST /api/svg-style/process          （src 注入樣式 → dist）
 *   - 列表： GET  /api/svg-style/files
 *   - 清空： POST /api/svg-style/clear
 *   - src 靜態： /upload/svg-style/<name>　/　dist 靜態： /upload/svg-style/dist/<name>
 *   - 注入樣板： /apps/svg-style/svg-style.txt
 *
 * 依賴：無（原生 fetch / URL）。建議與 jQuery / Materialize / Lodash 一起載入。
 *
 * Public API：
 *   SvgStyleLib.FOLDER / STATIC_BASE / DIST_BASE / STYLE_URL
 *   SvgStyleLib.isSafeLink(link) / isUploadable(name) / basename(link) / encodePath(link)
 *   SvgStyleLib.fileUrl(name) / distUrl(name)
 *   SvgStyleLib.injectStyle(svg, styleText)        → string  （與後端逐字一致）
 *   SvgStyleLib.buildPreviewSvg(processedSvg, isLight) → string  強制 @media 供預覽
 *   SvgStyleLib.buildSrcdoc(svgMarkup, isLight)    → string  sandbox iframe 用的完整 HTML
 *   SvgStyleLib.fetchText(link) / fetchStyle()
 *   SvgStyleLib.uploadFile(file) / listFiles() / processAll() / clearFolder()
 *   SvgStyleLib.formatSize(bytes) / timestamp(date) / escapeHtml(s)
 */
(function (window) {
  'use strict';

  var FOLDER = 'svg-style';
  var UPLOAD_API = '/api/upload?folder=' + FOLDER;
  var FILES_API = '/api/svg-style/files';
  var PROCESS_API = '/api/svg-style/process';
  var CLEAR_API = '/api/svg-style/clear';
  var STATIC_BASE = '/upload/' + FOLDER + '/';
  var DIST_BASE = STATIC_BASE + 'dist/';
  var STYLE_URL = '/apps/' + FOLDER + '/svg-style.txt';

  var ALLOWED_ABSOLUTE_PREFIXES = [STATIC_BASE];
  var UPLOADABLE_RE = /\.svg$/i;

  function pad2(n) { return ('0' + n).slice(-2); }
  function bust(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now(); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isSafeLink(link) {
    if (!link || typeof link !== 'string') return false;
    if (link.indexOf('..') !== -1) return false;
    if (link.charAt(0) === '\\') return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return false;
    if (link.indexOf('//') === 0) return false;
    if (link.charAt(0) === '/') {
      return ALLOWED_ABSOLUTE_PREFIXES.some(function (p) { return link.indexOf(p) === 0; });
    }
    return true;
  }

  function isUploadable(name) { return UPLOADABLE_RE.test(String(name || '')); }

  function basename(link) {
    var seg = String(link || '').split('?')[0].split('/').pop();
    try { seg = decodeURIComponent(seg); } catch (e) {}
    return seg || String(link || '');
  }

  function encodePath(link) {
    return String(link || '').split('/').map(encodeURIComponent).join('/');
  }

  function fileUrl(name) { return STATIC_BASE + name; }
  function distUrl(name) { return DIST_BASE + name; }

  // 在第一個 <svg ...> 開標籤後插入樣式。**與後端 routes/svg-style.js 同一條 regex + 冪等判斷。**
  // 冪等：若已含同一段樣式（重跑處理 / 來源已處理過）則不重複注入。
  function injectStyle(svgContent, styleText) {
    var s = String(svgContent);
    var st = String(styleText || '');
    if (st && s.indexOf(st.trim()) !== -1) return s;
    return s.replace(/(<svg\b[^>]*>)/i, function (m) { return m + '\n' + st; });
  }

  // 預覽：把 @media (prefers-color-scheme: light) 改寫成強制 light/dark，不靠系統偏好。
  function buildPreviewSvg(processedSvg, isLight) {
    var re = /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi;
    return String(processedSvg).replace(re, isLight ? '@media all' : '@media not all');
  }

  // 包成 sandbox iframe srcdoc 用的完整 HTML（依預覽模式給底色、置中）。
  function buildSrcdoc(svgMarkup, isLight) {
    var bg = isLight ? '#ffffff' : '#1a1a1a';
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>html,body{margin:0;height:100%;}' +
      'body{display:flex;align-items:center;justify-content:center;' +
      'padding:16px;box-sizing:border-box;background:' + bg + ';}' +
      'svg{max-width:100%;height:auto;}</style></head><body>' +
      String(svgMarkup || '') + '</body></html>';
  }

  var SvgStyleLib = {

    FOLDER: FOLDER,
    STATIC_BASE: STATIC_BASE,
    DIST_BASE: DIST_BASE,
    STYLE_URL: STYLE_URL,
    ALLOWED_ABSOLUTE_PREFIXES: ALLOWED_ABSOLUTE_PREFIXES,

    escapeHtml: escapeHtml,
    isSafeLink: isSafeLink,
    isUploadable: isUploadable,
    basename: basename,
    encodePath: encodePath,
    fileUrl: fileUrl,
    distUrl: distUrl,
    injectStyle: injectStyle,
    buildPreviewSvg: buildPreviewSvg,
    buildSrcdoc: buildSrcdoc,

    /** 讀取連結（相對或白名單絕對路徑）的文字內容 */
    fetchText: function (link) {
      return fetch(bust(encodePath(link)), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        });
    },

    /** 讀取注入樣板 svg-style.txt（前後端共用同一份） */
    fetchStyle: function () {
      return fetch(bust(STYLE_URL), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        });
    },

    /** 上傳單一 SVG 到 src（同名覆寫）。回傳伺服器 JSON；失敗 reject。 */
    uploadFile: function (file) {
      var fd = new FormData();
      fd.append('myFiles', file);
      return fetch(UPLOAD_API, { method: 'POST', body: fd })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (resp) {
          if (!resp || !resp.ok) throw new Error((resp && resp.error) || '上傳失敗');
          return resp;
        });
    },

    /** 列出 src 檔案（依修改時間新→舊；含 processed 旗標） */
    listFiles: function () {
      return fetch(bust(FILES_API), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('列表載入失敗 (' + r.status + ')');
          return r.json();
        })
        .then(function (d) { return (d && d.files) || []; });
    },

    /** 批次處理：src 注入樣式 → 寫到 dist */
    processAll: function () {
      return fetch(PROCESS_API, { method: 'POST' })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || '處理失敗');
          return d;
        });
    },

    /** 清空 src 與 dist */
    clearFolder: function () {
      return fetch(CLEAR_API, { method: 'POST' })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || '清空失敗');
          return d;
        });
    },

    timestamp: function (date) {
      var d = date || new Date();
      return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
        pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    },

    formatSize: function (bytes) {
      bytes = Number(bytes) || 0;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }
  };

  window.SvgStyleLib = SvgStyleLib;
})(window);
