// Native tool use for MEL chat: the model chooses and calls its own
// CapabilityBus capabilities (strict JSON protocol, works on any Workers AI
// model), up to AGENT_MAX_STEPS, before the normal grounded answer is written.

export const AGENT_TOOL_ALLOWLIST = Object.freeze([
  'self.state', 'autonomy.status', 'autonomy.tick', 'autonomy.activity',
  'capability.audit', 'evolution.enqueue', 'model.council',
  'code.read', 'code.search', 'web.research',
  'computer.status', 'computer.quick',
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
    if (j && typeof j.tool === 'string') return { tool: j.tool, input: j.input && typeof j.input === 'object' ? j.input : {} };
  } catch {}
  return { final: true };
}

function agentSystem(catalog) {
  return [
    'Tu es MEL. Tu AS des outils réels et tu les appelles TOI-MÊME. Ne demande jamais à Adrien de lancer un curl, une commande ou de fournir un token.',
    'Pour appeler un outil, réponds UNIQUEMENT par un JSON : {"tool":"<id>","input":{...}}. Quand tu as assez de résultats, ou si la demande est une simple conversation, réponds UNIQUEMENT : {"final":true}.',
    'Une demande de développement, de correction, de test complet ou d’audit de tes fonctions passe par evolution.enqueue (avec "goal") ou capability.audit.',
    'Outils disponibles : ' + JSON.stringify(catalog),
  ].join('\n');
}

/** Runs the tool loop. Returns rows in the native-chat toolResults format. */
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
    if (results.some(r => r.capability === action.tool && JSON.stringify(r.input) === JSON.stringify(action.input))) break;
    try {
      const result = await bus.execute(action.tool, action.input, context);
      results.push({ capability: action.tool, input: action.input, status: 'SUCCEEDED', result: summarize(result) });
    } catch (error) {
      results.push({ capability: action.tool, input: action.input, status: 'FAILED', error: String(error?.code || error?.message || 'CAPABILITY_FAILED') });
    }
  }
  return results.map(({ input, ...row }) => row);
}
