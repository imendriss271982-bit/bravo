// Tiny static server for the tests (Node built-in, no dependency).
// The app is served over http like on GitHub Pages: Chromium's file:// storage can lose
// localStorage writes across a reload, which made reload tests flaky for the wrong reason.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
module.exports = () => new Promise(ok => {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  srv.listen(0, '127.0.0.1', () => ok({ base: 'http://127.0.0.1:' + srv.address().port + '/', close: () => srv.close() }));
});
