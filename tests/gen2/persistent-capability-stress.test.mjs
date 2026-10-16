import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import {
  readPersistentCapabilityStress,
  startPersistentCapabilityStress,
} from '../../src/diagnostics/persistent-capability-stress.js';
import { validateStart, validateTerminal, validateProgressTransition, summarizeStressCoverage } from '../../scripts/persistent-capability-stress-live-proof.mjs';

function echoRecord() {
  return {
    id: 'echo',
    name: 'Diagnostic echo',
    category: 'diagnostic',
    provider: 'core',
    risk: 'LOW',
    enabled: true,
    health: 'HEALTHY',
  };
}

test('persistent capability stress stores one job and retries a safe runtime failure once', async () => {
  const db = sqliteD1();
  try {
    let executions = 0;
    const bus = {
      list: () => [echoRecord()],
      contract: () => ({ valid: true }),
      execute: async () => {
        executions += 1;
        if (executions === 1) throw Object.assign(new Error('TRANSIENT_ECHO_FAILURE'), { code: 'TRANSIENT_ECHO_FAILURE' });
        return { value: 'ok' };
      },
    };

    const queued = await startPersistentCapabilityStress({
      bus,
      db,
      context: { owner: 'test', permissions: [] },
    });

    assert.equal(queued.status, 'QUEUED');
    assert.match(queued.job_id, /^cap-stress-/);
    assert.equal(queued.progress.pass, 2);
    assert.equal(queued.progress.done, 0);
    assert.equal(executions, 1, 'first invocation performs only the first pass');

    const completed = await startPersistentCapabilityStress({
      bus,
      db,
      context: { owner: 'test', permissions: [] },
    });

    assert.equal(completed.status, 'COMPLETE');
    assert.equal(completed.job_id, queued.job_id);
    assert.equal(completed.progress.pass, 2);
    assert.equal(completed.progress.done, 1);
    assert.equal(executions, 2, 'second invocation performs the bounded retry');

    const persisted = await readPersistentCapabilityStress({ db, jobId: completed.job_id });
    assert.equal(persisted.status, 'COMPLETE');
    assert.equal(persisted.report.job_id, completed.job_id);
    assert.equal(persisted.report.capabilities[0].id, 'echo');
    assert.equal(persisted.report.capabilities[0].truth_status, 'EXISTANT_ET_TESTE');
    assert.equal(persisted.report.capabilities[0].retry_attempted, true);
  } finally {
    db.close();
  }
});

test('persistent capability stress can continue through waitUntil and expose live progress by job_id', async () => {
  const db = sqliteD1();
  try {
    let background = null;
    let executions = 0;
    const bus = {
      list: () => [echoRecord()],
      contract: () => ({ valid: true }),
      execute: async () => {
        executions += 1;
        return { value: 'ok' };
      },
    };

    const launched = await startPersistentCapabilityStress({
      bus,
      db,
      context: {
        owner: 'test',
        permissions: [],
        waitUntil(promise) { background = promise; },
      },
    });

    assert.equal(launched.status, 'RUNNING');
    assert.match(launched.job_id, /^cap-stress-/);
    assert.ok(background instanceof Promise);

    await background;
    const completed = await readPersistentCapabilityStress({ db, jobId: launched.job_id });
    assert.equal(completed.status, 'COMPLETE');
    assert.equal(completed.progress.done, 1);
    assert.equal(completed.progress.total, 1);
    assert.equal(executions, 1);
  } finally {
    db.close();
  }
});


test('generic capability route forwards Worker waitUntil and release smoke exposes only stress start/status', async () => {
  const router = await readFile(new URL('../../src/router.js', import.meta.url), 'utf8');
  assert.match(router, /"capability\.audit"/);
  assert.match(router, /"capability\.audit\.status"/);
  assert.match(router, /waitUntil:\s*typeof ctx\?\.waitUntil === "function"/);
  assert.match(router, /handleConversationApi\(request, env, url, ctx\)/);
  assert.match(router, /capabilityContext\(env, request, ctx\)/);
});


