/**
 * SvgStyleLib — svg-style 前端核心 library（可嵌入式、純邏輯、不碰 DOM）
 *
 * 把「自動雙向適配」「預覽用 @media 改寫」「sandbox 文件組裝」「路徑安全 / 編碼」
 * 「與伺服器溝通」等可重用邏輯抽成一支 library；index.html / svg-style.js 只負責 DOM。
 *
 * 設計重點：
 *   - 工具用途：讓 Claude 匯出的 SVG 圖表**同時適應 dark 與 light**。核心 `autoAdapt` 從 SVG 自身
 *     inline 顏色推導（`detectMode` 判原生主題 → 對相反主題做 HSL 明度翻轉、保留色相）→ 生成
 *     `@media (prefers-color-scheme)` 覆寫 + `@media print`（一律淺色）並注入。palette-agnostic、
 *     不需 SVG 自帶 <style>、也不需手維護對映表。純字串運算 → 放在 lib（同 xlsx 的 buildSheetTable 那側）。
 *   - 預覽在 **sandbox iframe**（`sandbox=""`，不給 allow-scripts）；SVG 不需 script，全 sandbox 最安全。
 *   - 另有「替換 <style>」路徑：偵測 SVG 自帶 <style> 時，可手動整段替換成 svg-style-replace.txt。
 *
 * 後端對應（薄後端；顏色適配全在前端）：
 *   - 上傳： POST /api/upload?folder=svg-style   （form 欄位 myFiles，多檔）→ src
 *   - 列表： GET  /api/svg-style/files
 *   - 清空： POST /api/svg-style/clear
 *   - src 靜態： /upload/svg-style/<name>
 *   - 替換樣板： /apps/svg-style/svg-style-replace.txt（純前端 fetch）
 *
 * 依賴：無（原生 fetch / URL）。建議與 jQuery / Materialize / Lodash 一起載入。
 *
 * Public API：
 *   SvgStyleLib.FOLDER / STATIC_BASE
 *   SvgStyleLib.isSafeLink(link) / isUploadable(name) / basename(link) / encodePath(link)
 *   SvgStyleLib.fileUrl(name)
 *   SvgStyleLib.hasStyleBlock(svg)                 → boolean SVG 是否含 <style>…</style> 區塊
 *   SvgStyleLib.replaceStyleBlock(svg, block)      → string  把第一個 <style>…</style> 整段換成 block（純前端、即時預覽用）
 *   SvgStyleLib.detectMode(svg)                    → 'light'|'dark'  依面板 fill 明度偵測原生主題
 *   SvgStyleLib.buildAutoStyle(svg)                → string  依原圖顏色生成「相反主題」@media 覆寫 + @media print 淺色 <style>（palette-agnostic）
 *   SvgStyleLib.autoAdapt(svg)                     → string  移除舊自動區塊後注入新生成區塊（雙向 dark/light 自適應；冪等）＝預覽/下載引擎
 *   SvgStyleLib.buildPreviewSvg(processedSvg, isLight) → string  強制 @media (prefers-color-scheme) 供預覽
 *   SvgStyleLib.buildSrcdoc(svgMarkup, isLight)    → string  sandbox iframe 用的完整 HTML
 *   SvgStyleLib.fetchText(link) / fetchReplaceStyle()
 *   SvgStyleLib.uploadFile(file) / listFiles() / clearFolder()
 *   SvgStyleLib.formatSize(bytes) / timestamp(date) / escapeHtml(s)
 */
