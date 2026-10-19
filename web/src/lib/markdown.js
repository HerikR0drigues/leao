// Markdown das respostas: marked + realce de código + DOMPurify (nada de HTML do modelo chega cru à página).
import { Marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      const html = language ? hljs.highlight(text, { language }).value : escapeHtml(text);
      const label = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : '';
      // O clique em "copiar" é tratado no componente da mensagem (delegação), não por script inline.
      return `<pre class="code">${label}<button type="button" class="copy-code">copiar</button><code class="hljs">${html}</code></pre>`;
    },
  },
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(src) {
  return DOMPurify.sanitize(marked.parse(String(src || '')));
}
