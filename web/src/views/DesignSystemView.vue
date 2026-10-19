<template>
  <section class="ds">
    <div class="inner">
      <header class="hero">
        <img src="/favicon.png" alt="" width="56" height="56">
        <div>
          <h1>Leão · Design System</h1>
          <p class="muted">Tema Dracula com roxo como cor de ação. Tokens em <code>styles/tokens.css</code>, base em <code>styles/base.css</code>, componentes com estilo próprio. Esta página usa os componentes reais do app.</p>
        </div>
      </header>
      <nav class="toc">
        <a v-for="s in SECTIONS" :key="s.id" :href="`#${s.id}`">{{ s.label }}</a>
      </nav>

      <section id="marca" class="block">
        <h2 class="section-title">Marca</h2>
        <div class="brand-row">
          <img src="/favicon.png" alt="" width="96" height="96">
          <img src="/favicon.png" alt="" width="48" height="48">
          <img src="/favicon.png" alt="" width="24" height="24">
          <img src="/favicon.png" alt="" width="16" height="16">
          <p class="muted">Leão desenhado para o projeto, na paleta Dracula. O nome não usa a marca Claude.</p>
        </div>
      </section>

      <section id="cores" class="block">
        <h2 class="section-title">Cores</h2>
        <h3>Superfícies</h3>
        <div class="swatches">
          <div v-for="c in SURFACES" :key="c.token" class="swatch">
            <div class="chip-color" :style="{ background: `var(${c.token})` }" />
            <code>{{ c.token }}</code><span class="hex">{{ values[c.token] }}</span><span class="use">{{ c.use }}</span>
          </div>
        </div>
        <h3>Acentos</h3>
        <div class="swatches">
          <div v-for="c in ACCENTS" :key="c.token" class="swatch">
            <div class="chip-color" :style="{ background: `var(${c.token})` }" />
            <code>{{ c.token }}</code><span class="hex">{{ values[c.token] }}</span><span class="use">{{ c.use }}</span>
          </div>
        </div>
      </section>

      <section id="tipografia" class="block">
        <h2 class="section-title">Tipografia</h2>
        <div class="type"><code>Título 26/700</code><span style="font-size:26px;font-weight:700">O que vamos fazer?</span></div>
        <div class="type"><code>Cabeçalho 16/600</code><span style="font-size:16px;font-weight:600">Fix filtro de comissões</span></div>
        <div class="type"><code>Corpo 14/400 Inter</code><span>Texto de conversa e descrições.</span></div>
        <div class="type"><code>Rótulo 11/600</code><span class="section-title">Sessões</span></div>
        <div class="type"><code>Código 12 JetBrains Mono</code><span class="mono" style="color:var(--cyan)">Bash: git status --short</span></div>
      </section>

      <section id="controles" class="block">
        <h2 class="section-title">Botões, campos e estados</h2>
        <div class="row">
          <button class="btn primary" type="button">Primário</button>
          <button class="btn" type="button">Neutro</button>
          <button class="btn ghost" type="button">Fantasma</button>
          <button class="btn danger" type="button">Perigo</button>
          <button class="btn ghost danger-text" type="button">Encerrar</button>
          <button class="btn primary" type="button" disabled>Desabilitado</button>
          <button class="btn primary sm" type="button">Pequeno</button>
        </div>
        <div class="row">
          <input class="field" placeholder="Campo de texto" style="max-width:260px">
          <select class="field" style="max-width:160px"><option>sonnet</option></select>
        </div>
        <div class="row">
          <span class="row-item"><span class="dot busy" /> trabalhando</span>
          <span class="row-item"><span class="dot" /> parada</span>
          <span class="row-item"><span class="dot blocked" /> esperando você</span>
          <span class="row-item"><span class="dot done" /> concluída</span>
          <span class="pill">bg</span><span class="pill purple">trabalhando</span><span class="pill red">esperando você</span><span class="pill green">pronto</span>
          <span class="row-item"><span class="spinner" /> raciocinando</span>
        </div>
        <div class="bars">
          <div class="bar"><span class="ok" style="width:18%" /></div>
          <div class="bar"><span class="warn" style="width:64%" /></div>
          <div class="bar"><span class="high" style="width:91%" /></div>
        </div>
        <UsageMini :usage="SAMPLE_USAGE" />
        <h3>Menus (substituem o select nativo: chip inteiro clicável, teclado e descrição por opção)</h3>
        <div class="row">
          <SelectMenu v-model="demo.model" :options="modelOptions(SAMPLE_MODELS)" :icon="Bot" title="Modelo" placement="bottom" />
          <SelectMenu v-model="demo.effort" :options="effortOptions(['low', 'medium', 'high'])" :icon="Gauge" title="Esforço" placement="bottom" />
          <div style="width:260px"><SelectMenu v-model="demo.mode" :options="modeOptions(['auto', 'default', 'plan'])" block placement="bottom" title="Permissões" /></div>
        </div>
      </section>

      <section id="conversa" class="block">
        <h2 class="section-title">Conversa</h2>
        <div class="chat">
          <MessageItem v-for="(m, i) in SAMPLE_MESSAGES" :key="i" :item="m" />
        </div>
      </section>

      <section id="perguntas" class="block">
        <h2 class="section-title">Perguntas e permissões</h2>
        <div class="two inert">
          <PromptCard :message="SAMPLE_QUESTION" chat-id="exemplo" />
          <PromptCard :message="SAMPLE_PERMISSION" chat-id="exemplo" />
        </div>
        <PromptCard :message="SAMPLE_ANSWERED" chat-id="exemplo" />
      </section>

      <section id="caixa" class="block">
        <h2 class="section-title">Caixa de mensagem</h2>
        <div class="composer-demo">
          <ComposerBox :chat="SAMPLE_CHAT" :usage="SAMPLE_USAGE" :submitter="demoSubmit" local-commands placeholder="Exemplo: digite / para ver comandos e skills" />
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive } from 'vue';
import MessageItem from '../components/MessageItem.vue';
import PromptCard from '../components/PromptCard.vue';
import UsageMini from '../components/UsageMini.vue';
import ComposerBox from '../components/ComposerBox.vue';
import SelectMenu from '../components/SelectMenu.vue';
import { Bot, Gauge } from '@lucide/vue';
import { modelOptions, effortOptions, modeOptions } from '../lib/settings';
import { toast } from '../store';

