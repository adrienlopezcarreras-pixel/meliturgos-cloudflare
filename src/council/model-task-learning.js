const SCHEMA = 'mel.council.model-task-learning/v1';
const DEFAULT_WEIGHTS = Object.freeze({ quality: 0.5, reliability: 0.25, latency: 0.15, cost: 0.1 });

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function finite(value, code, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(code);
  return value;
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('MODEL_LEARNING_EVIDENCE_REQUIRED');
  }
  if (evidence.verified !== true) throw new Error('MODEL_LEARNING_EVIDENCE_NOT_VERIFIED');
  return freezeDeep({
    verified: true,
    source: required(evidence.source, 'MODEL_LEARNING_EVIDENCE_SOURCE_REQUIRED'),
    evaluation_id: required(evidence.evaluation_id, 'MODEL_LEARNING_EVALUATION_ID_REQUIRED')
  });
}

function normalizeOutcome(input, sequence) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('MODEL_LEARNING_OUTCOME_INVALID');
  }
  if (typeof input.success !== 'boolean') throw new Error('MODEL_LEARNING_SUCCESS_REQUIRED');

  return freezeDeep({
    idempotency_key: required(input.idempotencyKey, 'MODEL_LEARNING_IDEMPOTENCY_KEY_REQUIRED'),
    task_type: required(input.taskType, 'MODEL_LEARNING_TASK_TYPE_REQUIRED'),
    model_id: required(input.modelId, 'MODEL_LEARNING_MODEL_ID_REQUIRED'),
    quality: finite(input.quality, 'MODEL_LEARNING_QUALITY_INVALID', { min: 0, max: 1 }),
    latency_ms: finite(input.latencyMs, 'MODEL_LEARNING_LATENCY_INVALID', { min: 0 }),
    cost_eur: finite(input.costEur, 'MODEL_LEARNING_COST_INVALID', { min: 0 }),
    success: input.success,
    evidence: normalizeEvidence(input.evidence),
    metadata: freezeDeep(clone(input.metadata || {})),
    sequence
  });
}

function normalizeWeights(weights = DEFAULT_WEIGHTS) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    throw new Error('MODEL_LEARNING_WEIGHTS_INVALID');
  }
  const normalized = {
    quality: finite(weights.quality ?? 0, 'MODEL_LEARNING_WEIGHTS_INVALID', { min: 0 }),
    reliability: finite(weights.reliability ?? 0, 'MODEL_LEARNING_WEIGHTS_INVALID', { min: 0 }),
    latency: finite(weights.latency ?? 0, 'MODEL_LEARNING_WEIGHTS_INVALID', { min: 0 }),
    cost: finite(weights.cost ?? 0, 'MODEL_LEARNING_WEIGHTS_INVALID', { min: 0 })
  };
  const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error('MODEL_LEARNING_WEIGHTS_INVALID');
  return freezeDeep(Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, value / total])));
}

function publicValue(value) {
  return freezeDeep(clone(value));
}

export class ModelTaskLearningRegistry {
  constructor({ snapshot = null } = {}) {
    this.outcomes = new Map();
    this.sequence = 0;
    if (snapshot) this.importSnapshot(snapshot);
  }

  record(input) {
    const nextSequence = this.sequence + 1;
    const outcome = normalizeOutcome(input, nextSequence);
    const existing = this.outcomes.get(outcome.idempotency_key);
    if (existing) {
      const comparable = { ...outcome, sequence: existing.sequence };
      if (stableJson(comparable) !== stableJson(existing)) {
        throw new Error('MODEL_LEARNING_IDEMPOTENCY_CONFLICT');
      }
      return publicValue(existing);
    }
    this.sequence = nextSequence;
    this.outcomes.set(outcome.idempotency_key, outcome);
    return publicValue(outcome);
  }

  list({ taskType = null, modelId = null } = {}) {
    const rows = [...this.outcomes.values()]
      .filter(row => !taskType || row.task_type === taskType)
      .filter(row => !modelId || row.model_id === modelId)
      .sort((a, b) => a.sequence - b.sequence)
      .map(publicValue);
    return freezeDeep(rows);
  }

  summary(taskType, modelId) {
    const normalizedTask = required(taskType, 'MODEL_LEARNING_TASK_TYPE_REQUIRED');
    const normalizedModel = required(modelId, 'MODEL_LEARNING_MODEL_ID_REQUIRED');
    const rows = this.list({ taskType: normalizedTask, modelId: normalizedModel });
    if (rows.length === 0) return null;

    const samples = rows.length;
    const successes = rows.filter(row => row.success).length;
    const totalQuality = rows.reduce((sum, row) => sum + row.quality, 0);
    const totalLatency = rows.reduce((sum, row) => sum + row.latency_ms, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.cost_eur, 0);

    return freezeDeep({
      task_type: normalizedTask,
      model_id: normalizedModel,
      samples,
      successes,
      reliability: round(successes / samples),
      avg_quality: round(totalQuality / samples),
      avg_latency_ms: round(totalLatency / samples, 3),
      avg_cost_eur: round(totalCost / samples, 8),
      last_sequence: rows.at(-1).sequence
    });
  }

