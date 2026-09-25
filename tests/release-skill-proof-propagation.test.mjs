import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release retries Skill Registry proof across bounded Worker secret propagation', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /SKILL_REGISTRY_READY=0/);
  assert.match(workflow, /for SKILL_REGISTRY_ATTEMPT in \$\(seq 1 12\)/);
  assert.match(workflow, /skill-registry-proof/);
  assert.match(workflow, /release-launch-bootstrap" \|\| true\)/);
  assert.match(workflow, /Skill Registry proof propagation attempt/);
  assert.match(workflow, /test "\$SKILL_REGISTRY_READY" = "1"/);
  assert.match(workflow, /MEL_EVOL_05_PRODUCTION_D1_PROOF_FAILED/);
});
