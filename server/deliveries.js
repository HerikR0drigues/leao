// Entregas de uma pasta: branch, commits à frente da base e arquivos alterados, no repo e nos submódulos.
const fs = require('fs');
const path = require('path');
const { run } = require('./exec');

const CACHE_MS = 20000;
const BASE_CANDIDATES = ['origin/desenvolvimento', 'origin/main', 'origin/master'];
const MAX_COMMITS = 8;
const MAX_FILES = 12;

const cache = new Map();

function git(repo, args) {
  return run('git', ['-C', repo, ...args], { timeoutMs: 8000 }).then((out) => out.trim()).catch(() => '');
}

function submodulePaths(root) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
  } catch {
    return [];
  }
  return [...raw.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => path.join(root, m[1].trim())).filter((p) => fs.existsSync(path.join(p, '.git')));
}

async function findBase(repo) {
  for (const ref of BASE_CANDIDATES) {
    if (await git(repo, ['rev-parse', '--verify', '-q', ref])) return ref;
  }
  return null;
}

function parseCommits(out) {
  return out.split('\n').filter(Boolean).map((line) => {
    const [hash, subject, ct] = line.split('\t');
    return { hash, subject, ts: Number(ct) * 1000 };
  });
}

function parseStatus(out, isRoot, submodules) {
  const names = new Set(submodules.map((p) => path.basename(p)));
  return out.split('\n').filter(Boolean)
    .map((line) => ({ code: line.slice(0, 2).trim(), file: line.slice(3) }))
    // No repo raiz, submódulo "modificado" é só ponteiro: os arquivos aparecem no item do submódulo.
    .filter((f) => !(isRoot && names.has(f.file)));
}

async function repoDelivery(repo, root, submodules) {
  const branch = await git(repo, ['branch', '--show-current']);
  if (!branch && !(await git(repo, ['rev-parse', '--git-dir']))) return null;
  const base = await findBase(repo);
  const [log, status] = await Promise.all([
    base ? git(repo, ['log', '--format=%h%x09%s%x09%ct', `-n${MAX_COMMITS}`, `${base}..HEAD`]) : Promise.resolve(''),
    git(repo, ['status', '--porcelain']),
  ]);
  const ahead = base ? Number(await git(repo, ['rev-list', '--count', `${base}..HEAD`])) || 0 : 0;
  const files = parseStatus(status, repo === root, submodules);
  const onBase = base && branch === base.replace(/^origin\//, '');
  if (!ahead && !files.length && (onBase || !branch)) return null;
  return {
    repo: repo === root ? path.basename(root) : path.relative(root, repo),
    branch: branch || '(HEAD destacado)',
    base,
    ahead,
    commits: parseCommits(log),
    changed: files.length,
    files: files.slice(0, MAX_FILES),
  };
}

async function getDeliveries(root) {
  if (!root) return [];
  const cached = cache.get(root);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const submodules = submodulePaths(root);
  const results = await Promise.all([root, ...submodules].map((r) => repoDelivery(r, root, submodules)));
  const data = results.filter(Boolean);
  cache.set(root, { at: Date.now(), data });
  return data;
}

module.exports = { getDeliveries, parseCommits, parseStatus };
