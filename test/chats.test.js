// ChatManager de ponta a ponta contra o "claude" falso (test/fixtures/fake-claude.js): fila, perguntas, permissões,
// compactar, interromper e imagens, sem gastar token.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.homedir(), '.leao-test', `test-chats-${process.pid}`);
process.env.LEAO_DATA_DIR = DATA_DIR;
process.env.LEAO_CLAUDE_BIN = path.join(__dirname, 'fixtures', 'fake-claude.js');
fs.chmodSync(process.env.LEAO_CLAUDE_BIN, 0o755);

const { ChatManager } = require('../server/chats');

const WAIT_MS = 5000;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

async function waitFor(check, label) {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`tempo esgotado esperando: ${label}`);
}

function setup(t, settings = {}) {
  const manager = new ChatManager();
  const chat = manager.create({ cwd: os.homedir(), ...settings });
  t.after(() => manager.shutdown());
  return { manager, chat };
}

const texts = (chat, role) => chat.messages.filter((m) => m.role === role).map((m) => m.text);

test('mensagem simples: streaming, resposta final, custo e limites do plano', async (t) => {
  const { manager, chat } = setup(t);
  const deltas = [];
  manager.on('event', (e) => { if (e.type === 'delta') deltas.push(e.text); });
  manager.send(chat.id, 'oi');
  await waitFor(() => chat.status === 'idle' && texts(chat, 'assistant').length === 1, 'resposta');
  assert.deepEqual(texts(chat, 'assistant'), ['eco: oi']);
  assert.equal(deltas.join(''), 'eco: oi');
  assert.equal(chat.costUsd, 0.01);
  assert.ok(chat.sessionId, 'sessionId capturado do init');
  assert.equal(manager.limits.fiveHour.utilization, 0.2);
});

test('fila: 2ª mensagem com o Claude ocupado espera e entra na ordem certa', async (t) => {
  const { manager, chat } = setup(t);
  manager.send(chat.id, 'DEVAGAR um');
  await waitFor(() => chat.status === 'busy', 'ocupado');
  manager.send(chat.id, 'dois');
  const queued = chat.messages.find((m) => m.text === 'dois');
  assert.equal(queued.queued, true, 'marcada como na fila');
  await waitFor(() => chat.status === 'idle' && texts(chat, 'assistant').length === 2, 'duas respostas');
  assert.deepEqual(chat.messages.map((m) => `${m.role}:${m.text}`), [
    'user:DEVAGAR um', 'assistant:eco: DEVAGAR um', 'user:dois', 'assistant:eco: dois',
  ]);
  assert.equal(queued.queued, false);
  // custo cumulativo do processo vira soma das diferenças: 0,01 + 0,01
  assert.equal(chat.costUsd, 0.02);
});

test('pergunta (AskUserQuestion): espera você e devolve a resposta escolhida', async (t) => {
  const { manager, chat } = setup(t);
  manager.send(chat.id, 'PERGUNTA');
  await waitFor(() => chat.status === 'waiting', 'esperando resposta');
  const prompt = chat.messages.find((m) => m.role === 'prompt');
  assert.equal(prompt.kind, 'question');
  assert.throws(() => manager.send(chat.id, 'outra coisa'), /esperando sua resposta/);
  manager.respond(chat.id, prompt.requestId, { decision: 'allow', answers: { 'Qual cor?': 'Azul' } });
  await waitFor(() => chat.status === 'idle', 'fim do turno');
  assert.equal(prompt.answer, 'Azul');
  assert.deepEqual(texts(chat, 'assistant'), ['escolheu: Azul']);
  assert.throws(() => manager.respond(chat.id, prompt.requestId, { decision: 'allow', answers: {} }), /já foi respondida/);
});

test('permissão negada leva o motivo até o Claude', async (t) => {
  const { manager, chat } = setup(t);
  manager.send(chat.id, 'PERMISSAO');
  await waitFor(() => chat.status === 'waiting', 'pedido de permissão');
  const prompt = chat.messages.find((m) => m.role === 'prompt');
  assert.equal(prompt.kind, 'permission');
  assert.equal(prompt.detail, 'touch x');
  manager.respond(chat.id, prompt.requestId, { decision: 'deny', message: 'não quero' });
  await waitFor(() => chat.status === 'idle', 'fim do turno');
  assert.deepEqual(texts(chat, 'assistant'), ['negado: não quero']);
});

