<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.kind" @click="removeToast(t.id)">
      <CircleAlert v-if="t.kind" :size="16" class="icon" />
      <Info v-else :size="16" class="icon" />
      <span>{{ t.message }}</span>
    </div>
  </div>
</template>

<script setup>
import { CircleAlert, Info } from '@lucide/vue';
import { state, removeToast } from '../store';
</script>

<style scoped>
.toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 40; max-width: min(400px, calc(100vw - 32px)); }
.toast { display: flex; gap: 10px; align-items: flex-start; background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--purple); padding: 10px 14px; border-radius: 10px; box-shadow: var(--shadow); font-size: 13px; cursor: pointer; }
.toast.error, .toast.alert { border-left-color: var(--red); }
.icon { flex: none; margin-top: 2px; color: var(--purple); }
.toast.error .icon, .toast.alert .icon { color: var(--red); }
</style>
