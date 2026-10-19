<template>
  <section class="view">
    <div v-if="!state.ready" class="center muted"><span class="spinner" /> Conectando ao Leão…</div>

    <div v-else-if="!chat" class="center">
      <MessageSquareOff :size="36" class="muted" />
      <h2>Chat não encontrado</h2>
      <p class="muted">Ele pode ter sido fechado. O histórico de chats fechados fica em ~/.leao/chats.</p>
      <router-link to="/" class="btn ghost">Voltar à visão geral</router-link>
    </div>

    <template v-else>
      <header class="head">
        <div class="title-wrap">
          <input v-if="renaming" ref="renameInput" v-model="newTitle" class="field rename" @keydown.enter="saveTitle" @keydown.esc="renaming = false" @blur="saveTitle">
          <h2 v-else :title="'Duplo clique para renomear'" @dblclick="startRename">{{ chat.title || 'Novo chat' }}</h2>
          <div class="sub">
            <span class="pill" :class="statusPill.cls">{{ statusPill.text }}</span>
            <span class="mono">{{ chat.cwd }}</span>
            <span v-if="chat.adoptedFrom" class="pill purple" title="Sessão que veio do terminal: mesmo id, mesma conversa">veio do terminal</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn ghost sm" type="button" :disabled="chat.status !== 'idle' || !chat.sessionId" title="Resume a conversa para liberar contexto (detalhes antigos viram resumo)" @click="compact">
            <Shrink :size="14" /> Compactar
          </button>
          <button class="btn ghost sm danger-text" type="button" @click="close"><X :size="14" /> Fechar</button>
        </div>
      </header>

      <div ref="scroller" class="messages">
        <template v-if="history.length">
          <MessageItem v-for="(it, i) in history" :key="`h${i}`" :item="it" class="from-history" />
          <div class="divider"><span>continuação no Leão</span></div>
        </template>
        <div v-if="loading" class="center muted"><span class="spinner" /> Carregando conversa…</div>
        <MessageItem v-for="m in visible" :key="m.id" :item="m" :chat-id="chat.id" />
        <div v-if="showThinking" class="live">
          <span class="spinner" />
          <span>{{ liveText }}</span>
        </div>
        <div v-if="!loading && !history.length && !visible.length" class="welcome">
          <img src="/favicon.png" alt="" width="40" height="40">
          <p>Pronto. Escreva abaixo, cole uma imagem ou digite <b>/</b> para usar uma skill.</p>
          <p class="muted">Perfil <b>{{ profileLabel }}</b> · modelo <b>{{ modelLabel(chat.model, state.models) }}</b> · pasta <span class="mono">{{ chat.cwd }}</span></p>
        </div>
      </div>

      <button v-if="!stuck" class="jump btn sm" type="button" @click="scrollToBottom(true)"><ArrowDownToLine :size="14" /> Ir para o fim</button>

      <div v-if="queued.length" class="queue">
        <span class="section-title">Na fila</span>
        <div v-for="m in queued" :key="m.id" class="queued" :title="m.text">{{ m.text || '(imagem)' }}</div>
      </div>

      <ComposerBox
        ref="composer"
        :chat="chat"
        :usage="chat.usage"
        :busy="chat.status === 'busy'"
        :waiting="chat.status === 'waiting'"
        :placeholder="chat.status === 'waiting' ? 'O Claude está esperando sua resposta no card acima' : 'Mensagem…   / comandos e skills · ! sem gastar token · cole imagens'"
        :submitter="send"
        local-commands
        @interrupt="interrupt"
        @setting="setting"
        @command="onCommand"
      />
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDownToLine, MessageSquareOff, Shrink, X } from '@lucide/vue';
import MessageItem from '../components/MessageItem.vue';
import ComposerBox from '../components/ComposerBox.vue';
import { useStickToBottom } from '../composables/useStickToBottom';
import {
  state, findChat, loadMessages, sendMessage, interruptChat, compactChat, patchChat, archiveChat, createChat, runCommand, openDialog, toast, toastError,
} from '../store';
import { NOW_ICONS } from '../lib/icons';
import { fmtPct, fmtTokens, fmtUsd } from '../lib/format';
import { modeLabel, modelLabel } from '../lib/settings';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const scroller = ref(null);
const composer = ref(null);
const renameInput = ref(null);
const renaming = ref(false);
const newTitle = ref('');
const loading = ref(false);
const { stuck, scrollToBottom } = useStickToBottom(scroller);

const chat = computed(() => findChat(props.id));
const messages = computed(() => state.messages[props.id] || []);
const visible = computed(() => messages.value.filter((m) => !(m.role === 'user' && m.queued)));
const queued = computed(() => messages.value.filter((m) => m.role === 'user' && m.queued));
const history = computed(() => state.history[props.id] || []);
const profileLabel = computed(() => {
  const p = state.profiles.find((x) => x.id === chat.value.profile);
  return p ? p.label : chat.value.profile;
});
const statusPill = computed(() => ({
  idle: { text: 'pronto', cls: 'green' },
  busy: { text: 'trabalhando', cls: 'purple' },
  waiting: { text: 'esperando você', cls: 'red' },
}[chat.value.status] || { text: chat.value.status, cls: '' }));
const showThinking = computed(() => chat.value.status === 'busy' && !messages.value.some((m) => m.streaming));
const liveText = computed(() => {
  const now = chat.value.now;
  return now ? `${NOW_ICONS[now.icon] || ''} ${now.text}` : 'Claude está pensando…';
});

