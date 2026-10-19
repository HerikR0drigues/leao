// Traduz eventos do `claude -p --output-format stream-json` em operações simples para o chat.
const SUMMARY_MAX = 160;

function toolSummary(name, input) {
  const i = input || {};
  const picked = i.command || i.file_path || i.pattern || i.skill || i.description || i.url || i.query || i.prompt;
  const text = picked ? String(picked) : JSON.stringify(i);
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

function normalizeLimits(info) {
  const windows = info.unifiedWindows || {};
  const pick = (w) => (w ? { utilization: Number(w.utilization || 0), resetsAt: w.resetsAt ? w.resetsAt * 1000 : null } : null);
  return {
    status: info.status || 'unknown',
    fiveHour: pick(windows.five_hour),
    sevenDay: pick(windows.seven_day),
    updatedAt: Date.now(),
  };
}

function parseEvent(d) {
  if (!d || typeof d !== 'object') return [];
  if (d.type === 'control_request' && d.request) {
    const r = d.request;
    return [{
      op: 'control',
      requestId: d.request_id,
      subtype: r.subtype,
      toolName: r.tool_name || null,
      input: r.input || {},
      description: r.description || '',
      suggestions: r.permission_suggestions || null,
    }];
  }
  if (d.type === 'control_response') {
    const r = d.response || {};
    return [{ op: 'control-ack', requestId: r.request_id, ok: r.subtype === 'success', error: r.error || null }];
  }
  // Compactação (manual via /compact ou automática): verificado em 2026-10-02 no modo headless.
  if (d.type === 'system' && d.subtype === 'status') {
    return [{ op: 'status', status: d.status || null, compactResult: d.compact_result || null }];
  }
  if (d.type === 'system' && d.subtype === 'compact_boundary') {
    const meta = d.compact_metadata || {};
    return [{ op: 'compact', trigger: meta.trigger || 'auto', pre: Number(meta.pre_tokens || 0), post: Number(meta.post_tokens || 0) }];
  }
  if (d.type === 'system' && d.subtype === 'thinking_tokens') {
    return [{ op: 'thinking', tokens: Number(d.estimated_tokens || 0) }];
  }
  if (d.type === 'system' && d.subtype === 'init') {
    return [{ op: 'init', sessionId: d.session_id, model: d.model }];
  }
  if (d.type === 'stream_event') {
    const ev = d.event || {};
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
      return [{ op: 'delta', text: ev.delta.text }];
    }
    return [];
  }
  if (d.type === 'assistant' && d.message && Array.isArray(d.message.content)) {
    const ops = [];
    for (const block of d.message.content) {
      if (block.type === 'text' && block.text) ops.push({ op: 'text', text: block.text });
      if (block.type === 'tool_use') ops.push({ op: 'tool', name: block.name, summary: toolSummary(block.name, block.input) });
    }
    return ops;
  }
  // No plano (assinatura) o que limita é a janela de 5h e a semanal, não dinheiro.
  if (d.type === 'rate_limit_event' && d.rate_limit_info) {
    return [{ op: 'limits', limits: normalizeLimits(d.rate_limit_info) }];
  }
  if (d.type === 'result') {
    return [{
      op: 'result',
      isError: Boolean(d.is_error) || (d.subtype && d.subtype !== 'success'),
      costTotal: Number(d.total_cost_usd || 0),
      text: typeof d.result === 'string' ? d.result : '',
      usage: d.usage || null,
    }];
  }
  return [];
}

// Buffer de linhas: o stdout chega em pedaços que não respeitam quebra de linha.
function createLineSplitter(onLine) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onLine(line);
    }
  };
}

module.exports = { parseEvent, toolSummary, createLineSplitter, normalizeLimits };
