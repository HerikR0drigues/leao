// Serve o build do front (dist/) com fallback de SPA: /chat/<id> e /sessao/<id> devolvem o index.html,
// então F5 e link direto funcionam. O token vai numa <meta>, o que permite CSP sem script inline.
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};
// Nada de origem externa: fontes e ícones vêm do próprio build (sem telemetria, sem CDN).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');
const TOKEN_PLACEHOLDER = '__LEAO_TOKEN__';

function sendIndex(res, token) {
  const file = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Front não compilado: rode "npm run build" (ou "npm run dev" para desenvolver).');
    return;
  }
  const html = fs.readFileSync(file, 'utf8').replace(TOKEN_PLACEHOLDER, token);
  res.writeHead(200, {
    'content-type': TYPES['.html'],
    'cache-control': 'no-store',
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(html);
}

function serveStatic(req, res, pathname, token) {
  const ext = path.extname(pathname);
  if (!ext || pathname === '/index.html') {
    sendIndex(res, token);
    return;
  }
  const file = path.normalize(path.join(DIST_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(DIST_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('não encontrado');
    return;
  }
  // Arquivos em /assets têm hash no nome: podem ficar em cache para sempre.
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

module.exports = { serveStatic, CSP, TOKEN_PLACEHOLDER };