(function (window) {
  'use strict';

  var FOLDER = 'svg-style';
  var UPLOAD_API = '/api/upload?folder=' + FOLDER;
  var FILES_API = '/api/svg-style/files';
  var CLEAR_API = '/api/svg-style/clear';
  var STATIC_BASE = '/upload/' + FOLDER + '/';
  var STYLE_REPLACE_URL = '/apps/' + FOLDER + '/svg-style-replace.txt';

  // 第一個 <style …>…</style> 區塊（不貪婪、跨行）。供 hasStyleBlock / replaceStyleBlock 共用。
  var STYLE_BLOCK_RE = /<style\b[^>]*>[\s\S]*?<\/style>/i;

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

  // 偵測 SVG 是否含 <style>…</style> 區塊（給 UI 決定是否提供「替換 <style>」動作）。
  function hasStyleBlock(svgContent) {
    return STYLE_BLOCK_RE.test(String(svgContent || ''));
  }

  // 把 SVG 內**第一個** <style>…</style> 區塊整段換成 replacementBlock（給「SVG 自帶 <style>」的手動路徑）。
  // 與 autoAdapt「新增一段」不同，本函式是「取代」既有的那段。
  // 無 <style> 時原樣回傳（呼叫端通常已用 hasStyleBlock gate）。replacer 用函式以免 $ 被當特殊字。
  function replaceStyleBlock(svgContent, replacementBlock) {
    var s = String(svgContent);
    var rep = String(replacementBlock == null ? '' : replacementBlock);
    return s.replace(STYLE_BLOCK_RE, function () { return rep; });
  }

  /* ===== 自動適配（palette-agnostic）：從 SVG 既有顏色推導，雙向 dark/light ===== */
  // 掃描 inline style 的 paint 顏色 → 偵測原生主題 → 對「相反主題」用 HSL 明度翻轉（保留色相/彩度）
  // 生成 @media (prefers-color-scheme) 覆寫並注入。原生主題顯示原圖、相反主題顯示翻轉版 → 同圖兩主題都正確。
  // 不依賴手寫 palette 表（取代寫死的 svg-style.txt 成為預覽/下載引擎）。

  var PAINT_PROPS = ['fill', 'stroke', 'stop-color', 'flood-color'];
  var SURFACE_TAGS = { rect: 1, path: 1, polygon: 1, circle: 1, ellipse: 1 };
  // 先前自動產生的區塊（連同注入時加在前面的換行與縮排），重跑前先整段移除以保冪等。
  var AUTO_STYLE_RE = /\n?[ \t]*<style\b[^>]*\bdata-svg-style-auto\b[^>]*>[\s\S]*?<\/style>/i;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // 解析 rgb()/rgba()/#hex → {r,g,b,a}（a 0–1）；無法解析回 null。
  function parseColor(str) {
    var s = String(str).trim(), m;
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    m = s.match(/^#([0-9a-fA-F]{3,8})$/);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (c) { return c + c; }).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var hue = function (p, q, t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  // 翻轉明度（保留色相/彩度）；輸出沿用是否帶 alpha。
  function flipColor(c) {
    var hsl = rgbToHsl(c.r, c.g, c.b);
    var rgb = hslToRgb(hsl.h, hsl.s, clamp01(1 - hsl.l));
    if (c.a != null && c.a < 1) return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + c.a + ')';
    return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
  }

  // 掃描每個帶 inline style 的元素，收集 { tag, prop, raw, color }；raw＝可直接放進 [style*=] 的原樣子字串。
  function collectPaints(svg) {
    var s = String(svg), elRe = /<([a-zA-Z][\w:-]*)\b[^>]*?\bstyle\s*=\s*"([^"]*)"/g, em;
    var paintRe = /(fill|stroke|stop-color|flood-color)\s*:\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/gi;
    var list = [], seen = {};
    while ((em = elRe.exec(s))) {
      var tag = em[1].toLowerCase(), style = em[2], pm;
      paintRe.lastIndex = 0;
      while ((pm = paintRe.exec(style))) {
        var prop = pm[1].toLowerCase(), col = parseColor(pm[2]);
        if (!col) continue;
        var key = tag + '|' + pm[0];
        if (seen[key]) continue; seen[key] = 1;
        list.push({ tag: tag, prop: prop, raw: pm[0], value: pm[2], color: col });   // raw 例：fill:rgb(12, 68, 124)；value＝顏色值
      }
    }
    return list;
  }

  // 偵測原生主題：以「面板類」(rect/path…) 的 fill 平均明度判斷（亮→light、暗→dark）；無面板則退用所有 fill。
  function detectMode(svg) {
    var paints = collectPaints(svg), ls = [], i, p, hsl;
    for (i = 0; i < paints.length; i++) {
      p = paints[i];
      if (p.prop === 'fill' && SURFACE_TAGS[p.tag] && p.color.a !== 0) { hsl = rgbToHsl(p.color.r, p.color.g, p.color.b); ls.push(hsl.l); }
    }
    if (!ls.length) for (i = 0; i < paints.length; i++) { p = paints[i]; if (p.prop === 'fill' && p.color.a !== 0) { hsl = rgbToHsl(p.color.r, p.color.g, p.color.b); ls.push(hsl.l); } }
    if (!ls.length) return 'dark';
    var avg = ls.reduce(function (a, b) { return a + b; }, 0) / ls.length;
    return avg > 0.5 ? 'light' : 'dark';
  }

  // 依原圖顏色生成「相反主題」的 @media 覆寫 <style>（帶 data-svg-style-auto 標記）。無可處理顏色則回空字串。
  function buildAutoStyle(svg) {
    var paints = collectPaints(svg);
    if (!paints.length) return '';
    var native = detectMode(svg), opp = native === 'light' ? 'dark' : 'light';
    var screenRules = [], printRules = [], seen = {};
    paints.forEach(function (p) {
      if (seen[p.raw]) return; seen[p.raw] = 1;   // 同一 prop:color 一條即可（與 element type 無關）
      var sel = '[style*="' + p.raw.replace(/"/g, '\\"') + '"]';
      var flipped = flipColor(p.color);
      screenRules.push('      ' + sel + ' { ' + p.prop + ': ' + flipped + ' !important; }');
      // 列印一律淺色（不論螢幕主題）：原生淺色→沿用原值；原生深色→用翻轉後的淺色值。
      printRules.push('      ' + sel + ' { ' + p.prop + ': ' + (native === 'light' ? p.value : flipped) + ' !important; }');
    });
    if (!screenRules.length) return '';
    // 屬性務必帶值（data-svg-style-auto="1"）：SVG 直接開啟時走嚴格 XML 解析，無值屬性會報錯。
    return '  <style data-svg-style-auto="1">\n' +
      '    /* svg-style 自動產生：依原圖顏色明度翻轉、保留色相，雙向適配（原生＝' + native + '，覆寫＝' + opp + ' mode）。勿手改；重跑會整段重生。 */\n' +
      '    @media (prefers-color-scheme: ' + opp + ') {\n' + screenRules.join('\n') + '\n    }\n' +
      '    /* 列印一律淺色（不論螢幕主題）；放最後，列印時以同特異度 !important 蓋過上面的深色覆寫。需 SVG 以 inline 方式嵌入 .md/HTML 才生效。 */\n' +
      '    @media print {\n' + printRules.join('\n') + '\n    }\n' +
      '  </style>';
  }

  // 自動適配：先移除先前自動區塊（冪等）→ 在第一個 <svg> 開標籤後注入新生成的區塊。
  function autoAdapt(svg) {
    var s = String(svg).replace(AUTO_STYLE_RE, '');
    var block = buildAutoStyle(s);
    if (!block) return s;
    return s.replace(/(<svg\b[^>]*>)/i, function (m) { return m + '\n' + block; });
  }

  // 預覽：把 @media (prefers-color-scheme: light|dark) 改寫成強制某主題（不靠系統偏好）。
  function buildPreviewSvg(processedSvg, isLight) {
    var target = isLight ? 'light' : 'dark';
    return String(processedSvg).replace(/@media\s*\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/gi,
      function (m, scheme) { return '@media ' + (scheme.toLowerCase() === target ? 'all' : 'not all'); });
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
    STYLE_REPLACE_URL: STYLE_REPLACE_URL,
    ALLOWED_ABSOLUTE_PREFIXES: ALLOWED_ABSOLUTE_PREFIXES,

    escapeHtml: escapeHtml,
    isSafeLink: isSafeLink,
    isUploadable: isUploadable,
    basename: basename,
    encodePath: encodePath,
    fileUrl: fileUrl,
    hasStyleBlock: hasStyleBlock,
    replaceStyleBlock: replaceStyleBlock,
    detectMode: detectMode,
    buildAutoStyle: buildAutoStyle,
    autoAdapt: autoAdapt,
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

    /** 讀取「替換用」樣板 svg-style-replace.txt（整段取代 SVG 既有 <style>；純前端用，內容待補） */
    fetchReplaceStyle: function () {
      return fetch(bust(STYLE_REPLACE_URL), { cache: 'no-store' })
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

    /** 列出 src 檔案（依修改時間新→舊） */
    listFiles: function () {
      return fetch(bust(FILES_API), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('列表載入失敗 (' + r.status + ')');
          return r.json();
        })
        .then(function (d) { return (d && d.files) || []; });
    },

    /** 清空 src 與殘留 dist */
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
