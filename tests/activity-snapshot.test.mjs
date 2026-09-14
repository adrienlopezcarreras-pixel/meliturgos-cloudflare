import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivitySnapshot, classifyAuditAction } from '../src/activity/activity-snapshot.js';

test('activity categories are derived from persisted action names', () => {
  assert.equal(classifyAuditAction('memory.write'), 'memory');
  assert.equal(classifyAuditAction('lora.train'), 'learning');
  assert.equal(classifyAuditAction('ci.smoke.test'), 'test');
  assert.equal(classifyAuditAction('drive.backup'), 'backup');
  assert.equal(classifyAuditAction('cloudflare.deploy'), 'deployment');
  assert.equal(classifyAuditAction('teacher.review'), 'development');
});

test('activity snapshot exposes recorded evidence and no invented percentage', () => {
  const snapshot = buildActivitySnapshot({
    jobs: [{
      id: 'owner-chat-1',
      status: 'WAITING_TEACHER',
      goal: 'Corriger MEL',
      requested_by: 'owner-chat',
      created_at: 100,
      updated_at: 200,
      tests_json: JSON.stringify([{ name: 'smoke', ok: true }]),
      result_json: JSON.stringify({ dev_bridge: { needs_repair: false } }),
    }],
    audits: [{ id: 1, timestamp: 300, action: 'memory.write', details_json: '{"key":"x"}' }],
    lessons: [{ id: 'l1', created_at: 250, goal: 'conversation', lesson: 'Réponse naturelle validée', outcome: 'PASS', score: 1 }],
    backups: [{ id: 'b1', created_at: 150, object_key: 'checkpoint.json', metadata_json: '{}' }],
    deployment: { sha: 'abc123', branch: 'release/test' },
  });

  assert.equal(snapshot.deployment.sha, 'abc123');
  assert.ok(snapshot.events.some((event) => event.category === 'memory'));
  assert.ok(snapshot.events.some((event) => event.category === 'learning'));
  assert.ok(snapshot.events.some((event) => event.category === 'backup'));
  assert.ok(snapshot.events.some((event) => event.category === 'test'));
  const waiting = snapshot.events.find((event) => event.id === 'job:owner-chat-1');
  assert.match(waiting.explanation, /Teacher/);
  assert.match(waiting.explanation, /poursuivre|avancer/);
  assert.doesNotMatch(JSON.stringify(snapshot), /progress_percent|fake_percentage|%/i);
});
