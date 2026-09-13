import fs from 'node:fs';

const file = 'src/api/native-chat.js';
let src = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (!src.includes(before)) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  src = src.replace(before, after);
}

replaceOnce(
  "import { classifyCapabilityTruth, declaredImplementationStatus } from '../diagnostics/capability-truth-audit.js';\n",
  "import { classifyCapabilityTruth, declaredImplementationStatus } from '../diagnostics/capability-truth-audit.js';\nimport { LearningEngine } from '../learning/learning-engine.js';\nimport { MentorMemoryRepository } from '../learning/mentor-memory.js';\n",
  'learning-imports'
);

replaceOnce(
  "async function loadCognitiveMemory(env) {",
  "export async function loadCognitiveMemory(env, limit = 12) {",
  'memory-export'
);
replaceOnce(
  ".slice(0, 12);",
  ".slice(0, Math.max(1, Math.min(32, Number(limit) || 12)));",
  'memory-limit'
);

const oldRouter = `function createNativeModelRouter(env) {\n  const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(env) });\n  return new ModelRouter({\n    augmentio,\n    maxCalls: 3,\n    invoke: async (selected, messages) => env.AI.run(selected.model_id || selected.id, { messages }),\n  });\n}\n\nexport async function runNativeInference({ env, messages, text, parallel = false, maxCandidates = 4 } = {}) {\n  if (!env?.AI || typeof env.AI.run !== 'function') {\n    const error = new Error('AI_BINDING_MISSING');\n    error.code = 'AI_BINDING_MISSING';\n    throw error;\n  }\n  const router = createNativeModelRouter(env);\n  const task = classifyTask(text || '');\n  return router.execute({\n    task,\n    messages,\n    parallel: Boolean(parallel),\n    maxCandidates: Math.max(1, Math.min(12, Number(maxCandidates) || 4)),\n  }, { source: 'native-chat' });\n}\n`;

const newRouter = `export function inferenceGenerationOptions(settings = null) {\n  if (!settings || typeof settings !== 'object') return {};\n  const out = {};\n  if (Number.isFinite(Number(settings.temperature))) out.temperature = Number(settings.temperature);\n  if (Number.isFinite(Number(settings.top_p))) out.top_p = Number(settings.top_p);\n  if (Number.isFinite(Number(settings.max_tokens)) && Number(settings.max_tokens) > 0) out.max_tokens = Math.round(Number(settings.max_tokens));\n  return out;\n}\n\nasync function activePromotedInferenceSettings(env) {\n  if (!env?.DB) return null;\n  try {\n    const memory = new MentorMemoryRepository(env.DB);\n    const rows = await memory.recent({ limit: 1, kind: 'INFERENCE_SETTINGS' });\n    if (!rows.length) return null;\n    return await new LearningEngine({ memory }).activeInferenceSettings();\n  } catch {\n    return null;\n  }\n}\n\nfunction createNativeModelRouter(env, inferenceSettings = null) {\n  const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(env) });\n  const generation = inferenceGenerationOptions(inferenceSettings);\n  return new ModelRouter({\n    augmentio,\n    maxCalls: 3,\n    invoke: async (selected, messages) => env.AI.run(selected.model_id || selected.id, { messages, ...generation }),\n  });\n}\n\nexport async function runNativeInference({ env, messages, text, parallel = false, maxCandidates = 4, inferenceSettings = null } = {}) {\n  if (!env?.AI || typeof env.AI.run !== 'function') {\n    const error = new Error('AI_BINDING_MISSING');\n    error.code = 'AI_BINDING_MISSING';\n    throw error;\n  }\n  const router = createNativeModelRouter(env, inferenceSettings);\n  const task = classifyTask(text || '');\n  return router.execute({\n    task,\n    messages,\n    parallel: Boolean(parallel),\n    maxCandidates: Math.max(1, Math.min(12, Number(maxCandidates) || 4)),\n  }, { source: 'native-chat', inference_settings: inferenceSettings || null });\n}\n`;
replaceOnce(oldRouter, newRouter, 'model-router-runtime');

