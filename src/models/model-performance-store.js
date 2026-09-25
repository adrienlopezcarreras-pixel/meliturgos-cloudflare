const DEFAULT_TASK = 'GENERAL';
const MIN_DYNAMIC_SAMPLES = 3;
const MAX_LATENCY_MS = 120000;

function bounded(value, min = 0, max = 1, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanTask(value) {
  return String(value || DEFAULT_TASK).trim().toUpperCase().slice(0, 48) || DEFAULT_TASK;
}

function cleanModelId(value) {
  return String(value || '').trim().slice(0, 240);
}

function normalizedCost(model) {
  const cost = Number(model?.cost);
  if (Number.isFinite(cost) && cost >= 0) return cost;
  return null;
}

function latencyUtility(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return 0.5;
  return 1 / (1 + (Math.min(value, MAX_LATENCY_MS) / 2500));
}

function costUtility(model) {
  const cost = normalizedCost(model);
  if (cost === 0) return 1;
  if (cost == null) return 0.15;
  return 1 / (1 + cost);
}

export function modelPerformanceScore(model, stats = null) {
  if (!stats) return null;
  const samples = Math.max(0, Number(stats.samples) || 0);
  const benchmarkSamples = Math.max(0, Number(stats.benchmark_samples) || 0);
  if (samples < MIN_DYNAMIC_SAMPLES && benchmarkSamples < 1) return null;

  const successes = Math.max(0, Number(stats.successes) || 0);
  const successRate = samples > 0 ? bounded(successes / samples, 0, 1, 0.5) : 0.5;
  const quality = benchmarkSamples > 0
    ? bounded(stats.quality_score, 0, 1, 0.5)
    : successRate;
  const latency = latencyUtility(stats.avg_latency_ms);
  const cost = costUtility(model);
  const evidenceScore =
    (quality * 0.45)
    + (successRate * 0.25)
    + (latency * 0.20)
    + (cost * 0.10);

  return Number(evidenceScore.toFixed(6));
}

export function modelPerformanceConfidence(stats = null) {
  if (!stats) return 0;
  const samples = Math.max(0, Number(stats.samples) || 0);
  const benchmarkSamples = Math.max(0, Number(stats.benchmark_samples) || 0);
  if (samples < MIN_DYNAMIC_SAMPLES && benchmarkSamples < 1) return 0;
  return bounded(Math.max(samples / 20, benchmarkSamples / 8), 0.2, 1, 0.2);
}

function sortWithEvidence(models, statsById) {
  const rows = models.map((model, index) => {
    const stats = statsById.get(model.id) || null;
    const evidence = modelPerformanceScore(model, stats);
    const confidence = modelPerformanceConfidence(stats);
    const staticScore = models.length <= 1 ? 1 : 1 - (index / (models.length - 1));
    const combined = evidence == null || confidence <= 0
      ? staticScore
      : (staticScore * (1 - confidence)) + (evidence * confidence);
    return { model, index, combined };
  });

  return rows.sort((a, b) => {
    if (b.combined !== a.combined) return b.combined - a.combined;
    const priorityDelta = Number(b.model.priority || 0) - Number(a.model.priority || 0);
    if (priorityDelta !== 0) return priorityDelta;
    return a.index - b.index;
  }).map(row => row.model);
}

export class InMemoryModelPerformanceStore {
  constructor(seed = []) {
    this.rows = new Map();
    for (const row of seed) {
      const modelId = cleanModelId(row?.model_id ?? row?.modelId);
      if (!modelId) continue;
      const task = cleanTask(row?.task);
      this.rows.set(`${task}::${modelId}`, {
        model_id: modelId,
        task,
        samples: Math.max(0, Number(row.samples) || 0),
        successes: Math.max(0, Number(row.successes) || 0),
        failures: Math.max(0, Number(row.failures) || 0),
        avg_latency_ms: Math.max(0, Number(row.avg_latency_ms) || 0),
        quality_score: bounded(row.quality_score, 0, 1, 0.5),
        benchmark_samples: Math.max(0, Number(row.benchmark_samples) || 0),
        updated_at: Math.max(0, Number(row.updated_at) || 0),
      });
    }
  }

  key(modelId, task) {
    return `${cleanTask(task)}::${cleanModelId(modelId)}`;
  }

  async list(task) {
    const wanted = cleanTask(task);
    return [...this.rows.values()].filter(row => row.task === wanted).map(row => ({ ...row }));
  }

  async rank(models, task) {
    const rows = await this.list(task);
    const statsById = new Map(rows.map(row => [row.model_id, row]));
    return sortWithEvidence(Array.isArray(models) ? models : [], statsById);
  }

  async recordAttempt({ modelId, task, ok, latencyMs }) {
    const id = cleanModelId(modelId);
    if (!id) return false;
    const normalizedTask = cleanTask(task);
    const key = this.key(id, normalizedTask);
    const previous = this.rows.get(key) || {
      model_id: id,
      task: normalizedTask,
      samples: 0,
      successes: 0,
      failures: 0,
      avg_latency_ms: 0,
      quality_score: 0.5,
      benchmark_samples: 0,
      updated_at: 0,
    };
    const samples = previous.samples + 1;
    const latency = Math.max(0, Math.min(MAX_LATENCY_MS, Number(latencyMs) || 0));
    const avgLatency = previous.samples > 0
      ? ((previous.avg_latency_ms * previous.samples) + latency) / samples
      : latency;
    this.rows.set(key, {
      ...previous,
      samples,
      successes: previous.successes + (ok ? 1 : 0),
      failures: previous.failures + (ok ? 0 : 1),
      avg_latency_ms: Number(avgLatency.toFixed(2)),
      updated_at: Date.now(),
    });
    return true;
  }

  async recordBenchmark({ modelId, task, quality }) {
    const id = cleanModelId(modelId);
    if (!id) return false;
    const normalizedTask = cleanTask(task);
    const key = this.key(id, normalizedTask);
    const previous = this.rows.get(key) || {
      model_id: id,
      task: normalizedTask,
      samples: 0,
      successes: 0,
      failures: 0,
      avg_latency_ms: 0,
      quality_score: 0.5,
      benchmark_samples: 0,
      updated_at: 0,
    };
    const nextCount = previous.benchmark_samples + 1;
    const nextQuality = ((previous.quality_score * previous.benchmark_samples) + bounded(quality, 0, 1, 0)) / nextCount;
    this.rows.set(key, {
      ...previous,
      quality_score: Number(nextQuality.toFixed(6)),
      benchmark_samples: nextCount,
      updated_at: Date.now(),
    });
    return true;
  }
}

export class D1ModelPerformanceStore {
  constructor(db) {
    this.db = db || null;
    this.ready = false;
  }

  async ensure() {
    if (this.ready) return true;
    if (!this.db?.prepare) return false;
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS model_task_performance (
        model_id TEXT NOT NULL,
        task TEXT NOT NULL,
        samples INTEGER NOT NULL DEFAULT 0,
        successes INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        avg_latency_ms REAL NOT NULL DEFAULT 0,
        quality_score REAL NOT NULL DEFAULT 0.5,
        benchmark_samples INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(model_id, task)
      )
    `).run();
    this.ready = true;
    return true;
  }

  async list(task) {
    if (!(await this.ensure())) return [];
    const result = await this.db.prepare(`
      SELECT model_id, task, samples, successes, failures,
             avg_latency_ms, quality_score, benchmark_samples, updated_at
      FROM model_task_performance
      WHERE task = ?
    `).bind(cleanTask(task)).all();
    return Array.isArray(result?.results) ? result.results : [];
  }

  async rank(models, task) {
    try {
      const rows = await this.list(task);
      const statsById = new Map(rows.map(row => [String(row.model_id), row]));
      return sortWithEvidence(Array.isArray(models) ? models : [], statsById);
    } catch {
      return Array.isArray(models) ? [...models] : [];
    }
  }

  async recordAttempt({ modelId, task, ok, latencyMs }) {
    if (!(await this.ensure())) return false;
    const id = cleanModelId(modelId);
    if (!id) return false;
    const normalizedTask = cleanTask(task);
    const latency = Math.max(0, Math.min(MAX_LATENCY_MS, Number(latencyMs) || 0));
    const now = Date.now();
    await this.db.prepare(`
      INSERT INTO model_task_performance(
        model_id, task, samples, successes, failures,
        avg_latency_ms, quality_score, benchmark_samples, updated_at
      ) VALUES(?, ?, 1, ?, ?, ?, 0.5, 0, ?)
      ON CONFLICT(model_id, task) DO UPDATE SET
        avg_latency_ms = ((model_task_performance.avg_latency_ms * model_task_performance.samples) + excluded.avg_latency_ms)
          / (model_task_performance.samples + 1),
        samples = model_task_performance.samples + 1,
        successes = model_task_performance.successes + excluded.successes,
        failures = model_task_performance.failures + excluded.failures,
        updated_at = excluded.updated_at
    `).bind(id, normalizedTask, ok ? 1 : 0, ok ? 0 : 1, latency, now).run();
    return true;
  }

  async recordBenchmark({ modelId, task, quality }) {
    if (!(await this.ensure())) return false;
    const id = cleanModelId(modelId);
    if (!id) return false;
    const normalizedTask = cleanTask(task);
    const score = bounded(quality, 0, 1, 0);
    const now = Date.now();
    await this.db.prepare(`
      INSERT INTO model_task_performance(
        model_id, task, samples, successes, failures,
        avg_latency_ms, quality_score, benchmark_samples, updated_at
      ) VALUES(?, ?, 0, 0, 0, 0, ?, 1, ?)
      ON CONFLICT(model_id, task) DO UPDATE SET
        quality_score = ((model_task_performance.quality_score * model_task_performance.benchmark_samples) + excluded.quality_score)
          / (model_task_performance.benchmark_samples + 1),
        benchmark_samples = model_task_performance.benchmark_samples + 1,
        updated_at = excluded.updated_at
    `).bind(id, normalizedTask, score, now).run();
    return true;
  }
}

export const MODEL_PERFORMANCE_LIMITS = Object.freeze({
  min_dynamic_samples: MIN_DYNAMIC_SAMPLES,
  max_latency_ms: MAX_LATENCY_MS,
});