test('compactar no Leve: avisa o antes/depois e volta ao Leve na próxima mensagem', async (t) => {
  const { manager, chat } = setup(t, { profile: 'leve' });
  manager.send(chat.id, 'oi');
  await waitFor(() => chat.status === 'idle' && chat.sessionId, 'primeira resposta');
  manager.compact(chat.id);
  await waitFor(() => chat.status === 'idle' && texts(chat, 'system').some((s) => s.startsWith('Contexto compactado')), 'compactação');
  assert.ok(texts(chat, 'system').includes('Contexto compactado: 1,0k → 100 tokens. Detalhes antigos agora são um resumo.'));
  await waitFor(() => !manager.procs.has(chat.id), 'processo com comandos liberados encerrado');
});

test('compactar recusa enquanto o Claude trabalha', async (t) => {
  const { manager, chat } = setup(t);
  assert.throws(() => manager.compact(chat.id), /conversa está vazia/);
  manager.send(chat.id, 'DEVAGAR');
  await waitFor(() => chat.status === 'busy', 'ocupado');
  assert.throws(() => manager.compact(chat.id), /espere o Claude terminar/);
  await waitFor(() => chat.status === 'idle', 'fim');
});

test('interromper: avisa "Interrompido." sem virar "Erro" e cancela a fila', async (t) => {
  const { manager, chat } = setup(t);
  manager.send(chat.id, 'DEVAGAR longo');
  await waitFor(() => chat.status === 'busy', 'ocupado');
  manager.send(chat.id, 'na fila');
  manager.interrupt(chat.id);
  await waitFor(() => chat.status === 'idle', 'parado');
  const system = texts(chat, 'system');
  assert.ok(system.includes('Interrompido.'));
  assert.ok(!system.some((s) => s.startsWith('Erro')), `sem erro falso: ${system.join(' | ')}`);
  assert.equal(chat.messages.find((m) => m.text === 'na fila').cancelled, true);
});

test('imagem: vai como bloco image para o Claude e fica salva na mensagem', async (t) => {
  const { manager, chat } = setup(t);
  manager.send(chat.id, 'o que tem aqui?', [{ name: 'p.png', mediaType: 'image/png', data: PNG_1PX }]);
  await waitFor(() => chat.status === 'idle' && texts(chat, 'assistant').length === 1, 'resposta');
  assert.deepEqual(texts(chat, 'assistant'), ['eco: 1 imagem(ns): o que tem aqui?']);
  const [img] = chat.messages[0].images;
  assert.match(img.id, /^[0-9a-f-]{36}\.png$/);
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'uploads', img.id)));
  assert.equal(img.data, undefined, 'base64 não vai para o histórico salvo');
});

test('perfil Leve barra skill localmente, sem chamar o Claude', (t) => {
  const { manager, chat } = setup(t, { profile: 'leve' });
  manager.send(chat.id, '/demo:resumo');
  assert.equal(manager.procs.has(chat.id), false, 'nenhum processo aberto');
  assert.match(texts(chat, 'system')[0], /O perfil Leve desativa skills/);
});

test('renomear não encerra o processo; trocar modelo sim (próxima mensagem retoma com --resume)', async (t) => {
  const { manager, chat } = setup(t);
  manager.send(chat.id, 'oi');
  await waitFor(() => chat.status === 'idle' && chat.sessionId, 'resposta');
  const pid = manager.procs.get(chat.id).child.pid;
  manager.updateSettings(chat.id, { title: 'Novo nome' });
  assert.equal(manager.procs.get(chat.id).child.pid, pid);
  manager.updateSettings(chat.id, { model: 'sonnet' });
  assert.equal(manager.procs.has(chat.id), false);
  const session = chat.sessionId;
  manager.send(chat.id, 'de novo');
  await waitFor(() => chat.status === 'idle' && texts(chat, 'assistant').length === 2, 'segunda resposta');
  assert.equal(chat.sessionId, session, 'retomou a mesma sessão');
});
