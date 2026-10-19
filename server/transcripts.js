// Linha do tempo de uma sessão lida do transcript em ~/.claude/projects: zero token.
// O texto do raciocínio vem vazio no transcript (só assinatura): mostramos que raciocinou, não o conteúdo.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { toolSummary } = require('./stream');
const { readLinesFrom } = require('./lines');

const PROJECTS_DIR = path.join(config.CLAUDE_HOME, 'projects');
const TAIL_BYTES_DETAIL = 768 * 1024;
const TAIL_BYTES_NOW = 96 * 1024;
const TEXT_MAX = 1200;
const NOISE = /^<(system-reminder|command-|local-command|task-notification)|^\[Request interrupted/;

const pathCache = new Map();

function findTranscript(sessionId) {
  if (!sessionId) return null;
  const cached = pathCache.get(sessionId);
  if (cached && fs.existsSync(cached)) return cached;
  let dirs;
  try {
    dirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const file = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(file)) {
      pathCache.set(sessionId, file);
      return file;
    }
  }
  return null;
}

function readTailLines(file, bytes) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // primeira linha provavelmente cortada
    return lines.filter(Boolean);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function clip(text) {
  const t = String(text || '').trim();
  return t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX)}…` : t;
}

function userText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

// Converte linhas do transcript em itens: user, text, thinking, tool. Também extrai título e PRs.
const QUESTION_TOOL = 'AskUserQuestion';

function parseTranscript(lines) {
  const items = [];
  const prs = new Map();
  const questions = new Map();
  let title = null;
  for (const line of lines) {
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = d.timestamp ? Date.parse(d.timestamp) : null;
    if (d.type === 'custom-title' && d.customTitle) title = d.customTitle;
    else if (d.type === 'ai-title' && d.aiTitle && !title) title = d.aiTitle;
    else if (d.type === 'pr-link' && d.prUrl) {
      // O CLI regrava o pr-link a cada turno: vai só para Entregas, não para a linha do tempo.
      if (!prs.has(d.prUrl)) prs.set(d.prUrl, { number: d.prNumber, url: d.prUrl, repo: d.prRepository, ts });
    } else if (d.type === 'user' && d.message && !d.isMeta) {
      // Resposta de uma pergunta (AskUserQuestion): o transcript traz as escolhas estruturadas em toolUseResult.
      const results = Array.isArray(d.message.content) ? d.message.content.filter((c) => c.type === 'tool_result') : [];
      for (const r of results) {
        const q = questions.get(r.tool_use_id);
        if (q) q.answers = (d.toolUseResult && d.toolUseResult.answers) || { '': String(r.content || '') };
      }
      const text = userText(d.message.content).trim();
      if (text && !NOISE.test(text)) items.push({ kind: 'user', ts, text: clip(text) });
    } else if (d.type === 'assistant' && d.message && Array.isArray(d.message.content)) {
      for (const b of d.message.content) {
        if (b.type === 'thinking') {
          const last = items[items.length - 1];
          if (!last || last.kind !== 'thinking') items.push({ kind: 'thinking', ts, text: clip(b.thinking) });
        } else if (b.type === 'text' && b.text && b.text.trim()) {
          items.push({ kind: 'text', ts, text: clip(b.text) });
        } else if (b.type === 'tool_use' && b.name === QUESTION_TOOL) {
          const item = { kind: 'question', ts, questions: (b.input && b.input.questions) || [], answers: null };
          questions.set(b.id, item);
          items.push(item);
        } else if (b.type === 'tool_use') {
          items.push({ kind: 'tool', ts, name: b.name, text: toolSummary(b.name, b.input), desc: (b.input && b.input.description) || '' });
        }
      }
    }
  }
  return { items, prs: [...prs.values()], title };
}

function describeNow(item) {
  if (!item) return null;
  if (item.kind === 'tool') return { icon: 'tool', text: `${item.name}: ${item.desc || item.text.split('\n')[0]}`, ts: item.ts };
  if (item.kind === 'thinking') return { icon: 'thinking', text: 'raciocinando', ts: item.ts };
  if (item.kind === 'text') return { icon: 'text', text: item.text.split('\n')[0], ts: item.ts };
  if (item.kind === 'question') return { icon: 'user', text: item.answers ? 'respondeu uma pergunta' : 'fez uma pergunta', ts: item.ts };
  return { icon: 'user', text: `você: ${item.text.split('\n')[0]}`, ts: item.ts };
}

function sessionNow(sessionId) {
  const file = findTranscript(sessionId);
  if (!file) return null;
  const { items, title } = parseTranscript(readTailLines(file, TAIL_BYTES_NOW));
  return { now: describeNow(items[items.length - 1]), title };
}

// PRs podem ter sido abertos no começo da sessão, fora do tail: varre o arquivo todo só nas linhas pr-link.
const prCache = new Map();

async function allPrLinks(file) {
  let st = prCache.get(file);
  if (!st) {
    st = { offset: 0, rest: '', lines: [] };
    prCache.set(file, st);
  }
  try {
    if (fs.statSync(file).size < st.offset) Object.assign(st, { offset: 0, rest: '', lines: [] });
    const { offset, rest } = await readLinesFrom(file, st.offset, st.rest, (line) => {
      if (line.includes('"pr-link"')) st.lines.push(line);
    });
    st.offset = offset;
    st.rest = rest;
  } catch {
    return [];
  }
  return parseTranscript(st.lines).prs;
}

async function sessionDetail(sessionId, limit = 120) {
  const file = findTranscript(sessionId);
  if (!file) return { items: [], prs: [], title: null, transcript: null };
  const parsed = parseTranscript(readTailLines(file, TAIL_BYTES_DETAIL));
  return { ...parsed, prs: await allPrLinks(file), items: parsed.items.slice(-limit), transcript: file };
}

module.exports = { findTranscript, parseTranscript, describeNow, sessionNow, sessionDetail };
