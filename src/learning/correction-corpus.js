const MAX_TEXT = 20_000;
const SECRETISH = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,}|(?:api[_ -]?key|token|password|secret|cookie|otp)\s*[:=]\s*[^\s,;]{6,})/i;

function bounded(value, max = MAX_TEXT) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function assertSafeText(label, value) {
  const text = bounded(value);
  if (SECRETISH.test(text)) {
    const error = new Error(`LEARNING_SECRET_REJECTED:${label}`);
    error.code = 'LEARNING_SECRET_REJECTED';
    throw error;
  }
  return text;
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function createCorrectionRecord({
  id = crypto.randomUUID(),
  source = 'teacher',
  domain = 'general',
  task = '',
  input,
  before,
  after,
  rationale,
  tests = [],
  tags = [],
  validated = false,
  quality = 0.5,
  created_at = Date.now(),
} = {}) {
  const record = {
    id: bounded(id, 200),
    source: bounded(source, 80) || 'teacher',
    domain: bounded(domain, 120) || 'general',
    task: assertSafeText('task', task).slice(0, 4000),
    input: assertSafeText('input', input),
    before: assertSafeText('before', before),
    after: assertSafeText('after', after),
    rationale: assertSafeText('rationale', rationale).slice(0, 8000),
    tests: Array.isArray(tests) ? tests.map(x => bounded(x, 300)).filter(Boolean).slice(0, 20) : [],
    tags: Array.isArray(tags) ? tags.map(x => bounded(x, 80)).filter(Boolean).slice(0, 20) : [],
    validated: validated === true,
    quality: clamp01(quality, 0.5),
    created_at: Number(created_at) || Date.now(),
  };

  if (!record.input || !record.before || !record.after || !record.rationale) {
    const error = new Error('LEARNING_CORRECTION_INCOMPLETE');
    error.code = 'LEARNING_CORRECTION_INCOMPLETE';
    throw error;
  }
  if (record.before === record.after) {
    const error = new Error('LEARNING_CORRECTION_NO_CHANGE');
    error.code = 'LEARNING_CORRECTION_NO_CHANGE';
    throw error;
  }
  return record;
}

export function toSftExample(record) {
  const row = createCorrectionRecord(record);
  return {
    id: row.id,
    domain: row.domain,
    quality: row.quality,
    messages: [
      { role: 'system', content: 'Réponds en appliquant les corrections validées de MELITURGOS sans reproduire les erreurs antérieures.' },
      { role: 'user', content: row.input },
      { role: 'assistant', content: row.after },
    ],
    metadata: {
      source: row.source,
      task: row.task,
      rationale: row.rationale,
      tests: row.tests,
      tags: row.tags,
      validated: row.validated,
      created_at: row.created_at,
    },
  };
}

export function toPreferenceExample(record) {
  const row = createCorrectionRecord(record);
  return {
    id: row.id,
    prompt: row.input,
    chosen: row.after,
    rejected: row.before,
    domain: row.domain,
    quality: row.quality,
    metadata: {
      rationale: row.rationale,
      tests: row.tests,
      tags: row.tags,
      validated: row.validated,
      created_at: row.created_at,
    },
  };
}

export function buildTrainingCorpus(records = [], { validatedOnly = true, minQuality = 0.65 } = {}) {
  const normalized = [];
  const rejected = [];
  for (const raw of Array.isArray(records) ? records : []) {
    try {
      const row = createCorrectionRecord(raw);
      if (validatedOnly && !row.validated) {
        rejected.push({ id: row.id, reason: 'NOT_VALIDATED' });
        continue;
      }
      if (row.quality < minQuality) {
        rejected.push({ id: row.id, reason: 'QUALITY_TOO_LOW' });
        continue;
      }
      normalized.push(row);
    } catch (error) {
      rejected.push({ id: raw?.id || null, reason: error?.code || 'INVALID_RECORD' });
    }
  }

  return {
    accepted: normalized.length,
    rejected: rejected.length,
    sft: normalized.map(toSftExample),
    preference: normalized.map(toPreferenceExample),
    rejected_records: rejected,
  };
}

export function summarizeLearning(records = [], benchmarkRuns = []) {
  const rows = (Array.isArray(records) ? records : []).map(raw => {
    try { return createCorrectionRecord(raw); } catch { return null; }
  }).filter(Boolean);
  const validated = rows.filter(x => x.validated);
  const domains = {};
  for (const row of validated) {
    if (!domains[row.domain]) domains[row.domain] = { count: 0, quality_sum: 0 };
    domains[row.domain].count += 1;
    domains[row.domain].quality_sum += row.quality;
  }
  for (const value of Object.values(domains)) {
    value.average_quality = value.count ? value.quality_sum / value.count : 0;
    delete value.quality_sum;
  }

  const runs = Array.isArray(benchmarkRuns) ? benchmarkRuns.filter(Boolean) : [];
  const baseline = runs.find(x => x.kind === 'baseline') || null;
  const latest = runs.length ? runs[runs.length - 1] : null;
  const baselineScore = baseline ? Number(baseline.score) : null;
  const latestScore = latest ? Number(latest.score) : null;

  return {
    corrections_recorded: rows.length,
    corrections_validated: validated.length,
    validation_rate: rows.length ? validated.length / rows.length : 0,
    average_validated_quality: validated.length ? validated.reduce((n, x) => n + x.quality, 0) / validated.length : 0,
    domains,
    benchmark: {
      runs: runs.length,
      baseline_score: Number.isFinite(baselineScore) ? baselineScore : null,
      latest_score: Number.isFinite(latestScore) ? latestScore : null,
      absolute_gain: Number.isFinite(baselineScore) && Number.isFinite(latestScore) ? latestScore - baselineScore : null,
    },
  };
}

export function decideAdapterPromotion({
  baseline,
  candidate,
  minOverallGain = 0.02,
  maxDomainRegression = 0.03,
} = {}) {
  const baseOverall = Number(baseline?.overall);
  const candOverall = Number(candidate?.overall);
  if (!Number.isFinite(baseOverall) || !Number.isFinite(candOverall)) {
    return { promote: false, reason: 'MISSING_BENCHMARK' };
  }
  const overallGain = candOverall - baseOverall;
  const regressions = [];
  const baseDomains = baseline?.domains || {};
  const candDomains = candidate?.domains || {};
  for (const [domain, baseScoreRaw] of Object.entries(baseDomains)) {
    const baseScore = Number(baseScoreRaw);
    const candScore = Number(candDomains[domain]);
    if (!Number.isFinite(baseScore) || !Number.isFinite(candScore)) continue;
    const delta = candScore - baseScore;
    if (delta < -Math.abs(maxDomainRegression)) regressions.push({ domain, delta });
  }
  if (regressions.length) return { promote: false, reason: 'DOMAIN_REGRESSION', overall_gain: overallGain, regressions };
  if (overallGain < minOverallGain) return { promote: false, reason: 'INSUFFICIENT_GAIN', overall_gain: overallGain, regressions: [] };
  return { promote: true, reason: 'BENCHMARK_IMPROVED', overall_gain: overallGain, regressions: [] };
}

export const learningPolicy = Object.freeze({
  training_requires_validated_examples: true,
  minimum_quality: 0.65,
  secrets_allowed_in_training_corpus: false,
  base_model_weights_frozen_by_default: true,
  adapter_promotion_requires_benchmark_gain: true,
});
