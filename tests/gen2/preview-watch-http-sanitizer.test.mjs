import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizedPreviewWatchFailure } from '../../scripts/sanitize-preview-watch-http.mjs';

test('GEN2-42 preview reports 503 and safe provider codes only', () => {
  const result = sanitizedPreviewWatchFailure({
    code: 'ECOSYSTEM_WATCH_TEMPORARILY_UNAVAILABLE',
    detail: 'secret-token-123456789 private prompt text',
  }, '503');
  assert.deepEqual(result, {
    ok: false,
    code: 'GEN2_42_PREVIEW_WATCH_HTTP_FAILED',
    http_status: 503,
    provider_code: 'ECOSYSTEM_WATCH_TEMPORARILY_UNAVAILABLE',
  });
  assert.doesNotMatch(JSON.stringify(result), /secret-token|private prompt/);
});
test('unsanitized exception messages cannot leak into preview proof logs', () => {
  const response = sanitizedPreviewWatchFailure({
    error: { code: 'Bearer secret-token-123456789' },
    stack: 'internal worker stack private prompt',
  }, 503);
  assert.equal(response.provider_code, 'UNCLASSIFIED');
  assert.doesNotMatch(JSON.stringify(response), /secret-token|prompt|stack/);
  assert.equal(sanitizedPreviewWatchFailure(null, 'bogus').http_status, 0);
});
test('failed GEN2-42 watch never counts as proof and does not retry forced POST blindly', () => {
  const workflow = readFileSync('.github/workflows/deploy-candidate-preview.yml', 'utf8');
  const start = workflow.indexOf('- name: Run isolated GEN2-42 sourced watch proof');
  const end = workflow.indexOf('\n      - name:', start + 10);
  const step = workflow.slice(start, end < 0 ? undefined : end);
  assert.match(step, /WATCH_HTTP_CODE="\$\(curl/);
  assert.match(step, /--write-out '%\{http_code\}'/);
  assert.match(step, /node scripts\/sanitize-preview-watch-http\.mjs capability-watch-run\.json/);
  assert.match(step, /if \[ "\$\{WATCH_HTTP_CODE\}" != "200" \]; then[\s\S]*?exit 1/);
  assert.doesNotMatch(step, /--retry(?:\s|$)|--retry-all-errors/);
  assert.doesNotMatch(step, /cat capability-watch-run\.json/);
});
