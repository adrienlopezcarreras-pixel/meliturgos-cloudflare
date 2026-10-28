import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MAX D1 forensic workflow never modifies data or prints mission payloads', async () => {
  const source = await readFile(new URL('../../.github/workflows/max-d1-readonly-diagnostics.yml', import.meta.url), 'utf8');
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /paths:/);
  assert.match(source, /max-d1-readonly-diagnostics\.yml/);
  assert.match(source, /wrangler d1 execute DB --remote --config wrangler\.jsonc/);
  assert.match(source, /WHERE requested_by='mel-autonomy'/);
  assert.match(source, /GROUP BY status,block_code,phase/);
  assert.match(source, /CASE\s*\n\s*WHEN json_extract\(attempt\.value,'\$\.error'\) IN/);
  assert.match(source, /GROUP BY failure_class/);
  assert.match(source, /FAILURE_SQL/);
  assert.doesNotMatch(source, /SELECT\s+json_extract\(attempt\.value,'\$\.error'\)/i);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\s+(?:INTO|FROM|TABLE|dev_jobs)\b/i);
  assert.doesNotMatch(source, /SELECT\s+(?:\*|id|goal|result_json|plan_json|patch_json)\b/i);
  assert.doesNotMatch(source, /\b(?:upload-artifact|write-all|issues:\s*write)\b/i);
});
