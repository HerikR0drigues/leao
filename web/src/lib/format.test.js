import { describe, expect, it } from 'vitest';
import { fmtTokens, fmtUsd, fmtMb, fmtPct, level, sessionLabel } from './format';

describe('formatação', () => {
  it('dinheiro equivalente em reais-estilo: vírgula e casas por faixa', () => {
    expect(fmtUsd(0.0436)).toBe('US$ 0,044');
    expect(fmtUsd(8.492)).toBe('US$ 8,49');
    expect(fmtUsd(7742.01)).toBe('US$ 7742');
  });
  it('tokens abreviados', () => {
    expect(fmtTokens(0)).toBe('0');
    expect(fmtTokens(950)).toBe('950');
    expect(fmtTokens(314542)).toBe('315k');
    expect(fmtTokens(15553179)).toBe('16M');
    expect(fmtTokens(1500000)).toBe('1.5M');
  });
  it('RAM e porcentagem', () => {
    expect(fmtMb(null)).toBe('');
    expect(fmtMb(731)).toBe('731 MB');
    expect(fmtMb(3150)).toBe('3.1 GB');
    expect(fmtPct(0.314)).toBe('31%');
  });
  it('nível de alerta do contexto', () => {
    expect(level(0.31)).toBe('');
    expect(level(0.62)).toBe('warn');
    expect(level(0.92)).toBe('high');
  });
  it('nome de sessão: ignora nome que é só id e cai para título/pasta', () => {
    expect(sessionLabel({ name: 'Especialista', project: 'x' })).toBe('Especialista');
    expect(sessionLabel({ name: '7b8898b4-4615-4f12-bf60-de36c7356e97', title: 'Redesign do chat', project: 'x' })).toBe('Redesign do chat');
    expect(sessionLabel({ name: '', project: 'app-server' })).toBe('app-server');
  });
});
