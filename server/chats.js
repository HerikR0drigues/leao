// Chats: cada um é um processo `claude -p` em stream-json mantido vivo entre mensagens,
// para que o prompt cache seja reaproveitado (2ª mensagem ~10x mais barata que a 1ª).
const EventEmitter = require('events');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('./config');
const store = require('./store');
const { buildChatArgs, DEFAULT_CHAT, normalizeModel } = require('./profiles');
const { parseEvent, createLineSplitter } = require('./stream');
const { assertDirectory } = require('./actions');
const { saveImages, buildContent } = require('./uploads');
const { buildPromptMessage, buildPromptResponse, controlError, QUESTION_TOOL } = require('./prompts');

const STDERR_TAIL = 2000;
const TITLE_MAX = 48;
const INTERRUPT_GRACE_MS = 5000;
const SETTING_KEYS = ['profile', 'model', 'effort', 'permissionMode'];

let seq = 0;
function newId() {
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}`;
}

class ChatManager extends EventEmitter {
  constructor() {
    super();
    this.chats = new Map();
    this.procs = new Map();
    this.limits = store.loadLimits();
    for (const chat of store.loadChats()) {
      if (chat.archived) continue;
      chat.status = 'idle';
      chat.model = normalizeModel(chat.model);
      for (const m of chat.messages) {
        m.streaming = false;
        // O processo que fez a pergunta não existe mais: não dá para responder depois de reiniciar.
        if (m.role === 'prompt' && !m.answered) Object.assign(m, { answered: true, answer: 'Expirou (app reiniciado)' });
      }
      this.chats.set(chat.id, chat);
    }
  }

  meta(chat) {
    const { messages, ...rest } = chat;
    const proc = this.procs.get(chat.id);
    return { ...rest, messageCount: messages.length, running: Boolean(proc), pid: proc ? proc.child.pid : null };
  }

  list() {
    return [...this.chats.values()].map((c) => this.meta(c)).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id) {
    const chat = this.chats.get(id);
    if (!chat) throw new Error(`chat não encontrado: "${id}"`);
    return chat;
  }

  create({ title, cwd, profile, model, effort, permissionMode, forkFrom, adoptSessionId } = {}) {
    assertDirectory(cwd);
    const settings = {
      profile: profile || DEFAULT_CHAT.profile,
      model: normalizeModel(model || DEFAULT_CHAT.model),
      effort: effort || DEFAULT_CHAT.effort,
      permissionMode: permissionMode || DEFAULT_CHAT.permissionMode,
    };
    buildChatArgs(settings); // valida antes de criar
    const now = Date.now();
    const chat = {
      id: crypto.randomUUID(),
      title: title || '',
      cwd,
      ...settings,
      forkFrom: forkFrom || null,
      // Sessão do terminal movida para o app: retoma o mesmo id (sem fork), histórico e consumo continuam.
      adoptedFrom: adoptSessionId || null,
      sessionId: adoptSessionId || null,
      status: 'idle',
      costUsd: 0,
      lastUsage: null,
      createdAt: now,
      updatedAt: now,
      archived: false,
      messages: [],
    };
    this.chats.set(chat.id, chat);
    store.saveChat(chat);
    this.emitChat(chat);
    return chat;
  }

  updateSettings(id, rawPatch) {
    const chat = this.get(id);
    const patch = rawPatch.model ? { ...rawPatch, model: normalizeModel(rawPatch.model) } : rawPatch;
    if (typeof patch.title === 'string') chat.title = patch.title.trim().slice(0, TITLE_MAX * 2);
    const changed = SETTING_KEYS.filter((k) => patch[k] && patch[k] !== chat[k]);
    if (changed.length) {
      if (chat.status !== 'idle') throw new Error('chat ocupado; interrompa antes de trocar perfil/modelo/modo');
      const next = Object.fromEntries(SETTING_KEYS.map((k) => [k, patch[k] || chat[k] || DEFAULT_CHAT[k]]));
      next.model = normalizeModel(next.model);
      buildChatArgs(next);
      Object.assign(chat, next);
      // Flags só valem no spawn: encerra e a próxima mensagem volta com --resume (renomear não encerra).
      this.killProc(id);
    }
    this.touch(chat);
    return chat;
  }

  send(id, text, images) {
    const chat = this.get(id);
    const content = String(text || '').trim();
    if (!content && !(images && images.length)) throw new Error('mensagem vazia');
    if (chat.status === 'waiting') throw new Error('o Claude está esperando sua resposta no card acima');
    if (content.startsWith('/') && chat.profile === 'leve') {
      // Evita gastar uma chamada para o modelo responder que a skill não existe.
      this.pushMessage(chat, { role: 'system', text: 'O perfil Leve desativa skills. Troque para Padrão ou Completo para usar /' + content.slice(1).split(/\s/)[0] + '.' });
      return chat;
    }
    const saved = saveImages(images);
    if (!chat.title) chat.title = (content || 'Imagem').slice(0, TITLE_MAX);
    const proc = this.procs.get(id) || this.spawnProc(chat);
    clearTimeout(proc.idleTimer);
    // Com o Claude ocupado a mensagem entra na fila do próprio CLI e roda em seguida (verificado em 2026-10-02).
    const queued = chat.status === 'busy';
    this.pushMessage(chat, { role: 'user', text: content, queued, images: saved.map(({ id: imgId, name, mediaType }) => ({ id: imgId, name, mediaType })) });
    proc.pending += 1;
    chat.status = 'busy';
    this.touch(chat);
    this.writeFrame(proc, { type: 'user', message: { role: 'user', content: buildContent(content, saved) } });
    return chat;
  }

  // /compact resume a conversa para liberar contexto. No Leve os comandos estão desligados:
  // reabre o processo com eles só para compactar e volta ao Leve na mensagem seguinte.
  compact(id) {
    const chat = this.get(id);
    if (chat.status !== 'idle') throw new Error('espere o Claude terminar (ou interrompa) antes de compactar');
    if (!chat.sessionId) throw new Error('nada para compactar ainda: a conversa está vazia');
    const needsSlash = chat.profile === 'leve';
    if (needsSlash) this.killProc(id);
    const proc = this.procs.get(id) || this.spawnProc(chat, { allowSlash: needsSlash });
    clearTimeout(proc.idleTimer);
    proc.compacting = true;
    proc.killAfterTurn = needsSlash;
    proc.pending += 1;
    this.pushMessage(chat, { role: 'system', text: 'Compactando o contexto… detalhes antigos viram um resumo.' });
    chat.status = 'busy';
    this.setNow(chat, { icon: 'thinking', text: 'compactando contexto' });
    this.touch(chat);
    this.writeFrame(proc, { type: 'user', message: { role: 'user', content: '/compact' } });
    return chat;
  }

  // Interrompe pelo protocolo (mantém processo e cache vivos); se não parar em 5s, encerra o processo.
  interrupt(id) {
    const chat = this.get(id);
    const proc = this.procs.get(id);
    if (!proc || chat.status === 'idle') return chat;
    this.expirePrompts(chat, 'Cancelado (interrompido)');
    proc.interrupted = true;
    this.writeFrame(proc, { type: 'control_request', request_id: `interrupt-${Date.now()}`, request: { subtype: 'interrupt' } });
    clearTimeout(proc.interruptTimer);
    proc.interruptTimer = setTimeout(() => {
      if (chat.status !== 'idle' && this.procs.get(id) === proc) {
        this.killProc(id, 'SIGINT');
        chat.status = 'idle';
        this.touch(chat);
      }
    }, INTERRUPT_GRACE_MS);
    this.pushMessage(chat, { role: 'system', text: 'Interrompido.' });
    this.touch(chat);
    return chat;
  }

  respond(id, requestId, body) {
    const chat = this.get(id);
    const prompt = chat.messages.find((m) => m.role === 'prompt' && m.requestId === requestId);
    if (!prompt) throw new Error(`pergunta não encontrada: "${requestId}"`);
    if (prompt.answered) throw new Error('essa pergunta já foi respondida');
    const proc = this.procs.get(id);
    if (!proc) throw new Error('o processo que fez a pergunta já terminou; mande uma nova mensagem');
    const { frame, summary } = buildPromptResponse(prompt, body || {});
    this.writeFrame(proc, frame);
    prompt.answered = true;
    prompt.answer = summary;
    this.emit('event', { type: 'message-update', chatId: chat.id, message: prompt });
    if (!chat.messages.some((m) => m.role === 'prompt' && !m.answered)) chat.status = 'busy';
    this.touch(chat);
    return chat;
  }

  expirePrompts(chat, answer) {
    for (const m of chat.messages) {
      if (m.role !== 'prompt' || m.answered) continue;
      Object.assign(m, { answered: true, answer });
      this.emit('event', { type: 'message-update', chatId: chat.id, message: m });
    }
  }

  writeFrame(proc, frame) {
    proc.child.stdin.write(`${JSON.stringify(frame)}\n`);
  }

  archive(id) {
    const chat = this.get(id);
    this.killProc(id);
    chat.archived = true;
    store.saveChat(chat);
    this.chats.delete(id);
    this.emit('event', { type: 'chat-removed', chatId: id });
  }

  shutdown() {
    for (const id of [...this.procs.keys()]) this.killProc(id);
  }

  spawnProc(chat, { allowSlash = false } = {}) {
    const resumeId = chat.sessionId || chat.forkFrom;
    const args = buildChatArgs({ ...chat, resumeId, fork: !chat.sessionId && Boolean(chat.forkFrom), allowSlash });
    const child = spawn(config.CLAUDE_BIN, args, { cwd: chat.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const proc = {
      child, costBase: 0, streaming: null, stderr: '', idleTimer: null, interruptTimer: null,
      pending: 0, compacting: false, killAfterTurn: false,
    };
    this.procs.set(chat.id, proc);
    // Sem este handshake o CLI esconde o AskUserQuestion e não manda pedidos de permissão ao app.
    this.writeFrame(proc, { type: 'control_request', request_id: `init-${chat.id}`, request: { subtype: 'initialize' } });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', createLineSplitter((line) => {
      let data;
      try {
        data = JSON.parse(line);
      } catch {
        proc.stderr = (proc.stderr + line + '\n').slice(-STDERR_TAIL);
        return;
      }
      for (const op of parseEvent(data)) this.applyOp(chat, proc, op);
    }));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      proc.stderr = (proc.stderr + chunk).slice(-STDERR_TAIL);
    });
    child.on('error', (err) => this.onExit(chat, proc, null, err.message));
    child.on('exit', (code, signal) => this.onExit(chat, proc, code, signal));
    this.emitChat(chat);
    return proc;
  }

  onExit(chat, proc, code, reason) {
    if (this.procs.get(chat.id) !== proc) return;
    this.procs.delete(chat.id);
    clearTimeout(proc.idleTimer);
    clearTimeout(proc.interruptTimer);
    this.expirePrompts(chat, 'Expirou (processo terminou)');
    this.dropQueued(chat);
    if (chat.status !== 'idle') {
      const tail = proc.stderr.trim().split('\n').slice(-5).join('\n');
      this.pushMessage(chat, { role: 'system', text: `Processo do Claude terminou (código ${code}, ${reason || 'sem sinal'}).${tail ? `\n${tail}` : ''}` });
      chat.status = 'idle';
    }
    this.touch(chat);
  }

  applyOp(chat, proc, op) {
    if (op.op === 'control') {
      this.onControl(chat, proc, op);
      return;
    }
    if (op.op === 'control-ack') {
      if (!op.ok) console.error(`[chats] control ${op.requestId} recusado: ${op.error}`);
      return;
    }
    if (op.op === 'status') {
      if (op.status === 'compacting') this.setNow(chat, { icon: 'thinking', text: 'compactando contexto' });
      return;
    }
    if (op.op === 'compact') {
      const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(n));
      const how = op.trigger === 'manual' ? 'Contexto compactado' : 'Contexto compactado automaticamente';
      this.pushMessage(chat, { role: 'system', text: `${how}: ${k(op.pre)} → ${k(op.post)} tokens. Detalhes antigos agora são um resumo.` });
      return;
    }
    if (op.op === 'thinking') {
      this.setNow(chat, { icon: 'thinking', text: `raciocinando · ~${op.tokens} tokens` });
      return;
    }
    if (op.op === 'limits') {
      this.limits = op.limits;
      store.saveLimits(op.limits);
      this.emit('event', { type: 'limits', limits: op.limits });
      return;
    }
    if (op.op === 'init') {
      chat.sessionId = op.sessionId || chat.sessionId;
      return;
    }
    if (op.op === 'delta') {
      if (!proc.streaming) {
        proc.streaming = this.pushMessage(chat, { role: 'assistant', text: '', streaming: true });
        this.setNow(chat, { icon: 'text', text: 'escrevendo resposta' });
      }
      proc.streaming.text += op.text;
      this.emit('event', { type: 'delta', chatId: chat.id, msgId: proc.streaming.id, text: op.text });
      return;
    }
    if (op.op === 'text') {
      if (proc.streaming) {
        proc.streaming.text = op.text;
        proc.streaming.streaming = false;
        this.emit('event', { type: 'message-update', chatId: chat.id, message: proc.streaming });
        proc.streaming = null;
      } else {
        this.pushMessage(chat, { role: 'assistant', text: op.text });
      }
      return;
    }
    if (op.op === 'tool') {
      this.finishStreaming(chat, proc);
      if (op.name === QUESTION_TOOL) return; // vira card de pergunta; o JSON cru só polui
      this.setNow(chat, { icon: 'tool', text: `${op.name}: ${op.summary.split('\n')[0]}` });
      this.pushMessage(chat, { role: 'tool', name: op.name, text: op.summary });
      return;
    }
    if (op.op === 'result') this.onResult(chat, proc, op);
  }

  onControl(chat, proc, op) {
    if (op.subtype !== 'can_use_tool') {
      this.writeFrame(proc, controlError(op.requestId, `subtype não suportado pelo Leão: ${op.subtype}`));
      return;
    }
    this.finishStreaming(chat, proc);
    const prompt = this.pushMessage(chat, buildPromptMessage(op));
    chat.status = 'waiting';
    this.touch(chat);
    const what = prompt.kind === 'question' ? 'fez uma pergunta' : `pede permissão para ${op.toolName}`;
    this.emit('event', { type: 'alert', alertType: 'waiting', chatId: chat.id, message: `Chat "${chat.title || 'sem título'}" ${what}` });
  }

  onResult(chat, proc, op) {
    clearTimeout(proc.interruptTimer);
    this.finishStreaming(chat, proc);
    // total_cost_usd é cumulativo por processo (verificado em 2026-10-02): soma só a diferença.
    let turnCost = op.costTotal - proc.costBase;
    if (turnCost < 0) turnCost = op.costTotal;
    proc.costBase = op.costTotal;
    chat.costUsd = Number((chat.costUsd + turnCost).toFixed(6));
    chat.lastUsage = op.usage;
    const today = store.addCost(turnCost);
    // Turno interrompido termina com erro de execução: já avisamos com "Interrompido.".
    if (op.isError && !proc.interrupted) this.pushMessage(chat, { role: 'system', text: `Erro: ${op.text || 'resposta com erro'}` });
    proc.pending = proc.interrupted ? 0 : Math.max(0, proc.pending - 1);
    if (proc.interrupted) this.dropQueued(chat);
    proc.interrupted = false;
    proc.compacting = false;
    this.emit('event', { type: 'cost', chatId: chat.id, turnCost, chatCost: chat.costUsd, today });
    if (proc.pending > 0) {
      // Próxima mensagem da fila começa agora: tira o selo "na fila" dela.
      // Ela vai para o fim da conversa: entrou na fila antes da resposta anterior terminar.
      const idx = chat.messages.findIndex((m) => m.role === 'user' && m.queued);
      if (idx !== -1) {
        const [next] = chat.messages.splice(idx, 1);
        next.queued = false;
        next.ts = Date.now();
        chat.messages.push(next);
        this.emit('event', { type: 'message-moved', chatId: chat.id, message: next });
      }
      this.touch(chat);
      return;
    }
    chat.status = 'idle';
    chat.now = null;
    this.touch(chat);
    if (proc.killAfterTurn) {
      this.killProc(chat.id);
      return;
    }
    proc.idleTimer = setTimeout(() => this.killProc(chat.id), config.CHAT_IDLE_KILL_MS);
  }

  dropQueued(chat) {
    for (const m of chat.messages) {
      if (m.role !== 'user' || !m.queued) continue;
      m.queued = false;
      m.cancelled = true;
      this.emit('event', { type: 'message-update', chatId: chat.id, message: m });
    }
  }

  // "O que está fazendo agora": não persiste a cada mudança, só avisa o front.
  setNow(chat, now) {
    chat.now = { ...now, ts: Date.now() };
    this.emit('event', { type: 'now', chatId: chat.id, now: chat.now });
  }

  finishStreaming(chat, proc) {
    if (!proc.streaming) return;
    proc.streaming.streaming = false;
    this.emit('event', { type: 'message-update', chatId: chat.id, message: proc.streaming });
    proc.streaming = null;
  }

  killProc(id, signal = 'SIGTERM') {
    const proc = this.procs.get(id);
    if (!proc) return;
    this.procs.delete(id);
    clearTimeout(proc.idleTimer);
    try {
      proc.child.kill(signal);
    } catch (err) {
      console.error(`[chats] kill ${id}: ${err.message}`);
    }
    const chat = this.chats.get(id);
    if (chat) this.emitChat(chat);
  }

  pushMessage(chat, partial) {
    const message = { id: newId(), ts: Date.now(), streaming: false, ...partial };
    chat.messages.push(message);
    if (chat.messages.length > config.MAX_MESSAGES_PER_CHAT) {
      chat.messages.splice(0, chat.messages.length - config.MAX_MESSAGES_PER_CHAT);
    }
    this.emit('event', { type: 'message', chatId: chat.id, message });
    return message;
  }

  touch(chat) {
    chat.updatedAt = Date.now();
    store.saveChat(chat);
    this.emitChat(chat);
  }

  emitChat(chat) {
    this.emit('event', { type: 'chat', chat: this.meta(chat) });
  }
}

module.exports = { ChatManager };
