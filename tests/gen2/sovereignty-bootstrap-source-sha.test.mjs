import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sovereignty bootstrap forwards the resolved deployed SHA to companion prevalidators', async () => {
  const source = await readFile(new URL('../../src/evolution/release-launch-bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /const deployedSha = exactDeployedSha\(env\);/);
  assert.match(source, /runCompanionSourceControlPrevalidationRuntime\(runtimeEnv, \{ \.\.\.options, sourceSha: deployedSha \}\)/);
  assert.match(source, /runCompanionInfrastructurePrevalidationRuntime\(runtimeEnv, \{[\s\S]*\.\.\.options,[\s\S]*sourceSha: deployedSha,[\s\S]*targetLayer: requestedRefreshStep \|\| null,[\s\S]*\}\)/);
});
