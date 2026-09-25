function text(value) {
  return String(value ?? '');
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export function estimateContextTokens(value) {
  const content = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Math.max(1, Math.ceil(content.length / 4));
}

function truncateToTokens(value, maxTokens) {
  const input = text(value);
  const chars = Math.max(0, Math.trunc(maxTokens * 4));
  if (input.length <= chars) return input;
  if (chars <= 1) return input.slice(0, chars);
  return input.slice(0, Math.max(0, chars - 1)) + '…';
}

function digest(value) {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeMessage(row, index) {
  return {
    id: text(row?.id || `message-${index}`),
    role: text(row?.role || 'unknown').toLowerCase(),
    content: text(row?.content),
    timestamp: Number(row?.timestamp || 0) || null,
    provenance: text(row?.provenance || ''),
    metadata: row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? structuredClone(row.metadata)
      : {},
  };
}

function normalizeMemory(row, index) {
  const source = text(row?.source || row?.provenance?.table || 'unknown');
  const id = text(row?.id || row?.provenance?.id || `memory-${index}`);
  return {
    id,
    source,
    content: text(row?.content),
    authority: text(row?.authority || ''),
    timestamp: Number(row?.timestamp || row?.created_at || 0) || null,
    score: Number(row?.rank_score ?? row?.similarity ?? row?.confidence ?? 0) || 0,
    provenance: row?.provenance && typeof row.provenance === 'object'
      ? structuredClone(row.provenance)
      : { table: source, id },
  };
}

function quota(total, ratio, min = 64) {
  return Math.max(min, Math.trunc(total * ratio));
}

function takeRecent(messages, budget) {
  const selected = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index];
    const fixed = { ...row, content: truncateToTokens(row.content, Math.max(16, budget - used)) };
    const cost = estimateContextTokens(fixed);
    if (selected.length && used + cost > budget) break;
    selected.push(fixed);
    used += cost;
    if (used >= budget) break;
  }
  selected.reverse();
  return { selected, used };
}

function takeMemories(memories, budget) {
  const sorted = memories.slice().sort((a, b) =>
    (b.score - a.score)
    || Number(b.timestamp || 0) - Number(a.timestamp || 0)
    || a.id.localeCompare(b.id)
  );
  const selected = [];
  let used = 0;
  for (const row of sorted) {
    const remaining = budget - used;
    if (remaining < 16 && selected.length) break;
    const compact = {
      ...row,
      content: truncateToTokens(row.content, Math.max(16, Math.min(600, remaining))),
    };
    const cost = estimateContextTokens(compact);
    if (selected.length && used + cost > budget) break;
    selected.push(compact);
    used += cost;
    if (used >= budget) break;
  }
  return { selected, used };
}

function continuityRows(snapshot, budget) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const sections = [
    ['resume_queue', Array.isArray(source.resume_queue) ? source.resume_queue : []],
    ['active_projects', Array.isArray(source.active_projects) ? source.active_projects : []],
    ['recent_decisions', Array.isArray(source.recent_decisions) ? source.recent_decisions : []],
    ['recent_lessons', Array.isArray(source.recent_lessons) ? source.recent_lessons : []],
  ];
  const output = {};
  let used = 0;

  for (const [key, rows] of sections) {
    output[key] = [];
    for (const row of rows) {
      const remaining = budget - used;
      if (remaining < 12) break;
      const raw = structuredClone(row);
      for (const field of ['rationale', 'content', 'next_action', 'description']) {
        if (typeof raw?.[field] === 'string') raw[field] = truncateToTokens(raw[field], Math.min(300, remaining));
      }
      const cost = estimateContextTokens(raw);
      if (output[key].length && used + cost > budget) break;
      output[key].push(raw);
      used += cost;
      if (used >= budget) break;
    }
    if (used >= budget) break;
  }

  return { selected: output, used };
}

function historicalDigest(omitted, budget) {
  const rows = [];
  let used = 0;
  for (const message of omitted) {
    const remaining = budget - used;
    if (remaining < 16) break;
    const row = {
      id: message.id,
      role: message.role,
      timestamp: message.timestamp,
      excerpt: truncateToTokens(message.content, Math.max(12, Math.min(120, remaining))),
      provenance: message.provenance,
    };
    const cost = estimateContextTokens(row);
    if (rows.length && used + cost > budget) break;
    rows.push(row);
    used += cost;
    if (used >= budget) break;
  }
  return { selected: rows, used };
}

/**
 * Deterministic extractive context packer. It never invents facts or replaces
 * omitted history with an ungrounded generated summary.
 */
export function packContext({
  messages = [],
  memories = [],
  restartSnapshot = null,
  budgetTokens = 12_000,
} = {}) {
  const budget = boundedInt(budgetTokens, 12_000, 512, 200_000);
  const normalizedMessages = (Array.isArray(messages) ? messages : []).map(normalizeMessage);
  const normalizedMemories = (Array.isArray(memories) ? memories : []).map(normalizeMemory);

  const recentBudget = quota(budget, 0.50, 256);
  const memoryBudget = quota(budget, 0.20, 128);
  const continuityBudget = quota(budget, 0.17, 128);
  const historyBudget = Math.max(64, budget - recentBudget - memoryBudget - continuityBudget);

  const recent = takeRecent(normalizedMessages, recentBudget);
  const recentIds = new Set(recent.selected.map(row => row.id));
  const omittedMessages = normalizedMessages.filter(row => !recentIds.has(row.id));
  const memory = takeMemories(normalizedMemories, memoryBudget);
  const continuity = continuityRows(restartSnapshot, continuityBudget);
  const history = historicalDigest(omittedMessages, historyBudget);

  const estimated = recent.used + memory.used + continuity.used + history.used;
  const sourceIds = {
    recent_messages: recent.selected.map(row => row.id),
    historical_excerpts: history.selected.map(row => row.id),
    memories: memory.selected.map(row => `${row.source}:${row.id}`),
    resume_items: (continuity.selected.resume_queue || []).map(row => text(row?.id)),
    projects: (continuity.selected.active_projects || []).map(row => text(row?.project_id)),
    decisions: (continuity.selected.recent_decisions || []).map(row => text(row?.decision_id)),
  };

  return Object.freeze({
    schema: 'mel.context-bundle/v1',
    budget_tokens: budget,
    estimated_tokens: estimated,
    within_budget: estimated <= budget,
    sections: Object.freeze({
      recent_messages: Object.freeze(recent.selected),
      memory_evidence: Object.freeze(memory.selected),
      continuity: Object.freeze(continuity.selected),
      historical_excerpts: Object.freeze(history.selected),
    }),
    omissions: Object.freeze({
      message_count: omittedMessages.length,
      first_omitted_message_id: omittedMessages[0]?.id || null,
      last_omitted_message_id: omittedMessages.at(-1)?.id || null,
      memory_count: Math.max(0, normalizedMemories.length - memory.selected.length),
    }),
    retrieval_hints: Object.freeze({
      conversation_history_required: omittedMessages.length > 0,
      memory_retrieval_required: normalizedMemories.length > memory.selected.length,
      omitted_message_range: omittedMessages.length
        ? {
            first_id: omittedMessages[0].id,
            last_id: omittedMessages.at(-1).id,
            count: omittedMessages.length,
          }
        : null,
    }),
    source_ids: Object.freeze(sourceIds),
    bundle_digest: digest(sourceIds),
  });
}
