export function fmtAgo(ts) {
  if (!ts) return '';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

export function fmtMb(mb) {
  if (mb === null || mb === undefined) return '';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

// Valor equivalente de API: no plano não há cobrança por token.
export function fmtUsd(v) {
  const n = Number(v || 0);
  const s = n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(3);
  return `US$ ${s.replace('.', ',')}`;
}

export function fmtPct(fraction) {
  return `${Math.round((fraction || 0) * 100)}%`;
}

export const LEVEL_WARN = 0.5;
export const LEVEL_HIGH = 0.8;
export function level(fraction) {
  if (fraction >= LEVEL_HIGH) return 'high';
  if (fraction >= LEVEL_WARN) return 'warn';
  return '';
}

// Nome amigável de uma sessão: nome dado pelo usuário, senão o título que o Claude gerou, senão a pasta.
export function sessionLabel(s) {
  if (s.name && !/^[0-9a-f-]{20,}$/.test(s.name)) return s.name;
  return s.title || s.project || s.id;
}
