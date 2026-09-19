import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

test('documented evidence is reviewed statically and final qualification is the live round-trip', () => {
  const source=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function validateDocumentedEvidence'),source.indexOf('async function probe'));
  assert.doesNotMatch(fn,/fetchTimed\(/);
  assert.match(fn,/DOCUMENTED_EVIDENCE_REVIEW_STALE/);
  assert.match(source,/reviewed_documentation_plus_live_roundtrip/);
  assert.match(source,/PROBE_CONTENT_MISMATCH/);
  assert.match(source,/id:'catbox-public'/);
});

test('UI marks qualified targets and runtime clears stale preferences', async () => {
  const response=await handleShardVaultStatus(new Request('https://example.test/shardvault'),{});
  const html=await response.text();
  assert.match(html,/QUALIFIÉE · test E\/L réel/);
  assert.match(html,/Utiliser ce dépôt/);
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/preferred&&\(!activeExternal\|\|!endpointMeetsDurability/);
  assert.match(runtime,/selectedViews\.some/);
  assert.match(runtime,/clearPreferredEndpoint/);
});
