<template>
  <section class="view">
    <div v-if="!state.ready" class="center muted"><span class="spinner" /> Conectando ao Leão…</div>

    <div v-else-if="!session" class="center">
      <TerminalSquare :size="36" class="muted" />
      <h2>Sessão não está mais ativa</h2>
      <p class="muted">Ela terminou, foi parada ou foi assumida pelo Leão. Conversas assumidas aparecem em Chats.</p>
      <router-link to="/" class="btn ghost">Voltar à visão geral</router-link>
    </div>

    <template v-else>
      <header class="head">
        <div class="title-wrap">
          <h2>{{ sessionLabel(session) }}</h2>
          <div class="sub">
            <span class="pill" :class="statePill.cls">{{ statePill.text }}</span>
            <span class="mono">{{ session.cwd }}</span>
            <span v-if="session.branch" class="branch"><GitBranch :size="12" /> {{ session.branch }}</span>
            <span>{{ session.kind === 'background' ? 'background' : 'terminal' }}</span>
          </div>
        </div>
        <div class="actions">
          <button v-if="isBg" class="btn ghost sm" type="button" @click="terminal"><Terminal :size="14" /> Abrir terminal</button>
          <button v-if="isBg" class="btn ghost sm" type="button" @click="logs"><ScrollText :size="14" /> Logs</button>
          <button class="btn ghost sm danger-text" type="button" @click="stop"><Power :size="14" /> {{ isBg ? 'Parar' : 'Encerrar' }}</button>
        </div>
      </header>

      <div ref="scroller" class="messages">
        <div v-if="!detail" class="center muted"><span class="spinner" /> Lendo a conversa…</div>
        <template v-else>
          <p v-if="!items.length" class="center muted">Transcript não encontrado ou ainda vazio.</p>
          <MessageItem v-for="(it, i) in items" :key="`${i}-${it.ts}`" :item="it" :live="it.kind === 'thinking' && i === items.length - 1 && session.state === 'busy'" />
          <div v-if="session.state === 'busy'" class="live"><span class="spinner" /> {{ liveText }}</div>
          <div v-if="session.state === 'blocked'" class="blocked">
            <Hand :size="16" /> Esta sessão está esperando você no terminal (uma pergunta ou permissão).
            <span v-if="isBg">Abra o terminal para responder, ou assuma a sessão aqui.</span>
          </div>
        </template>
      </div>

      <button v-if="!stuck" class="jump btn sm" type="button" @click="scrollToBottom(true)"><ArrowDownToLine :size="14" /> Ir para o fim</button>

      <ComposerBox
        :usage="session.usage"
        :busy="false"
        :queue-when-busy="false"
        send-label="Assumir e enviar"
        :placeholder="adoptPlaceholder"
        :submitter="adoptAndSend"
      />
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDownToLine, GitBranch, Hand, Power, ScrollText, Terminal, TerminalSquare } from '@lucide/vue';
import MessageItem from '../components/MessageItem.vue';
import ComposerBox from '../components/ComposerBox.vue';
import { useStickToBottom } from '../composables/useStickToBottom';
import {
  state, findSession, sessionDetail, sessionLogs, stopSession, openTerminal, adoptSession, sendMessage, openDialog, toast, toastError,
} from '../store';
import { sessionLabel } from '../lib/format';
import { findModel } from '../lib/settings';
import { NOW_ICONS } from '../lib/icons';

const POLL_MS = 3000;
const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const scroller = ref(null);
const { stuck, scrollToBottom } = useStickToBottom(scroller);

