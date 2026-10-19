<template>
  <div v-if="message.answered" class="prompt answered">
    <div class="head">{{ message.kind === 'question' ? 'Resposta' : `Permissão · ${message.toolName}` }}</div>
    <code v-if="message.kind === 'permission'" class="detail">{{ message.detail }}</code>
    <div class="answer"><Check :size="14" /> {{ message.answer }}</div>
  </div>

  <div v-else-if="message.kind === 'question'" class="prompt waiting">
    <div v-for="(q, qi) in questions" :key="qi" class="question">
      <div class="head"><CircleHelp :size="15" /><span v-if="q.header" class="pill purple">{{ q.header }}</span>{{ q.question }}</div>
      <div class="options">
        <button
          v-for="opt in q.options"
          :key="opt.label"
          type="button"
          class="option"
          :class="{ selected: isPicked(q, opt.label) }"
          :disabled="sending"
          @click="pick(q, opt.label)"
        >
          <span class="option-label">{{ opt.label }}</span>
          <span v-if="opt.description" class="option-desc">{{ opt.description }}</span>
        </button>
      </div>
      <input v-model="other[q.question]" class="field" :placeholder="q.multiSelect ? 'Outro (opcional): escreva sua resposta' : 'Outro: escreva sua resposta e envie'" @keydown.enter.prevent="submit">
    </div>
    <div class="actions">
      <button class="btn ghost sm" type="button" :disabled="sending" @click="send({ decision: 'deny' })">Pular</button>
      <button class="btn primary sm" type="button" :disabled="sending" @click="submit">Enviar resposta</button>
    </div>
  </div>

  <div v-else class="prompt waiting">
    <div class="head"><ShieldAlert :size="15" /> O Claude quer usar <b>{{ message.toolName }}</b></div>
    <div v-if="message.text && message.text !== message.detail" class="option-desc">{{ message.text }}</div>
    <code class="detail">{{ message.detail }}</code>
    <input v-model="reason" class="field" placeholder="Motivo da recusa (opcional; o Claude lê)">
    <div class="actions">
      <button class="btn danger sm" type="button" :disabled="sending" @click="send({ decision: 'deny', message: reason.trim() })">Negar</button>
      <button v-if="message.suggestions" class="btn ghost sm" type="button" :disabled="sending" @click="send({ decision: 'always' })">Sempre permitir</button>
      <button class="btn primary sm" type="button" :disabled="sending" @click="send({ decision: 'allow' })">Permitir</button>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { Check, CircleHelp, ShieldAlert } from '@lucide/vue';
import { respondPrompt, toastError } from '../store';

const props = defineProps({
  message: { type: Object, required: true },
  chatId: { type: String, required: true },
});

const questions = computed(() => props.message.questions || []);
const picked = reactive({});
const other = reactive({});
const reason = ref('');
const sending = ref(false);

function isPicked(q, label) {
  const v = picked[q.question];
  return Array.isArray(v) ? v.includes(label) : v === label;
}

function pick(q, label) {
  if (q.multiSelect) {
    const list = picked[q.question] || [];
    picked[q.question] = list.includes(label) ? list.filter((l) => l !== label) : [...list, label];
    return;
  }
  picked[q.question] = label;
  // Uma pergunta só, de escolha única: clicar já responde, como no Claude.
  if (questions.value.length === 1) submit();
}

function answers() {
  const out = {};
  for (const q of questions.value) {
    const typed = (other[q.question] || '').trim();
    const choice = picked[q.question];
    if (q.multiSelect) {
      const list = [...(choice || []), typed].filter(Boolean);
      if (list.length) out[q.question] = list;
    } else if (typed || choice) {
      out[q.question] = typed || choice;
    }
  }
  return out;
}

function submit() {
  send({ decision: 'allow', answers: answers() });
}

async function send(body) {
  sending.value = true;
  try {
    await respondPrompt(props.chatId, props.message.requestId, body);
  } catch (err) {
    toastError(err);
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.prompt { background: var(--bg-deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }
.prompt.waiting { border-color: var(--purple); box-shadow: 0 0 0 3px var(--purple-soft), var(--shadow); }
.prompt.answered { align-self: flex-start; padding: 8px 12px; gap: 4px; max-width: 85%; }
.head { display: flex; align-items: center; gap: 8px; font-weight: 600; flex-wrap: wrap; }
.head b { color: var(--green); font-family: var(--mono); font-weight: 500; }
.answer { display: flex; align-items: center; gap: 6px; color: var(--green); font-size: 13px; }
.detail { display: block; background: var(--bg-deeper); color: var(--cyan); padding: 8px 10px; border-radius: 6px; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.question { display: flex; flex-direction: column; gap: 8px; }
.options { display: flex; flex-direction: column; gap: 6px; }
.option { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; cursor: pointer; }
.option:hover { border-color: var(--purple); background: var(--surface-hi); }
.option.selected { border: 2px solid var(--purple); background: var(--purple-soft); }
.option-label { font-weight: 600; }
.option-desc { font-size: 12px; color: var(--muted); }
.actions { display: flex; justify-content: flex-end; gap: 6px; }
</style>
