<template>
  <form class="composer" :class="{ dragging }" @submit.prevent="submit" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
    <div v-if="slash.open" class="slash-menu" role="listbox">
      <div
        v-for="(s, i) in slash.items"
        :key="s.name"
        class="slash-item"
        :class="{ active: i === slash.index }"
        @mousedown.prevent="applySlash(s)"
      >
        <span class="slash-name">/{{ s.name }}</span>
        <span v-if="s.local" class="pill green">local</span>
        <span class="slash-desc">{{ s.description }}</span>
      </div>
    </div>

    <div v-if="images.length" class="attachments">
      <div v-for="(img, i) in images" :key="img.key" class="attachment" :title="img.name">
        <img :src="img.preview" :alt="img.name">
        <button type="button" class="remove" title="Remover" @click="removeImage(i)"><X :size="11" /></button>
      </div>
    </div>

    <textarea
      ref="input"
      v-model="text"
      rows="1"
      :placeholder="placeholder"
      @input="autoGrow"
      @keydown="onKeydown"
      @paste="onPaste"
    />

    <div class="toolbar">
      <button type="button" class="tool-btn" title="Anexar imagem (ou cole com Ctrl+V / arraste para cá)" @click="fileInput.click()"><Paperclip :size="14" /></button>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden @change="onFiles">

      <template v-if="chat">
        <SelectMenu :model-value="chat.model" :options="modelOptions(state.models)" :icon="Bot" title="Modelo" @update:model-value="(v) => $emit('setting', 'model', v)" />
        <SelectMenu :model-value="chat.profile" :options="profileOptions(state.profiles)" :icon="Layers" title="Perfil de contexto" @update:model-value="(v) => $emit('setting', 'profile', v)" />
        <SelectMenu :model-value="chat.effort" :options="effortOptions(state.efforts)" :icon="Gauge" title="Esforço" @update:model-value="(v) => $emit('setting', 'effort', v)" />
        <SelectMenu :model-value="chat.permissionMode || 'auto'" :options="modeOptions(state.permissionModes)" :icon="ShieldCheck" title="Permissões" @update:model-value="(v) => $emit('setting', 'permissionMode', v)" />
      </template>

      <span class="spacer" />
      <span v-if="usage && usage.turns" class="ctx" :class="level(usage.contextPct || 0)" :title="`Contexto ocupado: ${fmtTokens(usage.contextTokens)} de ${fmtTokens(usage.contextWindow)} tokens · equivalente de API (não cobrado no plano)`">
        ctx {{ fmtPct(usage.contextPct) }} · {{ fmtUsd(usage.costUsd) }}
      </span>
      <button v-if="busy" type="button" class="round stop" title="Parar (Esc)" @click="$emit('interrupt')"><Square :size="11" /></button>
      <button type="submit" class="round send" :disabled="!canSend" :title="busy && queueWhenBusy ? 'Pôr na fila (Enter)' : `${sendLabel} (Enter)`">
        <ListPlus v-if="busy && queueWhenBusy" :size="15" />
        <ArrowUp v-else :size="15" />
      </button>
    </div>
  </form>
</template>

<script setup>
import { computed, nextTick, reactive, ref } from 'vue';
import { ArrowUp, Bot, Gauge, Layers, ListPlus, Paperclip, ShieldCheck, Square, X } from '@lucide/vue';
import SelectMenu from './SelectMenu.vue';
import { state, loadCatalog, toast } from '../store';
import { modelOptions, profileOptions, effortOptions, modeOptions, localCommandItems, parseLocalCommand } from '../lib/settings';
import { fmtPct, fmtTokens, fmtUsd, level } from '../lib/format';

const props = defineProps({
  chat: { type: Object, default: null },
  usage: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  waiting: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Mensagem para o Claude…' },
  sendLabel: { type: String, default: 'Enviar' },
  queueWhenBusy: { type: Boolean, default: true },
  // Comandos /model, /effort… resolvidos no Leão (só em chat; numa sessão do terminal não há o que configurar).
  localCommands: { type: Boolean, default: false },
  // Recebe { text, images }; o texto só é limpo quando a promessa resolve (falhou = o que você escreveu continua aqui).
  submitter: { type: Function, required: true },
});
const emit = defineEmits(['interrupt', 'setting', 'command']);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const SLASH_MAX = 60;
const MAX_TEXTAREA_PX = 260;

const input = ref(null);
const fileInput = ref(null);
const text = ref('');
const images = ref([]);
const dragging = ref(false);
const sending = ref(false);
const slash = reactive({ open: false, items: [], index: 0 });

const lists = computed(() => ({ models: state.models, efforts: state.efforts, profiles: state.profiles, permissionModes: state.permissionModes }));
const canSend = computed(() => !sending.value && !props.waiting
  && (text.value.trim() || images.value.length)
  && (!props.busy || props.queueWhenBusy));

function autoGrow() {
  const el = input.value;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  updateSlash();
}

