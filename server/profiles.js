// Perfis de chat: quanto contexto cada processo headless carrega.
// Medido em 2026-10-02 com haiku respondendo "ok": completo ~35k tokens de contexto, leve ~22k.
const PROFILES = {
  leve: {
    label: 'Leve',
    description: 'Sem skills e sem MCP; só Bash, Read, Grep, Glob e perguntas. O mais barato.',
    args: ['--strict-mcp-config', '--disable-slash-commands', '--tools=Bash,Read,Grep,Glob,AskUserQuestion'],
  },
  padrao: {
    label: 'Padrão',
    description: 'Skills, agentes e tools nativas; sem integrações MCP.',
    args: ['--strict-mcp-config'],
  },
  completo: {
    label: 'Completo',
    description: 'Tudo: skills, agentes, tools e integrações MCP.',
    args: [],
  },
};

// IDs exatos (o que o CLI resolve para cada apelido, verificado em 2026-10-02 lendo o "model" do init):
// fable → claude-fable-5-1, opus → claude-opus-5-5, sonnet → claude-sonnet-5-5, haiku → claude-haiku-4-5-20251001.
const MODEL_LIST = [
  { id: 'claude-haiku-4-5-20251001', alias: 'haiku', label: 'Haiku 4.5', description: 'Mais rápido e barato; bom para perguntas diretas' },
  { id: 'claude-sonnet-5-5', alias: 'sonnet', label: 'Sonnet 5.5', description: 'Equilíbrio entre velocidade e qualidade para o dia a dia' },
  { id: 'claude-opus-5-5', alias: 'opus', label: 'Opus 5.5', description: 'O mais capaz do dia a dia; tarefas difíceis e longas' },
  { id: 'claude-fable-5-1', alias: 'fable', label: 'Fable 5.1', description: 'O mais capaz de todos; consome o limite do plano bem mais rápido (um "ok" ≈ US$ 0,36 equivalente)' },
];
const MODELS = MODEL_LIST.map((m) => m.id);

// Chats antigos guardam o apelido ("opus"); passam a valer pelo ID exato.
function normalizeModel(model) {
  const found = MODEL_LIST.find((m) => m.id === model || m.alias === model);
  return found ? found.id : model;
}
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// auto: o classificador decide e só pergunta o que for arriscado; default: pergunta tudo que escreve.
const PERMISSION_MODES = ['auto', 'default', 'acceptEdits', 'plan'];

const DEFAULT_CHAT = { profile: 'leve', model: 'claude-haiku-4-5-20251001', effort: 'low', permissionMode: 'auto' };

function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} inválido: "${value}" (esperado: ${allowed.join(', ')})`);
  }
}

// allowSlash: reabre o perfil Leve com comandos habilitados só para rodar o /compact (o Leve os desliga).
function buildChatArgs({ profile, model: rawModel, effort, permissionMode = DEFAULT_CHAT.permissionMode, resumeId, fork, allowSlash }) {
  const model = normalizeModel(rawModel);
  assertOneOf(profile, Object.keys(PROFILES), 'profile');
  assertOneOf(model, MODELS, 'model');
  assertOneOf(effort, EFFORTS, 'effort');
  assertOneOf(permissionMode, PERMISSION_MODES, 'permissionMode');
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode', permissionMode,
    // Perguntas e permissões chegam ao app como control_request (exige handshake initialize).
    '--permission-prompt-tool', 'stdio',
    '--model', model,
    '--effort', effort,
    ...PROFILES[profile].args.filter((a) => !(allowSlash && a === '--disable-slash-commands')),
  ];
  if (resumeId) {
    args.push('--resume', resumeId);
    if (fork) args.push('--fork-session');
  }
  return args;
}

function publicProfiles() {
  return Object.entries(PROFILES).map(([id, p]) => ({ id, label: p.label, description: p.description }));
}

const publicModels = () => MODEL_LIST.map(({ id, alias, label, description }) => ({ id, alias, label, description }));

module.exports = { PROFILES, MODELS, MODEL_LIST, EFFORTS, PERMISSION_MODES, DEFAULT_CHAT, buildChatArgs, publicProfiles, publicModels, normalizeModel };
