const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

process.env.LEAO_DATA_DIR = path.join(os.homedir(), '.leao-test', 'test-data');

const { buildChatArgs } = require('../server/profiles');
const { parseEvent, createLineSplitter, normalizeLimits } = require('../server/stream');
const { parseProcStatus, treeRssKb } = require('../server/proc');
const { normalizeSession, detectAlerts } = require('../server/sessions');
const { parseLocalCommand, formatRam, formatLimits } = require('../server/commands');
const { parseFrontmatter } = require('../server/catalog');

test('perfil leve corta skills, MCP e tools', () => {
  const args = buildChatArgs({ profile: 'leve', model: 'haiku', effort: 'low' });
  assert.ok(args.includes('--disable-slash-commands'));
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('--tools=Bash,Read,Grep,Glob,AskUserQuestion'));
  // apelido antigo vira o ID exato da versão
  assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', 'claude-haiku-4-5-20251001']);
});

test('perfil completo não restringe nada e resume com fork', () => {
  const args = buildChatArgs({ profile: 'completo', model: 'sonnet', effort: 'medium', resumeId: 'abc', fork: true });
  assert.ok(!args.includes('--strict-mcp-config'));
  assert.deepEqual(args.slice(-3), ['--resume', 'abc', '--fork-session']);
});

test('valores fora da lista são recusados com mensagem útil', () => {
  assert.throws(() => buildChatArgs({ profile: 'leve', model: 'gpt', effort: 'low' }), /model inválido: "gpt"/);
});

test('stream: delta de texto, tool_use e result', () => {
  assert.deepEqual(parseEvent({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'oi' } } }), [{ op: 'delta', text: 'oi' }]);
  const tool = parseEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git status' } }] } });
  assert.deepEqual(tool, [{ op: 'tool', name: 'Bash', summary: 'git status' }]);
  const [result] = parseEvent({ type: 'result', subtype: 'success', total_cost_usd: 0.0277, result: 'ok', usage: {} });
  assert.equal(result.costTotal, 0.0277);
  assert.equal(result.isError, false);
});

test('stream: limites do plano viram fração + epoch em ms', () => {
  // Formato real capturado em 2026-10-02.
  const info = { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.13, resetsAt: 1790991000 }, seven_day: { utilization: 0.49, resetsAt: 1790985600 } } };
  const [op] = parseEvent({ type: 'rate_limit_event', rate_limit_info: info });
  assert.equal(op.op, 'limits');
  assert.equal(op.limits.fiveHour.utilization, 0.13);
  assert.equal(op.limits.sevenDay.resetsAt, 1790985600000);
  assert.equal(formatLimits(normalizeLimits(info)), 'Limites do plano: janela 5h 13% · semana 49%');
});

test('line splitter junta pedaços quebrados no meio da linha', () => {
  const lines = [];
  const feed = createLineSplitter((l) => lines.push(l));
  feed('{"a":');
  feed('1}\n{"b"');
  feed(':2}\n');
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
});

test('RSS soma a árvore de processos', () => {
  const table = new Map([
    [10, parseProcStatus(10, 'PPid:\t1\nVmRSS:\t  1000 kB\n')],
    [11, parseProcStatus(11, 'PPid:\t10\nVmRSS:\t  500 kB\n')],
    [12, parseProcStatus(12, 'PPid:\t11\nVmRSS:\t  250 kB\n')],
    [20, parseProcStatus(20, 'PPid:\t1\nVmRSS:\t  9999 kB\n')],
  ]);
  assert.equal(treeRssKb(table, 10), 1750);
  assert.equal(treeRssKb(table, 99), null);
});

test('alerta quando sessão entra em blocked ou termina', () => {
  const before = [normalizeSession({ id: 'a', status: 'busy', name: 'A' }), normalizeSession({ id: 'b', status: 'idle', name: 'B' })];
  const after = [normalizeSession({ id: 'a', status: 'idle', name: 'A' }), normalizeSession({ id: 'b', state: 'blocked', name: 'B' })];
  const alerts = detectAlerts(before, after).map((a) => `${a.type}:${a.session.id}`);
  assert.deepEqual(alerts.sort(), ['blocked:b', 'done:a']);
  assert.deepEqual(detectAlerts(after, after), []);
});

