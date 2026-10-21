// [GPT] Owner-attended launch contract for the existing local development bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Windows development bridge launcher is explicit, bounded to its checkout, and opt-in', async () => {
  const src = await readFile(new URL('../windows-companion/Lancer-Pont-Developpement-MEL.cmd', import.meta.url), 'utf8');
  assert.match(src, /set \"REPO=%~dp0\.\.\"/);
  assert.match(src, /where node\.exe/);
  assert.match(src, /MEL_DEV_BRIDGE_TOKEN/);
  assert.match(src, /set \/p \"CONFIRMATION=Tapez OUI/);
  assert.match(src, /if \/I not \"%CONFIRMATION%\"==\"OUI\"/);
  assert.match(src, /node scripts\\mel-dev-bridge\.mjs/);
  assert.doesNotMatch(src, /schtasks|Register-ScheduledTask|Startup\\|RunOnce|sc create|New-Service|Start-Process/i);
  assert.doesNotMatch(src, /curl\s|iwr\s|Invoke-WebRequest|powershell\.exe/i);
});

test('owner instructions do not publish the bridge secret or claim autonomy is proved', async () => {
  const doc = await readFile(new URL('../docs/MEL-PONT-PC-DEVELOPPEMENT-DEMARRAGE.md', import.meta.url), 'utf8');
  assert.match(doc, /Node\.js/);
  assert.match(doc, /Ctrl\+C/);
  assert.match(doc, /ne prouve pas/);
  assert.match(doc, /Ne jamais le transmettre/);
});
