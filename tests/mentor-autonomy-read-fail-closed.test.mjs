import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerMentorCapabilities } from '../src/capabilities/mentor-capabilities.js';
import { registerAutonomyCapabilities } from '../src/capabilities/autonomy-capabilities.js';

const context = { owner: 'test-owner', permissions: [], requestId: 'mentor-autonomy-read-fail-closed' };

function buildBus() {
  const bus = new CapabilityBus();
  registerMentorCapabilities(bus, {});
  registerAutonomyCapabilities(bus, {});
  return bus;
}

for (const [id, input] of [
  ['mentor.recent', {}],
  ['autonomy.status', {}],
]) {
  test(`${id} is truthfully DEGRADED and fails closed without DB binding`, async () => {
    const bus = buildBus();
    const record = bus.describe(id);

    assert.equal(record.enabled, true);
    assert.equal(record.risk, 'LOW');
    assert.deepEqual(record.permissions, []);
    assert.equal(record.health, 'DEGRADED');

    await assert.rejects(
      bus.execute(id, input, context),
      error => error?.message === 'DB_BINDING_MISSING' || error?.code === 'DB_BINDING_MISSING'
    );
  });
}

test('mutating or provider-backed Mentor/autonomy capabilities stay MEDIUM and are not deep-executed', () => {
  const bus = buildBus();
  for (const id of ['mentor.propose', 'mentor.learn', 'autonomy.tick']) {
    const record = bus.describe(id);
    assert.equal(record.enabled, true);
    assert.equal(record.risk, 'MEDIUM');
    assert.equal(record.health, 'DEGRADED');
  }
});
