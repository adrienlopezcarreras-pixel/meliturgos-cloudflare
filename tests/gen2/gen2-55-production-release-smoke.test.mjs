import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-55 production release calls integrity and maturity through CapabilityBus', async () => {
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

test('GEN2-55 production release stays fail-closed and read-only', async () => {
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
