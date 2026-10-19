// Perguntas (AskUserQuestion) e pedidos de permissão que o CLI manda via control_request can_use_tool.
// Protocolo verificado em 2026-10-02 com --permission-prompt-tool stdio + handshake initialize.
const { toolSummary } = require('./stream');

const QUESTION_TOOL = 'AskUserQuestion';

function buildPromptMessage(op) {
  const isQuestion = op.toolName === QUESTION_TOOL;
  return {
    role: 'prompt',
    kind: isQuestion ? 'question' : 'permission',
    requestId: op.requestId,
    toolName: op.toolName,
    input: op.input,
    questions: isQuestion ? (op.input.questions || []) : null,
    text: isQuestion ? '' : (op.description || toolSummary(op.toolName, op.input)),
    detail: isQuestion ? '' : toolSummary(op.toolName, op.input),
    suggestions: op.suggestions || null,
    answered: false,
    answer: null,
  };
}

// answers: { [texto da pergunta]: "rótulo" | ["rótulo", ...] }. Múltipla escolha vai separada por vírgula.
function normalizeAnswers(questions, answers) {
  const out = {};
  for (const q of questions) {
    const raw = answers ? answers[q.question] : undefined;
    const value = Array.isArray(raw) ? raw.filter(Boolean).join(', ') : String(raw || '').trim();
    if (!value) throw new Error(`falta resposta para "${q.question}"`);
    out[q.question] = value;
  }
  return out;
}

// decision: 'allow' | 'always' | 'deny'. Retorna o control_response e o resumo para o card.
function buildPromptResponse(prompt, { decision, answers, message }) {
  let response;
  let summary;
  if (prompt.kind === 'question') {
    if (decision === 'deny') {
      response = { behavior: 'deny', message: message || 'O usuário preferiu não responder.' };
      summary = 'Sem resposta';
    } else {
      const normalized = normalizeAnswers(prompt.questions, answers);
      response = { behavior: 'allow', updatedInput: { ...prompt.input, answers: normalized } };
      summary = Object.values(normalized).join(' · ');
    }
  } else if (decision === 'deny') {
    response = { behavior: 'deny', message: message || 'O usuário negou esta ação.' };
    summary = message ? `Negado: ${message}` : 'Negado';
  } else if (decision === 'allow' || decision === 'always') {
    response = { behavior: 'allow', updatedInput: prompt.input };
    if (decision === 'always' && prompt.suggestions) response.updatedPermissions = prompt.suggestions;
    summary = decision === 'always' ? 'Permitido sempre' : 'Permitido';
  } else {
    throw new Error(`decisão inválida: "${decision}" (esperado: allow, always, deny)`);
  }
  return {
    frame: { type: 'control_response', response: { subtype: 'success', request_id: prompt.requestId, response } },
    summary,
  };
}

function controlError(requestId, error) {
  return { type: 'control_response', response: { subtype: 'error', request_id: requestId, error } };
}

module.exports = { buildPromptMessage, buildPromptResponse, normalizeAnswers, controlError, QUESTION_TOOL };
