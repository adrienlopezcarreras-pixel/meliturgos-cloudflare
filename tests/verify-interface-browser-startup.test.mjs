import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/verify-interface-browser.mjs', import.meta.url), 'utf8');

test('browser startup detects both an early exit and a spawn failure before timeout', () => {
  assert.match(script, /browser\.on\('error',/);
  assert.match(script, /browser\.on\('exit',/);
  assert.match(script, /CHROMIUM_SPAWN_FAILED/);
  assert.match(script, /CHROMIUM_EARLY_EXIT/);
  assert.match(script, /if\(!port&&browserFailure\)break/);
  assert.match(script, /CHROMIUM_START_TIMEOUT/);
});

test('browser startup provides proof without logging raw stderr or claiming successful browser checks', () => {
  assert.match(script, /browser\.stderr\.resume\(\)/);
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*stderr/);
  assert.match(script, /writeFile\(join\(output,'browser-startup\.json'\),JSON\.stringify\(\{status:'FAILED'/);
  assert.match(script, /throw new Error\(evidence\.code\)/);
  assert.match(script, /status:'STARTED',debug_port_available:true/);
});