async function load() {
  if (!state.ready || !chat.value || state.messages[props.id]) return;
  loading.value = true;
  try {
    await loadMessages(props.id);
  } catch (err) {
    toastError(err);
  } finally {
    loading.value = false;
    nextTick(() => {
      scrollToBottom(true);
      if (composer.value) composer.value.focus();
    });
  }
}
onMounted(load);
watch(() => state.ready, load);

async function send(body) {
  try {
    await sendMessage(props.id, body.text, body.images);
    scrollToBottom(true);
  } catch (err) {
    toastError(err);
    throw err;
  }
}

async function interrupt() {
  try {
    await interruptChat(props.id);
  } catch (err) {
    toastError(err);
  }
}

async function compact() {
  try {
    await compactChat(props.id);
  } catch (err) {
    toastError(err);
  }
}

const SETTING_NAMES = { model: 'Modelo', profile: 'Perfil', effort: 'Esforço', permissionMode: 'Permissões' };

async function setting(key, value) {
  try {
    await patchChat(props.id, { [key]: value });
    const shown = key === 'permissionMode' ? modeLabel(value) : key === 'model' ? modelLabel(value, state.models) : value;
    toast(`${SETTING_NAMES[key]}: ${shown}. Vale a partir da próxima mensagem (o cache é refeito uma vez).`);
  } catch (err) {
    toastError(err);
  }
}

function usageReport() {
  const u = chat.value.usage;
  if (!u || !u.turns) return 'Sem consumo registrado ainda.';
  return [
    `Contexto     ${fmtPct(u.contextPct)}  (${fmtTokens(u.contextTokens)} de ${fmtTokens(u.contextWindow)} tokens)`,
    `Modelo       ${u.model}`,
    `Respostas    ${u.turns}`,
    `Tokens       ${fmtTokens(u.totalTokens)} no total · saída ${fmtTokens(u.output)} · cache lido ${fmtTokens(u.cacheRead)} · escrito ${fmtTokens(u.cacheWrite)}`,
    `Do cache     ${u.cacheHitPct != null ? fmtPct(u.cacheHitPct) : '—'}`,
    `Equivalente  ${fmtUsd(u.costUsd)} no total · ${fmtUsd(u.rate10m.costUsd)} nos últimos 10 min`,
    '',
    'No plano não há cobrança por token: o que conta são as barras de limite (5h e semana) no topo.',
  ].join('\n');
}

// Comandos "/" resolvidos aqui mesmo: nenhum chama o modelo.
async function onCommand(cmd) {
  try {
    if (cmd.action === 'setting') await setting(cmd.key, cmd.value);
    else if (cmd.action === 'compact') await compact();
    else if (cmd.action === 'cost') openDialog('output', { title: 'Consumo deste chat', output: usageReport() });
    else if (cmd.action === 'status') openDialog('output', { title: 'Sessões', output: (await runCommand('!status')).output });
    else if (cmd.action === 'clear') {
      const { cwd, profile, model, effort, permissionMode } = chat.value;
      const created = await createChat({ cwd, profile, model, effort, permissionMode });
      router.push(`/chat/${created.id}`);
    }
  } catch (err) {
    toastError(err);
  }
}

function startRename() {
  newTitle.value = chat.value.title || '';
  renaming.value = true;
  nextTick(() => {
    renameInput.value.focus();
    renameInput.value.select();
  });
}

async function saveTitle() {
  if (!renaming.value) return;
  renaming.value = false;
  const title = newTitle.value.trim();
  if (!title || title === chat.value.title) return;
  try {
    await patchChat(props.id, { title });
  } catch (err) {
    toastError(err);
  }
}

async function close() {
  const ok = await openDialog('confirm', {
    title: `Fechar "${chat.value.title || 'chat'}"?`,
    message: 'O processo do Claude é encerrado e o chat sai da lista. O histórico fica salvo em ~/.leao/chats.',
    confirmLabel: 'Fechar chat',
    danger: true,
  });
  if (!ok) return;
  try {
    await archiveChat(props.id);
    router.push('/');
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
.title-wrap h2 { margin: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; }
.rename { font-size: 15px; font-weight: 600; padding: 3px 8px; }
.sub { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin-top: 2px; min-width: 0; }
.sub .mono { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.actions { display: flex; gap: 8px; }
.messages { flex: 1; overflow-y: auto; padding: 14px max(16px, calc((100% - var(--content-max)) / 2)); display: flex; flex-direction: column; gap: 8px; }
.from-history { opacity: .62; }
.divider { display: flex; align-items: center; gap: 10px; color: var(--purple); font-size: 11px; text-transform: uppercase; letter-spacing: .8px; flex-shrink: 0; }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: rgba(189, 147, 249, .35); }
.live { align-self: flex-start; display: flex; align-items: center; gap: 8px; color: var(--pink); font-size: 12.5px; flex-shrink: 0; }
.welcome { margin: auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px; max-width: 520px; }
.welcome img { border-radius: 10px; margin-bottom: 6px; }
.welcome p { margin: 0; }
.welcome b { color: var(--purple); }
.jump { position: absolute; left: 50%; transform: translateX(-50%); bottom: 96px; box-shadow: var(--shadow); z-index: 3; }
.queue { margin: 0 max(16px, calc((100% - var(--content-max)) / 2)) 6px; display: flex; flex-direction: column; gap: 3px; }
.queued { background: var(--surface); border: 1px dashed var(--line); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
