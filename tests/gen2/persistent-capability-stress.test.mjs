import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import {
  readPersistentCapabilityStress,
  startPersistentCapabilityStress,
} from '../../src/diagnostics/persistent-capability-stress.js';

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

    const completed = await startPersistentCapabilityStress({
      bus,
      db,
      context: { owner: 'test', permissions: [] },
    });

    assert.equal(completed.status, 'COMPLETE');
    assert.match(completed.job_id, /^cap-stress-/);
    assert.equal(completed.progress.pass, 2);
    assert.equal(completed.progress.done, 1);
    assert.equal(executions, 2, 'one first-pass execution plus one bounded retry');

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
