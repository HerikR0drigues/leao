import { describe, expect, it } from 'vitest';
import { parseLocalCommand, localCommandItems, findModel, modelLabel } from './settings';

const LISTS = {
  models: [{ id: 'claude-haiku-4-5-20251001', alias: 'haiku', label: 'Haiku 4.5' }, { id: 'claude-sonnet-5-5', alias: 'sonnet', label: 'Sonnet 5.5' }, { id: 'claude-opus-5-5', alias: 'opus', label: 'Opus 5.5' }],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  profiles: [{ id: 'leve', label: 'Leve', description: '' }, { id: 'padrao', label: 'Padrão', description: '' }],
  permissionModes: ['auto', 'default', 'acceptEdits', 'plan'],
};

describe('comandos / resolvidos no Leão', () => {
  it('/model e /effort viram troca de configuração (sem chamar o modelo)', () => {
    expect(parseLocalCommand('/model sonnet', LISTS)).toEqual({ action: 'setting', key: 'model', value: 'claude-sonnet-5-5' });
    expect(parseLocalCommand('/model Opus 5.5', LISTS)).toEqual({ action: 'setting', key: 'model', value: 'claude-opus-5-5' });
    expect(parseLocalCommand('/model claude-haiku-4-5-20251001', LISTS)).toEqual({ action: 'setting', key: 'model', value: 'claude-haiku-4-5-20251001' });
    expect(parseLocalCommand('/effort HIGH', LISTS)).toEqual({ action: 'setting', key: 'effort', value: 'high' });
    expect(parseLocalCommand('/perfil padrao', LISTS)).toEqual({ action: 'setting', key: 'profile', value: 'padrao' });
    expect(parseLocalCommand('/permissoes plan', LISTS)).toEqual({ action: 'setting', key: 'permissionMode', value: 'plan' });
    expect(parseLocalCommand('/permissions acceptEdits', LISTS)).toEqual({ action: 'setting', key: 'permissionMode', value: 'acceptEdits' });
  });
  it('valor inválido ou faltando explica as opções', () => {
    expect(parseLocalCommand('/model gpt', LISTS)).toEqual({ action: 'error', message: '"gpt" não é opção de /model. Opções: haiku, sonnet, opus' });
    expect(parseLocalCommand('/effort', LISTS).message).toMatch(/Use \/effort <valor>/);
  });
  it('ações: compactar, novo chat, custo e status', () => {
    expect(parseLocalCommand('/compact', LISTS)).toEqual({ action: 'compact' });
    expect(parseLocalCommand('/clear', LISTS)).toEqual({ action: 'clear' });
    expect(parseLocalCommand('/cost', LISTS)).toEqual({ action: 'cost' });
    expect(parseLocalCommand('/status', LISTS)).toEqual({ action: 'status' });
  });
  it('skill ou texto comum seguem para o Claude', () => {
    expect(parseLocalCommand('/demo:resumo do cliente', LISTS)).toBeNull();
    expect(parseLocalCommand('oi tudo bem', LISTS)).toBeNull();
  });
  it('menu lista um item por valor, marcado como local', () => {
    const names = localCommandItems(LISTS).map((i) => i.name);
    expect(names).toContain('model sonnet');
    expect(localCommandItems(LISTS).find((i) => i.name === 'model opus').description).toContain('Opus 5.5');
    expect(names).toContain('effort max');
    expect(names).toContain('compact');
    expect(localCommandItems(LISTS).every((i) => i.local)).toBe(true);
  });
});

describe('modelos com versão', () => {
  it('acha pelo ID, apelido, rótulo ou ID datado do transcript', () => {
    expect(findModel('opus', LISTS.models).id).toBe('claude-opus-5-5');
    expect(findModel('Sonnet 5.5', LISTS.models).id).toBe('claude-sonnet-5-5');
    expect(findModel('claude-haiku-4-5-20251001', LISTS.models).label).toBe('Haiku 4.5');
    expect(findModel('claude-opus-5-5-20260101', LISTS.models).id).toBe('claude-opus-5-5');
    expect(findModel('gpt-6', LISTS.models)).toBeNull();
  });
  it('rótulo para exibir: nome com versão', () => {
    expect(modelLabel('claude-sonnet-5-5', LISTS.models)).toBe('Sonnet 5.5');
    expect(modelLabel('haiku', LISTS.models)).toBe('Haiku 4.5');
  });
});
