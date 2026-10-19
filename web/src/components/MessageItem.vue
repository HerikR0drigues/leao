<template>
  <PromptCard v-if="kind === 'prompt'" :message="item" :chat-id="chatId" />

  <div v-else-if="kind === 'user'" class="msg user" :class="{ cancelled: item.cancelled }">
    <div v-if="images.length" class="images">
      <a v-for="img in images" :key="img.id" :href="uploadUrl(img.id)" target="_blank" rel="noopener" :title="img.name">
        <img :src="uploadUrl(img.id)" :alt="img.name" loading="lazy">
      </a>
    </div>
    <div v-if="item.text" class="text">{{ item.text }}</div>
    <div v-if="item.cancelled" class="note">não enviada (fila cancelada)</div>
    <CopyButton v-if="item.text" class="copy" :text="item.text" />
  </div>

  <div v-else-if="kind === 'assistant'" class="msg assistant" @click="onCodeCopy">
    <div v-if="item.streaming" class="text streaming">{{ item.text }}</div>
    <div v-else class="md" v-html="html" />
    <CopyButton v-if="!item.streaming && item.text" class="copy" :text="item.text" />
  </div>

  <div v-else-if="kind === 'tool'" class="msg tool" :class="{ open }" title="Clique para ver o comando inteiro" @click="open = !open">
    <span class="tool-icon">⚙</span>
    <span class="tool-name">{{ item.name }}</span>
    <span class="tool-desc">{{ item.desc || firstLine }}</span>
    <ChevronRight :size="13" class="chev" />
    <pre v-if="open" class="tool-body">{{ item.text }}</pre>
  </div>

  <div v-else-if="kind === 'question'" class="msg question">
    <div v-for="(q, i) in item.questions" :key="i" class="q">
      <div class="q-head"><CircleHelp :size="13" /> <span v-if="q.header" class="pill purple">{{ q.header }}</span> {{ q.question }}</div>
      <div class="q-options">
        <span v-for="o in q.options" :key="o.label" class="q-opt" :class="{ chosen: chosen(q, o.label) }">{{ o.label }}</span>
      </div>
      <div class="q-answer" :class="{ pending: !answerOf(q) }">{{ answerOf(q) ? `✓ ${answerOf(q)}` : 'aguardando resposta no terminal' }}</div>
    </div>
  </div>

  <div v-else-if="kind === 'thinking'" class="msg thinking">
    <template v-if="live"><span class="spinner" /> raciocinando…</template>
    <template v-else>✻ raciocinou</template>
  </div>

  <div v-else-if="kind === 'local'" class="msg local"><pre>{{ item.text }}</pre></div>

  <div v-else class="msg system">{{ item.text }}</div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ChevronRight, CircleHelp } from '@lucide/vue';
import PromptCard from './PromptCard.vue';
import CopyButton from './CopyButton.vue';
import { renderMarkdown } from '../lib/markdown';
import { copyText } from '../lib/clipboard';
import { uploadUrl } from '../lib/api';
import { toast } from '../store';

// item: mensagem do chat (role) ou item do transcript (kind). Os dois formatos convergem aqui.
const props = defineProps({
  item: { type: Object, required: true },
  chatId: { type: String, default: '' },
  // Raciocínio em andamento: só o último item de uma sessão trabalhando; o resto é passado.
  live: { type: Boolean, default: false },
});
const open = ref(false);
const KIND_BY_ROLE = { text: 'assistant' };
const kind = computed(() => {
  const k = props.item.role || props.item.kind;
  return KIND_BY_ROLE[k] || k;
});
const images = computed(() => props.item.images || []);
const html = computed(() => renderMarkdown(props.item.text));
const firstLine = computed(() => String(props.item.text || '').split('\n')[0]);

const answerOf = (q) => {
  const a = props.item.answers && (props.item.answers[q.question] || props.item.answers['']);
  return Array.isArray(a) ? a.join(', ') : a;
};
const chosen = (q, label) => String(answerOf(q) || '').split(', ').includes(label);

// Botão "copiar" dos blocos de código (vem no HTML do markdown).
async function onCodeCopy(e) {
  const btn = e.target.closest('.copy-code');
  if (!btn) return;
  const code = btn.closest('pre').querySelector('code');
  const ok = await copyText(code ? code.textContent : '');
  btn.textContent = ok ? 'copiado ✓' : 'falhou';
  if (!ok) toast('Não consegui copiar para a área de transferência', 'error');
  setTimeout(() => { btn.textContent = 'copiar'; }, 1500);
}
</script>

