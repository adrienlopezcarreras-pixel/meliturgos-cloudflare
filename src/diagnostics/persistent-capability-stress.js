import { auditRuntimeCapabilities, SAFE_SAMPLES } from './capability-truth-audit.js';

const STALE_RUN_MS = 45000;
// One capability row can spend up to ~14 s across bounded health, dynamic
// sample, execution and progress persistence. Keep the stale lease well above
// that envelope so status polling cannot reclaim and replay the same chunk
// while its original Worker task is still legitimately running.
const STRESS_CHUNK_SIZE = 12;

function stressError(code) {
  return Object.assign(new Error(code), { code });
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function compactProgressRow(row) {
  return {
    id: String(row?.id || ''),
    truth_status: String(row?.truth_status || 'UNKNOWN'),
    tested_now: row?.tested_now === true,
    auto_execution_blocked: row?.auto_execution_blocked || null,
    execution: row?.execution?.ok === true
      ? { ok: true, duration_ms: Math.max(0, Number(row.execution.duration_ms || 0)) }
      : row?.execution
        ? {
            ok: false,
            code: String(row.execution.code || 'CAPABILITY_FAILED').slice(0, 180),
            duration_ms: Math.max(0, Number(row.execution.duration_ms || 0)),
          }
        : null,
  };
}

function countsFor(rows = []) {
  return rows.reduce((acc, row) => {
    const key = String(row?.truth_status || 'UNKNOWN');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function contractsFor(rows = []) {
  return {
    inspected: rows.filter(row => row?.contract_valid !== null && row?.contract_valid !== undefined).length,
    valid: rows.filter(row => row?.contract_valid === true).length,
    invalid: rows.filter(row => row?.contract_valid === false).length,
  };
}

function mergeRetryReport(first, retry) {
  const byId = new Map((first?.capabilities || []).map(row => [String(row.id), row]));
  for (const row of retry?.capabilities || []) {
    if (row?.tested_now !== true) continue;
    const id = String(row.id || '');
    if (!id) continue;
    byId.set(id, { ...byId.get(id), ...row, retry_attempted: true });
  }
  const capabilities = [...byId.values()];
  return {
    ...first,
    counts: countsFor(capabilities),
    contracts: contractsFor(capabilities),
    capabilities,
    retry_pass: true,
  };
}

export class D1CapabilityStressStore {
  constructor(db) {
    if (!db || typeof db.prepare !== 'function') throw stressError('CAPABILITY_STRESS_DB_REQUIRED');
    this.db = db;
    this.ready = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = this.db.prepare(`CREATE TABLE IF NOT EXISTS capability_stress_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        pass INTEGER NOT NULL DEFAULT 1,
        current_capability TEXT,
        summary_json TEXT NOT NULL DEFAULT '{}',
        report_json TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )`).run();
    }
    await this.ready;
  }

  row(raw) {
    if (!raw) return null;
    return {
      job_id: raw.id,
      id: raw.id,
      persistent: true,
      status: raw.status,
      progress: {
        done: Number(raw.completed || 0),
        total: Number(raw.total || 0),
        pass: Number(raw.pass || 1),
        current_capability: raw.current_capability || null,
      },
      summary: parseJson(raw.summary_json, {}),
      report: parseJson(raw.report_json, null),
      error: raw.error || null,
      created_at: Number(raw.created_at || 0),
      updated_at: Number(raw.updated_at || 0),
      completed_at: raw.completed_at == null ? null : Number(raw.completed_at),
    };
  }

  async create({ id = `cap-stress-${crypto.randomUUID()}`, total = 0 } = {}) {
    await this.init();
    const now = Date.now();
    await this.db.prepare(`INSERT INTO capability_stress_runs
      (id,status,total,completed,pass,current_capability,summary_json,report_json,error,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, 'QUEUED', Number(total || 0), 0, 1, null, '{}', null, null, now, now, null)
      .run();
    return this.get(id);
  }

  async get(id) {
    await this.init();
    const row = await this.db.prepare('SELECT * FROM capability_stress_runs WHERE id=?').bind(String(id || '')).first();
    return this.row(row);
  }

  async latest() {
    await this.init();
    const row = await this.db.prepare('SELECT * FROM capability_stress_runs ORDER BY created_at DESC LIMIT 1').first();
    return this.row(row);
  }

  async latestActive() {
    await this.init();
    const row = await this.db.prepare("SELECT * FROM capability_stress_runs WHERE status IN ('QUEUED','RUNNING','RETRYING') ORDER BY created_at DESC LIMIT 1").first();
    return this.row(row);
  }

  async claimRunnable(id, { staleBefore = Date.now() - STALE_RUN_MS } = {}) {
    await this.init();
    const now = Date.now();
    const result = await this.db.prepare(`UPDATE capability_stress_runs
      SET status='RUNNING', updated_at=?
      WHERE id=? AND (
        status='QUEUED'
        OR (status IN ('RUNNING','RETRYING') AND updated_at<=?)
      )`)
      .bind(now, String(id || ''), Number(staleBefore || 0))
      .run();
    if (Number(result?.meta?.changes || 0) < 1) return null;
    return this.get(id);
  }

  async update(id, patch = {}) {
    await this.init();
    const current = await this.get(id);
    if (!current) throw stressError('CAPABILITY_STRESS_JOB_NOT_FOUND');
    const now = Date.now();
    const status = patch.status ?? current.status;
    const progress = { ...(current.progress || {}), ...(patch.progress || {}) };
    const summary = patch.summary ?? current.summary ?? {};
    const report = patch.report === undefined ? current.report : patch.report;
    const error = patch.error === undefined ? current.error : patch.error;
    const completedAt = patch.completed_at === undefined ? current.completed_at : patch.completed_at;
    await this.db.prepare(`UPDATE capability_stress_runs SET
      status=?,total=?,completed=?,pass=?,current_capability=?,summary_json=?,report_json=?,error=?,updated_at=?,completed_at=?
      WHERE id=?`)
      .bind(
        status,
        Number(progress.total || 0),
        Number(progress.done || 0),
        Number(progress.pass || 1),
        progress.current_capability || null,
        JSON.stringify(summary || {}),
        report == null ? null : JSON.stringify(report),
        error || null,
        now,
        completedAt,
        id,
      ).run();
    return this.get(id);
  }
}

function executionContext(context = {}) {
  return {
    owner: context.owner || 'capability-stress',
    permissions: Array.isArray(context.permissions) ? context.permissions : [],
    requestId: context.requestId || crypto.randomUUID(),
    approvedCapabilities: Array.isArray(context.approvedCapabilities) ? context.approvedCapabilities : [],
  };
}


function mergeFirstPassChunk(previousReport, chunk) {
  const capabilities = Array.isArray(previousReport?.capabilities)
    ? previousReport.capabilities.slice()
    : [];
  const startIndex = Number(chunk?.range?.start_index || 0);
  for (let offset = 0; offset < (chunk?.capabilities || []).length; offset += 1) {
    capabilities[startIndex + offset] = chunk.capabilities[offset];
  }
  const dense = capabilities.filter(Boolean);
  return {
    ok: true,
    total: Number(chunk?.total || previousReport?.total || dense.length || 0),
    deep: true,
    counts: countsFor(dense),
    contracts: contractsFor(dense),
    capabilities: dense,
    retry_pass: previousReport?.retry_pass === true,
    partial: chunk?.range?.complete !== true,
  };
}

async function finalizePersistentStress({ store, id, finalReport, retryIds = [] }) {
  const remainingRuntimeFailures = finalReport.capabilities
    .filter(row => row?.truth_status === 'EXISTANT_MAIS_ECHEC_RUNTIME')
    .map(row => row.id);
  const blocked = finalReport.capabilities
    .filter(row => row?.auto_execution_blocked)
    .map(row => ({ id: row.id, reason: row.auto_execution_blocked }));

  return store.update(id, {
    status: remainingRuntimeFailures.length ? 'COMPLETE_WITH_FAILURES' : 'COMPLETE',
    progress: {
      done: finalReport.total,
      total: finalReport.total,
      pass: retryIds.length ? 2 : 1,
      current_capability: null,
    },
    summary: {
      phase: 'COMPLETE',
      retryable_failures: retryIds.length,
      remaining_runtime_failures: remainingRuntimeFailures,
      blocked_count: blocked.length,
      blocked: blocked.slice(0, 200),
    },
    report: {
      ...finalReport,
      partial: false,
      job_id: id,
      persistent: true,
      completed_at: Date.now(),
    },
    completed_at: Date.now(),
    error: null,
  });
}

async function executeRetryPass({ bus, store, job, context = {} }) {
  const id = job.job_id;
  const retryIds = Array.isArray(job?.summary?.retry_ids)
    ? job.summary.retry_ids.map(value => String(value)).filter(Boolean)
    : [];
  if (!retryIds.length) {
    return finalizePersistentStress({
      store,
      id,
      finalReport: job.report || { ok: true, total: bus.list().length, deep: true, capabilities: [] },
      retryIds: [],
    });
  }

  const retryStart = Math.max(0, Math.min(retryIds.length, Number(job?.progress?.done || 0)));
  await store.update(id, {
    status: 'RETRYING',
    progress: {
      done: retryStart,
      total: retryIds.length,
      pass: 2,
      current_capability: 'health-refresh',
    },
    summary: {
      ...(job.summary || {}),
      phase: 'RETRYING',
      retryable_failures: retryIds.length,
      retry_ids: retryIds.slice(0, 100),
      chunk_start: retryStart,
    },
    error: null,
  });

  const retrySamples = Object.fromEntries(
    retryIds
      .filter(idValue => Object.hasOwn(SAFE_SAMPLES, idValue))
      .map(idValue => [idValue, SAFE_SAMPLES[idValue]])
  );

  const retry = await auditRuntimeCapabilities({ bus }, {
    deep: true,
    context: executionContext(context),
    executionTimeoutMs: 4_000,
    samples: retrySamples,
    recordIds: retryIds,
    startIndex: retryStart,
    maxRecords: STRESS_CHUNK_SIZE,
    onProgress: async ({ index, total, row }) => {
      await store.update(id, {
        status: 'RETRYING',
        progress: {
          done: retryStart,
          total,
          pass: 2,
          current_capability: row?.id || null,
        },
        summary: {
          ...(job.summary || {}),
          phase: 'RETRYING',
          retryable_failures: retryIds.length,
          retry_ids: retryIds.slice(0, 100),
          chunk_start: retryStart,
          chunk_progress: index,
          last_capability: compactProgressRow(row),
        },
      });
    },
  });

  const merged = mergeRetryReport(job.report || { capabilities: [] }, retry);
  if (retry?.range?.complete !== true) {
    return store.update(id, {
      status: 'QUEUED',
      progress: {
        done: Number(retry?.range?.next_index || retryStart),
        total: retryIds.length,
        pass: 2,
        current_capability: null,
      },
      summary: {
        ...(job.summary || {}),
        phase: 'RETRY_QUEUED',
        retryable_failures: retryIds.length,
        retry_ids: retryIds.slice(0, 100),
        next_index: Number(retry?.range?.next_index || retryStart),
      },
      report: merged,
      error: null,
    });
  }

  return finalizePersistentStress({
    store,
    id,
    finalReport: merged,
    retryIds,
  });
}

async function executePersistentStress({ bus, store, job, context = {} }) {
  const id = job.job_id;
  try {
    if (Number(job?.progress?.pass || 1) === 2) {
      return executeRetryPass({ bus, store, job, context });
    }

    const previousRows = Array.isArray(job?.report?.capabilities)
      ? job.report.capabilities
      : [];
    const persistedDone = Number(job?.progress?.done || 0);
    // Runs created by the pre-resumable implementation may have a non-zero
    // cursor without a partial report. Restart those once from zero rather than
    // silently skipping rows.
    const chunkStart = previousRows.length === persistedDone ? persistedDone : 0;
    const totalCapabilities = bus.list().length;

    await store.update(id, {
      status: 'RUNNING',
      progress: {
        done: chunkStart,
        total: totalCapabilities,
        pass: 1,
        current_capability: 'health-refresh',
      },
      summary: {
        phase: 'RUNNING',
        retryable_failures: 0,
        chunk_start: chunkStart,
        chunk_size: STRESS_CHUNK_SIZE,
      },
      report: chunkStart === 0 ? null : job.report,
      error: null,
    });

    // capability.audit is safe as a standalone bounded smoke, but executing it
    // from inside the persistent global stress recursively refreshes the whole
    // registry and can outlive the per-capability timeout. Keep it inventoried,
    // but do not self-execute it in this parent stress run.
    const persistentStressSamples = { ...SAFE_SAMPLES };
    delete persistentStressSamples['capability.audit'];

    const firstChunk = await auditRuntimeCapabilities({ bus }, {
      deep: true,
      context: executionContext(context),
      executionTimeoutMs: 4_000,
      samples: persistentStressSamples,
      startIndex: chunkStart,
      maxRecords: STRESS_CHUNK_SIZE,
      onProgress: async ({ index, total, row }) => {
        // Keep the durable cursor at the start of the current chunk until every
        // row in that chunk completed. If a Worker is terminated mid-chunk, the
        // next invocation safely replays the bounded read-only chunk.
        await store.update(id, {
          status: 'RUNNING',
          progress: {
            done: chunkStart,
            total,
            pass: 1,
            current_capability: row?.id || null,
          },
          summary: {
            phase: 'RUNNING',
            chunk_start: chunkStart,
            chunk_size: STRESS_CHUNK_SIZE,
            chunk_progress: index,
            last_capability: compactProgressRow(row),
          },
        });
      },
    });

    const mergedFirst = mergeFirstPassChunk(
      chunkStart === 0 ? null : job.report,
      firstChunk,
    );

    if (firstChunk?.range?.complete !== true) {
      return store.update(id, {
        status: 'QUEUED',
        progress: {
          done: Number(firstChunk?.range?.next_index || chunkStart),
          total: Number(firstChunk?.total || totalCapabilities),
          pass: 1,
          current_capability: null,
        },
        summary: {
          phase: 'QUEUED',
          retryable_failures: 0,
          next_index: Number(firstChunk?.range?.next_index || chunkStart),
          completed_rows: mergedFirst.capabilities.length,
        },
        report: mergedFirst,
        error: null,
      });
    }

    const first = {
      ...mergedFirst,
      partial: false,
    };
    const retryIds = first.capabilities
      .filter(row => row?.truth_status === 'EXISTANT_MAIS_ECHEC_RUNTIME')
      .filter(row => row?.auto_execution_blocked == null)
      .filter(row => row?.risk === 'LOW')
      .filter(row => Object.hasOwn(SAFE_SAMPLES, row.id))
      .map(row => row.id);

    if (retryIds.length) {
      return store.update(id, {
        status: 'QUEUED',
        progress: {
          done: 0,
          total: retryIds.length,
          pass: 2,
          current_capability: null,
        },
        summary: {
          phase: 'RETRY_QUEUED',
          retryable_failures: retryIds.length,
          retry_ids: retryIds.slice(0, 100),
          next_index: 0,
        },
        report: first,
        error: null,
      });
    }

    return finalizePersistentStress({
      store,
      id,
      finalReport: first,
      retryIds: [],
    });
  } catch (error) {
    return store.update(id, {
      status: 'FAILED',
      progress: { current_capability: null },
      summary: { phase: 'FAILED' },
      error: String(error?.code || error?.message || 'CAPABILITY_STRESS_FAILED').slice(0, 500),
      completed_at: Date.now(),
    });
  }
}

export async function startPersistentCapabilityStress({ bus, db, context = {} } = {}) {
  if (!bus) throw stressError('CAPABILITY_STRESS_BUS_REQUIRED');
  const store = new D1CapabilityStressStore(db);
  const active = await store.latestActive();
  const job = active || await store.create({ total: bus.list().length });

  const claimed = await store.claimRunnable(job.job_id);
  if (!claimed) {
    return { ...job, reused: Boolean(active), resumed: false };
  }

  const promise = executePersistentStress({ bus, store, job: claimed, context });
  const resumed = Boolean(active);
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(promise);
    return { ...claimed, status: 'RUNNING', reused: resumed, resumed };
  }
  const completed = await promise;
  return { ...completed, reused: resumed, resumed };
}

export async function readPersistentCapabilityStress({ db, jobId = null } = {}) {
  const store = new D1CapabilityStressStore(db);
  const job = jobId ? await store.get(jobId) : await store.latest();
  if (!job) throw stressError('CAPABILITY_STRESS_JOB_NOT_FOUND');
  return job;
}
