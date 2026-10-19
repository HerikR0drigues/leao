// Consumo de tokens por sessão a partir do `usage` gravado no transcript: zero token, leitura incremental.
// Preços por milhão de tokens (tabela oficial da skill claude-api, cache de 2026-09-25). Escrita de cache:
// 1,25x (5 min) e 2x (1 h) do input. Fórmula conferida em 2026-10-02 contra o total_cost_usd do CLI (haiku: 0,0436 = 0,0436).
const fs = require('fs');
const { findTranscript } = require('./transcripts');
const { readLinesFrom } = require('./lines');

const PRICES = [
  { match: 'fable-5', input: 10, output: 50, read: 0.25, window: 1000000 },
  { match: 'mythos-5', input: 10, output: 50, read: 0.25, window: 1000000 },
  { match: 'opus-5-5', input: 4, output: 20, read: 0.20, window: 1000000 },
  { match: 'opus-5', input: 5, output: 25, read: 0.50, window: 1000000 },
  { match: 'opus-4', input: 5, output: 25, read: 0.50, window: 1000000 },
  { match: 'sonnet-5', input: 2, output: 10, read: 0.20, window: 1000000 },
  { match: 'sonnet-4', input: 3, output: 15, read: 0.30, window: 1000000 },
  { match: 'haiku-4', input: 1, output: 5, read: 0.10, window: 200000 },
];
const WRITE_5M = 1.25;
const WRITE_1H = 2;
const MTOK = 1e6;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function priceFor(model) {
  return PRICES.find((p) => String(model || '').includes(p.match)) || null;
}

function costOf(model, u) {
  const p = priceFor(model);
  if (!p) return 0;
  const cc = u.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const w5m = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return ((u.input_tokens || 0) * p.input
    + w5m * p.input * WRITE_5M
    + w1h * p.input * WRITE_1H
    + (u.cache_read_input_tokens || 0) * p.read
    + (u.output_tokens || 0) * p.output) / MTOK;
}

function emptyTotals() {
  return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, costUsd: 0, turns: 0, model: null, contextTokens: 0, lastTs: null, recent: [] };
}

// Cada resposta aparece várias vezes no transcript (um evento por bloco): conta cada message.id uma vez só.
function applyLine(totals, seen, line) {
  if (!line.includes('"usage"')) return;
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return;
  }
  const m = d.message;
  if (d.type !== 'assistant' || !m || !m.usage || !m.id || seen.has(m.id)) return;
  if (m.model === '<synthetic>') return;
  seen.add(m.id);
  const u = m.usage;
  const cost = costOf(m.model, u);
  const ts = d.timestamp ? Date.parse(d.timestamp) : Date.now();
  totals.input += u.input_tokens || 0;
  totals.cacheWrite += u.cache_creation_input_tokens || 0;
  totals.cacheRead += u.cache_read_input_tokens || 0;
  totals.output += u.output_tokens || 0;
  totals.costUsd += cost;
  totals.turns += 1;
  totals.model = m.model;
  totals.contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  totals.lastTs = ts;
  totals.recent.push({ ts, cost, tokens: (u.output_tokens || 0) + (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) });
}

const fileState = new Map();
const inflight = new Set();

function stateOf(file) {
  let st = fileState.get(file);
  if (!st) {
    st = { offset: 0, rest: '', totals: emptyTotals(), seen: new Set() };
    fileState.set(file, st);
  }
  return st;
}

async function update(file) {
  const st = stateOf(file);
  const { size } = await fs.promises.stat(file);
  if (size < st.offset) {
    fileState.delete(file);
    return update(file);
  }
  if (size === st.offset) return;
  const { offset, rest } = await readLinesFrom(file, st.offset, st.rest, (line) => applyLine(st.totals, st.seen, line));
  st.offset = offset;
  st.rest = rest;
}

function summarize(totals) {
  const p = priceFor(totals.model);
  const since = Date.now() - RATE_WINDOW_MS;
  totals.recent = totals.recent.filter((r) => r.ts >= since);
  const recentCost = totals.recent.reduce((acc, r) => acc + r.cost, 0);
  const recentTokens = totals.recent.reduce((acc, r) => acc + r.tokens, 0);
  return {
    model: totals.model,
    turns: totals.turns,
    input: totals.input,
    output: totals.output,
    cacheRead: totals.cacheRead,
    cacheWrite: totals.cacheWrite,
    totalTokens: totals.input + totals.output + totals.cacheRead + totals.cacheWrite,
    costUsd: Number(totals.costUsd.toFixed(4)),
    contextTokens: totals.contextTokens,
    contextWindow: p ? p.window : null,
    contextPct: p && totals.contextTokens ? totals.contextTokens / p.window : null,
    cacheHitPct: totals.cacheRead + totals.cacheWrite + totals.input
      ? totals.cacheRead / (totals.cacheRead + totals.cacheWrite + totals.input) : null,
    // Ritmo: quanto gastou nos últimos 10 minutos.
    rate10m: { costUsd: Number(recentCost.toFixed(4)), tokens: recentTokens, turns: totals.recent.length },
    lastTs: totals.lastTs,
  };
}

// Devolve o último total conhecido na hora e dispara a leitura do que foi acrescentado, sem esperar:
// a primeira leitura de um transcript grande leva segundos e não pode segurar o monitor nem as rotas.
function sessionUsage(sessionId) {
  const file = findTranscript(sessionId);
  if (!file) return null;
  if (!inflight.has(file)) {
    inflight.add(file);
    update(file)
      .catch((err) => console.error(`[usage] ${file}: ${err.message}`))
      .finally(() => inflight.delete(file));
  }
  const st = stateOf(file);
  return st.totals.turns ? summarize(st.totals) : null;
}

// Para teste e scripts: espera a leitura terminar.
async function sessionUsageNow(sessionId) {
  const file = findTranscript(sessionId);
  if (!file) return null;
  await update(file);
  return summarize(stateOf(file).totals);
}

module.exports = { sessionUsage, sessionUsageNow, costOf, priceFor, applyLine, emptyTotals, summarize };
