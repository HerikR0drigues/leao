<template>
  <aside class="inspector">
    <section class="card">
      <header class="card-head"><span class="section-title">Agora</span></header>
      <div class="card-body">
        <p v-if="!item" class="muted">—</p>
        <div v-else-if="waiting" class="now alert"><Hand :size="16" /> Esperando você responder</div>
        <template v-else-if="now">
          <div class="now" :class="{ thinking: now.icon === 'thinking' }">
            <span class="now-icon">{{ NOW_ICONS[now.icon] || '·' }}</span>
            <span class="now-text">{{ now.text }}</span>
          </div>
          <p class="when">{{ busy ? 'agora' : 'última atividade' }} · há {{ fmtAgo(now.ts) }}</p>
        </template>
        <p v-else class="muted">{{ busy ? 'Trabalhando…' : 'Parado, aguardando mensagem.' }}</p>
      </div>
    </section>

    <section class="card">
      <header class="card-head"><span class="section-title">Consumo</span></header>
      <div class="card-body">
        <p v-if="!usage" class="muted">Sem consumo registrado ainda.</p>
        <template v-else>
          <div class="ctx">
            <div class="ctx-head"><span>Contexto</span><strong :class="level(usage.contextPct || 0)">{{ fmtPct(usage.contextPct) }}</strong></div>
            <div class="bar big"><span :class="level(usage.contextPct || 0)" :style="{ width: `${Math.max(1, Math.round((usage.contextPct || 0) * 100))}%` }" /></div>
            <div class="ctx-sub">{{ fmtTokens(usage.contextTokens) }} de {{ fmtTokens(usage.contextWindow) }} tokens · {{ usage.model }}</div>
          </div>
          <div class="stats">
            <div class="stat"><b>{{ fmtUsd(usage.costUsd) }}</b><span>gasto (equiv. API)</span></div>
            <div class="stat" :class="{ hot: rate > 0 }"><b>{{ rate > 0 ? `+${fmtUsd(rate)}` : '—' }}</b><span>últimos 10 min</span></div>
            <div class="stat"><b>{{ fmtTokens(usage.totalTokens) }}</b><span>tokens totais</span></div>
            <div class="stat"><b>{{ usage.cacheHitPct != null ? fmtPct(usage.cacheHitPct) : '—' }}</b><span>vindos do cache</span></div>
          </div>
          <div class="split" title="Composição dos tokens">
            <span class="s-read" :style="{ flex: Math.max(usage.cacheRead, 1) }" />
            <span class="s-write" :style="{ flex: Math.max(usage.cacheWrite, 1) }" />
            <span class="s-in" :style="{ flex: Math.max(usage.input, 1) }" />
            <span class="s-out" :style="{ flex: Math.max(usage.output, 1) }" />
          </div>
          <div class="legend">
            <span class="s-read">lido do cache {{ fmtTokens(usage.cacheRead) }}</span>
            <span class="s-write">escrito {{ fmtTokens(usage.cacheWrite) }}</span>
            <span class="s-out">saída {{ fmtTokens(usage.output) }}</span>
          </div>
          <p class="tiny muted">Equivalente de API calculado do transcript. No plano não há cobrança por token: o que conta são as barras de limite no topo.</p>
          <p v-if="(usage.contextPct || 0) >= 0.7 && isChat" class="tiny warn-text">Contexto alto: use <b>Compactar</b> no topo do chat para liberar espaço.</p>
        </template>
      </div>
    </section>

    <section class="card grow">
      <header class="card-head">
        <span class="section-title">Entregas</span>
        <button class="icon-btn" type="button" title="Atualizar" @click="refreshDeliveries"><RefreshCw :size="14" /></button>
      </header>
      <div class="card-body scroll">
        <p v-if="!deliveryData" class="muted"><span class="spinner" /> Carregando…</p>
        <template v-else>
          <a v-for="p in deliveryData.prs" :key="p.url" class="pr" :href="p.url" target="_blank" rel="noopener">
            <GitPullRequest :size="14" /> PR #{{ p.number }} <span class="muted">{{ p.repo }}</span>
          </a>
          <div v-for="r in deliveryData.deliveries" :key="r.repo" class="repo">
            <div class="repo-name">{{ r.repo }}</div>
            <div class="repo-branch"><GitBranch :size="12" /> {{ r.branch }}</div>
            <div class="repo-stats">
              <span class="ahead">↑ {{ r.ahead }} commit{{ r.ahead === 1 ? '' : 's' }}</span>
              <span class="dirty">● {{ r.changed }} alterado{{ r.changed === 1 ? '' : 's' }}</span>
              <span v-if="r.base" class="muted">base {{ r.base.replace('origin/', '') }}</span>
            </div>
            <div v-for="c in r.commits.slice(0, 4)" :key="c.hash" class="commit" :title="c.subject">
              <span class="hash">{{ c.hash }}</span><span class="subject">{{ c.subject }}</span>
            </div>
          </div>
          <p v-if="!deliveryData.prs.length && !deliveryData.deliveries.length" class="muted">Nada entregue ainda: sem PR, commit novo ou arquivo alterado.</p>
        </template>
      </div>
    </section>

    <section class="card">
      <header class="card-head"><span class="section-title">Recursos</span></header>
      <div class="card-body">
        <div v-for="[k, v] in resources" :key="k" class="kv"><span class="muted">{{ k }}</span><span>{{ v }}</span></div>
      </div>
    </section>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { GitBranch, GitPullRequest, Hand, RefreshCw } from '@lucide/vue';
