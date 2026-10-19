import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('../store', () => ({ respondPrompt: vi.fn(() => Promise.resolve({})), toastError: vi.fn() }));
// eslint-disable-next-line import/first
import { respondPrompt } from '../store';
// eslint-disable-next-line import/first
import PromptCard from './PromptCard.vue';

const question = (multiSelect = false) => ({
  role: 'prompt', kind: 'question', requestId: 'r1', answered: false,
  questions: [{ question: 'Qual cor?', header: 'Cor', multiSelect, options: [{ label: 'Azul' }, { label: 'Branco' }] }],
});

describe('PromptCard', () => {
  beforeEach(() => respondPrompt.mockClear());

  it('pergunta única: um clique já responde', async () => {
    const w = mount(PromptCard, { props: { message: question(), chatId: 'c1' } });
    await w.findAll('.option')[1].trigger('click');
    await flushPromises();
    expect(respondPrompt).toHaveBeenCalledWith('c1', 'r1', { decision: 'allow', answers: { 'Qual cor?': 'Branco' } });
  });

  it('múltipla escolha junta as marcadas e o "Outro"', async () => {
    const w = mount(PromptCard, { props: { message: question(true), chatId: 'c1' } });
    await w.findAll('.option')[0].trigger('click');
    await w.findAll('.option')[1].trigger('click');
    await w.find('input').setValue('Verde');
    expect(respondPrompt).not.toHaveBeenCalled();
    await w.find('.btn.primary').trigger('click');
    await flushPromises();
    expect(respondPrompt).toHaveBeenCalledWith('c1', 'r1', { decision: 'allow', answers: { 'Qual cor?': ['Azul', 'Branco', 'Verde'] } });
  });

  it('permissão: negar envia o motivo escrito', async () => {
    const message = { role: 'prompt', kind: 'permission', requestId: 'r2', answered: false, toolName: 'Bash', detail: 'git push', suggestions: [{ type: 'addRules' }] };
    const w = mount(PromptCard, { props: { message, chatId: 'c1' } });
    expect(w.text()).toContain('git push');
    await w.find('input').setValue('ainda não');
    await w.find('.btn.danger').trigger('click');
    await flushPromises();
    expect(respondPrompt).toHaveBeenCalledWith('c1', 'r2', { decision: 'deny', message: 'ainda não' });
  });

  it('respondida mostra só o resumo', () => {
    const w = mount(PromptCard, { props: { message: { ...question(), answered: true, answer: 'Azul' }, chatId: 'c1' } });
    expect(w.find('.option').exists()).toBe(false);
    expect(w.text()).toContain('Azul');
  });
});
