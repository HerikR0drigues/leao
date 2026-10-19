// Leão: painel local para controlar as sessões do Claude Code. Só escuta em 127.0.0.1.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

// Antes de qualquer módulo tocar no diretório de dados, senão a pasta nova nasce vazia e a migração é pulada.
config.migrateLegacyData();

const store = require('./store');
const actions = require('./actions');
const { SessionMonitor } = require('./sessions');
const { ChatManager } = require('./chats');
const { getCatalog } = require('./catalog');
const { sessionDetail } = require('./transcripts');
const { getDeliveries } = require('./deliveries');
const { sessionUsage } = require('./usage');
const { uploadPath, MEDIA_TYPES } = require('./uploads');
const { sessionDetail: transcriptDetail } = require('./transcripts');
const { parseLocalCommand, executeLocal } = require('./commands');
const { publicProfiles, publicModels, EFFORTS, PERMISSION_MODES, DEFAULT_CHAT } = require('./profiles');
const { readProcTable, treeRssKb } = require('./proc');
const { serveStatic } = require('./static');

// Comporta até 10 imagens de 5 MB em base64 (~1,37x).
const BODY_LIMIT = 70 * 1024 * 1024;
const HEARTBEAT_MS = 20000;

const TOKEN = crypto.randomBytes(24).toString('hex');
const monitor = new SessionMonitor();
const chats = new ChatManager();
const clients = new Set();

function broadcast(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(frame);
}

function chatList() {
  const table = readProcTable();
  return chats.list().map((c) => ({
    ...c,
    rssMb: c.pid ? Math.round((treeRssKb(table, c.pid) || 0) / 1024) : null,
    usage: c.sessionId ? sessionUsage(c.sessionId) : null,
  }));
}

// O `claude agents` também lista os processos dos chats do Leão: eles já aparecem em Chats, não em Sessões.
function isOwnChatProcess(session) {
  for (const c of chats.list()) {
    if ((c.pid && c.pid === session.pid) || (c.sessionId && c.sessionId === session.sessionId)) return true;
  }
  return false;
}

function visibleSessions() {
  return monitor.sessions.filter((s) => !isOwnChatProcess(s));
}

function state() {
  return {
    sessions: visibleSessions(),
    sessionsError: monitor.lastError,
    chats: chatList(),
    profiles: publicProfiles(),
    models: publicModels(),
    efforts: EFFORTS,
    permissionModes: PERMISSION_MODES,
    defaults: DEFAULT_CHAT,
    costToday: store.costToday(),
    limits: chats.limits,
    knownDirs: knownDirs(),
  };
}

function knownDirs() {
  const dirs = new Set();
  for (const s of visibleSessions()) if (s.cwd) dirs.add(s.cwd);
  for (const c of chats.list()) if (c.cwd) dirs.add(c.cwd);
  return [...dirs].sort();
}

