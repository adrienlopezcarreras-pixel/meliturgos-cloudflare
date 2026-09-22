import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const WORKFLOWS = path.join(process.cwd(), '.github', 'workflows');
const CANONICAL = 'deploy-cloudflare-release.yml';
const GUARD = 'canonical-branch-unicity.yml';
const DEPLOY_PATTERN = /cloudflare\/wrangler-action|(^|\s)(npx\s+|pnpm\s+exec\s+)?wrangler\s+(deploy|publish)|npm\s+run\s+deploy|workers\/scripts/im;

function isIsolatedPreview(name, source) {
  if (name === 'deploy-candidate-preview.yml') return source.includes('--env preview');
  if (['deploy-dreamina-preview.yml','deploy-memory-export-preview.yml','deploy-memory-sync-preview.yml','gen2-31-browser-live-preview.yml'].includes(name)) {
    return /--config\s+wrangler\.[A-Za-z0-9._-]*preview\.jsonc/.test(source);
  }
  return false;
}

test('only the canonical release workflow can mutate Cloudflare production', async () => {
  const files = (await readdir(WORKFLOWS)).filter(name => /\.ya?ml$/i.test(name)).sort();
  const violations = [];
  for (const name of files) {
    if (name === CANONICAL || name === GUARD) continue;
    const source = await readFile(path.join(WORKFLOWS, name), 'utf8');
    if (DEPLOY_PATTERN.test(source) && !isIsolatedPreview(name, source)) violations.push(name);
  }
  assert.deepEqual(violations, [], 'parallel production deployment paths are forbidden');
});

test('canonical production release requires human approval and exact immutable identity', async () => {
  const source = await readFile(path.join(WORKFLOWS, CANONICAL), 'utf8');
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /DEPLOY_APPROVED/);
  assert.match(source, /release\/\*/);
  assert.match(source, /expected_sha/);
  assert.match(source, /test "\$RELEASE_SHA" = "\$EXPECTED_SHA"/);
  assert.match(source, /git fetch origin main --depth=1/);
  assert.match(source, /test "\$SOURCE_SHA" = "\$EXPECTED_SHA"/);
  assert.match(source, /for attempt in \$\(seq 1 20\); do/);
  assert.match(source, /x-mel-release-smoke: 1/);
  assert.match(source, /production-code-read-smoke\.json/);
  assert.match(source, /production-code-search-smoke\.json/);
  assert.match(source, /production-code-self-check\.json/);
  assert.match(source, /production-memory-status\.json/);
  assert.match(source, /production-professor\.html/);
  assert.match(source, /production-normal-runtime\.js/);
  assert.match(source, /PRODUCTION_SELF_CODE_BRANCH_MISMATCH/);
  assert.match(source, /PRODUCTION_MEMORY_NOT_ONLINE/);
  assert.match(source, /PRODUCTION_PROFESSOR_MARKER_MISSING/);
  assert.match(source, /PRODUCTION_NORMAL_RUNTIME_CHAT_WIRING_MISSING/);
  assert.match(source, /SEARCH_CODE="\$\(curl --silent --show-error --max-time 120 \\\n\s+--header "x-mel-release-smoke: 1"/);
  assert.match(source, /node - <<'NODE'\n\s+const fs=require\('fs'\);/);
  assert.match(source, /PRODUCTION_CAPABILITY_NOT_USED/);
  assert.match(source, /createDefaultCapabilityBus/);
  assert.match(source, /src\/capabilities\/default-bus\.js/);
  assert.match(source, /code\.read/);
  assert.match(source, /code\.search/);
  assert.ok(
    source.indexOf('Production authenticated /api/chat code.read + code.search smoke passed.') <
      source.indexOf('Production code self-check + memory + UI smoke passed.'),
    'chat self-code smoke must complete before the broader production smoke bundle',
  );
  assert.ok(
    source.indexOf('Production code self-check + memory + UI smoke passed.') <
      source.indexOf('cleanup_secret\n          trap - EXIT'),
    'all authenticated release smokes must run before the temporary bootstrap secret is deleted',
  );
  assert.match(source, /MEL_DEPLOYED_GIT_SHA/);
  assert.match(source, /MEL_DEPLOYED_GIT_BRANCH/);
});


test('candidate preview materializes an exact-SHA critical code bundle before ShardVault reconstruction', async () => {
  const source = await readFile(path.join(WORKFLOWS, 'deploy-candidate-preview.yml'), 'utf8');
  assert.match(source, /Build exact-SHA critical MEL code bundle/);
  assert.match(source, /mel-critical-code\.tar\.gz/);
  assert.match(source, /src shardvault worker\.js wrangler\.jsonc package\.json package-lock\.json/);
  assert.doesNotMatch(source, /src shardvault scripts tests worker\.js/);
  assert.match(source, /shardvault\/code-critical\/\$\{REPO_KEY\}\/\$\{GITHUB_SHA\}\.tar\.gz/);
  assert.match(source, /wrangler r2 object put/);
  assert.match(source, /--file mel-critical-code\.tar\.gz/);
  assert.match(source, /Prove ShardVault external code reconstruction/);
  assert.ok(
    source.indexOf('Upload exact-SHA critical MEL code bundle to preview R2') <
      source.indexOf('Prove ShardVault external code reconstruction'),
    'critical code bundle must exist before live reconstruction proof',
  );
});