const SECTIONS = [
  { id: 'marca', label: 'Marca' }, { id: 'cores', label: 'Cores' }, { id: 'tipografia', label: 'Tipografia' },
  { id: 'controles', label: 'Controles' }, { id: 'conversa', label: 'Conversa' }, { id: 'perguntas', label: 'Perguntas' }, { id: 'caixa', label: 'Caixa de mensagem' },
];
const SURFACES = [
  { token: '--bg-deeper', use: 'fundo da janela' }, { token: '--bg-deep', use: 'sidebar e painéis' }, { token: '--bg', use: 'área central' },
  { token: '--surface', use: 'hover e chips' }, { token: '--surface-hi', use: 'mensagem do usuário' }, { token: '--line', use: 'bordas' },
  { token: '--comment', use: 'rótulos' }, { token: '--muted', use: 'texto secundário' }, { token: '--fg', use: 'texto' },
];
const ACCENTS = [
  { token: '--purple', use: 'ação e seleção' }, { token: '--pink', use: 'raciocínio' }, { token: '--cyan', use: 'ferramenta' },
  { token: '--green', use: 'ativo e sucesso' }, { token: '--orange', use: 'atenção e gasto' }, { token: '--red', use: 'esperando você e erro' },
  { token: '--yellow', use: 'hash de commit' },
];
const SAMPLE_USAGE = { turns: 91, contextPct: 0.31, contextTokens: 314542, contextWindow: 1000000, costUsd: 8.49, rate10m: { costUsd: 3.3 } };
const SAMPLE_MESSAGES = [
  { role: 'user', text: 'Corrige o filtro de comissões que ignora a filial' },
  { role: 'assistant', text: 'Vou olhar o componente do filtro e a rota do backend. O `v-select` manda **branch** em inglês:\n\n```js\nconst params = { tipo: \'branch\' }; // deveria ser \'filial\'\n```' },
  { role: 'tool', name: 'Bash', text: 'grep -rn "branch" src/modules/comissoes' },
  { kind: 'thinking', text: '' },
  { role: 'system', text: 'Contexto compactado: 24,6k → 287 tokens. Detalhes antigos agora são um resumo.' },
  { role: 'local', text: '[busy] Leão · app-server @ desenvolvimento · interactive · 731 MB' },
];
const SAMPLE_QUESTION = {
  role: 'prompt', kind: 'question', requestId: 'q', answered: false,
  questions: [{ question: 'Qual cor você prefere?', header: 'Cor', multiSelect: false, options: [{ label: 'Azul', description: 'Cor fria' }, { label: 'Branco', description: 'Cor neutra' }] }],
};
const SAMPLE_PERMISSION = { role: 'prompt', kind: 'permission', requestId: 'p', answered: false, toolName: 'Bash', detail: 'git push origin feat/filtro-filial', text: 'Envia a branch para o GitHub', suggestions: [{ type: 'addRules' }] };
const SAMPLE_ANSWERED = { role: 'prompt', kind: 'question', requestId: 'a', answered: true, answer: 'Azul' };
const SAMPLE_CHAT = { profile: 'leve', model: 'claude-haiku-4-5-20251001', effort: 'low', permissionMode: 'auto' };

