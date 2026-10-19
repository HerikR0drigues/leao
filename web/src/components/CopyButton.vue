<template>
  <button type="button" class="copy-btn" :class="{ done }" :title="done ? 'Copiado' : 'Copiar'" @click.stop="copy">
    <Check v-if="done" :size="13" />
    <Copy v-else :size="13" />
  </button>
</template>

<script setup>
import { ref } from 'vue';
import { Check, Copy } from '@lucide/vue';
import { copyText } from '../lib/clipboard';
import { toast } from '../store';

const DONE_MS = 1500;
const props = defineProps({ text: { type: String, required: true } });
const done = ref(false);

async function copy() {
  const ok = await copyText(props.text);
  if (!ok) {
    toast('Não consegui copiar para a área de transferência', 'error');
    return;
  }
  done.value = true;
  setTimeout(() => { done.value = false; }, DONE_MS);
}
</script>

<style scoped>
.copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); cursor: pointer; }
.copy-btn:hover { color: var(--fg); border-color: var(--purple); }
.copy-btn.done { color: var(--green); border-color: var(--green); }
</style>
