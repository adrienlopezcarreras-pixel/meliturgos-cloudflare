import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShardVaultMemoryPayload } from '../src/continuity/shardvault-memory-export.js';

function fakeDb(fixtures = {}) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      queries.push(String(sql));
      const match = String(sql).match(/FROM\s+([A-Za-z0-9_]+)/i);
      const table = match?.[1] || '';
      return {
        bind() {
          return {
            async all() {
              return { results: structuredClone(fixtures[table] || []) };
            },
          };
        },
      };
    },
  };
}

test('ShardVault v2 includes control-plane state required for regeneration without secrets', async () => {
  const db = fakeDb({
    memories: [{ id: 1, content: 'memory' }],
    conversations: [{ id: 'c1' }],
    archive_messages: [{ id: 'a1' }],
    automations: [{ id: 'auto1', api_token: ['ghp', '_', 'example', 'token'].join('') }],
    automation_runs: [{ id: 'run1' }],
    dev_jobs: [{ id: 'job1', status: 'COMPLETED' }],
    dev_bridge_state: [{
      bridge_id: 'mel-autonomy-control',
      status: 'MAX_AUTONOMY',
      metadata_json: JSON.stringify({ max_autonomy: true }),
    }],
    mentor_lessons: [{ id: 'lesson1', note: ['Bearer', 'example-token-value'].join(' ') }],
    capability_watch_state: [{ id: 'watch1' }],
    timeline_events: [{ id: 'event1' }],
    mel_skill_registry_snapshots: [{ registry_key: 'system', snapshot_json: '{}' }],
    plugin_versions: [{ plugin_id: 'p1', version: '1.0.0' }],
    plugin_active_versions: [{ plugin_id: 'p1', version: '1.0.0' }],
    plugin_activation_history: [{ sequence: 1, plugin_id: 'p1', action: 'ACTIVATE' }],
  });

  const payload = await buildShardVaultMemoryPayload({ DB: db, MELITURGOS_USER: 'owner' }, {
    now: '2026-09-28T17:20:00.000Z',
  });

  assert.equal(payload.version, 2);
  assert.equal(payload.policy.credential_tables_included, false);
  assert.equal(payload.policy.structured_secret_fields_redacted, true);
  assert.equal(payload.policy.secret_shaped_values_redacted, true);
  assert.equal(payload.policy.oauth_tokens_included, false);
  assert.equal(payload.policy.api_credentials_included, false);

  assert.equal(payload.recovery_state.dev_bridge_state[0].status, 'MAX_AUTONOMY');
  assert.equal(payload.recovery_state.automations.length, 1);
  assert.equal(payload.recovery_state.automations[0].api_token, '[REDACTED]');
  assert.equal(payload.recovery_state.mentor_lessons[0].note, '[REDACTED]');
  assert.equal(payload.recovery_state.skill_registry_snapshots.length, 1);
  assert.equal(payload.recovery_state.plugin_versions.length, 1);
  assert.ok(payload.recovery_state.roadmap.length > 0);

  const queried = db.queries.join('\n');
  assert.doesNotMatch(queried, /mel_oauth_tokens/i);
  assert.doesNotMatch(queried, /oauth.*token/i);
  assert.doesNotMatch(queried, /secret/i);
});

test('ShardVault regeneration export tolerates optional recovery tables not existing yet', async () => {
  const db = {
    prepare(sql) {
      const table = String(sql).match(/FROM\s+([A-Za-z0-9_]+)/i)?.[1] || '';
      return {
        bind() {
          return {
            async all() {
              if (['memories', 'conversations', 'archive_messages'].includes(table)) {
                return { results: [] };
              }
              throw new Error('no such table');
            },
          };
        },
      };
    },
  };

  const payload = await buildShardVaultMemoryPayload({ DB: db }, {
    now: '2026-09-28T17:21:00.000Z',
  });

  assert.equal(payload.version, 2);
  assert.equal(payload.counts.dev_jobs, 0);
  assert.equal(payload.counts.plugin_versions, 0);
  assert.ok(Array.isArray(payload.recovery_state.roadmap));
});
