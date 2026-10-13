import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('preview fails closed on resource identities before any D1, R2 or Worker mutation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-candidate-preview.yml', import.meta.url), 'utf8');
  const guard = workflow.indexOf('name: Require isolated preview resource identities before any mutation');
  const migrate = workflow.indexOf('name: Initialize isolated preview D1');
  const r2 = workflow.indexOf('name: Upload exact-SHA critical MEL code bundle to preview R2');
  const deploy = workflow.indexOf('name: Deploy isolated preview Worker');
  assert.ok(guard > 0 && migrate > guard && r2 > migrate && deploy > r2,
    'resource guard and D1 migration must run before every preview storage/Worker mutation');
  assert.ok(workflow.includes('MEL_PREVIEW_D1_DATABASE_ID'));
  assert.ok(workflow.includes('MEL_PREVIEW_R2_BUCKET'));
  assert.ok(workflow.includes('PREVIEW_D1_ISOLATED_UUID_REQUIRED'));
  assert.ok(workflow.includes('PREVIEW_R2_ISOLATED_BUCKET_REQUIRED'));
  assert.ok(workflow.includes("d1.toLowerCase() === String(productionD1?.database_id || '').toLowerCase()"));
  assert.ok(workflow.includes("bucket === productionR2?.bucket_name"));
  assert.ok(workflow.includes('OBJECT_PATH="${MEL_PREVIEW_R2_BUCKET}/shardvault/code-critical/'));
  assert.ok(!workflow.includes('OBJECT_PATH="meliturgos-private-media/'));
});

test('preview isolation never borrows incomplete binding as a live D1 identity', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-candidate-preview.yml', import.meta.url), 'utf8');
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.env.preview.vars.MEL_PREVIEW_ISOLATED, 'true');
  assert.notEqual(config.env.preview.d1_databases[0].database_id, config.d1_databases[0].database_id);
  assert.ok(workflow.includes('config.env.preview.d1_databases = [{'));
  assert.ok(workflow.includes("database_id: d1,"));
  assert.ok(workflow.includes("config.env.preview.r2_buckets = [{ binding: 'MEDIA_BUCKET', bucket_name: bucket }]"));
});

test('skipped preview stages do not invent diagnostic artifacts or call the autonomy pause endpoint', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-candidate-preview.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes('id: preview_d1_migrate'));
  assert.ok(workflow.includes("if: ${{ always() && steps.preview_d1_migrate.outcome != 'skipped' }}"));
  assert.ok(workflow.includes('id: preview_http_smoke'));
  assert.ok(workflow.includes("if: ${{ always() && steps.preview_http_smoke.outcome != 'skipped' }}"));
  assert.ok(workflow.includes('id: preview_autonomy_proof'));
  assert.ok(workflow.includes("if: ${{ always() && steps.preview_autonomy_proof.outcome != 'skipped' }}"));
  assert.ok(workflow.includes('if-no-files-found: error'), 'missing required diagnostic remains an error if its stage ran');
  assert.ok(workflow.indexOf('name: Require isolated preview resource identities before any mutation')
    < workflow.indexOf('name: Initialize isolated preview D1'));
});

test('D1 and HTTP artifacts never publish raw preview response content', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-candidate-preview.yml', import.meta.url), 'utf8');
  const migrate = workflow.slice(workflow.indexOf('name: Initialize isolated preview D1'),
    workflow.indexOf('name: Sanitize D1 migration diagnostic'));
  const sanitize = workflow.slice(workflow.indexOf('name: Sanitize D1 migration diagnostic'),
    workflow.indexOf('name: Upload sanitized D1 migration diagnostic'));
  const http = workflow.slice(workflow.indexOf('name: Smoke test isolated preview HTTP'),
    workflow.indexOf('name: Smoke all canonical UI surfaces'));
  assert.ok(!migrate.includes('cat wrangler-d1-preview.log'));
  assert.ok(sanitize.includes('GITHUB_STEP_SUMMARY'));
  assert.ok(sanitize.includes('wrangler-d1-preview.sanitized.log'));
  assert.ok(!http.includes('cat preview-headers.txt'));
  assert.ok(!http.includes('head -c 1200 preview-root.html'));
  assert.ok(http.includes('body_bytes='));
  assert.ok(http.includes('html_received='));
});
