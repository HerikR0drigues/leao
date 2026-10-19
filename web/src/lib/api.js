// Cliente da API local. O token vem numa <meta> que o servidor preenche a cada inicialização.
const PLACEHOLDER = '__LEAO_TOKEN__';
const RELOAD_GUARD_KEY = 'leao.reloadedForToken';
const RELOAD_GUARD_MS = 30000;
const TIMEOUT_MS = 120000;

const meta = document.querySelector('meta[name="leao-token"]');
// Em desenvolvimento (Vite) a meta fica com o placeholder e quem injeta o token é o proxy.
export const TOKEN = meta && meta.content !== PLACEHOLDER ? meta.content : '';

// Servidor reiniciado = token novo: a página antiga só volta a funcionar recarregando. Uma vez a cada 30 s no máximo.
export function reloadForNewToken() {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
  } catch {
    last = 0;
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  window.location.reload();
  return true;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(method, url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-leao-token': TOKEN },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(err.name === 'AbortError' ? `tempo esgotado em ${url}` : `sem conexão com o Leão (${err.message})`, 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) reloadForNewToken();
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status} em ${url}`, res.status);
  return data;
}

export const eventsUrl = () => `/api/events?token=${encodeURIComponent(TOKEN)}`;
export const uploadUrl = (id) => `/api/uploads/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