monitor.on('update', () => broadcast({ type: 'sessions', sessions: visibleSessions(), error: monitor.lastError, chats: chatList() }));
monitor.on('alert', (alert) => {
  if (!isOwnChatProcess(alert.session)) broadcast({ ...alert, type: 'alert', alertType: alert.type });
});
chats.on('event', (event) => broadcast(event));

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error(`corpo maior que ${BODY_LIMIT} bytes`));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(parts).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`JSON inválido: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

// Bloqueia DNS rebinding e requisições de outros sites: Host local + token em toda chamada de API.
function hostAllowed(req) {
  const allowed = [`127.0.0.1:${config.PORT}`, `localhost:${config.PORT}`];
  return allowed.includes(req.headers.host);
}

function tokenOk(req, url) {
  const given = req.headers['x-leao-token'] || url.searchParams.get('token') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function openEvents(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'hello', state: state() })}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function sessionOr404(id) {
  const session = visibleSessions().find((s) => s.id === id);
  if (!session) throw Object.assign(new Error(`sessão não encontrada: "${id}"`), { status: 404 });
  return session;
}

async function runLocalCommand(cmd, chat) {
  try {
    const view = { sessions: visibleSessions(), find: (q) => monitor.find(q, visibleSessions()) };
    return await executeLocal(cmd, { monitor: view, chatList: chatList(), cwd: chat ? chat.cwd : null, limits: chats.limits });
  } catch (err) {
    return `Erro: ${err.message}`;
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // remove "api"
  const [resource, id, sub] = parts;
  const method = req.method;

  if (resource === 'state' && method === 'GET') return sendJson(res, 200, state());
  if (resource === 'catalog' && method === 'GET') return sendJson(res, 200, getCatalog());
  if (resource === 'events' && method === 'GET') return openEvents(req, res);

  if (resource === 'command' && method === 'POST') {
    const body = await readBody(req);
    const cmd = parseLocalCommand(body.text);
    if (!cmd) throw new Error('comando local precisa começar com "!" (ex: !status)');
    return sendJson(res, 200, { output: await runLocalCommand(cmd, null) });
  }

  if (resource === 'uploads' && id && method === 'GET') {
    const file = uploadPath(id);
    const ext = path.extname(file).slice(1);
    const type = Object.keys(MEDIA_TYPES).find((k) => MEDIA_TYPES[k] === ext);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' });
    fs.createReadStream(file).pipe(res);
    return null;
  }

  if (resource === 'chats') {
    if (id && sub === 'history' && method === 'GET') {
      // Conversa anterior de uma sessão movida do terminal: lida do transcript, só leitura.
      const chat = chats.get(id);
      if (!chat.adoptedFrom) return sendJson(res, 200, { items: [] });
      // Só o que veio antes da adoção: o transcript é o mesmo e já contém a continuação feita pelo Leão.
      const { items } = await transcriptDetail(chat.adoptedFrom, 400);
      return sendJson(res, 200, { items: items.filter((it) => it.kind !== 'thinking' && (!it.ts || it.ts < chat.createdAt)).slice(-200) });
    }
    if (!id && method === 'POST') return sendJson(res, 200, chats.meta(chats.create(await readBody(req))));
    if (id && !sub && method === 'GET') return sendJson(res, 200, chats.get(id));
    if (id && !sub && method === 'PATCH') return sendJson(res, 200, chats.meta(chats.updateSettings(id, await readBody(req))));
    if (id && !sub && method === 'DELETE') {
      chats.archive(id);
      return sendJson(res, 200, { ok: true });
    }
    if (id && sub === 'deliveries' && method === 'GET') {
      const chat = chats.get(id);
      const { prs } = await sessionDetail(chat.sessionId, 0);
      return sendJson(res, 200, { prs, deliveries: await getDeliveries(chat.cwd) });
    }
    if (id && sub === 'interrupt' && method === 'POST') return sendJson(res, 200, chats.meta(chats.interrupt(id)));
    if (id && sub === 'compact' && method === 'POST') return sendJson(res, 200, chats.meta(chats.compact(id)));
    if (id && sub === 'respond' && method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, chats.meta(chats.respond(id, body.requestId, body)));
    }
    if (id && sub === 'messages' && method === 'POST') {
      const body = await readBody(req);
      const chat = chats.get(id);
      const cmd = parseLocalCommand(body.text);
      if (cmd) {
        chats.pushMessage(chat, { role: 'user', text: body.text.trim(), local: true });
        chats.pushMessage(chat, { role: 'local', text: await runLocalCommand(cmd, chat) });
        chats.touch(chat);
        return sendJson(res, 200, chats.meta(chat));
      }
      return sendJson(res, 200, chats.meta(chats.send(id, body.text, body.images)));
    }
  }

  if (resource === 'sessions') {
    if (id === 'bg' && method === 'POST') return sendJson(res, 200, { output: await actions.startBackground(await readBody(req)) });
    if (id && sub === 'detail' && method === 'GET') {
      const session = sessionOr404(id);
      const detail = await sessionDetail(session.sessionId);
      return sendJson(res, 200, { ...detail, deliveries: await getDeliveries(session.cwd) });
    }
    if (id && sub === 'logs' && method === 'GET') return sendJson(res, 200, { output: await actions.sessionLogs(sessionOr404(id)) });
    if (id && sub === 'stop' && method === 'POST') {
      const output = await actions.stopSession(sessionOr404(id));
      monitor.refresh();
      return sendJson(res, 200, { output });
    }
    if (id && sub === 'terminal' && method === 'POST') return sendJson(res, 200, { output: actions.openTerminal(sessionOr404(id)) });
    if (id && sub === 'adopt' && method === 'POST') {
      const session = sessionOr404(id);
      if (!session.sessionId) throw new Error(`sessão "${id}" sem sessionId para mover`);
      const body = await readBody(req);
      await actions.releaseSession(session);
      const chat = chats.create({ ...body, cwd: session.cwd, adoptSessionId: session.sessionId, title: session.name && !/^[0-9a-f-]{20,}$/.test(session.name) ? session.name : (session.title || session.project) });
      monitor.refresh();
      return sendJson(res, 200, chats.meta(chat));
    }
    if (id && sub === 'fork-chat' && method === 'POST') {
      const session = sessionOr404(id);
      if (!session.sessionId) throw new Error(`sessão "${id}" sem sessionId para continuar no app`);
      const body = await readBody(req);
      const chat = chats.create({ ...body, cwd: session.cwd, forkFrom: session.sessionId, title: `↳ ${session.name || session.project}` });
      return sendJson(res, 200, chats.meta(chat));
    }
  }

  return sendJson(res, 404, { error: `rota não encontrada: ${method} ${url.pathname}` });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!hostAllowed(req)) {
    res.writeHead(403);
    res.end('host não permitido');
    return;
  }
  if (!url.pathname.startsWith('/api/')) {
    serveStatic(req, res, url.pathname, TOKEN);
    return;
  }
  if (!tokenOk(req, url)) return sendJson(res, 401, { error: 'token ausente ou inválido (recarregue a página)' });
  try {
    await handleApi(req, res, url);
  } catch (err) {
    console.error(`[api] ${req.method} ${url.pathname}:`, err.stack || err.message);
    if (!res.headersSent) sendJson(res, err.status || 400, { error: err.message });
  }
});

function shutdown() {
  monitor.stop();
  chats.shutdown();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(config.DATA_DIR, 'token'), TOKEN, { mode: 0o600 });

server.listen(config.PORT, config.HOST, () => {
  console.log(`${config.APP_NAME} em http://localhost:${config.PORT}`);
  monitor.start();
});