test('comando local só com "!"', () => {
  assert.deepEqual(parseLocalCommand('!parar chat ia'), { name: 'parar', arg: 'chat ia' });
  assert.equal(parseLocalCommand('/demo:resumo oi'), null);
  assert.equal(parseLocalCommand('status'), null);
});

test('!ram ordena do mais pesado e soma o total', () => {
  const out = formatRam([{ name: 'A', rssMb: 300 }, { name: 'B', rssMb: 1700 }, { name: 'C', rssMb: null }], [{ title: 'chat x', id: 'x', rssMb: 48 }]);
  const lines = out.split('\n');
  assert.equal(lines[0], 'Total: 2.00 GB em 3 processos');
  assert.match(lines[1], /1700 MB {2}B/);
});

test('frontmatter com descrição em bloco', () => {
  const fm = parseFrontmatter('---\nname: demo:x\ndescription: |\n  linha um\n  linha dois\ndisable-model-invocation: true\n---\ncorpo');
  assert.equal(fm.name, 'demo:x');
  assert.equal(fm.description, 'linha um linha dois');
  assert.equal(fm['disable-model-invocation'], 'true');
});

const { buildPromptMessage, buildPromptResponse } = require('../server/prompts');

const QUESTION_OP = {
  requestId: 'r1',
  toolName: 'AskUserQuestion',
  input: { questions: [{ question: 'Qual cor você prefere?', header: 'Cor', options: [{ label: 'Azul' }, { label: 'Verde' }], multiSelect: false }] },
};

test('pergunta: resposta vai em updatedInput.answers (formato verificado em 2026-10-02)', () => {
  const prompt = buildPromptMessage(QUESTION_OP);
  assert.equal(prompt.kind, 'question');
  const { frame, summary } = buildPromptResponse(prompt, { decision: 'allow', answers: { 'Qual cor você prefere?': 'Verde' } });
  assert.equal(frame.response.request_id, 'r1');
  assert.deepEqual(frame.response.response.updatedInput.answers, { 'Qual cor você prefere?': 'Verde' });
  assert.equal(summary, 'Verde');
});

test('pergunta de múltipla escolha junta os rótulos e recusa resposta vazia', () => {
  const op = { ...QUESTION_OP, input: { questions: [{ ...QUESTION_OP.input.questions[0], multiSelect: true }] } };
  const prompt = buildPromptMessage(op);
  const { summary } = buildPromptResponse(prompt, { decision: 'allow', answers: { 'Qual cor você prefere?': ['Azul', 'Verde'] } });
  assert.equal(summary, 'Azul, Verde');
  assert.throws(() => buildPromptResponse(prompt, { decision: 'allow', answers: {} }), /falta resposta para "Qual cor você prefere\?"/);
});

test('permissão: negar leva o motivo; sempre permitir devolve as sugestões', () => {
  const prompt = buildPromptMessage({ requestId: 'r2', toolName: 'Bash', input: { command: 'touch x' }, suggestions: [{ type: 'addRules' }] });
  assert.equal(prompt.kind, 'permission');
  assert.equal(prompt.detail, 'touch x');
  const denied = buildPromptResponse(prompt, { decision: 'deny', message: 'não' }).frame.response.response;
  assert.deepEqual(denied, { behavior: 'deny', message: 'não' });
  const always = buildPromptResponse(prompt, { decision: 'always' }).frame.response.response;
  assert.deepEqual(always.updatedPermissions, [{ type: 'addRules' }]);
  assert.throws(() => buildPromptResponse(prompt, { decision: 'talvez' }), /decisão inválida: "talvez"/);
});

