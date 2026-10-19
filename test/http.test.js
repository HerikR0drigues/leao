// Servidor HTTP de verdade (processo filho) com o "claude" falso: token, Host, fallback de SPA (F5), CSP e travessia de caminho.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 4400 + (process.pid % 500);
const DATA_DIR = path.join(os.homedir(), '.leao-test', `test-http-${process.pid}`);
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');
const BOOT_MS = 8000;

function request(pathname, { headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method, headers: { host: `127.0.0.1:${PORT}`, ...headers } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

let server;
let token;

test.before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, LEAO_PORT: String(PORT), LEAO_DATA_DIR: DATA_DIR, LEAO_CLAUDE_BIN: path.join(__dirname, 'fixtures', 'fake-claude.js') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const until = Date.now() + BOOT_MS;
  while (Date.now() < until) {
    try {
      token = fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim();
      await request('/api/state');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('servidor de teste não subiu');
});

test.after(() => server && server.kill());

test('API exige token e recusa Host de outro site', async () => {
  assert.equal((await request('/api/state')).status, 401);
  assert.equal((await request('/api/state', { headers: { 'x-leao-token': 'errado' } })).status, 401);
  assert.equal((await request('/api/state', { headers: { host: 'evil.com', 'x-leao-token': token } })).status, 403);
  const ok = await request('/api/state', { headers: { 'x-leao-token': token } });
  assert.equal(ok.status, 200);
  const state = JSON.parse(ok.body);
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.permissionModes, ['auto', 'default', 'acceptEdits', 'plan']);
});

test('F5 em /chat/<id> e /sessao/<id> devolve a página com token e CSP', { skip: !fs.existsSync(DIST_INDEX) && 'rode npm run build antes' }, async () => {
  for (const route of ['/', '/chat/abc', '/sessao/xyz', '/design-system']) {
    const res = await request(route);
    assert.equal(res.status, 200, route);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.body.includes(`content="${token}"`), `token injetado em ${route}`);
    assert.ok(!res.body.includes('__LEAO_TOKEN__'));
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
  }
});

test('arquivos fora de dist/ não vazam', async () => {
  for (const evil of ['/assets/..%2F..%2Fserver%2Findex.js', '/..%2Fpackage.json', '/assets/nao-existe.js']) {
    assert.equal((await request(evil)).status, 404, evil);
  }
  const traversal = await request(`/api/uploads/..%2F..%2Ftoken?token=${token}`);
  assert.equal(traversal.status, 404);
});

test('comando local responde sem chamar modelo', async () => {
  const res = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ text: '!ajuda' });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/command', method: 'POST', headers: { host: `127.0.0.1:${PORT}`, 'x-leao-token': token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
  assert.equal(res.status, 200);
  assert.match(JSON.parse(res.body).output, /!status/);
});
