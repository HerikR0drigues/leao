<template>
  <div ref="root" class="select-menu" :class="[`place-${placement}`, { block }]">
    <button
      type="button"
      class="trigger"
      :class="{ open }"
      :title="title"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown.down.prevent="openAndFocus(0)"
      @keydown.up.prevent="openAndFocus(options.length - 1)"
    >
      <component :is="icon" v-if="icon" :size="13" class="icon" />
      <span v-if="caption" class="caption">{{ caption }}</span>
      <span class="value">{{ current ? current.label : placeholder }}</span>
      <ChevronDown :size="13" class="chev" />
    </button>

    <div v-if="open" class="popover" role="listbox" :aria-label="title" @keydown="onKeydown">
      <div v-if="title" class="heading">{{ title }}</div>
      <button
        v-for="(opt, i) in options"
        :key="opt.value"
        :ref="(el) => (items[i] = el)"
        type="button"
        role="option"
        class="option"
        :class="{ selected: opt.value === modelValue, active: i === active }"
        :aria-selected="opt.value === modelValue"
        @mouseenter="active = i"
        @click="choose(opt)"
      >
        <span class="opt-main">
          <span class="opt-label">{{ opt.label }}</span>
          <span v-if="opt.description" class="opt-desc">{{ opt.description }}</span>
        </span>
        <Check v-if="opt.value === modelValue" :size="14" class="opt-check" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  // [{ value, label, description? }]
  options: { type: Array, required: true },
  title: { type: String, default: '' },
  caption: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  placeholder: { type: String, default: 'Escolher' },
  // top: abre para cima (caixa de mensagem no rodapé); bottom: para baixo (formulários).
  placement: { type: String, default: 'top' },
  block: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const root = ref(null);
const open = ref(false);
const active = ref(-1);
const items = ref([]);
const current = computed(() => props.options.find((o) => o.value === props.modelValue) || null);

function onOutside(e) {
  if (root.value && !root.value.contains(e.target)) close();
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onOutside);
  else document.removeEventListener('mousedown', onOutside);
});
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutside));

function toggle() {
  if (open.value) close();
  else openAndFocus(Math.max(0, props.options.findIndex((o) => o.value === props.modelValue)));
}

function openAndFocus(index) {
  open.value = true;
  active.value = index;
  nextTick(() => items.value[index] && items.value[index].focus());
}

function close() {
  open.value = false;
  active.value = -1;
}

function choose(opt) {
  if (opt.value !== props.modelValue) emit('update:modelValue', opt.value);
  close();
  nextTick(() => root.value && root.value.querySelector('.trigger').focus());
}

function onKeydown(e) {
  const n = props.options.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    items.value[active.value].focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close();
    root.value.querySelector('.trigger').focus();
  } else if (e.key === 'Tab') {
    close();
  }
}
</script>

<style scoped>
.select-menu { position: relative; display: inline-flex; }
.select-menu.block { display: flex; }
.trigger {
  display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px;
  background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--muted);
  font-size: 12px; cursor: pointer; white-space: nowrap; transition: background .12s, color .12s, border-color .12s;
}
.trigger:hover, .trigger.open { background: var(--surface); color: var(--fg); }
.trigger.open { border-color: var(--line); }
.block .trigger { width: 100%; height: 34px; background: var(--bg-deep); border-color: var(--line); color: var(--fg); font-size: 13px; padding: 0 10px; }
.block .trigger:hover, .block .trigger.open { border-color: var(--purple); }
.block .value { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.icon { color: var(--purple); flex: none; }
.caption { color: var(--comment); }
.value { color: inherit; }
.chev { color: var(--comment); flex: none; transition: transform .12s; }
.trigger.open .chev { transform: rotate(180deg); }
.popover {
  position: absolute; z-index: 20; min-width: 230px; max-width: 340px; max-height: 340px; overflow-y: auto;
  background: var(--bg-deep); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 4px;
}
.block .popover { left: 0; right: 0; max-width: none; }
.place-top .popover { bottom: calc(100% + 6px); left: 0; }
.place-bottom .popover { top: calc(100% + 4px); left: 0; }
.heading { font-size: 10.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--comment); padding: 6px 8px 4px; font-weight: 600; }
.option {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 6px 8px; border: 0; border-radius: 6px;
  background: transparent; color: var(--fg); cursor: pointer; outline: none;
}
.option.active, .option:focus-visible { background: var(--purple-soft); }
.option.selected .opt-label { color: var(--purple); font-weight: 600; }
.opt-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.opt-label { font-size: 12.5px; }
.opt-desc { font-size: 11px; color: var(--muted); white-space: normal; line-height: 1.35; }
.opt-check { color: var(--purple); flex: none; }
</style>
