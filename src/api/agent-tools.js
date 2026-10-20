import { stableStringify } from '../resilience/recovery-bundle.js';

// Native tool use for MEL chat: the model chooses and calls its own
// CapabilityBus capabilities (strict JSON protocol, works on any Workers AI
// model), up to AGENT_MAX_STEPS, before the normal grounded answer is written.

export const AGENT_TOOL_ALLOWLIST = Object.freeze([
  'self.state', 'autonomy.status', 'autonomy.tick', 'autonomy.activity',
  'capability.audit', 'evolution.enqueue', 'model.council',
  'code.read', 'code.search', 'web.research',
  'computer.status', 'computer.quick',
  // Lectures seulement. Les mutations restent derrière le chemin déterministe
  // et la confirmation explicite, jamais dans cette boucle.
  'gmail.messages.search', 'gmail.messages.read',
  'calendar.events.read',
  'drive.files.list', 'drive.files.search',
]);
export const AGENT_MAX_STEPS = 4;
const AGENT_MODEL = '@cf/openai/gpt-oss-120b';
const AGENT_DEADLINE_MS = 90_000;

// Only action requests pay for an extra model call (plain conversation stays one call).
export function wantsAgentTools(text) {
  if (/aucune action|sans (?:aucune )?action|ne (?:fais|lance|touche)/i.test(String(text || ''))) return false;
  return /\b(?:lance\w*|ex[ée]cute\w*|teste\w*|test|audit\w*|v[ée]rifie\w*|corrige\w*|r[ée]pare\w*|d[ée]veloppe\w*|cr[ée]e\w*|connecte\w*|appelle\w*|d[ée]marre\w*|active\w*|council|stress|d1|base de donn[ée]es|companion|github|outil\w*|autonom\w*|max)\b/i.test(String(text || ''));
}

export function agentToolCatalog(bus) {
  const known = new Map((typeof bus?.list === 'function' ? bus.list() : []).map(r => [r.id, r]));
  return AGENT_TOOL_ALLOWLIST.filter(id => known.has(id)).map(id => ({
    id,
    description: String(known.get(id).description || known.get(id).name || '').slice(0, 220),
    input_schema: known.get(id).input_schema || { type: 'object' },
  }));
}

export function parseAgentAction(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return { final: true };
  try {
    const j = JSON.parse(match[0]);
    if (!j || typeof j !== 'object') return { final: true };
    if (j.final === true && typeof j.tool !== 'string') return { final: true };
    if (typeof j.tool === 'string') {
      const raw = j.input ?? j.arguments ?? j.args;
      const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      return { tool: j.tool, input };
    }
  } catch {}
  return { final: true };
}

export function responseIsBareToolCall(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  const action = parseAgentAction(trimmed);
  return action.final !== true && typeof action.tool === 'string';
}

const LEAKED_READ_TOOLS = new Set([
  'gmail.messages.search', 'gmail.messages.read',
  'calendar.events.read',
  'drive.files.list', 'drive.files.search',
  'self.state', 'autonomy.status', 'capability.audit',
  'code.read', 'code.search', 'web.research', 'computer.status',
]);

/** Preserve actionable fallback diagnostics without copying upstream bodies. */
export function toolFailureDetails(error) {
  const result = { error:String(error?.code || error?.message || 'CAPABILITY_FAILED').slice(0, 180) };
  for (const field of ['native_code', 'fallback_code']) {
    const code = String(error?.[field] || '');
    if (/^[A-Z][A-Z0-9_]{0,159}$/.test(code)) result[field] = code;
  }
  return result;
}

function eachJsonObject(text, visit) {
  const source = String(text || '');
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{') continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < source.length; end += 1) {
      const char = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          visit(source.slice(start, end + 1), start, end + 1);
          // Nested objects are arguments/data, never separate tool requests.
          start = end;
          break;
        }
      }
    }
  }
}

export function leakedToolCalls(text) {
  const found = [];
  eachJsonObject(text, raw => {
    const action = parseAgentAction(raw);
    if (typeof action.tool === 'string') found.push(action);
  });
  return found;
}