const session = computed(() => findSession(props.id));
const isBg = computed(() => session.value && session.value.kind === 'background');
const detail = computed(() => state.sessionDetails[props.id] || null);
// "Raciocinou" entre cada tool é ruído: só o raciocínio em andamento (último item) aparece.
const items = computed(() => {
  const list = detail.value ? detail.value.items : [];
  return list.filter((it, i) => it.kind !== 'thinking' || i === list.length - 1);
});
const statePill = computed(() => ({
  busy: { text: 'trabalhando', cls: 'purple' },
  idle: { text: 'parada', cls: '' },
  blocked: { text: 'esperando você', cls: 'red' },
  done: { text: 'concluída', cls: 'green' },
}[session.value.state] || { text: session.value.state, cls: '' }));
const liveText = computed(() => {
  const now = session.value.now;
  return now ? `${NOW_ICONS[now.icon] || ''} ${now.text}` : 'trabalhando…';
});
const adoptPlaceholder = computed(() => (isBg.value
  ? 'Escreva para assumir esta sessão no Leão: ela é parada no background e continua aqui, com a mesma conversa.'
  : 'Escreva para assumir esta sessão no Leão: o terminal dela é encerrado e a conversa continua aqui, a mesma.'));

let timer = null;
async function poll() {
  clearTimeout(timer);
  if (!session.value) {
    timer = null;
    return;
  }
  try {
    state.sessionDetails[props.id] = await sessionDetail(props.id);
  } catch (err) {
    if (err.status !== 404) toastError(err);
  }
  timer = setTimeout(poll, POLL_MS);
}
watch(() => state.ready && Boolean(session.value), (ok) => {
  if (ok && !timer) poll();
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

async function adoptAndSend(body) {
  const s = session.value;
  const found = findModel(s.usage && s.usage.model, state.models);
  const settings = await openDialog('adopt', { session: s, defaultModel: found ? found.id : null });
  if (!settings) throw new Error('cancelado');
  try {
    const chat = await adoptSession(s.id, settings);
    await router.push(`/chat/${chat.id}`);
    if (body.text || body.images.length) await sendMessage(chat.id, body.text, body.images);
  } catch (err) {
    toastError(err);
    throw err;
  }
}

async function terminal() {
  try {
    toast((await openTerminal(props.id)).output);
  } catch (err) {
    toastError(err);
  }
}

async function logs() {
  try {
    const { output } = await sessionLogs(props.id);
    openDialog('output', { title: `Logs · ${sessionLabel(session.value)}`, output: output || '(sem saída)' });
  } catch (err) {
    toastError(err);
  }
}

async function stop() {
  const s = session.value;
  const ok = await openDialog('confirm', {
    title: `${isBg.value ? 'Parar' : 'Encerrar'} "${sessionLabel(s)}"?`,
    message: isBg.value
      ? 'A sessão em background é parada. A conversa fica salva e pode ser retomada.'
      : `O processo ${s.pid} recebe SIGTERM e o terminal dela fecha. A conversa fica salva (claude --resume).`,
    confirmLabel: isBg.value ? 'Parar' : 'Encerrar',
    danger: true,
  });
  if (!ok) return;
  try {
    toast((await stopSession(props.id)).output);
  } catch (err) {
    toastError(err);
  }
}
</script>

<style scoped>
.view { display: flex; flex-direction: column; min-height: 0; position: relative; }
.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 24px; }
.center h2 { margin: 0; }
.head { display: flex; align-items: center; gap: 12px; padding: 7px 16px; border-bottom: 1px solid var(--bg-deep); flex: none; }
.title-wrap { flex: 1; min-width: 0; }
.title-wrap h2 { margin: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin-top: 2px; min-width: 0; }
.sub .mono { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.branch { display: inline-flex; align-items: center; gap: 3px; color: var(--purple); font-family: var(--mono); white-space: nowrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.messages { flex: 1; overflow-y: auto; padding: 14px max(16px, calc((100% - var(--content-max)) / 2)); display: flex; flex-direction: column; gap: 8px; }
.live { align-self: flex-start; display: flex; align-items: center; gap: 8px; color: var(--pink); font-size: 12.5px; flex-shrink: 0; }
.blocked { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--red); background: var(--red-soft); border: 1px solid rgba(255, 85, 85, .4); padding: 10px 14px; border-radius: 10px; font-size: 13px; flex-shrink: 0; }
.jump { position: absolute; left: 50%; transform: translateX(-50%); bottom: 96px; box-shadow: var(--shadow); z-index: 3; }
</style>
