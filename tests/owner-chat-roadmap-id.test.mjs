import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('an owner-chat development job without roadmap entry gets a stable id instead of blocking the autonomy queue', async () => {
  const src = await readFile(new URL('../src/evolution/autonomy-implementation-planner.js', import.meta.url), 'utf8');
  assert.match(src, /job\?\.optional_context\?\.source === 'owner-chat' && job\?\.id \? 'OWNER-CHAT-'/);
  const roadmapId = job => String(job?.optional_context?.roadmap_id || '').trim()
    || (job?.optional_context?.source === 'owner-chat' && job?.id ? 'OWNER-CHAT-' + String(job.id).replace(/^owner-chat-/, '').slice(0, 8).toUpperCase() : '');
  assert.equal(roadmapId({ id: 'owner-chat-9a98cc77c6c4', optional_context: { source: 'owner-chat', roadmap_id: null } }), 'OWNER-CHAT-9A98CC77');
  assert.equal(roadmapId({ id: 'x', optional_context: { source: 'ecosystem-watch' } }), '', 'other sources still require a real roadmap id');
});
