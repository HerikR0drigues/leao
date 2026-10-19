import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('markdown das respostas', () => {
  it('remove script, handlers e javascript: (nada de HTML do modelo cru na página)', () => {
    const html = renderMarkdown('oi <script>alert(1)</script><img src=x onerror="alert(2)"> [x](javascript:alert(3))');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
  });
  it('bloco de código com linguagem ganha realce e rótulo', () => {
    const html = renderMarkdown('```js\nconst a = 1;\n```');
    expect(html).toContain('class="code-lang"');
    expect(html).toContain('hljs-keyword');
  });
  it('código sem linguagem é escapado, não interpretado', () => {
    const html = renderMarkdown('```\n<b>negrito?</b>\n```');
    expect(html).toContain('&lt;b&gt;');
  });
  it('links abrem em nova aba sem vazar a origem', () => {
    const html = renderMarkdown('[PR](https://github.com/o/r/pull/1)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
