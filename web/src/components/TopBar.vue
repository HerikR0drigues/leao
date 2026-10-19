<template>
  <header class="topbar">
    <router-link to="/" class="brand" title="Visão geral">
      <img src="/favicon.png" alt="" width="20" height="20">
      <span>Leão</span>
    </router-link>

    <div class="limits">
      <div v-for="w in windows" :key="w.label" class="limit" :title="w.title">
        <span>{{ w.label }}</span>
        <div class="bar"><span :class="w.level" :style="{ width: `${w.pct}%` }" /></div>
        <span class="mono">{{ w.text }}</span>
      </div>
    </div>

    <div class="stat" title="RAM de todas as sessões e chats do Claude (processo + filhos)">
      <Cpu :size="14" /> {{ ram }}
    </div>
    <div class="stat" :class="{ hot: burn > 0 }" title="Equivalente de API gasto por todas as sessões nos últimos 10 minutos. No plano não há cobrança por token.">
      <Flame :size="14" /> {{ burn > 0 ? `${fmtUsd(burn)}/10min` : 'ocioso' }}
    </div>

    <form class="command" @submit.prevent="run">
      <span class="prefix">!</span>
      <input v-model="command" placeholder="status · bloqueadas · ram · custo · ajuda  (sem gastar token)" autocomplete="off">
    </form>

    <span class="conn" :class="{ off: !state.connected }" :title="state.connected ? 'Conectado ao Leão' : 'Sem conexão com o servidor; tentando de novo'" />
    <router-link to="/design-system" class="icon-btn" title="Design system"><Palette :size="17" /></router-link>
    <button class="icon-btn" :class="{ active: state.notify }" type="button" :title="state.notify ? 'Avisos do navegador ligados' : 'Ligar avisos do navegador'" @click="toggleNotify">
      <Bell v-if="state.notify" :size="17" />
      <BellOff v-else :size="17" />
    </button>
  </header>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Bell, BellOff, Cpu, Flame, Palette } from '@lucide/vue';
import { state, toggleNotify, runCommand, openDialog, toastError } from '../store';
import { fmtMb, fmtUsd } from '../lib/format';

const LIMIT_WARN = 0.6;
const LIMIT_HIGH = 0.85;
const command = ref('');

function windowInfo(label, w) {
  if (!w) return { label, pct: 0, text: '—', level: '', title: 'Sem leitura ainda: aparece depois da primeira mensagem num chat do Leão' };
  const level = w.utilization >= LIMIT_HIGH ? 'high' : w.utilization >= LIMIT_WARN ? 'warn' : 'ok';
  const when = w.resetsAt ? new Date(w.resetsAt).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return { label, pct: Math.round(w.utilization * 100), text: `${Math.round(w.utilization * 100)}%`, level, title: `Limite do plano · renova ${when}` };
}

const windows = computed(() => [
  windowInfo('5h', state.limits && state.limits.fiveHour),
  windowInfo('Semana', state.limits && state.limits.sevenDay),
]);
const everything = computed(() => [...state.sessions, ...state.chats]);
const ram = computed(() => fmtMb(everything.value.reduce((acc, s) => acc + (s.rssMb || 0), 0)) || '0 MB');
const burn = computed(() => everything.value.reduce((acc, s) => acc + ((s.usage && s.usage.rate10m && s.usage.rate10m.costUsd) || 0), 0));

async function run() {
  const raw = command.value.trim();
  if (!raw) return;
  const text = raw.startsWith('!') ? raw : `!${raw}`;
  try {
    const { output } = await runCommand(text);
    command.value = '';
    openDialog('output', { title: text, output });
  } catch (err) {
    toastError(err);
  }
}
</script>

<style scoped>
.topbar { display: flex; align-items: center; gap: 14px; padding: 5px 12px; background: var(--bg-deeper); border-bottom: 1px solid var(--bg); flex: none; min-width: 0; }
.brand { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 14px; color: var(--fg); text-decoration: none; white-space: nowrap; }
.brand img { border-radius: 6px; }
.limits { display: flex; gap: 14px; }
.limit { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.limit .bar { width: 60px; height: 5px; }
.stat { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.stat.hot { color: var(--orange); font-weight: 600; }
.command { flex: 1; display: flex; align-items: center; background: var(--bg-deep); border: 1px solid var(--line); border-radius: 6px; padding-left: 8px; max-width: 460px; margin-left: auto; min-width: 160px; }
.command:focus-within { border-color: var(--purple); box-shadow: 0 0 0 3px var(--purple-soft); }
.prefix { color: var(--pink); font-family: var(--mono); }
.command input { flex: 1; border: 0; background: transparent; padding: 4px 8px; outline: none; min-width: 0; font-size: 12.5px; }
.conn { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex: none; }
.conn.off { background: var(--red); animation: pulse 1s infinite; }
@media (max-width: 1100px) { .limits, .stat { display: none; } }
</style>
