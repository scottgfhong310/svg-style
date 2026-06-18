/**
 * svg-style — 頁面控制器（glue）
 *
 * DOM 行為：app 主題切換、i18n、上傳 / 拖拉 / 清空、選檔→預覽（sandbox iframe）、
 * 預覽 深/淺 切換（獨立於 app 主題）、批次處理 src→dist、下載目前檔。
 * 樣式注入 / @media 改寫 / sandbox 組裝 / 路徑安全 / 伺服器溝通在 svg-style-lib.js；
 * i18n 引擎在 i18n.js，語言字典在 locales/<code>.js。
 *
 * 依賴（皆於 index.html 先載入）：jQuery / Materialize / Lodash / SvgStyleLib / I18n（+ locales）。
 *
 * 註：預覽用 **sandbox iframe**（`sandbox=""`，不給 allow-scripts）；上傳的 SVG 可能含 script，
 *     全 sandbox 渲染最安全（SVG 不需 script）。預覽內容＝lib.injectStyle（與後端 dist 逐字一致）。
 */

(function () {
  'use strict';

  var L = window.SvgStyleLib;
  var THEME_KEY = 'svg-style-theme';

  var emptyState = document.getElementById('empty-state');
  var docBox = document.getElementById('ss-doc');
  var frame = document.getElementById('ss-frame');
  var docName = document.getElementById('ss-doc-name');
  var docBadge = document.getElementById('ss-doc-badge');
  var previewMeta = document.getElementById('ss-meta');
  var sideNav = document.getElementById('side-nav');
  var dropOverlay = document.getElementById('drop-overlay');
  var filePicker = document.getElementById('file-picker');
  var downloadBtn = document.getElementById('setting-download');
  var processBtn = document.getElementById('setting-process');

  var state = {
    theme: 'dark',      // app 主題；預覽 深/淺 跟隨此值（side-tools display mode）
    current: null,      // 目前選的 src 連結（原始）
    name: '',
    srcText: '',        // 目前 src SVG 原文
    styleText: '',      // svg-style.txt（注入樣板）
    files: []
  };

  /* ---------- app 主題（外殼；與預覽模式無關） ---------- */

  function applyTheme(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    state.theme = theme;
    var r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.classList.toggle('dark-mode', theme === 'dark');
    r.classList.toggle('light-mode', theme === 'light');
    var icon = document.querySelector('#setting-mode i');
    if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    renderPreview();   // 預覽跟隨 app 主題（side-tools display mode）→ 重建 srcdoc
  }

  /* ---------- 顯示切換 ---------- */

  function showDoc(show) {
    docBox.style.display = show ? 'block' : 'none';
    emptyState.style.display = show ? 'none' : '';
    document.body.classList.toggle('is-empty', !show);
    if (downloadBtn) downloadBtn.style.display = show ? 'flex' : 'none';
  }

  // 「已執行」微回饋：icon 暫時變 check 800ms（家族 §5.5）
  function setIconDone(el) {
    var i = el && el.querySelector('i');
    if (!i) return;
    var orig = i.textContent;
    i.textContent = 'check';
    setTimeout(function () { i.textContent = orig; }, 800);
  }

  /* ---------- loading ---------- */
  var loadingTimer = null;
  function showLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(function () {
      var el = document.getElementById('loading'); if (el) el.classList.add('show');
    }, 180);
  }
  function hideLoading() {
    clearTimeout(loadingTimer);
    var el = document.getElementById('loading'); if (el) el.classList.remove('show');
  }

  /* ---------- 預覽渲染 ---------- */

  function processedCurrent() {
    return L.injectStyle(state.srcText, state.styleText);   // == 後端 dist 內容
  }

  function renderPreview() {
    if (!state.current || !state.srcText) {
      frame.removeAttribute('srcdoc');
      previewMeta.textContent = '';
      return;
    }
    var isLight = state.theme === 'light';
    var processed = processedCurrent();
    var previewSvg = L.buildPreviewSvg(processed, isLight);
    frame.srcdoc = L.buildSrcdoc(previewSvg, isLight);
    previewMeta.textContent = I18n.t('meta.preview', {
      mode: I18n.t(isLight ? 'mode.light' : 'mode.dark'),
      a: state.srcText.length, b: processed.length
    });
  }

  /* ---------- 選檔 / 載入 ---------- */

  function loadAndShow(link, displayName, processed) {
    if (!L.isSafeLink(link)) {
      state.current = null; state.srcText = '';
      M.toast({ html: I18n.t('toast.badLink'), classes: 'red' });
      showDoc(false);
      return Promise.resolve();
    }
    state.current = link;
    state.name = displayName || L.basename(link);
    document.title = state.name + ' | ' + I18n.t('title.suffix');
    docName.textContent = state.name;
    docName.title = state.name;
    docBadge.style.display = processed ? '' : 'none';
    markActive(link);
    showDoc(true);
    showLoading();
    return L.fetchText(link)
      .then(function (text) { state.srcText = text; renderPreview(); })
      .catch(function (err) {
        state.srcText = '';
        M.toast({ html: I18n.t('toast.loadFail', { n: state.name, m: err.message }), classes: 'red' });
        showDoc(false);
      })
      .then(function () { hideLoading(); });
  }

  /* ---------- 檔案清單 ---------- */

  function markActive(link) {
    $('#side-nav li').removeClass('active');
    if (!link) return;
    var esc = window.CSS && CSS.escape ? CSS.escape(link) : link;
    $('#side-nav li[data-link="' + esc + '"]').addClass('active');
  }

  function renderSideNav(files) {
    if (!files.length) {
      sideNav.innerHTML = '<li><a style="color:var(--muted)!important;">' + I18n.t('side.noFiles') + '</a></li>';
      return;
    }
    sideNav.innerHTML = files.map(function (f) {
      var link = L.fileUrl(f.name);
      var badge = f.processed ? '<span class="file-flag" title="' + _.escape(I18n.t('badge.processed')) + '">●</span>' : '';
      return '<li data-link="' + _.escape(link) + '">' +
        '<a href="#!" class="file-item" data-name="' + _.escape(f.name) + '" data-processed="' + (f.processed ? 1 : 0) + '">' +
        '<i class="material-icons">image</i>' +
        '<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _.escape(f.name) + '</span>' +
        badge +
        '<span class="file-meta">' + L.formatSize(f.size) + '</span>' +
        '</a></li>';
    }).join('');
    markActive(state.current);
  }

  function refreshFiles(selectName, autoOpen) {
    return L.listFiles().then(function (files) {
      state.files = files;
      renderSideNav(files);
      // 更新目前檔的「已處理」徽章
      if (state.current) {
        var cur = files.filter(function (f) { return L.fileUrl(f.name) === state.current; })[0];
        docBadge.style.display = (cur && cur.processed) ? '' : 'none';
      }
      if (selectName) {
        var hit = files.filter(function (f) { return f.name === selectName; })[0];
        if (hit) return loadAndShow(L.fileUrl(hit.name), hit.name, hit.processed);
      }
      if (autoOpen && !state.current && files.length) {
        return loadAndShow(L.fileUrl(files[0].name), files[0].name, files[0].processed);
      }
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.listFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 上傳 ---------- */

  function uploadFiles(fileList) {
    var arr = Array.prototype.slice.call(fileList).filter(function (f) { return L.isUploadable(f.name); });
    if (!arr.length) { M.toast({ html: I18n.t('toast.notSvg'), classes: 'orange' }); return; }
    var lastName = null;
    var chain = Promise.resolve();
    arr.forEach(function (file) {
      chain = chain.then(function () {
        return L.uploadFile(file).then(function () {
          lastName = file.name;
          M.toast({ html: I18n.t('toast.uploaded', { n: file.name }), classes: 'green' });
        }).catch(function (err) {
          M.toast({ html: I18n.t('toast.uploadFail', { n: file.name, m: err.message }), classes: 'red' });
        });
      });
    });
    chain.then(function () { return refreshFiles(lastName); });
  }

  /* ---------- 批次處理 src → dist ---------- */

  function processAll() {
    if (!state.files.length) { M.toast({ html: I18n.t('toast.noSrc'), classes: 'orange' }); return; }
    L.processAll().then(function (d) {
      M.toast({ html: I18n.t('toast.processed', { n: d.processed || 0 }), classes: 'green' });
      setIconDone(processBtn);
      return refreshFiles();   // 更新 processed 徽章
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.processFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 下載目前檔（注入後＝dist 內容） ---------- */

  function downloadCurrent() {
    if (!state.current || !state.srcText) return;
    var blob = new Blob([processedCurrent()], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = state.name || L.basename(state.current);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setIconDone(downloadBtn);
  }

  /* ---------- 清空 ---------- */

  function clearFolder() {
    if (!confirm(I18n.t('confirm.clear'))) return;
    L.clearFolder().then(function (d) {
      M.toast({ html: I18n.t('toast.cleared', { n: d.removed || 0 }), classes: 'teal' });
      state.current = null; state.name = ''; state.srcText = '';
      showDoc(false);
      document.title = I18n.t('title.suffix');
      return refreshFiles();
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.clearFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 全頁拖拉 ---------- */

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    return false;
  }
  function bindDragDrop() {
    var depth = 0;
    window.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; dropOverlay.classList.add('show'); });
    window.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; depth--; if (depth <= 0) { depth = 0; dropOverlay.classList.remove('show'); } });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; dropOverlay.classList.remove('show');
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) uploadFiles(dt.files);
    });
  }

  /* ---------- i18n ---------- */

  function cycleLang() {
    var langs = I18n.langs;
    var i = langs.indexOf(I18n.lang);
    I18n.set(langs[(i + 1) % langs.length]);
    M.toast({ html: I18n.name(I18n.lang) });
  }
  function onLangChanged() {
    renderSideNav(state.files);
    document.title = state.current ? (state.name + ' | ' + I18n.t('title.suffix')) : I18n.t('title.suffix');
    if (state.current) renderPreview();   // meta 文字隨語系（SVG 內容是 data 不變）
  }

  /* ---------- 事件 ---------- */

  function bindEvents() {
    $(document).on('click', '#side-nav a.file-item', function (e) {
      e.preventDefault();
      var name = String($(this).data('name'));
      var processed = String($(this).data('processed')) === '1';
      loadAndShow(L.fileUrl(name), name, processed);
      var inst = M.Sidenav.getInstance(document.getElementById('slide-out'));
      if (inst && inst.isOpen) inst.close();
    });

    emptyState.addEventListener('click', function () { filePicker.click(); });
    filePicker.addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length) uploadFiles(e.target.files);
      filePicker.value = '';
    });

    document.getElementById('setting-menu').addEventListener('click', function () {
      var inst = M.Sidenav.getInstance(document.getElementById('slide-out')); if (inst) inst.open();
    });
    document.getElementById('setting-mode').addEventListener('click', toggleTheme);
    document.getElementById('setting-lang').addEventListener('click', cycleLang);
    document.getElementById('setting-process').addEventListener('click', processAll);
    document.getElementById('setting-download').addEventListener('click', downloadCurrent);
    document.getElementById('setting-clear').addEventListener('click', clearFolder);
  }

  /* ---------- 初始化 ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    M.Sidenav.init(document.querySelectorAll('.sidenav'), {
      edge: 'right',
      onOpenStart: function () { document.body.classList.add('sidenav-open'); },
      onCloseEnd: function () { document.body.classList.remove('sidenav-open'); }
    });

    var savedTheme = 'dark';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(savedTheme === 'light' ? 'light' : 'dark');

    I18n.apply(document);
    document.addEventListener('i18n:changed', onLangChanged);
    document.title = I18n.t('title.suffix');

    bindEvents();
    bindDragDrop();

    // 先載入注入樣板，再抓清單（確保首次預覽用得到 styleText）
    L.fetchStyle()
      .then(function (txt) { state.styleText = txt; })
      .catch(function (err) {
        M.toast({ html: I18n.t('toast.styleFail', { m: err.message }), classes: 'red' });
      })
      .then(function () { return refreshFiles(null, true); });
  });
})();
