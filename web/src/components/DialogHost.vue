<template>
  <div v-if="d" class="overlay" @mousedown.self="tryClose" @keydown.esc.prevent="tryClose">
    <form ref="box" class="dialog" :class="{ wide: d.kind === 'output' }" tabindex="-1" @submit.prevent="confirm">
      <h3>{{ title }}</h3>

      <template v-if="d.kind === 'confirm'">
        <p class="muted">{{ d.props.message }}</p>
      </template>

      <pre v-else-if="d.kind === 'output'" class="output">{{ d.props.output }}</pre>

      <template v-else-if="d.kind === 'adopt'">
        <p class="muted">
          {{ adoptText }}
          A conversa continua a <b>mesma</b> (mesmo id, mesmo histórico, mesmo consumo), agora pelo Leão.
        </p>
        <div class="grid">
          <div class="label">Perfil
            <SelectMenu v-model="form.profile" :options="profileOptions(state.profiles)" block placement="bottom" title="Perfil" />
          </div>
          <div class="label">Modelo
            <SelectMenu v-model="form.model" :options="modelOptions(state.models)" block placement="bottom" title="Modelo" />
          </div>
          <div class="label">Esforço
            <SelectMenu v-model="form.effort" :options="effortOptions(state.efforts)" block placement="bottom" title="Esforço" />
          </div>
          <div class="label">Permissões
            <SelectMenu v-model="form.permissionMode" :options="modeOptions(state.permissionModes)" block placement="bottom" title="Permissões" />
          </div>
        </div>
      </template>

      <template v-else-if="d.kind === 'newChat'">
        <label class="label">Pasta do projeto
          <input v-model="form.cwd" class="field mono" list="leao-dirs" placeholder="/home/…/projeto" required>
        </label>
        <label class="label">Título (opcional)
          <input v-model="form.title" class="field" placeholder="ex.: Fix filtro de comissões">
        </label>
        <div class="grid">
          <div class="label">Perfil
            <SelectMenu v-model="form.profile" :options="profileOptions(state.profiles)" block placement="bottom" title="Perfil" />
          </div>
          <div class="label">Modelo
            <SelectMenu v-model="form.model" :options="modelOptions(state.models)" block placement="bottom" title="Modelo" />
          </div>
          <div class="label">Esforço
            <SelectMenu v-model="form.effort" :options="effortOptions(state.efforts)" block placement="bottom" title="Esforço" />
          </div>
          <div class="label">Permissões
            <SelectMenu v-model="form.permissionMode" :options="modeOptions(state.permissionModes)" block placement="bottom" title="Permissões" />
          </div>
        </div>
      </template>

      <template v-else-if="d.kind === 'newBackground'">
        <label class="label">Pasta do projeto (precisa ser confiável no Claude Code)
          <input v-model="form.cwd" class="field mono" list="leao-dirs" required>
        </label>
        <div class="label">Modelo
          <SelectMenu v-model="form.model" :options="modelOptions(state.models)" block placement="bottom" title="Modelo" />
        </div>
        <label class="label">Tarefa
          <textarea v-model="form.prompt" class="field" rows="5" placeholder="O que a sessão deve fazer" required />
        </label>
      </template>

      <datalist id="leao-dirs"><option v-for="dir in state.knownDirs" :key="dir" :value="dir" /></datalist>

      <div class="actions">
        <button v-if="d.kind !== 'output'" class="btn ghost" type="button" @click="closeDialog(null)">Cancelar</button>
        <button class="btn" :class="d.props.danger ? 'danger' : 'primary'" type="submit">{{ confirmLabel }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import SelectMenu from './SelectMenu.vue';
import { state, closeDialog } from '../store';
import { modelOptions, profileOptions, effortOptions, modeOptions, findModel } from '../lib/settings';
import { sessionLabel } from '../lib/format';

const box = ref(null);
const form = reactive({});
let pristine = '';

const d = computed(() => state.dialog);
const title = computed(() => {
  const dd = d.value;
  if (dd.props.title) return dd.props.title;
  return {
    newChat: 'Novo chat',
    newBackground: 'Nova sessão em background',
    adopt: `Assumir "${dd.props.session ? sessionLabel(dd.props.session) : ''}" no Leão`,
  }[dd.kind] || '';
});
const confirmLabel = computed(() => d.value.props.confirmLabel || {
  output: 'Fechar', newChat: 'Criar chat', newBackground: 'Iniciar', adopt: 'Assumir e enviar',
}[d.value.kind] || 'Confirmar');
const adoptText = computed(() => {
  const s = d.value.props.session;
  if (!s) return '';
  return s.kind === 'background'
    ? 'A sessão em background é parada e retomada aqui.'
    : `O terminal dela (pid ${s.pid}) é encerrado e a sessão é retomada aqui.`;
});

watch(d, (dd) => {
  for (const k of Object.keys(form)) delete form[k];
  if (!dd) return;
  const defaults = state.defaults || {};
  if (dd.kind === 'newChat') {
    Object.assign(form, { cwd: state.knownDirs[0] || '', title: '', profile: defaults.profile, model: defaults.model, effort: defaults.effort, permissionMode: defaults.permissionMode });
  } else if (dd.kind === 'newBackground') {
    const sonnet = findModel('sonnet', state.models);
    Object.assign(form, { cwd: state.knownDirs[0] || '', model: sonnet ? sonnet.id : defaults.model, prompt: '' });
  } else if (dd.kind === 'adopt') {
    // A sessão vinha do terminal com tudo (skills e MCP): o perfil Completo mantém as mesmas ferramentas.
    const opus = findModel('opus', state.models);
    Object.assign(form, { profile: 'completo', model: dd.props.defaultModel || (opus ? opus.id : defaults.model), effort: 'high', permissionMode: 'auto' });
  }
  pristine = JSON.stringify(form);
  nextTick(() => {
    if (!box.value) return;
    const first = box.value.querySelector('input, textarea, select');
    (first || box.value).focus();
  });
});

function confirm() {
  const dd = d.value;
  if (dd.kind === 'confirm' || dd.kind === 'output') {
    closeDialog(true);
    return;
  }
  closeDialog({ ...form });
}

// Esc e clique fora fecham, mas não descartam o que você digitou.
function tryClose() {
  if (JSON.stringify(form) !== pristine) return;
  closeDialog(null);
}
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(10, 10, 16, .65); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 30; padding: 16px; }
.dialog { width: min(600px, 100%); max-height: 90vh; overflow-y: auto; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: 0 24px 64px rgba(0, 0, 0, .6); padding: 20px; display: flex; flex-direction: column; gap: 12px; outline: none; }
.dialog.wide { width: min(900px, 100%); }
h3 { margin: 0; font-size: 16px; }
p { margin: 0; line-height: 1.55; }
p b { color: var(--fg); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.output { max-height: 60vh; overflow: auto; background: var(--bg-deeper); padding: 12px; border-radius: 8px; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; margin: 0; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
textarea.field { resize: vertical; }
@media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
</style>