<style scoped>
.msg { max-width: 100%; line-height: 1.55; word-wrap: break-word; flex-shrink: 0; position: relative; }
.copy { position: absolute; top: 4px; right: 4px; opacity: 0; transition: opacity .12s; }
.msg:hover > .copy, .copy:focus-visible { opacity: 1; }

.user { background: var(--bg-deep); border-left: 2px solid var(--purple); border-radius: 4px; padding: 7px 34px 7px 12px; }
.user .text { white-space: pre-wrap; }
.user.cancelled { opacity: .5; }
.user .note { font-size: 11px; color: var(--orange); margin-top: 3px; }
.images { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.images img { max-width: 200px; max-height: 140px; border-radius: 6px; display: block; border: 1px solid var(--line); }

.assistant { padding: 2px 34px 2px 14px; border-left: 2px solid transparent; }
.streaming { white-space: pre-wrap; }
.streaming::after { content: "▍"; color: var(--purple); animation: pulse 1s infinite; }
.md :deep(p) { margin: 0 0 .6em; }
.md :deep(p:last-child) { margin-bottom: 0; }
.md :deep(ul), .md :deep(ol) { margin: .2em 0 .6em; padding-left: 1.3em; }
.md :deep(li) { margin: .1em 0; }
.md :deep(h1), .md :deep(h2), .md :deep(h3) { font-size: 1em; margin: .9em 0 .3em; color: var(--purple); }
.md :deep(code) { background: var(--bg-deep); color: var(--green); padding: 0 4px; border-radius: 3px; font-family: var(--mono); font-size: .88em; }
.md :deep(pre.code) { position: relative; background: var(--bg-deeper); padding: 10px 12px; border-radius: 6px; overflow-x: auto; border: 1px solid var(--bg-deep); margin: .5em 0; }
.md :deep(pre.code code) { background: none; padding: 0; color: var(--fg); font-size: 12px; }
.md :deep(.code-lang) { position: absolute; top: 4px; right: 62px; font-size: 10px; color: var(--comment); font-family: var(--mono); }
.md :deep(.copy-code) { position: absolute; top: 3px; right: 4px; font: 10.5px var(--font); color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 7px; cursor: pointer; }
.md :deep(.copy-code:hover) { color: var(--fg); border-color: var(--purple); }
.md :deep(strong) { color: var(--orange); }
.md :deep(a) { color: var(--cyan); }
.md :deep(table) { border-collapse: collapse; margin: .5em 0; font-size: 12.5px; display: block; overflow-x: auto; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--line); padding: 3px 8px; text-align: left; }
.md :deep(th) { background: var(--bg-deep); }
.md :deep(blockquote) { margin: .5em 0; padding-left: 10px; border-left: 2px solid var(--comment); color: var(--muted); }

.tool { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding: 2px 8px 2px 14px; font-size: 12px; color: var(--muted); cursor: pointer; border-radius: 4px; min-width: 0; }
.tool:hover { background: var(--bg-deep); }
.tool-icon { color: var(--cyan); }
.tool-name { font-family: var(--mono); color: var(--cyan); flex: none; }
.tool-desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.chev { color: var(--comment); flex: none; transition: transform .12s; }
.tool.open .chev { transform: rotate(90deg); }
.tool-body { flex-basis: 100%; margin: 2px 0 4px; padding: 6px 10px; background: var(--bg-deeper); border-radius: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--cyan); white-space: pre-wrap; word-break: break-word; }

.question { margin-left: 14px; border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-deep); }
.q { display: flex; flex-direction: column; gap: 5px; }
.q-head { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12.5px; }
.q-options { display: flex; gap: 5px; flex-wrap: wrap; }
.q-opt { font-size: 11.5px; padding: 1px 8px; border-radius: 4px; border: 1px solid var(--line); color: var(--muted); }
.q-opt.chosen { border-color: var(--purple); color: var(--purple); background: var(--purple-soft); }
.q-answer { font-size: 12px; color: var(--green); }
.q-answer.pending { color: var(--red); }

.thinking { display: flex; align-items: center; gap: 7px; padding-left: 14px; color: var(--pink); font-style: italic; font-size: 12px; }
.local pre { margin: 0; font-family: var(--mono); font-size: 11.5px; background: var(--bg-deep); border-left: 2px solid var(--green); padding: 6px 10px; border-radius: 4px; overflow-x: auto; }
.system { align-self: center; font-size: 11.5px; color: var(--orange); padding: 2px 10px; text-align: center; max-width: 90%; white-space: pre-wrap; }
</style>
