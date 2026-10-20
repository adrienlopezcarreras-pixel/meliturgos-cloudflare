// Live progress for MEL's chat: what she is doing, which tools she uses and
// what she produced, streamed while she works (like an agent's progress panel).
//
// The route answers at once with NDJSON. `progress` events describe each step
// (running → done/failed); the handler's own answer follows: its NDJSON stream
// is passed through, a JSON answer becomes `delta` + `done` with the full
// result, so the browser keeps every field it used before.

import { requireAuth } from '../core/security.js';

const encoder = new TextEncoder();

const LABELS = Object.freeze({
  'web.research': 'Recherche sur le web',
  'knowledge.research': 'Recherche documentaire',
  'code.read': 'Lecture de mon code',
  'code.search': 'Recherche dans mon code',
  'self.state': 'Vérification de mon état réel',
  'computer.status': 'État de ton PC (Companion)',
  'computer.quick': 'Action rapide sur ton PC',
  'computer.agent': 'Action sur ton PC',
  'model.council': 'Consultation de plusieurs modèles',
  'work.run': 'Travail de fond',
  'work.plan.list': 'Lecture de mes travaux',
  'work.plan.save': 'Enregistrement d’un plan',
  'capability.audit': 'Test de mes capacités',
  'chatgpt.history.search': 'Recherche dans nos anciennes conversations',
  'autonomy.status': 'État de mon autonomie',
  'autonomy.run': 'Avancée de mon auto-développement',
  'memory.search': 'Recherche dans ma mémoire',
  'memory.write': 'Mémorisation',
});

export function capabilityLabel(id) {
  const key = String(id || '');
  if (LABELS[key]) return LABELS[key];
  if (key.startsWith('google.') || key.startsWith('gmail') || key.includes('calendar') || key.includes('drive')) return 'Tes données connectées (' + key + ')';
  if (key.startsWith('media.image')) return 'Image (' + key + ')';
  if (key.startsWith('computer.')) return 'Ton PC (' + key + ')';
  return key || 'Action';
}

/** One short, factual line about a tool result (counts only, never content). */
export function resultDetail(result) {
  if (!result || typeof result !== 'object') return '';
  const n = key => (Array.isArray(result[key]) ? result[key].length : null);
  const sources = n('sources') ?? n('citations');
  if (sources != null) return sources + ' source(s)';
  const items = n('results') ?? n('items') ?? n('matches') ?? n('devices') ?? n('files');
  if (items != null) return items + ' résultat(s)';
  if (typeof result.status === 'string') return result.status.toLowerCase();
  return '';
}

/** Report every CapabilityBus execution of this request as a progress step. */
export function instrumentBus(runtime, onProgress) {
  const bus = runtime?.bus;
  if (!bus || typeof bus.execute !== 'function' || typeof onProgress !== 'function' || bus.__melProgress) return runtime;
  const execute = bus.execute.bind(bus);
  let seq = 0;
  bus.execute = async (id, input, context) => {
    const stepId = 'tool-' + (++seq) + '-' + String(id);
    const started = Date.now();
    const kind = String(id || '').startsWith('computer.') ? 'pc' : 'tool';
    try { onProgress({ id: stepId, kind, tool: String(id), label: capabilityLabel(id), status: 'running' }); } catch {}
    try {
      const result = await execute(id, input, context);
      try { onProgress({ id: stepId, kind, tool: String(id), label: capabilityLabel(id), status: 'done', detail: resultDetail(result), ms: Date.now() - started }); } catch {}
      return result;
    } catch (error) {
      try { onProgress({ id: stepId, kind, tool: String(id), label: capabilityLabel(id), status: 'failed', detail: String(error?.code || error?.message || 'ÉCHEC').slice(0, 90), ms: Date.now() - started }); } catch {}
      throw error;
    }
  };
  bus.__melProgress = true;
  return runtime;
}

function shortModel(model) { return String(model || '').replace(/^@cf\/[^/]+\//, ''); }

// Shorter than the browser idle abort (45 s). A silent tool or model call
// must not look like a dead stream.
export const CHAT_PROGRESS_HEARTBEAT_MS = 12_000;

/** Wraps the chat handler: streamed progress, then the answer. */
export async function withChatProgress(request, env, options, handler) {
  let body = null;
  try { body = await request.clone().json(); } catch { body = null; }
  if (!body || body.stream !== true || request.method !== 'POST') return handler(request, env, options);
  if (options?.authorized !== true) {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
  }
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = event => { if (!open) return; try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch {} };
      const progress = step => send({ type: 'progress', ...step });
      progress({ id: 'read', kind: 'step', label: 'Je lis ta demande et rassemble le contexte', status: 'running' });
      let readDone = false;
      const finishRead = () => { if (!readDone) { readDone = true; progress({ id: 'read', kind: 'step', label: 'Je lis ta demande et rassemble le contexte', status: 'done' }); } };
      let heartbeatShown = false;
      const heartbeat = setInterval(() => {
        heartbeatShown = true;
        progress({ id: 'heartbeat', kind: 'step', label: 'Je continue, un outil ou le modèle travaille encore', status: 'running' });
      }, CHAT_PROGRESS_HEARTBEAT_MS);
      try {
        const response = await handler(request, env, { ...options, onProgress: step => { finishRead(); progress(step); } });
        finishRead();
        const type = response.headers.get('content-type') || '';
        if (type.includes('application/x-ndjson') && response.body) {
          // Pass the model's own stream through, marking the writing step.
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let writing = false;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index;
            while ((index = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, index);
              buffer = buffer.slice(index + 1);
              if (!line.trim()) continue;
              let event = null;
              try { event = JSON.parse(line); } catch { continue; }
              if (event.type === 'start' && !writing) { writing = true; progress({ id: 'write', kind: 'step', label: 'Rédaction de la réponse', status: 'running', detail: shortModel(event.model) }); }
              if (event.type === 'model') progress({ id: 'write', kind: 'step', label: 'Rédaction de la réponse', status: 'running', detail: shortModel(event.model) + ' (relais)' });
              if (event.type === 'done' && writing) progress({ id: 'write', kind: 'step', label: 'Rédaction de la réponse', status: 'done', detail: shortModel(event.model) });
              if (event.type === 'error' && writing) progress({ id: 'write', kind: 'step', label: 'Rédaction de la réponse', status: 'failed', detail: String(event.code || '') });
              send(event);
            }
          }
          if (buffer.trim()) { try { send(JSON.parse(buffer)); } catch {} }
          return;
        }
        let data = {};
        try { data = await response.json(); } catch { data = {}; }
        if (!response.ok && !(data?.text || data?.response)) {
          send({ type: 'error', code: String(data?.code || data?.error || ('HTTP ' + response.status)), status: response.status });
          return;
        }
        const text = String(data?.text || data?.response || '');
        if (data?.model) progress({ id: 'write', kind: 'step', label: 'Rédaction de la réponse', status: 'done', detail: shortModel(data.model) });
        send({ type: 'start', model: data?.model || null });
        if (text) send({ type: 'delta', text });
        const { text: _t, response: _r, ...rest } = data || {};
        send({ type: 'done', model: data?.model || null, archived: data?.archive_saved === true, truncated: data?.response_truncated === true, result: rest });
      } catch (error) {
        finishRead();
        send({ type: 'error', code: String(error?.code || error?.message || 'CHAT_FAILED').slice(0, 120) });
      } finally {
        clearInterval(heartbeat);
        if (heartbeatShown) progress({ id: 'heartbeat', kind: 'step', label: 'Cette réponse est terminée', status: 'done' });
        open = false;
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-mel-progress': '1' } });
}
