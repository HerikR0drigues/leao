// Estado central do Leão: dados vindos do servidor (SSE) + ações. Componentes leem `state` e chamam as ações.
import { reactive } from 'vue';
import { api, eventsUrl, reloadForNewToken, TOKEN } from './lib/api';

export const state = reactive({
  ready: false,
  connected: false,
  sessions: [],
  sessionsError: null,
  chats: [],
  messages: {},
  history: {},
  // Detalhe das sessões do terminal (linha do tempo, PRs, entregas): uma busca por sessão aberta, lida por tela e painel.
  sessionDetails: {},
  profiles: [],
  models: [],
  efforts: [],
  permissionModes: [],
  defaults: {},
  limits: null,
  costToday: 0,
  knownDirs: [],
  catalog: null,
  toasts: [],
  dialog: null,
  notify: false,
});

const TOAST_MS = 4500;
const TOAST_LONG_MS = 9000;
const NOTIFY_KEY = 'leao.notify';

// ---------- toasts e diálogos ----------
let toastSeq = 0;
export function toast(message, kind = '') {
  toastSeq += 1;
  const id = toastSeq;
  state.toasts.push({ id, message, kind });
  setTimeout(() => removeToast(id), kind ? TOAST_LONG_MS : TOAST_MS);
}
export function removeToast(id) {
  const i = state.toasts.findIndex((t) => t.id === id);
  if (i !== -1) state.toasts.splice(i, 1);
}
export function toastError(err) {
  toast(err && err.message ? err.message : String(err), 'error');
}

// kind: 'confirm' | 'newChat' | 'newBackground' | 'adopt' | 'output'. Resolve com o valor da ação escolhida.
export function openDialog(kind, props = {}) {
  return new Promise((resolve) => {
    state.dialog = { kind, props, resolve };
  });
}
export function closeDialog(value = null) {
  const d = state.dialog;
  state.dialog = null;
  if (d) d.resolve(value);
}

// ---------- consultas ----------
export const findChat = (id) => state.chats.find((c) => c.id === id) || null;
export const findSession = (id) => state.sessions.find((s) => s.id === id) || null;

function upsertChat(meta) {
  const i = state.chats.findIndex((c) => c.id === meta.id);
  if (i === -1) state.chats.unshift({ ...meta });
  else Object.assign(state.chats[i], meta);
}

// ---------- ações de chat ----------
export async function loadMessages(chatId) {
  const chat = await api('GET', `/api/chats/${chatId}`);
  const { messages, ...meta } = chat;
  upsertChat(meta);
  state.messages[chatId] = messages;
  if (meta.adoptedFrom && !state.history[chatId]) {
    const { items } = await api('GET', `/api/chats/${chatId}/history`);
    state.history[chatId] = items;
  }
  return chat;
}

export async function createChat(body) {
  const chat = await api('POST', '/api/chats', body);
  upsertChat(chat);
  return chat;
}

export const sendMessage = (chatId, text, images) => api('POST', `/api/chats/${chatId}/messages`, { text, images });
export const respondPrompt = (chatId, requestId, body) => api('POST', `/api/chats/${chatId}/respond`, { requestId, ...body });
export const interruptChat = (chatId) => api('POST', `/api/chats/${chatId}/interrupt`);
export const compactChat = (chatId) => api('POST', `/api/chats/${chatId}/compact`);
export const chatDeliveries = (chatId) => api('GET', `/api/chats/${chatId}/deliveries`);

export async function patchChat(chatId, patch) {
  const meta = await api('PATCH', `/api/chats/${chatId}`, patch);
  upsertChat(meta);
  return meta;
}

export const archiveChat = (chatId) => api('DELETE', `/api/chats/${chatId}`);

// ---------- ações de sessão ----------
export const sessionDetail = (id) => api('GET', `/api/sessions/${id}/detail`);
export const sessionLogs = (id) => api('GET', `/api/sessions/${id}/logs`);
export const stopSession = (id) => api('POST', `/api/sessions/${id}/stop`);
export const openTerminal = (id) => api('POST', `/api/sessions/${id}/terminal`);
export const startBackground = (body) => api('POST', '/api/sessions/bg', body);

export async function adoptSession(sessionId, settings) {
  const chat = await api('POST', `/api/sessions/${sessionId}/adopt`, settings);
  upsertChat(chat);
  return chat;
}

export const runCommand = (text) => api('POST', '/api/command', { text });

export async function loadCatalog() {
  if (!state.catalog) state.catalog = await api('GET', '/api/catalog');
  return state.catalog;
}

