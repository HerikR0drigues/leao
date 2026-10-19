// Ações sobre sessões existentes. Nenhuma delas chama modelo: custo zero de tokens.
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('./config');
const { run } = require('./exec');

function assertDirectory(cwd) {
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch {
    throw new Error(`pasta não encontrada: "${cwd}" (esperado: caminho absoluto existente)`);
  }
  if (!stat.isDirectory()) throw new Error(`não é pasta: "${cwd}"`);
}

async function sessionLogs(session) {
  if (session.kind !== 'background') {
    throw new Error(`logs só existem para sessões em background; "${session.name || session.id}" é ${session.kind}`);
  }
  return run(config.CLAUDE_BIN, ['logs', session.id]);
}

async function stopSession(session) {
  if (session.kind === 'background') {
    await run(config.CLAUDE_BIN, ['stop', session.id]);
    return `parada: ${session.name || session.id} (retoma com claude attach ${session.id})`;
  }
  if (!session.pid) throw new Error(`sessão "${session.name || session.id}" sem pid para encerrar`);
  if (session.pid === process.pid) throw new Error('o Leão não encerra o próprio processo');
  // SIGTERM deixa o Claude Code salvar a conversa; retoma depois com --resume.
  process.kill(session.pid, 'SIGTERM');
  return `encerrada: ${session.name || session.id} (retoma com claude --resume ${session.sessionId || ''})`.trim();
}

const RELEASE_TIMEOUT_MS = 8000;
const RELEASE_POLL_MS = 200;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Libera a sessão para o app retomá-la: para (background) ou encerra (terminal) e espera o processo sair,
// senão dois processos escreveriam no mesmo transcript.
async function releaseSession(session) {
  if (session.kind === 'background') {
    await run(config.CLAUDE_BIN, ['stop', session.id]);
    return;
  }
  if (!session.pid) throw new Error(`sessão "${session.name || session.id}" sem pid para encerrar`);
  if (session.pid === process.pid) throw new Error('o Leão não encerra o próprio processo');
  process.kill(session.pid, 'SIGTERM');
  const deadline = Date.now() + RELEASE_TIMEOUT_MS;
  while (isAlive(session.pid)) {
    if (Date.now() > deadline) throw new Error(`o processo ${session.pid} não encerrou em ${RELEASE_TIMEOUT_MS / 1000}s; feche o terminal e tente de novo`);
    await new Promise((r) => setTimeout(r, RELEASE_POLL_MS));
  }
}

function openTerminal(session) {
  if (session.kind !== 'background') {
    throw new Error(`"${session.name || session.id}" já está aberta num terminal (pid ${session.pid})`);
  }
  const args = ['--', config.CLAUDE_BIN, 'attach', session.id];
  const child = spawn(config.TERMINAL_BIN, args, { cwd: session.cwd || undefined, detached: true, stdio: 'ignore' });
  child.on('error', (err) => console.error('[terminal]', err.message));
  child.unref();
  return `abrindo terminal: ${session.name || session.id}`;
}

async function startBackground({ cwd, prompt, model }) {
  assertDirectory(cwd);
  if (!prompt || !prompt.trim()) throw new Error('prompt vazio (esperado: a tarefa da sessão)');
  const args = ['--bg'];
  if (model) args.push('--model', model);
  args.push(prompt);
  const out = await run(config.CLAUDE_BIN, args, { cwd, timeoutMs: 30000 });
  return out.trim();
}

module.exports = { sessionLogs, stopSession, releaseSession, openTerminal, startBackground, assertDirectory };
