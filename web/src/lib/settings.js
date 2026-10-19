// Opções de configuração do chat (com descrição) e os comandos "/" resolvidos no próprio Leão, sem gastar token.
const MODEL_DESCRIPTIONS = {
  haiku: 'Mais rápido e barato; bom para perguntas diretas',
  sonnet: 'Equilíbrio entre velocidade e qualidade para o dia a dia',
  opus: 'O mais capaz; para tarefas difíceis e longas',
};
const EFFORT_DESCRIPTIONS = {
  low: 'Responde rápido, pensa pouco',
  medium: 'Pensa o suficiente para a maioria das tarefas',
  high: 'Pensa bem antes de agir',
  xhigh: 'Pensa muito; tarefas complexas',
  max: 'Sem economia; só quando a qualidade importa mais que tudo',
};
const MODE_DESCRIPTIONS = {
  auto: 'O classificador decide e só pergunta o que for arriscado',
  default: 'Pergunta antes de editar arquivo ou rodar comando',
  acceptEdits: 'Aceita edições de arquivo sem perguntar',
  plan: 'Só lê e planeja; não altera nada',
};
const MODE_LABELS = { auto: 'Auto', default: 'Perguntar', acceptEdits: 'Aceitar edições', plan: 'Só planejar' };

// models: [{ id, alias, label, description }] vindos do servidor (IDs exatos; o rótulo traz a versão).
export const modelOptions = (models) => models.map((m) => ({ value: m.id, label: m.label, description: m.description || MODEL_DESCRIPTIONS[m.alias] || '' }));

// Aceita ID, apelido ("opus") ou rótulo ("Opus 5.5") e devolve o modelo da lista; também casa o ID datado do transcript.
export function findModel(raw, models) {
  const v = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!v) return null;
  return models.find((m) => m.id.toLowerCase() === v || (m.alias || '') === v || m.label.toLowerCase().replace(/\s+/g, '') === v)
    || models.find((m) => v.startsWith(m.id.toLowerCase()) || m.id.toLowerCase().startsWith(v))
    || null;
}
export const modelLabel = (id, models) => {
  const m = findModel(id, models);
  return m ? m.label : (id || '');
};
export const effortOptions = (efforts) => efforts.map((e) => ({ value: e, label: e, description: EFFORT_DESCRIPTIONS[e] || '' }));
export const modeOptions = (modes) => modes.map((m) => ({ value: m, label: MODE_LABELS[m] || m, description: MODE_DESCRIPTIONS[m] || '' }));
export const profileOptions = (profiles) => profiles.map((p) => ({ value: p.id, label: p.label, description: p.description }));
export const modeLabel = (m) => MODE_LABELS[m] || m;

// Comando → chave da configuração do chat. Aceita o nome em português e o do Claude Code.
const SETTING_COMMANDS = {
  model: 'model', modelo: 'model',
  effort: 'effort', esforco: 'effort', 'esforço': 'effort',
  perfil: 'profile', profile: 'profile',
  permissoes: 'permissionMode', 'permissões': 'permissionMode', permissions: 'permissionMode',
};
const ACTION_COMMANDS = {
  compact: 'compact', compactar: 'compact',
  clear: 'clear', novo: 'clear', new: 'clear',
  cost: 'cost', custo: 'cost',
  status: 'status',
};

function valuesFor(key, lists) {
  return {
    model: lists.models.map((m) => m.alias || m.id),
    effort: lists.efforts,
    profile: lists.profiles.map((p) => p.id),
    permissionMode: lists.permissionModes,
  }[key] || [];
}

// Itens do menu "/" para os comandos locais (um item por valor: "/model sonnet", "/effort high"...).
export function localCommandItems(lists) {
  const items = [];
  const push = (name, description) => items.push({ name, description, local: true });
  for (const m of lists.models) push(`model ${m.alias || m.id}`, `Modelo → ${m.label}: ${m.description || ''}`);
  for (const o of effortOptions(lists.efforts)) push(`effort ${o.value}`, `Esforço → ${o.value}: ${o.description}`);
  for (const o of profileOptions(lists.profiles)) push(`perfil ${o.value}`, `Perfil → ${o.label}: ${o.description}`);
  for (const o of modeOptions(lists.permissionModes)) push(`permissoes ${o.value}`, `Permissões → ${o.label}: ${o.description}`);
  push('compact', 'Resume a conversa para liberar contexto (detalhes antigos viram resumo)');
  push('clear', 'Nova conversa na mesma pasta, com as mesmas configurações');
  push('cost', 'Consumo deste chat: contexto, tokens e equivalente de API (sem gastar token)');
  push('status', 'Todas as sessões e o que cada uma está fazendo (sem gastar token)');
  return items;
}

// "/model sonnet" → { action: 'setting', key: 'model', value: 'sonnet' }. Comando que não é local → null (vai para o Claude).
export function parseLocalCommand(text, lists) {
  const match = String(text || '').trim().match(/^\/(\S+)(?:\s+(.+?))?\s*$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const arg = match[2];
  if (ACTION_COMMANDS[name]) return { action: ACTION_COMMANDS[name] };
  const key = SETTING_COMMANDS[name];
  if (!key) return null;
  const allowed = valuesFor(key, lists);
  if (!arg) return { action: 'error', message: `Use /${name} <valor>. Opções: ${allowed.join(', ')}` };
  if (key === 'model') {
    const model = findModel(arg, lists.models);
    if (!model) return { action: 'error', message: `"${arg}" não é opção de /${name}. Opções: ${allowed.join(', ')}` };
    return { action: 'setting', key, value: model.id };
  }
  const value = allowed.find((v) => v.toLowerCase() === arg.toLowerCase());
  if (!value) return { action: 'error', message: `"${arg}" não é opção de /${name}. Opções: ${allowed.join(', ')}` };
  return { action: 'setting', key, value };
}
