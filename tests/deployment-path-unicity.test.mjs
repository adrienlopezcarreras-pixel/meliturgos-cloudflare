import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const WORKFLOWS = path.join(process.cwd(), '.github', 'workflows');
const CANONICAL = 'deploy-cloudflare-release.yml';
const DEPLOY_PATTERN = /cloudflare\/wrangler-action|(^|\s)(npx\s+)?wrangler\s+deploy|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/im;

test('only the canonical release workflow can mutate Cloudflare production', async () => {
  const files = (await readdir(WORKFLOWS)).filter(name => /\.ya?ml$/i.test(name)).sort();
  const violations = [];
  for (const name of files) {
    if (name === CANONICAL) continue;
    const source = await readFile(path.join(WORKFLOWS, name), 'utf8');
    if (DEPLOY_PATTERN.test(source)) violations.push(name);
  }
  assert.deepEqual(violations, [], 'parallel Cloudflare deployment paths are forbidden');
});

test('canonical production release requires human approval and exact immutable identity', async () => {
  const source = await readFile(path.join(WORKFLOWS, CANONICAL), 'utf8');
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /DEPLOY_APPROVED/);
  assert.match(source, /release\/\*/);
  assert.match(source, /expected_sha/);
  assert.match(source, /test "\$RELEASE_SHA" = "\$EXPECTED_SHA"/);
  assert.match(source, /test "\$CANONICAL_SHA" = "\$EXPECTED_SHA"/);
  assert.match(source, /MEL_DEPLOYED_GIT_SHA/);
  assert.match(source, /MEL_DEPLOYED_GIT_BRANCH/);
});
