import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2 module run route binds ModuleRunner to the central CapabilityBus', async () => {
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  const routeStart = router.indexOf('if (path === "/api/gen2/modules/run"');
  assert.notEqual(routeStart, -1, 'modules/run route must exist');
  const route = router.slice(routeStart, router.indexOf('\n  return null;', routeStart));

  assert.match(route, /const runtime = createGen2Runtime\(\{ env \}\);/);
  assert.match(route, /new ModuleRunner\(env, runtime\.bus\)/);
  assert.match(route, /runner\.run\(module_uuid, input,/);
  assert.doesNotMatch(route, /new ModuleRunner\(env\)(?!,)/);
});