import { state, findChat, findSession, chatDeliveries, toastError } from '../store';
import { fmtAgo, fmtMb, fmtPct, fmtTokens, fmtUsd, level } from '../lib/format';
import { NOW_ICONS } from '../lib/icons';
import { modelLabel } from '../lib/settings';

const CHAT_DELIVERIES_MS = 20000;
const route = useRoute();
const isChat = computed(() => route.name === 'chat');
const item = computed(() => (isChat.value ? findChat(route.params.id) : findSession(route.params.id)));
const waiting = computed(() => item.value && (item.value.status === 'waiting' || item.value.state === 'blocked'));
const busy = computed(() => item.value && (item.value.status === 'busy' || item.value.state === 'busy'));
const now = computed(() => item.value && item.value.now);
const usage = computed(() => (item.value && item.value.usage && item.value.usage.turns ? item.value.usage : null));
const rate = computed(() => (usage.value && usage.value.rate10m ? usage.value.rate10m.costUsd : 0));

const chatData = ref(null);
const deliveryData = computed(() => {
  if (isChat.value) return chatData.value;
  const d = state.sessionDetails[route.params.id];
  return d ? { prs: d.prs || [], deliveries: d.deliveries || [] } : null;
});

let timer = null;
async function loadChatDeliveries() {
  clearTimeout(timer);
  if (!isChat.value || !item.value) return;
  try {
    chatData.value = await chatDeliveries(route.params.id);
  } catch (err) {
    toastError(err);
  }
  timer = setTimeout(loadChatDeliveries, CHAT_DELIVERIES_MS);
}
watch(() => [route.name, route.params.id, Boolean(item.value)], () => {
  chatData.value = null;
  loadChatDeliveries();
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

function refreshDeliveries() {
  if (isChat.value) loadChatDeliveries();
}

const resources = computed(() => {
  const it = item.value;
  if (!it) return [];
  const rows = [['RAM', fmtMb(it.rssMb) || '—']];
  if (isChat.value) {
    rows.push(['Processo', it.running ? `ativo · pid ${it.pid}` : 'dormindo (acorda na próxima mensagem)']);
    rows.push(['Configuração', `${it.profile} · ${modelLabel(it.model, state.models)} · ${it.effort}`]);
  } else {
    rows.push(['Tipo', it.kind === 'background' ? 'background' : 'terminal']);
    rows.push(['Pid', it.pid || '—']);
    rows.push(['Id', it.id]);
  }
  return rows;
});
</script>

<style scoped>
.inspector { background: var(--bg-deep); border-left: 1px solid var(--bg); display: flex; flex-direction: column; gap: 6px; padding: 8px; min-height: 0; overflow-y: auto; }
.card { background: var(--bg); border: 1px solid var(--bg-deeper); border-radius: 8px; display: flex; flex-direction: column; min-height: 0; flex-shrink: 0; }
.card.grow { flex: 1 1 auto; min-height: 160px; flex-shrink: 1; }
.card-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 2px; min-height: 26px; }
.card-body { padding: 2px 10px 9px; display: flex; flex-direction: column; gap: 7px; font-size: 12px; }
.card-body.scroll { overflow-y: auto; }
.card-body p { margin: 0; }
.now { display: flex; gap: 8px; align-items: flex-start; font-family: var(--mono); font-size: 12px; color: var(--cyan); word-break: break-word; }
.now.thinking { color: var(--pink); font-family: var(--font); font-style: italic; }
.now.alert { color: var(--red); font-family: var(--font); align-items: center; font-weight: 500; }
.now-icon { width: 16px; text-align: center; flex: none; }
.when { font-size: 11px; color: var(--comment); }
.ctx { display: flex; flex-direction: column; gap: 6px; }
.ctx-head { display: flex; justify-content: space-between; align-items: baseline; color: var(--muted); }
.ctx-head strong { font-size: 17px; color: var(--purple); }
.ctx-head strong.warn { color: var(--orange); }
.ctx-head strong.high { color: var(--red); }
.bar.big { height: 8px; }
.ctx-sub { font-size: 11px; color: var(--comment); font-family: var(--mono); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.stat { background: var(--bg-deep); border-radius: 6px; padding: 5px 8px; display: flex; flex-direction: column; }
.stat b { font-family: var(--mono); font-size: 12.5px; font-weight: 600; }
.stat span { font-size: 10.5px; color: var(--comment); }
.stat.hot b { color: var(--orange); }
.split { display: flex; height: 6px; border-radius: 4px; overflow: hidden; gap: 1px; }
.split .s-read { background: var(--cyan); }
.split .s-write { background: var(--pink); }
.split .s-in { background: var(--fg); }
.split .s-out { background: var(--green); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 10.5px; color: var(--muted); }
.legend span::before { content: "■ "; }
.legend .s-read::before { color: var(--cyan); }
.legend .s-write::before { color: var(--pink); }
.legend .s-out::before { color: var(--green); }
.tiny { font-size: 10.5px; }
.warn-text { color: var(--orange); }
.pr { display: flex; align-items: center; gap: 6px; color: var(--green); text-decoration: none; font-weight: 500; }
.pr:hover { text-decoration: underline; }
.repo { border-top: 1px solid var(--bg-deep); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.repo:first-of-type { border-top: 0; padding-top: 0; }
.repo-name { font-weight: 600; }
.repo-branch { display: flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--purple); word-break: break-all; }
.repo-stats { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; }
.ahead { color: var(--green); }
.dirty { color: var(--orange); }
.commit { display: flex; gap: 6px; font-size: 11.5px; min-width: 0; }
.hash { font-family: var(--mono); color: var(--yellow); flex: none; }
.subject { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kv { display: flex; justify-content: space-between; gap: 8px; }
.kv span:last-child { text-align: right; word-break: break-all; }
</style>