replaceOnce(
  "  const memoryWrite = await rememberExplicit(env, text);\n  const retrieved = await loadCognitiveMemory(env);\n",
  "  const memoryWrite = await rememberExplicit(env, text);\n  const activeInferenceSettings = await activePromotedInferenceSettings(env);\n  const retrieved = await loadCognitiveMemory(env, activeInferenceSettings?.memory_results ?? 12);\n",
  'active-settings-memory'
);

replaceOnce(
  "  const ai = await runNativeInference({ env, messages, text, parallel, maxCandidates: body.max_candidates ?? env.MEL_AUGMENTIO_MAX_CANDIDATES ?? 4 });",
  "  const ai = await runNativeInference({ env, messages, text, parallel, maxCandidates: body.max_candidates ?? env.MEL_AUGMENTIO_MAX_CANDIDATES ?? activeInferenceSettings?.council_min_responses ?? 4, inferenceSettings: activeInferenceSettings });",
  'active-settings-inference'
);

replaceOnce(
  "    memory_reason: memoryWrite.reason || null,\n    active_theme: theme,",
  "    memory_reason: memoryWrite.reason || null,\n    active_inference_settings: activeInferenceSettings,\n    inference_settings_applied: activeInferenceSettings ? { generation: ['temperature','top_p','max_tokens'], memory: ['memory_results'], council: parallel ? ['council_min_responses'] : [], review_passes: 'not_supported_in_single-pass-chat' } : null,\n    active_theme: theme,",
  'response-evidence'
);

fs.writeFileSync(file, src);

const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { inferenceGenerationOptions, runNativeInference, loadCognitiveMemory } from '../src/api/native-chat.js';\n\ntest('promoted inference generation settings reach the direct AI payload', async () => {\n  const calls = [];\n  const env = { AI: { run: async (model, payload) => { calls.push({ model, payload }); return { response: 'ok' }; } } };\n  const settings = { temperature: 0.22, top_p: 0.81, max_tokens: 3072, memory_results: 7, review_passes: 2, council_min_responses: 3 };\n  const result = await runNativeInference({ env, messages: [{ role: 'user', content: 'hello' }], text: 'hello', inferenceSettings: settings });\n  assert.equal(result.text, 'ok');\n  assert.equal(calls.length, 1);\n  assert.equal(calls[0].payload.temperature, 0.22);\n  assert.equal(calls[0].payload.top_p, 0.81);\n  assert.equal(calls[0].payload.max_tokens, 3072);\n  assert.equal('review_passes' in calls[0].payload, false);\n  assert.equal('memory_results' in calls[0].payload, false);\n});\n\ntest('no promoted settings preserves provider defaults', async () => {\n  const options = inferenceGenerationOptions(null);\n  assert.deepEqual(options, {});\n  const calls = [];\n  const env = { AI: { run: async (_model, payload) => { calls.push(payload); return { response: 'ok' }; } } };\n  await runNativeInference({ env, messages: [{ role: 'user', content: 'hello' }], text: 'hello' });\n  assert.deepEqual(Object.keys(calls[0]).sort(), ['messages']);\n});\n\ntest('memory_results bounds the cognitive-memory retrieval count', async () => {\n  const rows = Array.from({ length: 20 }, (_, i) => ({ content: 'm' + i, importance: 20 - i, source: 'test', created_at: i }));\n  const env = { DB: { prepare(sql) { return { bind() { return this; }, async run() { return { success: true }; }, async all() { return sql.includes('SELECT * FROM memories') ? { results: rows } : { results: [] }; } }; } } };\n  const retrieved = await loadCognitiveMemory(env, 5);\n  assert.equal(retrieved.count, 5);\n});\n`;
fs.writeFileSync('tests/native-chat-inference-settings.test.mjs', test);
console.log('runtime learning settings wired');
