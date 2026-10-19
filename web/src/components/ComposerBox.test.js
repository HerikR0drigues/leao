import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('../store', () => ({
  state: {
    models: [{ id: 'claude-haiku-4-5-20251001', alias: 'haiku', label: 'Haiku 4.5' }, { id: 'claude-sonnet-5-5', alias: 'sonnet', label: 'Sonnet 5.5' }, { id: 'claude-opus-5-5', alias: 'opus', label: 'Opus 5.5' }], efforts: ['low', 'high'], permissionModes: ['auto', 'plan'],
    profiles: [{ id: 'leve', label: 'Leve', description: 'barato' }],
  },
  loadCatalog: vi.fn(() => Promise.resolve({ skills: [{ name: 'demo:resumo', description: 'resume o projeto' }] })),
  toast: vi.fn(),
}));
// eslint-disable-next-line import/first
import { toast } from '../store';
// eslint-disable-next-line import/first
import ComposerBox from './ComposerBox.vue';

const CHAT = { model: 'claude-haiku-4-5-20251001', profile: 'leve', effort: 'low', permissionMode: 'auto' };

function setup(props = {}) {
  const submitter = vi.fn(() => Promise.resolve());
  const w = mount(ComposerBox, { props: { submitter, chat: CHAT, localCommands: true, ...props }, attachTo: document.body });
  return { w, submitter, textarea: w.find('textarea') };
}

describe('ComposerBox', () => {
  beforeEach(() => toast.mockClear());

  it('Enter envia e limpa; Shift+Enter não envia', async () => {
    const { w, submitter, textarea } = setup();
    await textarea.setValue('olá');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(submitter).not.toHaveBeenCalled();
    await textarea.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(submitter).toHaveBeenCalledWith({ text: 'olá', images: [] });
    expect(textarea.element.value).toBe('');
    w.unmount();
  });

  it('Enter durante composição (acento/IME) não envia', async () => {
    const { w, submitter, textarea } = setup();
    await textarea.setValue('olá');
    await textarea.trigger('keydown', { key: 'Enter', isComposing: true });
    await textarea.trigger('keydown', { key: 'Enter', keyCode: 229 });
    expect(submitter).not.toHaveBeenCalled();
    w.unmount();
  });

  it('se o envio falha, o texto continua na caixa', async () => {
    const submitter = vi.fn(() => Promise.reject(new Error('sem conexão')));
    const w = mount(ComposerBox, { props: { submitter }, attachTo: document.body });
    await w.find('textarea').setValue('não perca isto');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(w.find('textarea').element.value).toBe('não perca isto');
    w.unmount();
  });

  it('/model sonnet troca o modelo localmente, sem enviar ao Claude', async () => {
    const { w, submitter, textarea } = setup();
    await textarea.setValue('/model sonnet');
    await w.find('form').trigger('submit');
    expect(submitter).not.toHaveBeenCalled();
    expect(w.emitted('command')).toEqual([[{ action: 'setting', key: 'model', value: 'claude-sonnet-5-5' }]]);
    w.unmount();
  });

  it('/model inválido avisa as opções', async () => {
    const { w, textarea } = setup();
    await textarea.setValue('/model gpt');
    await w.find('form').trigger('submit');
    expect(toast).toHaveBeenCalledWith('"gpt" não é opção de /model. Opções: haiku, sonnet, opus', 'error');
    w.unmount();
  });

  it('digitar "/" mostra comandos locais e skills; skill segue para o Claude', async () => {
    const { w, submitter, textarea } = setup();
    await textarea.setValue('/demo');
    await textarea.trigger('input');
    await flushPromises();
    expect(w.find('.slash-menu').text()).toContain('/demo:resumo');
    await textarea.trigger('keydown', { key: 'Enter' });
    expect(textarea.element.value).toBe('/demo:resumo ');
    expect(submitter).not.toHaveBeenCalled();
    w.unmount();
  });

  it('ocupado: botão vira "pôr na fila"; sem fila permitida, desabilita', async () => {
    const { w, textarea } = setup({ busy: true });
    await textarea.setValue('próxima');
    expect(w.find('.round.send').attributes('title')).toMatch(/fila/);
    expect(w.find('.round.send').attributes('disabled')).toBeUndefined();
    await w.setProps({ queueWhenBusy: false });
    expect(w.find('.round.send').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('imagem acima de 5 MB é recusada com aviso', async () => {
    const { w } = setup();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' });
    const input = w.find('input[type=file]');
    Object.defineProperty(input.element, 'files', { value: [big] });
    await input.trigger('change');
    await flushPromises();
    expect(toast).toHaveBeenCalledWith('"grande.png" tem 5.0 MB; o máximo é 5 MB', 'error');
    expect(w.findAll('.attachment')).toHaveLength(0);
    w.unmount();
  });
});