// ---------- notificações do navegador ----------
export async function toggleNotify() {
  if (!window.Notification) {
    toast('Este navegador não suporta notificações');
    return;
  }
  if (state.notify) {
    state.notify = false;
    remember(NOTIFY_KEY, '0');
    toast('Avisos do navegador desligados');
    return;
  }
  const perm = await Notification.requestPermission();
  state.notify = perm === 'granted';
  remember(NOTIFY_KEY, state.notify ? '1' : '0');
  toast(state.notify ? 'Avisos ligados: você é avisado quando um agente precisa de você ou termina' : 'O navegador não permitiu notificações');
}

function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento: só perde a preferência */
  }
}
function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function notify(message, kind) {
  toast(message, kind);
  if (state.notify && document.hidden && window.Notification && Notification.permission === 'granted') {
    // eslint-disable-next-line no-new
    new Notification('Leão', { body: message, icon: '/favicon.png' });
  }
}

// ---------- eventos ao vivo ----------
function findMessage(chatId, msgId) {
  const list = state.messages[chatId];
  return list ? list.find((m) => m.id === msgId) : null;
}

const handlers = {
  hello(e) {
    const s = e.state;
    Object.assign(state, {
      sessions: s.sessions,
      sessionsError: s.sessionsError,
      chats: s.chats,
      profiles: s.profiles,
      models: s.models,
      efforts: s.efforts,
      permissionModes: s.permissionModes,
      defaults: s.defaults,
      limits: s.limits,
      costToday: s.costToday,
      knownDirs: s.knownDirs,
    });
    state.ready = true;
    // Reconectou: o que estava aberto pode ter mudado enquanto a conexão caiu.
    for (const chatId of Object.keys(state.messages)) {
      if (findChat(chatId)) loadMessages(chatId).catch(() => {});
      else delete state.messages[chatId];
    }
  },
  sessions(e) {
    state.sessions = e.sessions;
    state.sessionsError = e.error;
    for (const c of e.chats) {
      const chat = findChat(c.id);
      if (chat) Object.assign(chat, { rssMb: c.rssMb, usage: c.usage, running: c.running, pid: c.pid });
    }
  },
  alert(e) {
    notify(e.message, e.alertType === 'done' ? '' : 'alert');
  },
  chat(e) {
    upsertChat(e.chat);
  },
  now(e) {
    const chat = findChat(e.chatId);
    if (chat) chat.now = e.now;
  },
  'chat-removed'(e) {
    state.chats = state.chats.filter((c) => c.id !== e.chatId);
    delete state.messages[e.chatId];
    delete state.history[e.chatId];
  },
  message(e) {
    const list = state.messages[e.chatId];
    if (list && !list.some((m) => m.id === e.message.id)) list.push(e.message);
  },
  delta(e) {
    const m = findMessage(e.chatId, e.msgId);
    if (m) m.text += e.text;
  },
  'message-update'(e) {
    const m = findMessage(e.chatId, e.message.id);
    if (m) Object.assign(m, e.message);
  },
  'message-moved'(e) {
    const list = state.messages[e.chatId];
    if (!list) return;
    const i = list.findIndex((m) => m.id === e.message.id);
    if (i !== -1) list.splice(i, 1);
    list.push(e.message);
  },
  cost(e) {
    state.costToday = e.today;
  },
  limits(e) {
    state.limits = e.limits;
  },
};

// Aplica um evento do servidor ao estado (exportado para os testes).
export function applyEvent(event) {
  const handler = handlers[event.type];
  if (handler) handler(event);
}

let source = null;
export function connect() {
  state.notify = recall(NOTIFY_KEY) === '1' && window.Notification && Notification.permission === 'granted';
  source = new EventSource(eventsUrl());
  source.onopen = () => {
    state.connected = true;
  };
  source.onmessage = (msg) => applyEvent(JSON.parse(msg.data));
  source.onerror = async () => {
    state.connected = false;
    // EventSource não expõe o status: confere se o motivo é token vencido (servidor reiniciado).
    try {
      const res = await fetch('/api/state', { headers: { 'x-leao-token': TOKEN } });
      if (res.status === 401) reloadForNewToken();
    } catch {
      /* servidor fora do ar: o EventSource tenta de novo sozinho */
    }
  };
  // F5 com a conexão aberta: fecha antes de sair para não segurar uma das 6 conexões por host do navegador.
  window.addEventListener('pagehide', () => source && source.close());
}
