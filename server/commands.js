// Comandos locais com prefixo "!": respondidos pelo próprio Leão, sem chamar modelo (zero token).
const actions = require('./actions');
const store = require('./store');

const LOG_TAIL_LINES = 40;

const HELP = [
  '!status            todas as sessões, estado, branch e RAM',
  '!bloqueadas        só as que estão esperando você',
  '!ram               RAM total e as sessões mais pesadas',
  '!custo             limites do plano (5h/semana) e consumo por chat',
  '!logs <id|nome>    últimas linhas de uma sessão em background',
  '!parar <id|nome>   para/encerra uma sessão (conversa fica salva)',
  '!bg <tarefa>       nova sessão em background na pasta deste chat',
  '!ajuda             esta lista',
].join('\n');

function parseLocalCommand(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('!')) return null;
  const [name, ...rest] = t.slice(1).split(/\s+/);
  return { name: (name || '').toLowerCase(), arg: rest.join(' ').trim() };
}

function formatSession(s) {
  const ram = s.rssMb != null ? `${s.rssMb} MB` : '—';
  const where = [s.project, s.branch].filter(Boolean).join(' @ ');
  return `[${s.state}] ${s.name || s.id} · ${where} · ${s.kind} · ${ram} · id ${s.id}`;
}

function formatSessions(sessions) {
  if (!sessions.length) return 'Nenhuma sessão ativa.';
  return sessions.map(formatSession).join('\n');
}

function formatRam(sessions, chats) {
  const rows = [
    ...sessions.filter((s) => s.rssMb != null).map((s) => ({ label: s.name || s.project, mb: s.rssMb })),
    ...chats.filter((c) => c.rssMb != null).map((c) => ({ label: `chat: ${c.title || c.id.slice(0, 8)}`, mb: c.rssMb })),
  ].sort((a, b) => b.mb - a.mb);
  const total = rows.reduce((acc, r) => acc + r.mb, 0);
  const top = rows.slice(0, 8).map((r) => `${String(r.mb).padStart(6)} MB  ${r.label}`);
  return [`Total: ${(total / 1024).toFixed(2)} GB em ${rows.length} processos`, ...top].join('\n');
}

function pct(w) {
  return w ? `${Math.round(w.utilization * 100)}%` : '?';
}

function formatLimits(limits) {
  if (!limits) return 'Limites do plano: ainda sem leitura (aparece após a 1ª mensagem num chat do app).';
  return `Limites do plano: janela 5h ${pct(limits.fiveHour)} · semana ${pct(limits.sevenDay)}`;
}

// No plano não há cobrança por token: o valor em US$ é só o equivalente de API, para comparar chats.
function formatCost(chats, limits) {
  const lines = [formatLimits(limits), `Hoje (equivalente API, não é cobrado): US$ ${store.costToday().toFixed(4)}`];
  for (const c of [...chats].sort((a, b) => b.costUsd - a.costUsd).slice(0, 8)) {
    lines.push(`US$ ${c.costUsd.toFixed(4)}  ${c.title || c.id.slice(0, 8)} (${c.profile}/${c.model})`);
  }
  return lines.join('\n');
}

function requireSession(monitor, arg) {
  if (!arg) throw new Error('informe o id ou nome da sessão (ex: !parar 15611f44)');
  const session = monitor.find(arg);
  if (!session) throw new Error(`sessão não encontrada: "${arg}" (use !status para ver os ids)`);
  return session;
}

async function executeLocal(cmd, { monitor, chatList, cwd, limits }) {
  switch (cmd.name) {
    case 'ajuda':
    case 'help':
      return HELP;
    case 'status':
      return formatSessions(monitor.sessions);
    case 'bloqueadas':
      return formatSessions(monitor.sessions.filter((s) => s.state === 'blocked'));
    case 'ram':
      return formatRam(monitor.sessions, chatList);
    case 'custo':
      return formatCost(chatList, limits);
    case 'logs': {
      const out = await actions.sessionLogs(requireSession(monitor, cmd.arg));
      return out.trim().split('\n').slice(-LOG_TAIL_LINES).join('\n') || '(sem saída)';
    }
    case 'parar':
    case 'stop':
      return actions.stopSession(requireSession(monitor, cmd.arg));
    case 'bg':
      if (!cwd) throw new Error('!bg precisa de um chat aberto (usa a pasta dele)');
      return `Sessão criada: ${await actions.startBackground({ cwd, prompt: cmd.arg })}`;
    default:
      return `Comando desconhecido: !${cmd.name}\n\n${HELP}`;
  }
}

module.exports = { parseLocalCommand, executeLocal, formatSession, formatRam, formatLimits, HELP };
