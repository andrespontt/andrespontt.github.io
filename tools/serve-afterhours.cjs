// Local preview with byte ranges, so long songs seek exactly as on GitHub Pages.
// node tools/serve-afterhours.cjs [port]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8175);
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.writeHead(302, {Location: '/apps/afterhours.html'}).end(); return; }
  if (!['GET', 'HEAD'].includes(req.method) || !(pathname === '/apps/afterhours.html' || pathname === '/assets/icons/icon.svg' || /^\/apps\/afterhours\/(?:audio\/)?[a-z0-9.-]+\.(?:css|js|json|mp3|wav)$/.test(pathname))) {
    res.writeHead(404).end('Not found'); return;
  }
  const file = path.join(root, pathname);
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    const mime = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.svg':'image/svg+xml'};
    const headers = {'Content-Type': mime[path.extname(file)], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
    let start = 0, end = stat.size - 1, status = 200;
    if (req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!range || Number(range[1]) >= stat.size || (range[2] && Number(range[2]) < Number(range[1]))) {
        res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}).end(); return;
      }
      start = Number(range[1]); end = range[2] ? Math.min(end, Number(range[2])) : end;
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file, {start, end});
    stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log(`Afterhours preview: http://127.0.0.1:${port}/apps/afterhours.html`));