test('persistent stress live-proof validators accept a durable terminal report and reject mismatched jobs', () => {
  const started = validateStart({
    ok: true,
    capability: 'capability.audit',
    result: { persistent: true, job_id: 'cap-stress-proof', status: 'RUNNING' },
  });
  assert.equal(started.job_id, 'cap-stress-proof');

  const completed = {
    ok: true,
    capability: 'capability.audit.status',
    result: {
      persistent: true,
      job_id: 'cap-stress-proof',
      status: 'COMPLETE',
      progress: { done: 3, total: 3 },
      report: { persistent: true, job_id: 'cap-stress-proof' },
      summary: { remaining_runtime_failures: [] },
    },
  };
  const terminal = validateTerminal(completed, 'cap-stress-proof');
  assert.equal(terminal.status, 'COMPLETE');
  assert.throws(
    () => validateTerminal({ ...completed, result: {
      ...completed.result, status: 'COMPLETE_WITH_FAILURES',
      summary: { remaining_runtime_failures: ['system.integrity'] },
    } }, 'cap-stress-proof'),
    /CAPABILITY_STRESS_RUNTIME_FAILURES:system.integrity/,
    'a complete but failed audit must fail its GitHub production proof',
  );

  assert.throws(() => validateTerminal({
    ok: true,
    capability: 'capability.audit.status',
    result: {
      persistent: true,
      job_id: 'cap-stress-other',
      status: 'COMPLETE',
      progress: { done: 1, total: 1 },
      report: { persistent: true, job_id: 'cap-stress-other' },
    },
  }, 'cap-stress-proof'), /CAPABILITY_STRESS_JOB_MISMATCH/);
});


test('persistent capability stress excludes capability.audit only from its own recursive execution set', async () => {
  const source = await readFile(new URL('../../src/diagnostics/persistent-capability-stress.js', import.meta.url), 'utf8');
  assert.match(source, /delete persistentStressSamples\['capability\.audit'\]/);
  const { SAFE_SAMPLES } = await import('../../src/diagnostics/capability-truth-audit.js');
  assert.equal(Object.hasOwn(SAFE_SAMPLES, 'capability.audit'), true);
});


test('persistent stress advances in durable chunks instead of restarting from zero', async () => {
  const db = sqliteD1();
  try {
    const records = Array.from({ length: 25 }, (_, index) => ({
      id: 'chunk-' + index,
      name: 'Chunk ' + index,
      category: 'test',
      provider: 'core',
      risk: 'LOW',
      enabled: true,
      health: 'HEALTHY',
    }));
    const bus = {
      list: () => records,
      contract: () => ({ valid: true }),
      execute: async () => ({ ok: true }),
    };

    let background = null;
    const context = {
      owner: 'test',
      permissions: [],
      waitUntil(promise) { background = promise; },
    };

    const first = await startPersistentCapabilityStress({ bus, db, context });
    assert.equal(first.status, 'RUNNING');
    await background;

    let persisted = await readPersistentCapabilityStress({ db, jobId: first.job_id });
    assert.equal(persisted.status, 'QUEUED');
    assert.equal(persisted.progress.done, 6);
    assert.equal(persisted.progress.total, 25);
    assert.equal(persisted.report.capabilities.length, 6);

    for (const expectedDone of [12, 18, 24]) {
      const resumed = await startPersistentCapabilityStress({ bus, db, context });
      assert.equal(resumed.resumed, true);
      await background;
      persisted = await readPersistentCapabilityStress({ db, jobId: first.job_id });
      assert.equal(persisted.status, 'QUEUED');
      assert.equal(persisted.progress.done, expectedDone);
      assert.equal(persisted.report.capabilities.length, expectedDone);
    }

    const final = await startPersistentCapabilityStress({ bus, db, context });
    assert.equal(final.resumed, true);
    await background;

    persisted = await readPersistentCapabilityStress({ db, jobId: first.job_id });
    assert.equal(persisted.status, 'COMPLETE');
    assert.equal(persisted.progress.done, 25);
    assert.equal(persisted.progress.total, 25);
    assert.equal(persisted.report.capabilities.length, 25);
    assert.deepEqual(
      persisted.report.capabilities.map(row => row.id),
      records.map(row => row.id),
    );
  } finally {
    db.close();
  }
});

test('legacy non-zero cursor without a partial report restarts safely from zero', async () => {
  const db = sqliteD1();
  try {
    const records = Array.from({ length: 13 }, (_, index) => ({
      id: 'legacy-' + index,
      name: 'Legacy ' + index,
      category: 'test',
      provider: 'core',
      risk: 'LOW',
      enabled: true,
      health: 'HEALTHY',
    }));
    const bus = {
      list: () => records,
      contract: () => ({ valid: true }),
      execute: async () => ({ ok: true }),
    };

    const storeModule = await import('../../src/diagnostics/persistent-capability-stress.js');
    const store = new storeModule.D1CapabilityStressStore(db);
    const job = await store.create({ total: records.length });
    await store.update(job.job_id, {
      status: 'QUEUED',
      progress: { done: 7, total: records.length, pass: 1, current_capability: null },
      report: null,
      summary: { phase: 'QUEUED' },
    });

    const resumed = await startPersistentCapabilityStress({
      bus,
      db,
      context: { owner: 'test', permissions: [] },
    });
    assert.equal(resumed.resumed, true);

    const persisted = await readPersistentCapabilityStress({ db, jobId: job.job_id });
    assert.equal(persisted.status, 'QUEUED');
    assert.equal(persisted.progress.done, 6);
    assert.equal(persisted.report.capabilities.length, 6);
    assert.equal(persisted.report.capabilities[0].id, 'legacy-0');
  } finally {
    db.close();
  }
});


