import { beforeEach, describe, expect, it } from 'vitest';
import { state, applyEvent } from './store';

const HELLO = {
  type: 'hello',
  state: {
    sessions: [], sessionsError: null, chats: [{ id: 'c1', title: 'A', status: 'idle' }],
    profiles: [], models: ['haiku'], efforts: ['low'], permissionModes: ['auto'], defaults: {}, limits: null, costToday: 0, knownDirs: [],
  },
};

describe('eventos ao vivo', () => {
  beforeEach(() => {
    state.ready = false;
    state.messages = {};
    applyEvent(HELLO);
    state.messages.c1 = [];
  });

  it('hello marca o app como pronto (antes disso nenhuma tela diz "não encontrado")', () => {
    expect(state.ready).toBe(true);
    expect(state.chats.map((c) => c.id)).toEqual(['c1']);
  });

  it('streaming: delta acumula e message-update fecha a mensagem', () => {
    applyEvent({ type: 'message', chatId: 'c1', message: { id: 'm1', role: 'assistant', text: '', streaming: true } });
    applyEvent({ type: 'delta', chatId: 'c1', msgId: 'm1', text: 'Olá, ' });
    applyEvent({ type: 'delta', chatId: 'c1', msgId: 'm1', text: 'mundo' });
    expect(state.messages.c1[0].text).toBe('Olá, mundo');
    applyEvent({ type: 'message-update', chatId: 'c1', message: { id: 'm1', role: 'assistant', text: 'Olá, mundo!', streaming: false } });
    expect(state.messages.c1[0]).toMatchObject({ text: 'Olá, mundo!', streaming: false });
  });

  it('mensagem repetida não duplica', () => {
    const msg = { type: 'message', chatId: 'c1', message: { id: 'm1', role: 'user', text: 'oi' } };
    applyEvent(msg);
    applyEvent(msg);
    expect(state.messages.c1).toHaveLength(1);
  });

  it('mensagem da fila vai para o fim quando começa a rodar', () => {
    applyEvent({ type: 'message', chatId: 'c1', message: { id: 'u1', role: 'user', text: 'um' } });
    applyEvent({ type: 'message', chatId: 'c1', message: { id: 'u2', role: 'user', text: 'dois', queued: true } });
    applyEvent({ type: 'message', chatId: 'c1', message: { id: 'a1', role: 'assistant', text: 'resposta um' } });
    applyEvent({ type: 'message-moved', chatId: 'c1', message: { id: 'u2', role: 'user', text: 'dois', queued: false } });
    expect(state.messages.c1.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('sessions atualiza consumo e RAM dos chats sem trocar o resto', () => {
    applyEvent({ type: 'sessions', sessions: [{ id: 's1' }], error: null, chats: [{ id: 'c1', rssMb: 240, usage: { turns: 2 }, running: true, pid: 9 }] });
    expect(state.sessions).toHaveLength(1);
    expect(state.chats[0]).toMatchObject({ id: 'c1', title: 'A', rssMb: 240, running: true });
  });

  it('chat fechado some da lista e do cache', () => {
    applyEvent({ type: 'chat-removed', chatId: 'c1' });
    expect(state.chats).toHaveLength(0);
    expect(state.messages.c1).toBeUndefined();
  });
});
