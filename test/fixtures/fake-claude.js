#!/usr/bin/env node
// "claude -p" falso para os testes: fala o mesmo protocolo stream-json capturado do CLI real em 2026-10-02
// (handshake initialize, can_use_tool, compactação, rate_limit_event, total_cost_usd cumulativo). Zero token.
const crypto = require('crypto');
const readline = require('readline');

const COST_PER_TURN = 0.01;
const SLOW_MS = 400;

const args = process.argv.slice(2);

// `claude agents --json`: o monitor de sessões pergunta isso a cada 3 s.
if (args[0] === 'agents') {
  process.stdout.write('[]\n');
  process.exit(0);
}
const resumeIdx = args.indexOf('--resume');
const sessionId = resumeIdx !== -1 ? args[resumeIdx + 1] : crypto.randomUUID();
let costTotal = 0;
let busy = false;
let interrupted = false;
const queue = [];
const pendingControl = new Map();

const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function textOf(content) {
  if (typeof content === 'string') return { text: content, images: 0 };
  const blocks = Array.isArray(content) ? content : [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    images: blocks.filter((b) => b.type === 'image').length,
  };
}

function result(text, isError = false) {
  costTotal += COST_PER_TURN;
  write({
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    is_error: isError,
    result: text,
    total_cost_usd: Number(costTotal.toFixed(6)),
    usage: { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 100, output_tokens: 5 },
    session_id: sessionId,
  });
}

function askControl(request) {
  const requestId = crypto.randomUUID();
  write({ type: 'control_request', request_id: requestId, request });
  return new Promise((resolve) => pendingControl.set(requestId, resolve));
}

async function handleTurn(content) {
  const { text, images } = textOf(content);
  write({ type: 'system', subtype: 'init', session_id: sessionId, model: 'claude-haiku-4-5-20251001', tools: [] });
  write({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 1790991000 }, seven_day: { utilization: 0.5, resetsAt: 1790985600 } } } });

  if (text === '/compact') {
    write({ type: 'system', subtype: 'status', status: 'compacting', session_id: sessionId });
    write({ type: 'system', subtype: 'status', status: null, compact_result: 'success', session_id: sessionId });
    write({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 1000, post_tokens: 100 } });
    result('');
    return;
  }
  if (text.includes('DEVAGAR')) {
    write({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 42 });
    await sleep(SLOW_MS);
    if (interrupted) {
      interrupted = false;
      result('', true);
      return;
    }
  }
  if (text.includes('PERGUNTA')) {
    const input = { questions: [{ question: 'Qual cor?', header: 'Cor', multiSelect: false, options: [{ label: 'Azul' }, { label: 'Branco' }] }] };
    const answer = await askControl({ subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input });
    const chosen = answer.behavior === 'allow' ? answer.updatedInput.answers['Qual cor?'] : 'nada';
    write({ type: 'assistant', message: { id: crypto.randomUUID(), content: [{ type: 'text', text: `escolheu: ${chosen}` }] } });
    result(`escolheu: ${chosen}`);
    return;
  }
  if (text.includes('PERMISSAO')) {
    const answer = await askControl({ subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'touch x' }, permission_suggestions: [{ type: 'addRules' }] });
    const reply = answer.behavior === 'allow' ? 'executado' : `negado: ${answer.message}`;
    write({ type: 'assistant', message: { id: crypto.randomUUID(), content: [{ type: 'text', text: reply }] } });
    result(reply);
    return;
  }
  const reply = images ? `eco: ${images} imagem(ns): ${text}` : `eco: ${text}`;
  write({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: reply.slice(0, 3) } } });
  write({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: reply.slice(3) } } });
  write({ type: 'assistant', message: { id: crypto.randomUUID(), content: [{ type: 'text', text: reply }] } });
  result(reply);
}

// Uma mensagem por vez, as outras esperam na fila (como o CLI real faz).
async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) await handleTurn(queue.shift());
  busy = false;
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return;
  }
  if (d.type === 'control_request' && d.request.subtype === 'initialize') {
    write({ type: 'control_response', response: { subtype: 'success', request_id: d.request_id, response: { commands: [] } } });
  } else if (d.type === 'control_request' && d.request.subtype === 'interrupt') {
    if (busy) interrupted = true;
    queue.length = 0;
    write({ type: 'control_response', response: { subtype: 'success', request_id: d.request_id } });
  } else if (d.type === 'control_response') {
    const resolve = pendingControl.get(d.response.request_id);
    if (resolve) {
      pendingControl.delete(d.response.request_id);
      resolve(d.response.response);
    }
  } else if (d.type === 'user') {
    queue.push(d.message.content);
    drain();
  }
});
rl.on('close', () => process.exit(0));
