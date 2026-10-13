import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Only working post-release proofs may claim an exact expected SHA.
// Persistent stress deliberately fails closed pending a safe replacement:
// it must not pretend to have revalidated a deployed commit.
const workflows = [
  'activate-platform-capabilities.yml',
  'live-connections-production-proof.yml',
  'mel-sov-01-live-proof.yml',
  'council-rich-ui-production-proof.yml',
];
const disabledProof = 'persistent-capability-stress-live-proof.yml';

test('post-release production proofs are reusable and no longer race on workflow_run', async () => {
  for (const name of workflows) {
    const source = await readFile(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.match(source, /workflow_call:/, name);
    assert.doesNotMatch(source, /workflows:\s*\["deploy-cloudflare-release"\]/, name);
    const directSha = /inputs\.expected_sha \|\| github\.sha/.test(source);
    const envResolvedSha = /INPUT_SHA:\s*\$\{\{ inputs\.expected_sha \}\}/.test(source)
      && /FALLBACK_SHA:\s*\$\{\{ github\.sha \}\}/.test(source)
      && /SHA="\$\{INPUT_SHA:-\$\{FALLBACK_SHA\}\}"/.test(source);
    assert.equal(directSha || envResolvedSha, true, name);
  }
});

test('disabled live stress stays callable but fails closed with no secret mutation or false SHA proof', async () => {
  const source=await readFile(new URL('../../.github/workflows/'+disabledProof, import.meta.url),'utf8');
  assert.match(source,/workflow_call:/);
  assert.match(source,/production-proof:\n\s+if: github\.event_name != 'pull_request'/);
  assert.match(source,/PERSISTENT_STRESS_LIVE_PROOF_DISABLED_UNSAFE_PRODUCTION_SECRET_MUTATION/);
  assert.match(source,/exit 1/);
  assert.doesNotMatch(source,/wrangler\s+secret\s+(?:put|delete)|MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(source,/MEL_PROOF_TOKEN=|node scripts\/persistent-capability-stress-live-proof\.mjs/);
});

test('post-release suite sequences platform, stress, Council rich UI, connections and sovereignty even after a red proof', async () => {
  const source = await readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8');
  assert.match(source, /platform:\n[\s\S]*uses: \.\/\.github\/workflows\/activate-platform-capabilities\.yml/);
  assert.match(source, /persistent-stress:\n[\s\S]*needs: \[resolve, platform\][\s\S]*if: always\(\)/);
  assert.match(source, /council-rich-ui:\n[\s\S]*needs: \[resolve, persistent-stress\][\s\S]*if: always\(\)/);
  assert.match(source, /connections:\n[\s\S]*needs: \[resolve, council-rich-ui\][\s\S]*if: always\(\)/);
  assert.match(source, /sovereignty:\n[\s\S]*needs: \[resolve, connections\][\s\S]*if: always\(\)/);
  assert.match(source, /summary:\n[\s\S]*needs: \[resolve, platform, persistent-stress, council-rich-ui, connections, sovereignty\]/);
});


test('post-release parent grants actions write required by called platform proof', async () => {
  const source = await readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8');
  assert.match(source, /permissions:\n\s+contents: read\n\s+actions: write/);
});


test('reusable production jobs do not require event_name workflow_call', async () => {
  for (const name of workflows) {
    const source = await readFile(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /github\.event_name\s*==\s*['"]workflow_call['"]/, name);
  }
});


test('canonical deployment cannot be green before the post-release health suite is green', async () => {
  const [deploy, suite] = await Promise.all([
    readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(deploy, /group:\s*mel-production-deploy/);
  assert.match(deploy, /deploy:\n\s+concurrency:\n\s+group:\s*mel-launch-bootstrap-token/);
  assert.match(deploy, /post-release-health:\n[\s\S]*needs:\s*deploy[\s\S]*uses:\s*\.\/\.github\/workflows\/post-release-proof-suite\.yml/);
  assert.match(deploy, /name:\s*post-release-health-gate/);
  assert.match(suite, /workflow_call:/);
  assert.doesNotMatch(suite, /workflow_run:/);
  assert.match(suite, /resolve:\n\s+if:\s*github\.event_name != 'pull_request'/);
});
