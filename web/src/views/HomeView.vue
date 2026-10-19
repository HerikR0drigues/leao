<template>
  <section class="home">
    <div class="inner">
      <header class="hero">
        <img src="/favicon.png" alt="" width="52" height="52">
        <div>
          <h1>O que vamos fazer?</h1>
          <p class="muted">Todos os seus agentes do Claude num lugar só: quem precisa de você, quem está trabalhando e o que já foi entregue.</p>
        </div>
      </header>

      <div class="quick">
        <button class="btn primary" type="button" @click="newChat"><Plus :size="15" /> Novo chat</button>
        <button class="btn ghost" type="button" @click="newBackground"><Rocket :size="15" /> Nova sessão em background</button>
      </div>

      <div v-if="!state.ready" class="muted"><span class="spinner" /> Conectando…</div>

      <template v-else>
        <div class="kpis">
          <div class="kpi" :class="{ alert: waiting.length }"><b>{{ waiting.length }}</b><span>esperando você</span></div>
          <div class="kpi"><b>{{ working.length }}</b><span>trabalhando agora</span></div>
          <div class="kpi" :class="{ hot: burn > 0 }"><b>{{ burn > 0 ? fmtUsd(burn) : '—' }}</b><span>últimos 10 min (equiv. API)</span></div>
          <div class="kpi"><b>{{ ram }}</b><span>RAM do Claude</span></div>
        </div>

        <section v-if="waiting.length" class="group">
          <h2 class="section-title">Precisam de você</h2>
          <router-link v-for="w in waiting" :key="w.key" :to="w.to" class="row alert">
            <Hand :size="16" />
            <span class="row-name">{{ w.label }}</span>
            <span class="row-sub">{{ w.sub }}</span>
          </router-link>
        </section>

        <section class="group">
          <h2 class="section-title">Trabalhando agora</h2>
          <p v-if="!working.length" class="muted">Ninguém trabalhando neste momento.</p>
          <router-link v-for="w in working" :key="w.key" :to="w.to" class="row">
            <span class="dot busy" />
            <span class="row-name">{{ w.label }}</span>
            <span class="row-now" :class="{ thinking: w.now && w.now.icon === 'thinking' }">{{ w.now ? `${NOW_ICONS[w.now.icon] || ''} ${w.now.text}` : 'trabalhando…' }}</span>
          </router-link>
        </section>

        <section class="group">
          <h2 class="section-title">Atalhos sem gastar token</h2>
          <p class="muted">Na barra do topo: <code>!status</code>, <code>!bloqueadas</code>, <code>!ram</code>, <code>!custo</code>, <code>!parar &lt;nome&gt;</code>. Nada disso chama o modelo.</p>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Hand, Plus, Rocket } from '@lucide/vue';
import { state, openDialog, createChat, startBackground, toast, toastError } from '../store';
import { fmtMb, fmtUsd, sessionLabel } from '../lib/format';
import { NOW_ICONS } from '../lib/icons';

const router = useRouter();

const waiting = computed(() => [
  ...state.chats.filter((c) => c.status === 'waiting').map((c) => ({ key: `c${c.id}`, to: `/chat/${c.id}`, label: c.title || 'Chat', sub: 'pergunta ou permissão no chat' })),
  ...state.sessions.filter((s) => s.state === 'blocked').map((s) => ({ key: `s${s.id}`, to: `/sessao/${s.id}`, label: sessionLabel(s), sub: `${s.project} · ${s.kind === 'background' ? 'background' : 'terminal'}` })),
]);
const working = computed(() => [
  ...state.chats.filter((c) => c.status === 'busy').map((c) => ({ key: `c${c.id}`, to: `/chat/${c.id}`, label: c.title || 'Chat', now: c.now })),
  ...state.sessions.filter((s) => s.state === 'busy').map((s) => ({ key: `s${s.id}`, to: `/sessao/${s.id}`, label: sessionLabel(s), now: s.now })),
]);
const everything = computed(() => [...state.sessions, ...state.chats]);
const burn = computed(() => everything.value.reduce((acc, s) => acc + ((s.usage && s.usage.rate10m && s.usage.rate10m.costUsd) || 0), 0));
const ram = computed(() => fmtMb(everything.value.reduce((acc, s) => acc + (s.rssMb || 0), 0)) || '0 MB');

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
.home { overflow-y: auto; }
.inner { max-width: 860px; margin: 0 auto; padding: 40px 24px 60px; display: flex; flex-direction: column; gap: 22px; }
.hero { display: flex; gap: 16px; align-items: center; }
.hero img { border-radius: 12px; box-shadow: 0 0 32px rgba(189, 147, 249, .25); }
.hero h1 { margin: 0; font-size: 26px; }
.hero p { margin: 4px 0 0; }
.quick { display: flex; gap: 10px; flex-wrap: wrap; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.kpi { background: var(--bg-deep); border: 1px solid var(--bg-deeper); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 2px; }
.kpi b { font-size: 22px; font-family: var(--mono); }
.kpi span { font-size: 12px; color: var(--muted); }
.kpi.alert { border-color: rgba(255, 85, 85, .5); background: var(--red-soft); }
.kpi.alert b { color: var(--red); }
.kpi.hot b { color: var(--orange); }
.group { display: flex; flex-direction: column; gap: 6px; }
.group h2 { margin: 0 0 4px; }
.group p { margin: 0; }
.row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--bg-deep); border: 1px solid var(--bg-deeper); color: var(--fg); text-decoration: none; min-width: 0; }
.row:hover { border-color: var(--purple); }
.row.alert { border-color: rgba(255, 85, 85, .5); color: var(--red); }
.row-name { font-weight: 600; white-space: nowrap; color: var(--fg); }
.row-sub { color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-now { color: var(--cyan); font-family: var(--mono); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.row-now.thinking { color: var(--pink); font-family: var(--font); font-style: italic; }
code { background: var(--bg-deep); color: var(--pink); padding: 1px 6px; border-radius: 4px; font-family: var(--mono); font-size: 12px; }
@media (max-width: 760px) { .kpis { grid-template-columns: 1fr 1fr; } }
</style>