test('live-proof progress diagnostics use the actual status row and drive resume calls', async () => {
  const source = await readFile(new URL('../../scripts/persistent-capability-stress-live-proof.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /row\?\.progress/);
  assert.match(source, /r\?\.progress\?\.current_capability/);
  assert.match(source, /stress-resume\.json/);
  assert.match(source, /attempt <= 240/);
});


test('persistent stress stale lease exceeds the bounded per-row execution envelope', async () => {
  const source = await readFile(new URL('../../src/diagnostics/persistent-capability-stress.js', import.meta.url), 'utf8');
  assert.match(source, /const STALE_RUN_MS = 45000;/);
  assert.doesNotMatch(source, /const STALE_RUN_MS = 15000;/);
});


test('retry pass may reset its own cursor while same-pass progress remains monotonic', () => {
  assert.deepEqual(
    validateProgressTransition({ pass:1, done:162 }, { pass:2, done:0 }),
    { pass:2, done:0 },
  );
  assert.deepEqual(
    validateProgressTransition({ pass:2, done:0 }, { pass:2, done:3 }),
    { pass:2, done:3 },
  );
  assert.throws(
    () => validateProgressTransition({ pass:2, done:3 }, { pass:2, done:2 }),
    /CAPABILITY_STRESS_PROGRESS_REGRESSED/,
  );
  assert.throws(
    () => validateProgressTransition({ pass:2, done:3 }, { pass:1, done:168 }),
    /CAPABILITY_STRESS_PASS_REGRESSED/,
  );
});

test('production stress gives every retry a bounded long read-only window and persists between individual attempts', async () => {
  const source = await readFile(new URL('../../src/diagnostics/persistent-capability-stress.js', import.meta.url), 'utf8');
  const retry = source.slice(source.indexOf('async function executeRetryPass('), source.indexOf('async function executePersistentStress('));
  const first = source.slice(source.indexOf('async function executePersistentStress('), source.indexOf('export async function startPersistentCapabilityStress('));
  assert.match(first, /executionTimeoutMs: 4_000/);
  assert.match(retry, /executionTimeoutMs: 18_000/);
  assert.match(retry, /maxRecords: 1/);
  assert.match(retry, /await store\.update\(id, \{/);
  assert.match(source, /const STALE_RUN_MS = 45000;/);
});

test('persistent proof accepts intentionally blocked capabilities but never accepts fake green runtime results', () => {
  const completed = {
    ok: true, capability: 'capability.audit.status',
    result: {
      persistent: true, job_id: 'blocked-but-safe', status: 'COMPLETE',
      progress: { done: 2, total: 2 },
      report: { persistent: true, job_id: 'blocked-but-safe' },
      summary: { blocked_count: 1, remaining_runtime_failures: [] },
    },
  };
  assert.equal(validateTerminal(completed, 'blocked-but-safe').status, 'COMPLETE');
  assert.throws(() => validateTerminal({
    ...completed, result: {
      ...completed.result,
      status: 'COMPLETE_WITH_FAILURES',
      summary: { blocked_count: 1, remaining_runtime_failures: ['self.state'] },
    },
  }, 'blocked-but-safe'), /CAPABILITY_STRESS_RUNTIME_FAILURES:self.state/);
});

test('exact production stress coverage distinguishes 165 inspected contracts from 40 executed capabilities', () => {
  const report = {
    progress: { done: 165, total: 165 },
    report: {
      counts: { EXISTANT_ET_TESTE: 40, PARTIEL: 30, EXISTANT_NON_TESTE: 94, BLOCKED_EXTERNAL: 1 },
      contracts: { inspected: 165, valid: 165, invalid: 0 },
    },
    summary: { blocked_count: 125, remaining_runtime_failures: [] },
  };
  const coverage = summarizeStressCoverage(report);
  assert.equal(coverage.contract_validation_complete, true);
  assert.equal(coverage.runtime_validation_complete, false);
  assert.equal(coverage.runtime_tested, 40);
  assert.equal(coverage.runtime_unverified, 125);
  assert.equal(coverage.runtime_coverage_percent, 24.24);
  assert.equal(coverage.evidence_scope, 'PARTIAL_SAFE_RUNTIME_EXECUTION');
  assert.throws(() => summarizeStressCoverage({
    ...report, report: {...report.report, counts: {...report.report.counts, EXISTANT_NON_TESTE: 93}},
  }), /CAPABILITY_COVERAGE_COUNTS_INCONSISTENT/);
  assert.throws(() => summarizeStressCoverage({
    ...report, report: {...report.report, contracts: { inspected: 165, valid: 164, invalid: 1 }},
  }), /CAPABILITY_COVERAGE_CONTRACTS_NOT_ALL_VALID/);
});

test('coverage marks full runtime execution only when every capability was genuinely tested', () => {
  const full = summarizeStressCoverage({
    progress: { total: 2 },
    report: { counts: { EXISTANT_ET_TESTE: 2 }, contracts: { inspected: 2, valid: 2, invalid: 0 } },
  });
  assert.equal(full.runtime_validation_complete, true);
  assert.equal(full.runtime_unverified, 0);
  assert.equal(full.runtime_coverage_percent, 100);
  assert.equal(full.evidence_scope, 'ALL_RUNTIME_SAMPLES_EXECUTED');
  assert.throws(() => summarizeStressCoverage({
    progress: { total: 2 },
    report: { counts: { EXISTANT_ET_TESTE: 1, PARTIEL: -1, EXISTANT_NON_TESTE: 2 },
      contracts: { inspected: 2, valid: 2, invalid: 0 } },
  }), /CAPABILITY_COVERAGE_COUNTS_INVALID/);
});

// Coverage aggregation is domain-only; individual capability IDs stay out of proof summaries.
test('persistent runtime coverage explains unverified rows using sanitized aggregate blocker codes', () => {
  const coverage = summarizeStressCoverage({
    progress: { total: 4 },
    report: {
      counts: { EXISTANT_ET_TESTE: 1, EXISTANT_NON_TESTE: 2, PARTIEL: 1 },
      contracts: { inspected: 4, valid: 4, invalid: 0 },
      capabilities: [
        { id: 'safe.tested', truth_status: 'EXISTANT_ET_TESTE', auto_execution_blocked: null },
        { id: 'risk.private', truth_status: 'EXISTANT_NON_TESTE', auto_execution_blocked: 'RISK_NOT_LOW' },
        { id: 'cloudflare.secret', truth_status: 'EXISTANT_NON_TESTE', auto_execution_blocked: 'UNKNOWN_OR_EXTERNAL_COST' },
        { id: 'bad.user.text', truth_status: 'PARTIEL', auto_execution_blocked: 'SAMPLE_PREPARATION_FAILED:SECRET_VALUE_NEVER_EXPOSE' },
      ],
    },
  });
  assert.equal(coverage.runtime_tested, 1);
  assert.equal(coverage.runtime_unverified, 3);
  assert.equal(coverage.reason_breakdown_available, true);
  assert.deepEqual(coverage.runtime_unverified_reasons, {
    RISK_NOT_LOW: 1,
    SAMPLE_PREPARATION_FAILED: 1,
    UNKNOWN_OR_EXTERNAL_COST: 1,
  });
  assert.deepEqual(coverage.runtime_tested_by_domain, { other: 1 });
  assert.deepEqual(coverage.runtime_unverified_by_domain, { connectors_storage: 1, other: 2 });
  assert.doesNotMatch(JSON.stringify(coverage), /safe\\.tested|risk\\.private|cloudflare\\.secret|bad\\.user\\.text|SECRET_VALUE_NEVER_EXPOSE/i);
});

test('runtime blocker breakdown remains absent when persistent row data are unavailable', () => {
  const coverage = summarizeStressCoverage({
    progress: { total: 2 },
    report: { counts: { EXISTANT_ET_TESTE: 1, PARTIEL: 1 },
      contracts: { inspected: 2, valid: 2, invalid: 0 } },
  });
  assert.equal(coverage.reason_breakdown_available, false);
  assert.equal(coverage.runtime_unverified_reasons, null);
  assert.equal(coverage.runtime_tested_by_domain, null);
  assert.equal(coverage.runtime_unverified_by_domain, null);
});

test('runtime blocker breakdown rejects stale or contradictory row evidence', () => {
  const base = {
    progress: { total: 2 },
    report: { counts: { EXISTANT_ET_TESTE: 1, PARTIEL: 1 },
      contracts: { inspected: 2, valid: 2, invalid: 0 },
      capabilities: [
        { truth_status: 'EXISTANT_NON_TESTE', auto_execution_blocked: 'NO_BOUNDED_SAMPLE' },
        { truth_status: 'PARTIEL', auto_execution_blocked: 'RISK_NOT_LOW' },
      ] },
  };
  assert.throws(() => summarizeStressCoverage(base), /CAPABILITY_COVERAGE_EXECUTION_COUNT_MISMATCH/);
});
