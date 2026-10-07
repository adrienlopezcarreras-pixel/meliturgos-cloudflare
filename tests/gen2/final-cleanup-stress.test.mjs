import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderFullMode } from '../../src/pages/full-interface-v2.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { flattenRoadmap, roadmapSummary } from '../../src/roadmap/master-roadmap.js';
import { creativeMediaCapabilityIds } from '../../src/capabilities/creative-media-capabilities.js';

function attrsOf(tag) {
  return tag.match(/^<button\b([^>]*)>/i)?.[1] || '';
}

function idOf(attrs) {
  return attrs.match(/\bid="([^"]+)"/i)?.[1] || null;
}

test('full control surface has no duplicate ids or orphan buttons', async () => {
  const response = await renderFullMode({});
  const html = await response.text();
  const source = await readFile(new URL('../../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const tags = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map(match => match[0]);
  assert.ok(tags.length >= 70, 'unexpectedly small control surface');

  const ids = [];
  const declarative = /\bdata-(?:view|jump|mode|pc-app|pc-key|pd-connect)="[^"]+"/i;
  for (const tag of tags) {
    const attrs = attrsOf(tag);
    const id = idOf(attrs);
    if (id) {
      ids.push(id);
      const references = source.split(id).length - 1;
      assert.ok(references >= 2, 'button has no runtime wiring: ' + id);
    } else {
      assert.match(attrs, declarative, 'anonymous button lacks a declarative action: ' + tag.slice(0, 160));
    }
  }

  assert.equal(new Set(ids).size, ids.length, 'duplicate button ids');
  assert.doesNotMatch(html, /id="mobileResumeAutonomy"/, 'redundant standalone mobile resume button returned');
  assert.match(source, /mobilePause[^\n]*autonomyControl\.paused===true\?'\/api\/gen2\/autonomy\/resume':'\/api\/gen2\/autonomy\/pause'/);
});

test('every registered core capability is real, unique and contract-valid', () => {
  const runtime = createGen2Runtime({ env: {} });
  const records = runtime.bus.list();
  assert.ok(records.length >= 80, 'capability inventory unexpectedly shrank');

  const ids = records.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate capability id');

  for (const row of records) {
    const declared = String(row.implementation_status || '').toUpperCase();
    assert.notEqual(declared, 'STUB', 'stub capability remains registered: ' + row.id);
    assert.notEqual(declared, 'NOT_IMPLEMENTED', 'unimplemented capability remains registered: ' + row.id);
    assert.ok(row.provider, 'provider missing: ' + row.id);
    assert.ok(['LOW','MEDIUM','HIGH'].includes(row.risk), 'invalid risk: ' + row.id);
    const contract = runtime.bus.contract(row.id);
    assert.equal(contract.valid, true, 'invalid capability contract: ' + row.id);
    assert.equal(contract.handler_registered, true, 'missing capability handler: ' + row.id);
  }

  const media = new Set(creativeMediaCapabilityIds());
  assert.equal(media.size, 12);
  for (const id of media) assert.ok(ids.includes(id), 'missing canonical media capability: ' + id);
});

test('roadmap truth has only the still-unproved media provider milestone open', () => {
  const rows = flattenRoadmap();
  const open = rows.filter(row => row.status !== 'DONE_VERIFIED');
  assert.deepEqual(open.map(row => ({ id: row.id, status: row.status })), [
    { id: 'MEL-MEDIA-02', status: 'PLANNED' },
  ]);

  const summary = roadmapSummary();
  assert.equal(summary.total, rows.length);
  assert.equal(summary.complete, rows.length - 1);
  assert.equal(summary.percent_complete, 99);
});
