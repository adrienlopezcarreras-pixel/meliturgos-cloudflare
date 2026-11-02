import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { DECLARED_ROADMAP_PROOFS, RELEASE_SMOKE_MARKERS, registerDeclaredRoadmapProofs } from '../src/roadmap/declared-roadmap-proofs.js';
import { classifyRoadmapItem } from '../src/roadmap/roadmap-truth.js';
import { requiredPowerConfirmation } from '../src/devices/power-confirmation.js';

test('the 24 declared roadmap proofs succeed and map to their own capability', async () => {
  const events = [];
  const bus = new CapabilityBus({ audit: async event => { events.push(event); } });
  registerDeclaredRoadmapProofs(bus);
  assert.equal(DECLARED_ROADMAP_PROOFS.length, 24);
  for (const { roadmapId, id: capability } of DECLARED_ROADMAP_PROOFS) {
    const result = await bus.execute(capability, {}, { owner: 'test', permissions: [] });
    assert.equal(result.ok, true, capability);
    assert.ok(events.some(event => event.capability === capability && event.status === 'SUCCEEDED'), capability);
    const classified = classifyRoadmapItem(roadmapId, {
      capabilities: new Map([[capability, { ok: 1, ko: 0, last_ok: Date.now(), last_ko: null }]]),
      computer: new Map(),
      delivered: new Map(),
    });
    assert.equal(classified.truth, 'VERIFIED_LIVE', roadmapId);
  }
});

test('release smoke markers are still the steps that block a production release', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  for (const marker of RELEASE_SMOKE_MARKERS) assert.ok(workflow.includes(marker), marker);
});

test('power commands still require the exact owner phrase', async () => {
  const source = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(requiredPowerConfirmation('power.off'), 'POWER_OFF_APPROVED');
  assert.match(source, /requiredPowerConfirmation\(action\)/);
  assert.doesNotMatch(source, /POWER_OFF_APPROVED":"POWER_RESTART_APPROVED/);
});
