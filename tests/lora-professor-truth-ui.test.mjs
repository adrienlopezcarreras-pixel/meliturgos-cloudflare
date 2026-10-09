import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Professor LoRA panel exposes five truthful pipeline stages', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  for (const label of [
    '1. Entraînement',
    '2. Checkpoint immuable',
    '3. Validation / benchmark',
    '4. Promotion',
    '5. Actif dans MEL',
  ]) assert.ok(source.includes(label), `missing LoRA stage: ${label}`);

  assert.ok(source.includes('freeValidationState'), 'validation/benchmark state must be explicit');
  assert.ok(source.includes("traceStatus==='SUCCEEDED'&&Number(dailyTrace?.trace_verified)===1"), 'verified successful trace must be a durable proof input');
  assert.ok(source.includes("'CHECKPOINT VÉRIFIÉ'"), 'verified success trace must prevent stale checkpoint pending state');
  assert.ok(source.includes("'NON LANCÉE · OPTIONNELLE'"), 'unstarted optional promotion must not look like a failure');
  assert.ok(source.includes('const applicable=knownStages.filter(x=>x.known)'), 'progress must be computed from known/applicable stages');
});

test('Professor LoRA panel does not render empty benchmark pseudo-metrics', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  for (const id of [
    'freeImpactTechnical',
    'freeImpactSensitive',
    'freeImpactRefusal',
    'freeImpactBoundary',
    'freeImpactAgentic',
    'freeImpactDelta',
  ]) assert.ok(!source.includes(`id="${id}"`), `empty pseudo-metric should be hidden: ${id}`);
});
