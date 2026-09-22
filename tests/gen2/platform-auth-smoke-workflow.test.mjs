import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/gen2-36-authenticated-provider-smokes.yml', 'utf8');

test('GEN2-36 authenticated provider smoke is main-only and uses explicit GitHub Actions write permission', () => {
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /gen2-36-provider-write-smoke\.yml\/dispatches/);
});

test('GEN2-36 external provider smoke stays non-destructive outside the harmless GitHub dispatch', () => {
  assert.match(workflow, /api\.cloudflare\.com\/client\/v4\/accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}/);
  assert.match(workflow, /api\.vercel\.com\/v2\/user/);
  assert.doesNotMatch(workflow, /api\.cloudflare\.com[^\n]*(?:--request|-X)\s+(?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(workflow, /api\.vercel\.com[^\n]*(?:--request|-X)\s+(?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(workflow, /wrangler\s+deploy|vercel\s+deploy/i);
});

test('GEN2-36 smoke fails closed when provider credentials or targets are unavailable', () => {
  assert.match(workflow, /test -n "\$CLOUDFLARE_API_TOKEN"/);
  assert.match(workflow, /test -n "\$CLOUDFLARE_ACCOUNT_ID"/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_TARGET_MISMATCH/);
  assert.match(workflow, /VERCEL_TOKEN_MISSING/);
  assert.match(workflow, /VERCEL_AUTH_SMOKE_FAILED/);
});
