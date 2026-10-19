<template>
  <nav class="sidebar">
    <section class="block">
      <header class="head">
        <span class="section-title">Chats</span>
        <button class="icon-btn" type="button" title="Novo chat" @click="newChat"><Plus :size="16" /></button>
      </header>
      <div class="list">
        <router-link
          v-for="c in state.chats"
          :key="c.id"
          :to="`/chat/${c.id}`"
          class="item"
          :class="{ waiting: c.status === 'waiting' }"
          active-class="active"
        >
          <span class="dot" :class="c.status === 'idle' ? '' : c.status" />
          <span class="name">{{ c.title || 'Novo chat' }}</span>
          <span class="badge">{{ modelLabel(c.model, state.models) }}</span>
          <div v-if="c.status === 'waiting'" class="line alert">esperando sua resposta</div>
          <div v-else-if="c.status === 'busy' && c.now" class="line now" :class="{ thinking: c.now.icon === 'thinking' }">{{ icon(c.now) }} {{ c.now.text }}</div>
          <div v-else class="line meta">{{ folder(c.cwd) }}</div>
          <UsageMini class="line" :usage="c.usage" />
        </router-link>
        <p v-if="state.ready && !state.chats.length" class="empty">Nenhum chat ainda. Clique em ＋ ou escreva numa sessão para assumi-la aqui.</p>
      </div>
    </section>

    <section class="block grow">
      <header class="head">
        <span class="section-title">Sessões <span class="muted">{{ state.sessions.length || '' }}</span></span>
        <button class="icon-btn" type="button" title="Nova sessão em background" @click="newBackground"><Plus :size="16" /></button>
      </header>
      <p v-if="state.sessionsError" class="error">{{ state.sessionsError }}</p>
      <div class="list">
        <router-link
          v-for="s in state.sessions"
          :key="s.id"
          :to="`/sessao/${s.id}`"
          class="item"
          :class="{ waiting: s.state === 'blocked' }"
          active-class="active"
          :title="`${s.cwd}\n${s.kind} · ${s.id}`"
        >
          <span class="dot" :class="s.state" />
          <span class="name">{{ sessionLabel(s) }}</span>
          <span class="badge">{{ s.kind === 'background' ? 'bg' : fmtMb(s.rssMb) }}</span>
          <div class="line meta">{{ [s.project, s.branch].filter(Boolean).join(' · ') }}</div>
          <div v-if="s.state === 'blocked'" class="line alert">esperando você</div>
          <div v-else-if="s.state === 'busy' && s.now" class="line now" :class="{ thinking: s.now.icon === 'thinking' }">{{ icon(s.now) }} {{ s.now.text }}</div>
          <div v-else-if="s.now" class="line meta">parada · última atividade há {{ fmtAgo(s.now.ts) }}</div>
          <UsageMini class="line" :usage="s.usage" />
        </router-link>
        <p v-if="state.ready && !state.sessions.length && !state.sessionsError" class="empty">Nenhuma sessão do Claude Code rodando.</p>
      </div>
    </section>
  </nav>
</template>

<script setup>
import { Plus } from '@lucide/vue';
import { useRouter } from 'vue-router';
import UsageMini from './UsageMini.vue';
import { state, openDialog, createChat, startBackground, toast, toastError } from '../store';
import { fmtAgo, fmtMb, sessionLabel } from '../lib/format';
import { modelLabel } from '../lib/settings';
import { NOW_ICONS } from '../lib/icons';

const router = useRouter();
const icon = (now) => NOW_ICONS[now.icon] || '·';
const folder = (cwd) => (cwd ? cwd.split('/').pop() : '');

async function newChat() {
  const body = await openDialog('newChat', {});
  if (!body) return;
  try {
    const chat = await createChat(body);
    router.push(`/chat/${chat.id}`);
  } catch (err) {
    toastError(err);
  }
}

async function newBackground() {
  const body = await openDialog('newBackground', {});
  if (!body) return;
  try {
    const { output } = await startBackground(body);
    toast(`Sessão iniciada em background: ${output.split('\n')[0]}`);
  } catch (err) {
    toastError(err);
  }
}
</script>

<style scoped>
.sidebar { background: var(--bg-deep); border-right: 1px solid var(--bg); display: flex; flex-direction: column; min-height: 0; }
.block { display: flex; flex-direction: column; min-height: 0; max-height: 42%; }
.block.grow { flex: 1; max-height: none; border-top: 1px solid var(--bg); }
.head { display: flex; align-items: center; justify-content: space-between; padding: 6px 6px 2px 12px; }
.list { overflow-y: auto; padding: 2px 6px 8px; display: flex; flex-direction: column; gap: 1px; }
.item {
  display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 0 7px; align-items: center;
  padding: 5px 8px; border-radius: 6px; border: 1px solid transparent; color: var(--fg); text-decoration: none;
}
.item:hover { background: var(--surface); }
.item.active { background: var(--purple-soft); border-color: rgba(189, 147, 249, .45); }
.item.waiting { border-color: rgba(255, 85, 85, .55); background: var(--red-soft); }
.item .dot { justify-self: center; }
.name { font-weight: 500; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 10.5px; color: var(--muted); font-family: var(--mono); }
.line { grid-column: 2 / 4; font-size: 11px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { color: var(--muted); }
.now { color: var(--cyan); font-family: var(--mono); }
.now.thinking { color: var(--pink); font-family: var(--font); font-style: italic; }
.alert { color: var(--red); font-weight: 500; }
.empty { color: var(--comment); font-size: 12px; padding: 6px 8px; margin: 0; }
.error { color: var(--red); font-size: 12px; padding: 4px 14px; margin: 0; }
</style>
