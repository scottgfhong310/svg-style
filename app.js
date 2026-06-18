/**
 * svg-style — 獨立執行的 Express 伺服器
 *
 * 提供：
 *   - 靜態檔（public/）→ 應用在 /apps/svg-style/
 *   - 上傳 API：/api/upload?folder=svg-style（routes/upload.js）
 *   - 列表 / 清空 API：/api/svg-style（routes/svg-style.js）
 *
 * 啟動： npm install && npm start
 *        預設 http://localhost:3000/apps/svg-style/
 */

const express = require('express');
const path = require('path');
const logger = require('morgan');

const uploadRouter = require('./routes/upload');
const svgStyleRouter = require('./routes/svg-style');

const app = express();

app.use(logger('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/upload', uploadRouter);
app.use('/api/svg-style', svgStyleRouter);

// 根路徑導向應用頁
app.get('/', (req, res) => res.redirect('/apps/svg-style/'));

// 404（API 回 JSON，其餘回純文字）
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found' });
  res.status(404).type('text/plain').send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`svg-style →  http://localhost:${PORT}/apps/svg-style/`);
});
