import test from 'node:test';
import assert from 'node:assert/strict';
import { DevAgent, ChangePlan, ChangeSet, TestResult, ReleaseCandidate } from '../../src/dev/dev-agent.js';
import { MediaService } from '../../src/media/media-service.js';

test('DevAgent keeps changes in a candidate until an evidenced release candidate', async () => {
  const events = [];
  const state = { commit: 'base-1', candidate: null };
  const agent = new DevAgent({
    diagnose: async input => { events.push('diagnose'); return { failure: input.failure, root_cause: 'fixture failure' }; },
    plan: async input => { events.push('plan'); return ChangePlan({ base_commit: state.commit, files: ['fixture.txt'], steps: [input.root_cause] }); },
    branch: async input => { events.push('branch'); return { branch: `gen2/${input.id}`, base_commit: state.commit }; },
    edit: async input => { events.push('edit'); state.candidate = { ...input, head_commit: 'candidate-1' }; return state.candidate; },
    test: async () => { events.push('test'); return TestResult({ head_commit: 'candidate-1', command: 'node --test fixture', exit_code: 0 }); },
    stage: async input => { events.push('stage'); return { ...input, staged: true }; },
    compare: async () => { events.push('compare'); return { changed: ['fixture.txt'], production_untouched: true }; },
    report: async input => { events.push('report'); return input; },
    releaseCandidate: async input => { events.push('release'); return ReleaseCandidate({ change: { ...input.change, head_commit: 'candidate-1' }, tests: input.tests }); },
    rollback: async () => { events.push('rollback'); state.candidate = null; return { rolled_back: true, stable_commit: state.commit }; }
  });
  const diagnosis = await agent.diagnose({ failure: 'fixture' });
  const plan = await agent.plan(diagnosis);
  const branch = await agent.branch(plan);
  const change = await agent.edit({ plan, branch });
  const result = await agent.test(change);
  const staged = await agent.stage(change);
  await agent.compare(staged);
  const candidate = await agent.releaseCandidate({ change, tests: [result] });
  const report = await agent.report({ candidate, production_untouched: true });
  assert.equal(report.candidate.status, 'RELEASE_CANDIDATE');
  assert.deepEqual(events, ['diagnose','plan','branch','edit','test','stage','compare','release','report']);
  assert.equal((await agent.rollback()).rolled_back, true);
});

test('MediaService stores binary in bucket and metadata in D1, with attachment reference', async () => {
  const rows = new Map();
  const objects = new Map();
  const db = { prepare(sql) { return { bind(...args) { return { async run() { if (sql.startsWith('INSERT')) rows.set(args[0], { id: args[0], type: args[1], mime_type: args[2], filename: args[3], size: args[4], r2_key: args[7], content_hash: args[8] }); else if (sql.startsWith('DELETE')) rows.delete(args[0]); }, async first() { return rows.get(args[0]) || null; } }; } }; } };
  const bucket = { async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); }, async get(key) { return objects.get(key) || null; }, async delete(key) { objects.delete(key); } };
  const service = new MediaService({ DB: db, MEDIA_BUCKET: bucket });
  const bytes = new TextEncoder().encode('mock document');
  const uploaded = await service.upload({ bytes, mime_type: 'text/plain', filename: 'note.txt', type: 'DOCUMENT' });
  assert.equal(uploaded.type, 'DOCUMENT');
  const metadata = await service.metadata({ id: uploaded.id });
  assert.equal(metadata.filename, 'note.txt');
  assert.deepEqual(await service.get({ id: uploaded.id }), bytes);
  const attachment = { id: uploaded.id, conversation_id: 'conversation-1' };
  assert.equal((await service.metadata(attachment)).id, uploaded.id);
  assert.deepEqual(await service.delete({ id: uploaded.id }), { id: uploaded.id, deleted: true });
  await assert.rejects(() => service.metadata({ id: uploaded.id }), /MEDIA_NOT_FOUND/);
});