const values = reactive({});
const SAMPLE_MODELS = [
  { id: 'claude-haiku-4-5-20251001', alias: 'haiku', label: 'Haiku 4.5', description: 'Mais rápido e barato' },
  { id: 'claude-sonnet-5-5', alias: 'sonnet', label: 'Sonnet 5.5', description: 'Equilíbrio para o dia a dia' },
  { id: 'claude-opus-5-5', alias: 'opus', label: 'Opus 5.5', description: 'O mais capaz do dia a dia' },
];
const demo = reactive({ model: 'claude-sonnet-5-5', effort: 'medium', mode: 'auto' });
onMounted(() => {
  const css = getComputedStyle(document.documentElement);
  for (const c of [...SURFACES, ...ACCENTS]) values[c.token] = css.getPropertyValue(c.token).trim();
});

async function demoSubmit(body) {
  toast(`Exemplo: enviaria "${body.text}"${body.images.length ? ` com ${body.images.length} imagem(ns)` : ''}`);
}
</script>

<style scoped>
.ds { overflow-y: auto; }
.inner { max-width: 1000px; margin: 0 auto; padding: 40px 24px 80px; display: flex; flex-direction: column; gap: 30px; }
.hero { display: flex; gap: 16px; align-items: center; }
.hero img { border-radius: 12px; }
.hero h1 { margin: 0; font-size: 28px; }
.hero p { margin: 4px 0 0; max-width: 680px; }
code { background: var(--bg-deep); color: var(--pink); padding: 1px 6px; border-radius: 4px; font-family: var(--mono); font-size: 12px; }
.toc { display: flex; gap: 8px; flex-wrap: wrap; }
.toc a { color: var(--purple); text-decoration: none; background: var(--purple-soft); padding: 4px 12px; border-radius: 20px; font-size: 13px; }
.block { display: flex; flex-direction: column; gap: 12px; scroll-margin-top: 16px; }
.block h2 { border-bottom: 1px solid var(--line); padding-bottom: 8px; margin: 0; }
.block h3 { margin: 6px 0 0; font-size: 13px; font-weight: 500; color: var(--muted); }
.brand-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.brand-row img { border-radius: 14px; }
.brand-row p { max-width: 380px; margin: 0; font-size: 13px; }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.swatch { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg-deep); display: flex; flex-direction: column; padding-bottom: 8px; }
.chip-color { height: 64px; margin-bottom: 8px; }
.swatch code, .swatch .hex, .swatch .use { padding: 0 10px; }
.swatch code { background: none; color: var(--fg); padding: 0 10px; }
.hex { font-family: var(--mono); font-size: 11px; color: var(--muted); }
.use { font-size: 11px; color: var(--comment); }
.type { display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--bg-deep); }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.row-item { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.bars { display: flex; flex-direction: column; gap: 8px; max-width: 320px; }
.chat { display: flex; flex-direction: column; gap: 14px; padding: 18px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.inert { pointer-events: none; }
.composer-demo { border: 1px solid var(--line); border-radius: 12px; padding-top: 18px; background: var(--bg); }
@media (max-width: 760px) { .two { grid-template-columns: 1fr; } .type { grid-template-columns: 1fr; } }
</style>
