// Hard daily Workers AI budget. The account is on Workers Paid, where neurons
// beyond the 10,000/day free allocation are billed instead of refused
// (≈ $70 in October 2026). Every env.AI.run() goes through this meter: once the
// day's estimated neurons reach the cap, calls are refused until 00:00 UTC,
// when Cloudflare resets the free allocation. Unreadable budget = refused.

export const DEFAULT_DAILY_NEURON_CAP = 9000;
// Background work (crons: MAX, mentor, watches) may only use this share of the
// day, so the owner's chat still answers once autonomy has spent its part
// (55 chat calls refused on 25/10).
export const BACKGROUND_NEURON_SHARE = 0.6;

// Neurons per million tokens [input, output], from Cloudflare Workers AI
// pricing. Unknown text models use the most expensive known rates.
const TEXT_RATES = {
  '@cf/openai/gpt-oss-120b': [31818, 68182],
  '@cf/openai/gpt-oss-20b': [18182, 27273],
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': [26668, 204805],
  '@cf/qwen/qwen2.5-coder-32b-instruct': [60000, 90909],
  '@cf/meta/llama-3.1-8b-instruct-fast': [4119, 34868],
  '@cf/meta/llama-3.1-8b-instruct-fp8': [4119, 34868],
};
const UNKNOWN_TEXT_RATE = [60000, 204805];
// Per call, for models not priced per token (images, speech, embeddings).
const FLAT_RATES = [
  [/flux|stable-diffusion|dreamshaper|lucid|phoenix|image/i, 2000],
  [/whisper|melotts|aura|tts|speech|deepgram/i, 500],
  [/bge|embed|reranker/i, 50],
];

const utcDay = now => new Date(now).toISOString().slice(0, 10);
const chars = value => (typeof value === 'string' ? value.length : JSON.stringify(value ?? '').length);

export function estimateNeurons(model, inputs = {}, output) {
  const id = String(model || '');
  const flat = FLAT_RATES.find(([pattern]) => pattern.test(id));
  if (flat && !TEXT_RATES[id]) return flat[1];
  const [rateIn, rateOut] = TEXT_RATES[id] || UNKNOWN_TEXT_RATE;
  const usage = output && typeof output === 'object' && !(output instanceof ReadableStream) ? output.usage : null;
  const promptTokens = Number(usage?.prompt_tokens) || Math.ceil(chars(inputs?.messages ?? inputs?.prompt ?? inputs?.input ?? inputs) / 4);
  // Streams carry no usage: charge the requested ceiling.
  const completionTokens = Number(usage?.completion_tokens)
    || (output && typeof output === 'object' && !(output instanceof ReadableStream)
      ? Math.ceil(chars(output.response ?? output.output ?? output) / 4)
      : Number(inputs?.max_tokens) || 1024);
  return (promptTokens * rateIn + completionTokens * rateOut) / 1e6;
}

const schemaReady = new WeakMap();
async function ensureSchema(db) {
  if (!schemaReady.has(db)) {
    schemaReady.set(db, db.prepare('CREATE TABLE IF NOT EXISTS mel_ai_neuron_budget (day TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, refused INTEGER NOT NULL DEFAULT 0)').run()
      .catch(error => { schemaReady.delete(db); throw error; }));
  }
  return schemaReady.get(db);
}

function budgetError(code, detail) {
  return Object.assign(new Error(`${code}${detail ? ':' + detail : ''}`), { code, status: 429 });
}

export async function readNeuronBudget(db, { now = Date.now(), cap = DEFAULT_DAILY_NEURON_CAP } = {}) {
  await ensureSchema(db);
  const day = utcDay(now);
  const row = await db.prepare('SELECT neurons, calls, refused FROM mel_ai_neuron_budget WHERE day = ?').bind(day).first();
  return { day, cap, neurons: Number(row?.neurons || 0), calls: Number(row?.calls || 0), refused: Number(row?.refused || 0) };
}

export function withNeuronBudget(env, { now = () => Date.now(), background = false } = {}) {
  const ai = env?.AI;
  if (!ai || ai.__melNeuronBudget || !env?.DB) return env;
  const db = env.DB;
  const dayCap = Number(env.MEL_AI_DAILY_NEURON_CAP) > 0 ? Number(env.MEL_AI_DAILY_NEURON_CAP) : DEFAULT_DAILY_NEURON_CAP;
  const cap = background ? Math.floor(dayCap * BACKGROUND_NEURON_SHARE) : dayCap;
  const run = async (model, inputs, options) => {
    let budget;
    try { budget = await readNeuronBudget(db, { now: now(), cap }); }
    catch { throw budgetError('WORKERS_AI_NEURON_BUDGET_UNAVAILABLE'); }
    if (budget.neurons >= cap) {
      await db.prepare('UPDATE mel_ai_neuron_budget SET refused = refused + 1 WHERE day = ?').bind(budget.day).run().catch(() => null);
      throw budgetError('WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED', `${Math.round(budget.neurons)}/${cap}`);
    }
    let output;
    try { output = await ai.run(model, inputs, options); }
    finally {
      const spent = estimateNeurons(model, inputs, output);
      await db.prepare('INSERT INTO mel_ai_neuron_budget (day, neurons, calls) VALUES (?, ?, 1) ON CONFLICT(day) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1')
        .bind(budget.day, spent).run().catch(() => null);
    }
    return output;
  };
  const metered = new Proxy(ai, {
    get(target, prop) {
      if (prop === 'run') return run;
      if (prop === '__melNeuronBudget') return true;
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { ...env, AI: metered };
}
