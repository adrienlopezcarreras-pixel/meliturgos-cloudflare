import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-55 production release proves integrity and maturity through CapabilityBus', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /"id":"system\.integrity"/);
  assert.match(workflow, /production-system-integrity\.json/);
  assert.match(workflow, /GEN2_55_PRODUCTION_INTEGRITY_FAILED/);
  assert.match(workflow, /"id":"system\.maturity"/);
  assert.match(workflow, /production-system-maturity\.json/);
  assert.match(workflow, /GEN2_55_PRODUCTION_MATURITY_FAILED/);
});

test('GEN2-55 production proof remains fail-closed and read-only', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /exit 48/);
  assert.match(workflow, /exit 49/);
  assert.match(workflow, /automatic_repair!==false/);
  assert.match(workflow, /network_calls!==false/);
  assert.match(workflow, /Production GEN2-55 D1 integrity \+ maturity audits passed/);
});

test('roadmap records already-proven SEC-03 and GEN2-48 as DONE_VERIFIED', async () => {
  const roadmap = await readFile(
    new URL('../../src/roadmap/master-roadmap.js', import.meta.url),
    'utf8',
  );

  assert.match(
    roadmap,
    /item\('MEL-SEC-03',[^\n]*'DONE_VERIFIED'/,
  );
  assert.match(
    roadmap,
    /item\('GEN2-48',[^\n]*'DONE_VERIFIED'/,
  );
  assert.match(
    roadmap,
    /item\('GEN2-55',[^\n]*'IN_PROGRESS'/,
  );
});