  rank(taskType, {
    allowedModels = null,
    maxCostEur = 0,
    minReliability = 0,
    minSamples = 1,
    fullConfidenceSamples = 5,
    latencyTargetMs = 5000,
    weights = DEFAULT_WEIGHTS
  } = {}) {
    const normalizedTask = required(taskType, 'MODEL_LEARNING_TASK_TYPE_REQUIRED');
    const normalizedWeights = normalizeWeights(weights);
    finite(maxCostEur, 'MODEL_LEARNING_MAX_COST_INVALID', { min: 0 });
    finite(minReliability, 'MODEL_LEARNING_MIN_RELIABILITY_INVALID', { min: 0, max: 1 });
    finite(minSamples, 'MODEL_LEARNING_MIN_SAMPLES_INVALID', { min: 1 });
    finite(fullConfidenceSamples, 'MODEL_LEARNING_CONFIDENCE_SAMPLES_INVALID', { min: 1 });
    finite(latencyTargetMs, 'MODEL_LEARNING_LATENCY_TARGET_INVALID', { min: Number.EPSILON });

    const allow = allowedModels == null
      ? null
      : new Set(allowedModels.map(value => required(value, 'MODEL_LEARNING_MODEL_ID_REQUIRED')));
    const modelIds = [...new Set(this.list({ taskType: normalizedTask }).map(row => row.model_id))].sort();
    const ranked = [];

    for (const modelId of modelIds) {
      if (allow && !allow.has(modelId)) continue;
      const stats = this.summary(normalizedTask, modelId);
      if (!stats || stats.samples < minSamples) continue;
      if (stats.reliability < minReliability) continue;
      if (stats.avg_cost_eur > maxCostEur) continue;

      const qualityScore = stats.avg_quality;
      const reliabilityScore = stats.reliability;
      const latencyScore = 1 / (1 + stats.avg_latency_ms / latencyTargetMs);
      const costScore = maxCostEur === 0
        ? (stats.avg_cost_eur === 0 ? 1 : 0)
        : Math.max(0, 1 - stats.avg_cost_eur / maxCostEur);
      const confidence = Math.min(1, stats.samples / fullConfidenceSamples);
      const rawScore =
        normalizedWeights.quality * qualityScore +
        normalizedWeights.reliability * reliabilityScore +
        normalizedWeights.latency * latencyScore +
        normalizedWeights.cost * costScore;
      const score = rawScore * (0.5 + confidence * 0.5);

      ranked.push(freezeDeep({
        ...stats,
        score: round(score),
        confidence: round(confidence),
        components: freezeDeep({
          quality: round(qualityScore),
          reliability: round(reliabilityScore),
          latency: round(latencyScore),
          cost: round(costScore)
        })
      }));
    }

    ranked.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.model_id.localeCompare(b.model_id));
    return freezeDeep(ranked);
  }

  recommend(taskType, options = {}) {
    return this.rank(taskType, options)[0] || null;
  }

  exportSnapshot() {
    return freezeDeep({
      schema: SCHEMA,
      outcomes: [...this.outcomes.values()]
        .sort((a, b) => a.sequence - b.sequence)
        .map(publicValue)
    });
  }

  importSnapshot(snapshot) {
    if (snapshot?.schema !== SCHEMA || !Array.isArray(snapshot.outcomes)) {
      throw new Error('MODEL_LEARNING_SNAPSHOT_INVALID');
    }
    if (this.outcomes.size) throw new Error('MODEL_LEARNING_IMPORT_REQUIRES_EMPTY');

    const ordered = [...snapshot.outcomes].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    for (const row of ordered) {
      const expectedSequence = this.sequence + 1;
      if (row.sequence !== expectedSequence) throw new Error('MODEL_LEARNING_SNAPSHOT_INVALID');
      this.record({
        idempotencyKey: row.idempotency_key,
        taskType: row.task_type,
        modelId: row.model_id,
        quality: row.quality,
        latencyMs: row.latency_ms,
        costEur: row.cost_eur,
        success: row.success,
        evidence: row.evidence,
        metadata: row.metadata
      });
    }
    return this;
  }
}

export const MODEL_TASK_LEARNING_SCHEMA = SCHEMA;
export const MODEL_TASK_DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
