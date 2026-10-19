// Monitor das sessões do Claude Code na máquina, via `claude agents --json`.
const EventEmitter = require('events');
const path = require('path');
const config = require('./config');
const { run } = require('./exec');
const { readProcTable, treeRssKb } = require('./proc');
const { sessionNow } = require('./transcripts');
const { sessionUsage } = require('./usage');

const BRANCH_CACHE_MS = 30000;

function normalizeSession(raw) {
  return {
    id: raw.id || raw.sessionId,
    sessionId: raw.sessionId || null,
    kind: raw.kind || 'interactive',
    pid: raw.pid || null,
    cwd: raw.cwd || '',
    project: raw.cwd ? path.basename(raw.cwd) : '',
    name: raw.name || '',
    state: raw.state || raw.status || 'unknown',
    startedAt: raw.startedAt || null,
  };
}

// Transições que merecem aviso: entrou em blocked (esperando você) ou terminou um trabalho.
function detectAlerts(previous, current) {
  const before = new Map(previous.map((s) => [s.id, s.state]));
  const alerts = [];
  for (const s of current) {
    const was = before.get(s.id);
    if (s.state === 'blocked' && was !== 'blocked') {
      alerts.push({ type: 'blocked', session: s, message: `${s.name || s.project} está esperando você` });
    } else if (was === 'busy' && s.state === 'idle') {
      alerts.push({ type: 'done', session: s, message: `${s.name || s.project} terminou` });
    }
  }
  return alerts;
}

class SessionMonitor extends EventEmitter {
  constructor() {
    super();
    this.sessions = [];
    this.lastError = null;
    this.branchCache = new Map();
    this.timer = null;
  }

  start() {
    const tick = () => {
      this.refresh().finally(() => {
        this.timer = setTimeout(tick, config.SESSIONS_POLL_MS);
      });
    };
    tick();
  }

  stop() {
    clearTimeout(this.timer);
  }

  async refresh() {
    let raw;
    try {
      raw = JSON.parse(await run(config.CLAUDE_BIN, ['agents', '--json']));
    } catch (err) {
      this.lastError = err.message;
      console.error('[sessions]', err.message);
      return;
    }
    this.lastError = null;
    const table = readProcTable();
    const sessions = await Promise.all(raw.map(normalizeSession).map(async (s) => {
      const live = sessionNow(s.sessionId) || {};
      return {
        ...s,
        title: live.title || null,
        now: live.now || null,
        usage: sessionUsage(s.sessionId),
        rssMb: s.pid ? Math.round((treeRssKb(table, s.pid) || 0) / 1024) : null,
        branch: await this.branchOf(s.cwd),
      };
    }));
    // Ordem estável: só "esperando você" sobe para o topo. Ordenar por trabalhando/parada fazia a lista
    // trocar de lugar a cada 3 s e o clique cair na sessão errada.
    sessions.sort((a, b) => Number(b.state === 'blocked') - Number(a.state === 'blocked') || (b.startedAt || 0) - (a.startedAt || 0));
    const alerts = detectAlerts(this.sessions, sessions);
    this.sessions = sessions;
    this.emit('update', sessions);
    for (const alert of alerts) this.emit('alert', alert);
  }

  async branchOf(cwd) {
    if (!cwd) return null;
    const cached = this.branchCache.get(cwd);
    if (cached && Date.now() - cached.at < BRANCH_CACHE_MS) return cached.branch;
    let branch = null;
    try {
      branch = (await run('git', ['-C', cwd, 'branch', '--show-current'], { timeoutMs: 3000 })).trim() || null;
    } catch {
      branch = null;
    }
    this.branchCache.set(cwd, { branch, at: Date.now() });
    return branch;
  }

  find(idOrName, list = this.sessions) {
    const needle = String(idOrName || '').toLowerCase();
    if (!needle) return null;
    return list.find((s) => s.id.toLowerCase() === needle)
      || list.find((s) => (s.sessionId || '').toLowerCase().startsWith(needle))
      || list.find((s) => s.name.toLowerCase() === needle)
      || list.find((s) => s.name.toLowerCase().includes(needle) || s.project.toLowerCase().includes(needle))
      || null;
  }
}

module.exports = { SessionMonitor, normalizeSession, detectAlerts };
