import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const WORKFLOWS = path.join(process.cwd(), '.github', 'workflows');
const CANONICAL = 'deploy-cloudflare-release.yml';
const GUARD = 'canonical-branch-unicity.yml';
const DEPLOY_PATTERN = /cloudflare\/wrangler-action|(^|\s)(npx\s+|pnpm\s+exec\s+)?wrangler\s+(deploy|publish)|npm\s+run\s+deploy/im;
const RAW_CLOUDFLARE_MUTATION_PATTERN = /--request\s+(POST|PUT|PATCH|DELETE)(?:[^\n]*\\\n){0,20}[^\n]*https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[^\s"'\\]+\/workers\/scripts/i;

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
    const mutatesProduction = DEPLOY_PATTERN.test(source) || RAW_CLOUDFLARE_MUTATION_PATTERN.test(source);
    if (mutatesProduction && !isIsolatedPreview(name, source)) violations.push(name);
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
  assert.match(source, /git fetch origin main/);
  assert.match(source, /git merge-base --is-ancestor "\$EXPECTED_SHA" "\$SOURCE_SHA"/);
  assert.match(source, /git rev-list --parents -n 1 "\$EXPECTED_SHA"/);
  assert.match(source, /RELEASE_TREE="\$\(git rev-parse "\$EXPECTED_SHA\^\{tree\}"\)"/);
  assert.match(source, /PARENT_TREE="\$\(git rev-parse "\$PARENT_SHA\^\{tree\}"\)"/);
  assert.match(source, /test -n "\$CANONICAL_MAIN_SHA"/);
  assert.match(source, /git rev-list --count "\$CANONICAL_MAIN_SHA\.\.\$SOURCE_SHA"/);
  assert.match(source, /test "\$MAIN_ADVANCE_COUNT" -le 25/);
  assert.match(source, /for PAUSE_ATTEMPT in \$\(seq 1 12\); do/);
  assert.match(source, /--data '\{"phase":"pause"\}'/);
  assert.match(source, /test "\$PAUSE_READY" = "1"/);
  assert.match(source, /for BACKUP_ATTEMPT in \$\(seq 1 3\); do/);
  assert.match(source, /--data '\{"phase":"backup"\}'/);
  const timeout=/timeout-minutes:\s*(\d+)/.exec(source);
  assert.ok(timeout,'canonical release timeout must be explicit');
  assert.ok(Number(timeout[1])>=75,'canonical release timeout must cover bounded ShardVault retry windows');
  assert.match(source, /CODE_SYNC_MAX_ACTIVE_ATTEMPTS=32/);
  assert.match(source, /CODE_SYNC_MAX_STALL=12/);
  assert.match(source, /CODE_SYNC_DEADLINE_EPOCH=\$\(\( \$\(date \+%s\) \+ 1200 \)\)/);
  assert.match(source, /while \[ "\$CODE_SYNC_READY" != "1" \] && \[ "\$\(date \+%s\)" -lt "\$CODE_SYNC_DEADLINE_EPOCH" \]; do/);
  assert.match(source, /PRODUCTION_CODE_SYNC_FINAL_NOT_COMPLETE/);
  assert.match(source, /PRODUCTION_CODE_SYNC_FINAL_NOT_RELEASE_SAFE/);
  assert.match(source, /PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_RELEASE_QUORUM/);
  assert.match(source, /PRODUCTION_CODE_SYNC_QUORUM_RECONSTRUCTION_NOT_VERIFIED/);
  assert.match(source, /PRODUCTION_CODE_SYNC_ROUNDTRIP_NOT_VERIFIED/);
  assert.match(source, /CODE_SYNC_CODE="\$\(curl --silent --show-error --max-time 170 \\\n\s+--header "x-mel-launch-bootstrap: \$\{BOOTSTRAP_TOKEN\}"/);
  assert.match(source, /--data '\{"phase":"code-sync"\}'/);
  assert.match(source, /for attempt in \$\(seq 1 8\); do/);
  assert.match(source, /--data '\{"phase":"readiness"\}'/);
  assert.match(source, /transient_non_json_response/);
  assert.match(source, /try \{ const d=JSON\.parse\(raw\)/);
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
  const exactDeploy = source.indexOf('      - name: Deploy exact approved SHA to production');
  const autonomyProof = source.indexOf('      - name: Prepare and prove production autonomy launch evidence', exactDeploy);
  assert.ok(exactDeploy >= 0 && autonomyProof > exactDeploy, 'autonomy proof must run after the exact immutable deploy');
  assert.match(source.slice(0, exactDeploy), /MEL_LAUNCH_BOOTSTRAP_TOKEN:String\(process\.env\.BOOTSTRAP_TOKEN\|\|''\)/);
  assert.doesNotMatch(source.slice(exactDeploy, autonomyProof), /wrangler secret (?:put|delete) MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  const preparation = source.slice(
    source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment'),
    source.indexOf('      - name: Install pinned Browser Rendering adapter'),
  );
  assert.doesNotMatch(preparation, /secrets\.MELITURGOS_PASSWORD/);
  assert.doesNotMatch(preparation, /MELITURGOS_PASSWORD:String\(process\.env\.MELITURGOS_PASSWORD\|\|''\)/);
  assert.doesNotMatch(preparation, /!payload\.MELITURGOS_PASSWORD/);

  const immutableDeploy = source.slice(
    source.indexOf('      - name: Deploy exact approved SHA to production'),
    source.indexOf('      - name: Verify bundled Workers AI zero-cost proof'),
  );
  assert.match(immutableDeploy, /--keep-vars/);
  assert.match(immutableDeploy, /--secrets-file media-vault-release-secrets\.json/);
  assert.match(source, /Require production owner auth secret before exact deploy/);
  assert.match(source, /wrangler secret list --name meliturgos --format json/);
  assert.match(source, /PRODUCTION_OWNER_AUTH_SECRET_MISSING/);
  assert.match(source, /omitted secrets are preserved by the exact deployment/);
  assert.match(source, /Verify owner auth binding and exact deployment immediately/);
  assert.match(source, /AUTH_NOT_CONFIGURED/);
  assert.match(source, /ROOT_CODE.*401/);
  assert.match(source, /RELEASE_IDENTITY_VERIFIED/);
  assert.match(source, /MEL_DEPLOYED_GIT_SHA/);
  assert.match(source, /MEL_DEPLOYED_GIT_BRANCH/);

  const wrangler = await readFile(path.join(process.cwd(), 'wrangler.jsonc'), 'utf8');
  assert.match(wrangler, /"secrets"\s*:\s*\{[\s\S]*"required"\s*:\s*\[[\s\S]*"MELITURGOS_PASSWORD"/);
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