const { costOf, applyLine, emptyTotals } = require('../server/usage');
const { parseTranscript } = require('../server/transcripts');
const { parseStatus } = require('../server/deliveries');

test('compactação: status e compact_boundary viram operações (formato real de 2026-10-02)', () => {
  assert.deepEqual(parseEvent({ type: 'system', subtype: 'status', status: 'compacting' }), [{ op: 'status', status: 'compacting', compactResult: null }]);
  const [op] = parseEvent({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 21599, post_tokens: 286 } });
  assert.deepEqual(op, { op: 'compact', trigger: 'manual', pre: 21599, post: 286 });
});

test('Leve com allowSlash libera comandos só para compactar', () => {
  const args = buildChatArgs({ profile: 'leve', model: 'haiku', effort: 'low', allowSlash: true });
  assert.ok(!args.includes('--disable-slash-commands'));
  assert.ok(args.includes('--strict-mcp-config'));
});

test('custo equivalente bate com o total_cost_usd do CLI (haiku, 2026-10-02)', () => {
  const usage = { input_tokens: 10, cache_creation_input_tokens: 20901, cache_read_input_tokens: 13796, output_tokens: 81, cache_creation: { ephemeral_1h_input_tokens: 20901, ephemeral_5m_input_tokens: 0 } };
  assert.equal(costOf('claude-haiku-4-5-20251001', usage).toFixed(7), '0.0435966');
});

test('usage conta cada resposta uma vez, mesmo repetida por bloco no transcript', () => {
  const totals = emptyTotals();
  const seen = new Set();
  const line = JSON.stringify({ type: 'assistant', timestamp: '2026-10-02T10:00:00Z', message: { id: 'msg_1', model: 'claude-opus-5-5', usage: { input_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, output_tokens: 50 } } });
  applyLine(totals, seen, line);
  applyLine(totals, seen, line);
  assert.equal(totals.turns, 1);
  assert.equal(totals.output, 50);
  assert.equal(totals.contextTokens, 1005);
});

test('transcript: pr-link vai para Entregas, mensagens meta e de comando ficam fora da linha do tempo', () => {
  const lines = [
    { type: 'user', message: { content: 'corrige o filtro' } },
    { type: 'user', isMeta: true, message: { content: 'Base directory for this skill' } },
    { type: 'user', message: { content: '<command-name>/rename</command-name>' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git status', description: 'Mostra o status' } }] } },
    { type: 'pr-link', prUrl: 'https://github.com/o/r/pull/1', prNumber: 1, prRepository: 'o/r' },
    { type: 'pr-link', prUrl: 'https://github.com/o/r/pull/1', prNumber: 1, prRepository: 'o/r' },
    { type: 'custom-title', customTitle: 'Filtro' },
  ].map((d) => JSON.stringify(d));
  const parsed = parseTranscript(lines);
  assert.deepEqual(parsed.items.map((i) => i.kind), ['user', 'tool']);
  assert.equal(parsed.items[1].desc, 'Mostra o status');
  assert.equal(parsed.prs.length, 1);
  assert.equal(parsed.title, 'Filtro');
});

test('entregas: no repo raiz o ponteiro de submódulo não conta como arquivo alterado', () => {
  const files = parseStatus(' M app-web\n M README.md\n?? novo.txt\n', true, ['/x/app-web']);
  assert.deepEqual(files.map((f) => f.file), ['README.md', 'novo.txt']);
});

test('transcript: AskUserQuestion vira card de pergunta com a resposta escolhida', () => {
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'AskUserQuestion', input: { questions: [{ question: 'Qual cor?', options: [{ label: 'Azul' }, { label: 'Branco' }] }] } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Your questions have been answered' }] }, toolUseResult: { answers: { 'Qual cor?': 'Branco' } } },
  ].map((d) => JSON.stringify(d));
  const { items } = parseTranscript(lines);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'question');
  assert.deepEqual(items[0].answers, { 'Qual cor?': 'Branco' });
});