async function updateSlash() {
  const match = text.value.match(/^\/([^\n]*)$/);
  if (!match) {
    slash.open = false;
    return;
  }
  const q = match[1].toLowerCase().trim();
  const local = props.localCommands ? localCommandItems(lists.value) : [];
  const catalog = await loadCatalog().catch(() => ({ skills: [] }));
  const all = [...local, ...catalog.skills.map((s) => ({ name: s.name, description: s.description }))];
  slash.items = all.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)).slice(0, SLASH_MAX);
  slash.index = 0;
  slash.open = slash.items.length > 0;
}

function applySlash(item) {
  slash.open = false;
  if (item.local) {
    text.value = `/${item.name}`;
    submit();
    return;
  }
  text.value = `/${item.name} `;
  nextTick(() => input.value.focus());
}

function onKeydown(e) {
  if (slash.open) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      slash.index = (slash.index + (e.key === 'ArrowDown' ? 1 : -1) + slash.items.length) % slash.items.length;
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.isComposing)) {
      e.preventDefault();
      applySlash(slash.items[slash.index]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      slash.open = false;
      return;
    }
  }
  // Enter durante composição (acento morto, IME) confirma o caractere, não envia.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    submit();
    return;
  }
  if (e.key === 'Escape' && props.busy) {
    e.preventDefault();
    emit('interrupt');
  }
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(`não consegui ler ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function addFiles(files) {
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast(`"${file.name}" não é imagem suportada (PNG, JPEG, GIF ou WebP)`, 'error');
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast(`"${file.name}" tem ${(file.size / 1048576).toFixed(1)} MB; o máximo é 5 MB`, 'error');
      continue;
    }
    images.value.push({
      key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      name: file.name || 'imagem colada',
      mediaType: file.type,
      data: await readAsBase64(file),
      preview: URL.createObjectURL(file),
    });
  }
}

function onPaste(e) {
  const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files);
}
function onDrop(e) {
  dragging.value = false;
  addFiles([...(e.dataTransfer ? e.dataTransfer.files : [])]);
}
function onFiles(e) {
  addFiles([...e.target.files]);
  e.target.value = '';
}
function removeImage(i) {
  URL.revokeObjectURL(images.value[i].preview);
  images.value.splice(i, 1);
}

function clear() {
  for (const img of images.value) URL.revokeObjectURL(img.preview);
  text.value = '';
  images.value = [];
  nextTick(autoGrow);
}

async function submit() {
  if (props.localCommands && !images.value.length) {
    const cmd = parseLocalCommand(text.value, lists.value);
    if (cmd) {
      if (cmd.action === 'error') {
        toast(cmd.message, 'error');
        return;
      }
      emit('command', cmd);
      clear();
      return;
    }
  }
  if (!canSend.value) return;
  const body = {
    text: text.value.trim(),
    images: images.value.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
  };
  sending.value = true;
  try {
    await props.submitter(body);
    clear();
  } catch {
    // quem chama mostra o erro; o texto continua aqui para tentar de novo
  } finally {
    sending.value = false;
    nextTick(() => input.value && input.value.focus());
  }
}

defineExpose({ focus: () => input.value && input.value.focus() });
</script>

<style scoped>
.composer {
  position: relative; margin: 0 max(16px, calc((100% - var(--content-max)) / 2)) 12px;
  background: var(--bg-deep); border: 1px solid var(--line); border-radius: 10px;
  padding: 8px 8px 6px 10px; display: flex; flex-direction: column; gap: 4px; flex: none;
}
.composer:focus-within { border-color: var(--purple); }
.composer.dragging { border-style: dashed; border-color: var(--cyan); }
textarea { border: 0; background: transparent; resize: none; padding: 2px 0; outline: none; min-height: 52px; max-height: 260px; width: 100%; line-height: 1.5; font-size: 13.5px; }
textarea::placeholder { color: var(--comment); }
.toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.tool-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
.tool-btn:hover { background: var(--surface); color: var(--fg); }
.spacer { flex: 1; }
.ctx { font-family: var(--mono); font-size: 11px; color: var(--comment); margin-right: 6px; white-space: nowrap; }
.ctx.warn { color: var(--orange); }
.ctx.high { color: var(--red); }
.round { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 0; cursor: pointer; margin-left: 4px; }
.round.send { background: var(--purple); color: var(--bg-deeper); }
.round.send:hover { background: var(--purple-hi); }
.round.send:disabled { background: var(--surface-hi); color: var(--comment); cursor: default; }
.round.stop { background: var(--surface-hi); color: var(--fg); }
.round.stop:hover { background: var(--red); color: var(--bg-deeper); }
.attachments { display: flex; gap: 6px; flex-wrap: wrap; }
.attachment { position: relative; }
.attachment img { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); display: block; }
.remove { position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%; border: 0; background: var(--red); color: var(--bg-deeper); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.slash-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); max-height: 320px; overflow-y: auto; background: var(--bg-deep); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 4px; z-index: 25; }
.slash-item { padding: 5px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; min-width: 0; }
.slash-item.active, .slash-item:hover { background: var(--purple-soft); }
.slash-name { font-family: var(--mono); color: var(--purple); font-size: 12px; white-space: nowrap; flex: none; }
.slash-desc { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
</style>
