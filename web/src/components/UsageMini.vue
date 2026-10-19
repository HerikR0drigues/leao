<template>
  <div v-if="usage && usage.turns" class="usage-mini" :title="title">
    <div class="bar"><span :class="level(pct)" :style="{ width: `${Math.max(3, Math.round(pct * 100))}%` }" /></div>
    <span>{{ fmtPct(pct) }} · {{ fmtUsd(usage.costUsd) }}<template v-if="rate > 0"> · <b>+{{ fmtUsd(rate) }}</b>/10min</template></span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { fmtPct, fmtUsd, fmtTokens, level } from '../lib/format';

const props = defineProps({ usage: { type: Object, default: null } });
const pct = computed(() => (props.usage && props.usage.contextPct) || 0);
const rate = computed(() => (props.usage && props.usage.rate10m && props.usage.rate10m.costUsd) || 0);
const title = computed(() => (props.usage
  ? `Contexto ${fmtTokens(props.usage.contextTokens)} de ${fmtTokens(props.usage.contextWindow)} · equivalente de API (não cobrado no plano)`
  : ''));
</script>

<style scoped>
.usage-mini { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); font-family: var(--mono); min-width: 0; }
.usage-mini .bar { width: 38px; height: 4px; flex: none; }
.usage-mini span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.usage-mini b { color: var(--orange); font-weight: 500; }
</style>
