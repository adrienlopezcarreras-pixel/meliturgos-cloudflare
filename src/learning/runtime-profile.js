import { createLearningEngine } from './learning-engine.js';
import { sanitizeInferenceSettings } from './inference-adaptation.js';

const cache = new WeakMap();
const DEFAULT_CACHE_MS = 30_000;

function parseEvidence(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function applyLearnedRuntimeProfile({ model, input = {}, profile = {}, fallbackMaxTokens = 4096 } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { model, payload: input, applied: { settings: false, lora: false } };
  }

  const settings = profile?.settings ? sanitizeInferenceSettings(profile.settings) : null;
  const payload = { ...input };
  const configuredFallback = Math.max(128, Math.min(8192, positiveNumber(fallbackMaxTokens) || 4096));

  if (!positiveNumber(payload.max_tokens)) payload.max_tokens = settings?.max_tokens || configuredFallback;
  if (settings && !Number.isFinite(Number(payload.temperature))) payload.temperature = settings.temperature;
  if (settings && !Number.isFinite(Number(payload.top_p))) payload.top_p = settings.top_p;

  const adapter = profile?.adapter || null;
  const adapterId = String(adapter?.adapter?.id || '').trim();
  const baseModel = String(adapter?.base_model || adapter?.adapter?.base_model || '').trim();
  const canApplyLora = Boolean(adapterId && baseModel && String(model || '') === baseModel && !String(payload.lora || '').trim());
  if (canApplyLora) payload.lora = adapterId;

  return {
    model,
    payload,
    applied: {
      settings: Boolean(settings),
      lora: canApplyLora,
      adapter_id: canApplyLora ? adapterId : null,
      base_model: canApplyLora ? baseModel : null,
    },
  };
}

export async function loadLearnedRuntimeProfile(env, { maxAgeMs = DEFAULT_CACHE_MS } = {}) {
  const db = env?.DB;
  if (!db || (typeof db !== 'object' && typeof db !== 'function')) {
    return { settings: null, adapter: null, loaded_at: Date.now(), source: 'NO_DB' };
  }

  const now = Date.now();
  const cached = cache.get(db);
  if (cached && cached.expires_at > now) return cached.value;

  const learning = createLearningEngine(env);
  const [settingRows, adapter] = await Promise.all([
    learning.memory.recent({ limit: 1, kind: 'INFERENCE_SETTINGS' }),
    learning.activeAdapter(),
  ]);
  const rawSettings = parseEvidence(settingRows?.[0]?.evidence)?.settings || null;
  const value = {
    settings: rawSettings ? sanitizeInferenceSettings(rawSettings) : null,
    adapter: adapter || null,
    loaded_at: now,
    source: 'D1_LEARNING_MEMORY',
  };
  cache.set(db, { expires_at: now + Math.max(1_000, Math.min(300_000, Number(maxAgeMs) || DEFAULT_CACHE_MS)), value });
  return value;
}

export function clearLearnedRuntimeProfileCache(db = null) {
  if (db && (typeof db === 'object' || typeof db === 'function')) cache.delete(db);
}
