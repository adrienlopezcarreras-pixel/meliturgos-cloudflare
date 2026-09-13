const DEFAULT_SETTINGS = Object.freeze({ temperature: 0.35, top_p: 0.9, max_tokens: 4096, memory_results: 12, review_passes: 1, council_min_responses: 2 });

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function sanitizeInferenceSettings(settings = {}) {
  return {
    temperature: clamp(settings.temperature, 0, 2, DEFAULT_SETTINGS.temperature),
    top_p: clamp(settings.top_p, 0.1, 1, DEFAULT_SETTINGS.top_p),
    max_tokens: Math.round(clamp(settings.max_tokens, 128, 8192, DEFAULT_SETTINGS.max_tokens)),
    memory_results: Math.round(clamp(settings.memory_results, 1, 32, DEFAULT_SETTINGS.memory_results)),
    review_passes: Math.round(clamp(settings.review_passes, 0, 4, DEFAULT_SETTINGS.review_passes)),
    council_min_responses: Math.round(clamp(settings.council_min_responses, 1, 8, DEFAULT_SETTINGS.council_min_responses)),
  };
}

export function settingsFingerprint(settings = {}) {
  const row = sanitizeInferenceSettings(settings);
  return JSON.stringify(row);
}

export function proposeNeighborSettings(current = {}, signal = {}) {
  const next = sanitizeInferenceSettings(current);
  const joined = (Array.isArray(signal.errors) ? signal.errors : []).map(String).join(' ').toLowerCase();
  if (/hallucin|invent|precision|format|instruction/.test(joined)) {
    next.temperature = Math.max(0, Number((next.temperature - 0.1).toFixed(2)));
    next.top_p = Math.max(0.55, Number((next.top_p - 0.05).toFixed(2)));
    next.review_passes = Math.min(4, next.review_passes + 1);
  }
  if (/trunc|incomplete|omission/.test(joined)) {
    next.max_tokens = Math.min(8192, next.max_tokens + 1024);
    next.review_passes = Math.min(4, next.review_passes + 1);
  }
  if (/memory|forgot|context|preference/.test(joined)) next.memory_results = Math.min(32, next.memory_results + 4);
  if (/code|regression|test/.test(joined)) {
    next.council_min_responses = Math.min(8, next.council_min_responses + 1);
    next.review_passes = Math.min(4, next.review_passes + 1);
  }
  if (signal.too_slow === true && signal.quality_ok === true) {
    next.review_passes = Math.max(0, next.review_passes - 1);
    next.council_min_responses = Math.max(1, next.council_min_responses - 1);
  }
  return sanitizeInferenceSettings(next);
}

export function chooseBestSettings(trials = [], { current = DEFAULT_SETTINGS, minimumTrials = 3, minimumGain = 0.02 } = {}) {
  const groups = new Map();
  for (const trial of Array.isArray(trials) ? trials : []) {
    const score = Number(trial?.score);
    if (!Number.isFinite(score)) continue;
    const settings = sanitizeInferenceSettings(trial.settings || {});
    const key = settingsFingerprint(settings);
    const row = groups.get(key) || { settings, scores: [], failures: 0 };
    row.scores.push(Math.max(0, Math.min(1, score)));
    if (trial.failed === true) row.failures += 1;
    groups.set(key, row);
  }
  const ranked = [...groups.values()].map(row => {
    const mean = row.scores.reduce((n, x) => n + x, 0) / row.scores.length;
    const failureRate = row.failures / row.scores.length;
    return { ...row, trials: row.scores.length, score: mean - failureRate * 0.1 };
  }).filter(row => row.trials >= minimumTrials).sort((a, b) => b.score - a.score || b.trials - a.trials);
  const active = sanitizeInferenceSettings(current);
  const activeKey = settingsFingerprint(active);
  const activeRow = ranked.find(row => settingsFingerprint(row.settings) === activeKey) || null;
  const best = ranked[0] || null;
  if (!best) return { promote: false, reason: 'INSUFFICIENT_TRIALS', active, candidate: null };
  const activeScore = activeRow?.score ?? null;
  if (settingsFingerprint(best.settings) === activeKey) return { promote: false, reason: 'ACTIVE_ALREADY_BEST', active, candidate: best.settings, candidate_score: best.score, active_score: activeScore };
  if (Number.isFinite(activeScore) && best.score - activeScore < minimumGain) return { promote: false, reason: 'INSUFFICIENT_GAIN', active, candidate: best.settings, candidate_score: best.score, active_score: activeScore };
  return { promote: true, reason: 'MEASURED_GAIN', active, candidate: best.settings, candidate_score: best.score, active_score: activeScore };
}

export { DEFAULT_SETTINGS };
