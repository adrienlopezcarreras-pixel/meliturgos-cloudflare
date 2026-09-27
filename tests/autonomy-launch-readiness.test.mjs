import test from 'node:test';
import assert from 'node:assert/strict';

import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import {
  evaluateFailureHygiene,
  evaluateRestoreReadiness,
  evaluateShardVaultLaunchReadiness,
  getAutonomyLaunchReadiness,
  prepareAutonomyLaunchCodeSync,
  prepareAutonomyLaunchBackup,
  prepareAutonomyLaunch,
} from '../src/evolution/launch-readiness.js';
import { maybeHandlePublicTeacherBridge } from '../src/teachers/public-teacher-api.js';
import { runScheduledSystemBackup } from '../src/backup/system-backup-runtime.js';
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

test('release launch backup uses compact post-persist proof without rereading the R2 payload', async () => {
  const DB = sqliteD1();
  const MEDIA_BUCKET = bucket();
  let getCount = 0;
  const originalGet = MEDIA_BUCKET.get.bind(MEDIA_BUCKET);
  MEDIA_BUCKET.get = async (...args) => {
    getCount += 1;
    return originalGet(...args);
  };
  const sha = 'abababababababababababababababababababab';
  const env = {
    DB,
    MEDIA_BUCKET,
    MEL_RUNTIME_ENV: 'production',
    MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_DEPLOYED_GIT_SHA: sha,
  };
  try {
    const backup = await prepareAutonomyLaunchBackup(env);
    assert.equal(backup.ok, true, JSON.stringify(backup));
    assert.equal(getCount, 0, 'release backup must not reread the persisted R2 payload');

    const restore = await evaluateRestoreReadiness(env);
    assert.equal(restore.ok, true, JSON.stringify(restore));
    assert.equal(restore.backup_deployed_sha, sha);
    assert.equal(getCount, 0, 'compact launch readiness must remain metadata-only');
  } finally {
    DB.close();
  }
});

test('encrypted production backup is readable by restore readiness', async () => {
  const DB = sqliteD1();
  const MEDIA_BUCKET = bucket();
  const sha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const env = {
    DB,
    MEDIA_BUCKET,
    MEL_RUNTIME_ENV: 'production',
    MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_DEPLOYED_GIT_SHA: sha,
    MEL_BACKUP_ENCRYPTION_KEY_ID: 'launch-readiness-test-key',
    MEL_BACKUP_ENCRYPTION_KEY_B64: Buffer.alloc(32, 7).toString('base64'),
  };
  try {
    const backup = await runScheduledSystemBackup(env, {
      force: true,
      now: () => '2026-09-27T06:30:00.000Z',
    });
    assert.equal(backup.ok, true, JSON.stringify(backup));
    assert.equal(backup.status, 'CREATED_VERIFIED');

    const restore = await evaluateRestoreReadiness(env);
    assert.equal(restore.ok, true, JSON.stringify(restore));
    assert.equal(restore.status, 'LATEST_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED');
    assert.equal(restore.sha_matches, true);
    assert.equal(restore.backup_deployed_sha, sha);
  } finally {
    DB.close();
  }
});
test('legacy backup without compact restore proof fails closed without loading R2 payload', async () => {
  const DB = sqliteD1();
  let getCount = 0;
  const MEDIA_BUCKET = bucket();
  const originalGet = MEDIA_BUCKET.get.bind(MEDIA_BUCKET);
  MEDIA_BUCKET.get = async (...args) => { getCount += 1; return originalGet(...args); };
  try {
    const now = Date.parse('2026-09-27T06:40:00.000Z');
    await DB.prepare('CREATE TABLE IF NOT EXISTS backup_objects(id TEXT PRIMARY KEY, object_key TEXT NOT NULL, metadata_json TEXT, created_at INTEGER NOT NULL)').run();
    await DB.prepare('INSERT INTO backup_objects(id,object_key,metadata_json,created_at) VALUES(?,?,?,?)')
      .bind('legacy-proofless','backups/system/legacy-proofless.enc.json',JSON.stringify({
        createdAt: '2026-09-27T06:40:00.000Z',
        integritySha256: 'a'.repeat(64),
        sourceCount: 3,
        verified: true,
        encrypted: true,
      }),now).run();

    const restore = await evaluateRestoreReadiness({
      DB,
      MEDIA_BUCKET,
      MEL_RUNTIME_ENV: 'production',
      MEL_DEPLOYED_GIT_SHA: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    assert.equal(restore.ok, false);
    assert.equal(restore.status, 'SYSTEM_BACKUP_RESTORE_PROOF_MISSING');
    assert.equal(getCount, 0);
  } finally {
    DB.close();
  }
});

test('prepareAutonomyLaunch reuses exact SHA-bound compact restore proof without creating another backup', async () => {
  const DB = sqliteD1();
  const MEDIA_BUCKET = bucket();
  const sha = 'cccccccccccccccccccccccccccccccccccccccc';
  const env = {
    DB,
    MEDIA_BUCKET,
    MEL_RUNTIME_ENV: 'production',
    MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_DEPLOYED_GIT_SHA: sha,
    MEL_SHARDVAULT_ENABLED: 'false',
    MEL_SHARDVAULT_ROADMAP_PAUSED: 'true',
  };
  try {
    await runScheduledSystemBackup(env, {
      force: true,
      now: () => '2026-09-27T06:50:00.000Z',
    });
    const first = await getAutonomyLaunchReadiness(env, { repository: new D1DevJobRepository(DB) });
    assert.equal(first.launch_ready, true, JSON.stringify(first));

    const prepared = await prepareAutonomyLaunch(env, { repository: new D1DevJobRepository(DB) });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.equal(prepared.status, 'LAUNCH_EVIDENCE_REUSED');
    assert.equal(prepared.backup.status, 'REUSED_VERIFIED_SHA_BOUND_BACKUP');
    assert.equal(prepared.readiness.candidate_sha, sha);
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


test('roadmap pause makes ShardVault an explicit temporary non-blocking gate without claiming recovery', async () => {
  const env = {
    MEL_SHARDVAULT_ENABLED: 'false',
    MEL_SHARDVAULT_ROADMAP_PAUSED: 'true',
  };
  const shard = await evaluateShardVaultLaunchReadiness(env);
  assert.equal(shard.ok, true);
  assert.equal(shard.status, 'PAUSED_FOR_ROADMAP');
  assert.equal(shard.paused, true);
  assert.equal(shard.temporary, true);
  assert.equal(shard.recoverable, false);
  assert.equal(shard.active_external_count, 0);
  assert.equal(shard.external_code_endpoints, 0);
  assert.equal(shard.resume_condition, 'ROADMAP_COMPLETE');

  const sync = await prepareAutonomyLaunchCodeSync(env);
  assert.equal(sync.ok, true);
  assert.equal(sync.complete, true);
  assert.equal(sync.status, 'PAUSED_FOR_ROADMAP');
  assert.equal(sync.code_sync.paused, true);
  assert.deepEqual(sync.code_sync.endpoints, []);
});

test('ShardVault roadmap pause is opt-in and does not weaken normal production verification', async () => {
  const shard = await evaluateShardVaultLaunchReadiness({
    MEL_SHARDVAULT_ENABLED: 'false',
    MEL_SHARDVAULT_ROADMAP_PAUSED: 'false',
  });
  assert.equal(shard.ok, false);
  assert.notEqual(shard.status, 'PAUSED_FOR_ROADMAP');
});