export function stripLeakedToolCalls(text) {
  const spans = [];
  eachJsonObject(text, (raw, start, end) => {
    const action = parseAgentAction(raw);
    if (typeof action.tool === 'string') spans.push([start, end]);
  });
  let visible = String(text || '');
  for (const [start, end] of spans.reverse()) visible = visible.slice(0, start) + visible.slice(end);
  return visible.replace(/```(?:json)?\s*```/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A read named in the final answer but not already run is executed once. Mutations are not. */
export async function executeLeakedReads({ bus, text, already = [], context = {}, summarize = x => x }) {
  if (typeof bus?.execute !== 'function') return [];
  const done = new Set((Array.isArray(already) ? already : []).map(row => String(row?.capability || '')));
  const pending = [];
  for (const action of leakedToolCalls(text)) {
    if (!LEAKED_READ_TOOLS.has(action.tool) || done.has(action.tool)) continue;
    done.add(action.tool);
    pending.push(action);
  }
  const results = [];
  for (const action of pending.slice(0, 3)) {
    try {
      const result = await bus.execute(action.tool, action.input, context);
      results.push({ capability: action.tool, status: 'SUCCEEDED', result: summarize(result) });
    } catch (error) {
      results.push({ capability: action.tool, status: 'FAILED', ...toolFailureDetails(error) });
    }
  }
  return results;
}

function agentSystem(catalog) {
  return [
    'Tu es MEL. Tu AS des outils réels et tu les appelles TOI-MÊME. Ne demande jamais à Adrien de lancer un curl, une commande ou de fournir un token.',
    'Pour appeler un outil, réponds UNIQUEMENT par un JSON : {"tool":"<id>","input":{...}}. « arguments » est accepté comme alias de input. Quand tu as assez de résultats, ou si la demande est une simple conversation, réponds UNIQUEMENT : {"final":true}.',
    'Une demande de développement du code passe par evolution.enqueue. Une lecture Gmail, Agenda ou Drive ne passe JAMAIS par evolution.enqueue : utilise gmail.messages.search, calendar.events.read ou drive.files.list.',
    'Outils disponibles : ' + JSON.stringify(catalog),
  ].join('\n');
}

/** Runs the tool loop. Returns rows in the native-chat toolResults format. */
const LEARNABLE_MISS = new Set(['AGENT_TOOL_NOT_ALLOWED', 'CAPABILITY_NOT_FOUND']);

// A missing tool is a skill to learn. An existing tool that failed for auth,
// approval or an absent account is not: that must not become a new module.
export function missingCapabilityShouldBeLearned(toolResults = []) {
  const rows = Array.isArray(toolResults) ? toolResults : [];
  if (rows.some(row => row?.capability === 'evolution.enqueue')) return false;
  if (rows.some(row => row?.status === 'SUCCEEDED')) return false;
  const failed = rows.filter(row => row?.status === 'FAILED');
  if (!failed.length || failed.some(row => !LEARNABLE_MISS.has(String(row?.error || '')))) return false;
  return true;
}

export async function runAgentToolLoop({ env, bus, text, recent = [], context = {}, summarize = x => x, now = () => Date.now() }) {
  if (!wantsAgentTools(text)) return [];
  const catalog = agentToolCatalog(bus);
  if (!catalog.length || typeof env?.AI?.run !== 'function') return [];
  const allowed = new Set(catalog.map(t => t.id));
  const results = [];
  const started = now();
  const history = (Array.isArray(recent) ? recent : []).slice(-6)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) }));
  for (let step = 0; step < AGENT_MAX_STEPS && now() - started < AGENT_DEADLINE_MS; step += 1) {
    const messages = [
      { role: 'system', content: agentSystem(catalog) },
      ...history,
      { role: 'user', content: String(text || '') },
      ...results.map(r => ({ role: 'user', content: 'TOOL_RESULT ' + r.capability + ' : ' + JSON.stringify(r.result ?? r.error).slice(0, 3000) })),
    ];
    let out;
    try { out = await env.AI.run(AGENT_MODEL, { messages, max_tokens: 400 }); } catch { break; }
    const reply = typeof out === 'string' ? out : out?.response || out?.choices?.[0]?.message?.content || '';
    const action = parseAgentAction(reply);
    if (action.final) break;
    if (!allowed.has(action.tool)) {
      results.push({ capability: action.tool, status: 'FAILED', error: 'AGENT_TOOL_NOT_ALLOWED' });
      continue;
    }
    if (results.some(r => r.capability === action.tool && stableStringify(r.input) === stableStringify(action.input))) break;
    if (action.tool === 'autonomy.tick') {
      if (typeof context?.waitUntil === 'function') {
        context.waitUntil(bus.execute(action.tool, action.input, context)
          .catch(error => console.error('[MEL autonomy] agent tick detached', String(error?.code || error?.message || 'UNKNOWN'))));
      }
      results.push({ capability: action.tool, input: action.input, status: 'QUEUED', result: { ok: true, status: 'QUEUED', detached: true } });
      continue;
    }
    try {
      const result = await bus.execute(action.tool, action.input, context);
      results.push({ capability: action.tool, input: action.input, status: 'SUCCEEDED', result: summarize(result) });
    } catch (error) {
      results.push({ capability: action.tool, input: action.input, status: 'FAILED', ...toolFailureDetails(error) });
    }
  }
  return results.map(({ input, ...row }) => row);
}
