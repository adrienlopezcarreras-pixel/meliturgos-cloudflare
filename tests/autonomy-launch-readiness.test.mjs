import test from 'node:test';
import assert from 'node:assert/strict';

import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import {
  evaluateFailureHygiene,
  getAutonomyLaunchReadiness,
} from '../src/evolution/launch-readiness.js';
import { maybeHandlePublicTeacherBridge } from '../src/teachers/public-teacher-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function bucket() {
  const objects = new Map();
  return {
    async put(key, value) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      objects.set(key, bytes);
    },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        size: bytes.byteLength,
        async text() { return new TextDecoder().decode(bytes); },
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      };
    },
    async head(key) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
    async delete(key) { objects.delete(key); },
    async list({ prefix = '', cursor } = {}) {
      if (cursor) return { truncated: false, objects: [] };
      return {
        truncated: false,
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, bytes]) => ({ key, size: bytes.byteLength, etag: key, uploaded: null })),
      };
    },
  };
}

test('historical owner failures never block launch and MEL roadmap retry storms are bounded', () => {
  const jobs = [];
  for (let i = 0; i < 50; i += 1) {
    jobs.push({ id: 'owner-' + i, requested_by: 'owner-chat', status: 'FAILED', error: 'old-owner-error' });
  }
  for (let i = 1; i <= 3; i += 1) {
    jobs.push({
      id: 'mel-' + i,
      requested_by: 'mel-autonomy',
      status: 'FAILED',
      optional_context: { roadmap_id: 'MEL-WORK-01', attempt: i },
      error: 'runtime-failure',
    });
  }
  const result = evaluateFailureHygiene(jobs);
  assert.equal(result.ok, true);
  assert.equal(result.historical_failed_count, 53);
  assert.ok(result.quarantined_roadmap_ids.includes('MEL-WORK-01'));
  assert.equal(result.unbounded_failed_count, 0);
  assert.equal(result.retry_cap, 3);
});

test('unscoped autonomous failures fail the launch gate instead of retrying invisibly', () => {
  const result = evaluateFailureHygiene([
    { id: 'bad', requested_by: 'mel-autonomy', status: 'FAILED', error: 'unknown-scope' },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.unbounded_failed_count, 1);
  assert.equal(result.code, 'UNSCOPED_FAILED_WORK_REQUIRES_REVIEW');
});

test('isolated preview can prove launch gate with synthetic restore without production mutation', async () => {
  const DB = sqliteD1();
  const MEDIA_BUCKET = bucket();
  const repository = new D1DevJobRepository(DB);
  try {
    const readiness = await getAutonomyLaunchReadiness({
      DB,
      MEDIA_BUCKET,
      MEL_PREVIEW_ISOLATED: 'true',
      MEL_RUNTIME_ENV: 'preview',
      MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
      MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
      MEL_DEPLOYED_GIT_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }, { repository });
    assert.equal(readiness.launch_ready, true, JSON.stringify(readiness));
    assert.equal(readiness.status, 'GO_FOR_SUPERVISED_AUTONOMY');
    assert.equal(readiness.restore.status, 'SYNTHETIC_PREVIEW_RESTORE_VERIFIED');
    assert.equal(readiness.shardvault.preview_only, true);
    assert.match(readiness.gate_digest, /^[a-f0-9]{64}$/);
  } finally {
    DB.close();
  }
});

test('public launch-readiness proof is read-only and minimized', async () => {
  const response = await maybeHandlePublicTeacherBridge(
    new Request('http://mel/api/teacher/launch-readiness'),
    {},
    { repository: new D1DevJobRepository(null, { memoryStore: new Map() }) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mutation_allowed, false);
  assert.equal(body.exposes_secrets, false);
  assert.equal(body.exposes_memory, false);
  assert.equal(Array.isArray(body.blockers), true);
  assert.equal('active_work' in body, false);
});
