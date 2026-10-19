// Catálogo de skills, agentes e integrações MCP lido direto do disco: navegar não gasta token.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CACHE_MS = 60000;
const DESCRIPTION_MAX = 220;

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^[|>]-?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        i += 1;
        block.push(lines[i].trim());
      }
      value = block.join(' ');
    }
    out[kv[1]] = value.replace(/^["']|["']$/g, '');
  }
  return out;
}

function shorten(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > DESCRIPTION_MAX ? `${t.slice(0, DESCRIPTION_MAX)}…` : t;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readSkills() {
  const dir = path.join(config.CLAUDE_HOME, 'skills');
  return safeReaddir(dir)
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .map((d) => {
      let raw;
      try {
        raw = fs.readFileSync(path.join(dir, d.name, 'SKILL.md'), 'utf8');
      } catch {
        return null;
      }
      const fm = parseFrontmatter(raw);
      return {
        name: fm.name || d.name,
        description: shorten(fm.description),
        manualOnly: fm['disable-model-invocation'] === 'true',
        argumentHint: fm['argument-hint'] || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readAgents() {
  const dir = path.join(config.CLAUDE_HOME, 'agents');
  return safeReaddir(dir)
    .filter((d) => d.name.endsWith('.md'))
    .map((d) => {
      const fm = parseFrontmatter(fs.readFileSync(path.join(dir, d.name), 'utf8'));
      return { name: fm.name || d.name.replace(/\.md$/, ''), description: shorten(fm.description), model: fm.model || '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readMcpServers() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(config.CLAUDE_JSON, 'utf8'));
  } catch {
    return [];
  }
  // O mesmo MCP costuma estar configurado em vários projetos: agrupa por nome.
  const byName = new Map();
  const add = (name, s, scope) => {
    if (!byName.has(name)) byName.set(name, { name, type: s.type || 'stdio', scopes: [] });
    const entry = byName.get(name);
    if (!entry.scopes.includes(scope)) entry.scopes.push(scope);
  };
  for (const [name, s] of Object.entries(data.mcpServers || {})) add(name, s, 'global');
  for (const [project, p] of Object.entries(data.projects || {})) {
    for (const [name, s] of Object.entries((p && p.mcpServers) || {})) add(name, s, path.basename(project));
  }
  return [...byName.values()]
    .map((m) => ({ ...m, scope: m.scopes.includes('global') ? 'global' : `${m.scopes.length} projeto(s)` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

let cache = null;
function getCatalog() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = { skills: readSkills(), agents: readAgents(), mcp: readMcpServers() };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getCatalog, parseFrontmatter };
