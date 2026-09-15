import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginRuntime } from '../../src/plugins/runtime.js';

function manifest(overrides = {}) {
  return {
    id: 'mel.echo',
    name: 'Echo',
    version: '1.0.0',
    description: 'Contract fixture',
    author: 'MEL',
    capabilities: ['echo'],
    permissions: ['plugin.echo'],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugins/echo.js',
    healthcheck: 'echo.health',
    risk: 'LOW',
    ...overrides,
  };
}

function plugin(overrides = {}) {
  const state = { activated: 0, deactivated: 0 };
  return {
    state,
    manifest: manifest(overrides.manifest),
    capabilities: {
      echo: async (input, ctx) => ({ text: input.text, plugin: ctx.plugin.id }),
      ...(overrides.capabilities || {}),
    },
    async activate() { state.activated += 1; },
    async deactivate() { state.deactivated += 1; },
    ...overrides,
  };
}

test('Mel.register validates, activates and emits timeline-visible events', async () => {
  const events = [];
  const runtime = createPluginRuntime({ timeline: (event) => events.push(event) });
  const candidate = plugin();

  const record = await runtime.register(candidate, { permissions: ['plugin.echo'] });

  assert.equal(record.status, 'ACTIVE');
  assert.equal(candidate.state.activated, 1);
  assert.equal(runtime.get('mel.echo').manifest.version, '1.0.0');
  assert.deepEqual(runtime.metrics(), { installed: 1, errors: 0, permission_denied: 0, active: 1 });
  assert.deepEqual(events.map((event) => event.type), ['registering', 'activated']);
  assert.ok(events.every((event) => event.category === 'plugin' && event.plugin_id === 'mel.echo'));
});

test('permissions fail closed before plugin activation', async () => {
  const events = [];
  const runtime = createPluginRuntime({ timeline: (event) => events.push(event) });
  const candidate = plugin();

  const record = await runtime.register(candidate, { permissions: [] });

  assert.equal(record.status, 'FAILED');
  assert.equal(record.error, 'PLUGIN_PERMISSION_DENIED');
  assert.equal(candidate.state.activated, 0);
  assert.deepEqual(runtime.metrics(), { installed: 0, errors: 1, permission_denied: 1, active: 0 });
  assert.equal(events.at(-1).type, 'permission_denied');
  assert.deepEqual(events.at(-1).missing_permissions, ['plugin.echo']);
});

test('capability execution uses the same permission boundary', async () => {
  const runtime = createPluginRuntime({ permissions: ['plugin.echo'] });
  await runtime.register(plugin());

  assert.deepEqual(
    await runtime.execute('mel.echo', 'echo', { text: 'bonjour' }),
    { text: 'bonjour', plugin: 'mel.echo' },
  );

  await assert.rejects(
    createPluginRuntime().execute('missing', 'echo', {}),
    (error) => error.code === 'PLUGIN_NOT_FOUND',
  );
});

test('registerAll isolates broken plugins so startup continues', async () => {
  const runtime = createPluginRuntime({ permissions: ['plugin.echo'] });
  const broken = plugin({
    manifest: { id: 'mel.broken' },
    async activate() { throw new Error('boom'); },
  });
  const healthy = plugin({ manifest: { id: 'mel.healthy' } });
  const invalid = { manifest: {}, capabilities: {}, activate() {}, deactivate() {} };

  const results = await runtime.registerAll([broken, invalid, healthy]);

  assert.deepEqual(results.map((record) => record.status), ['FAILED', 'FAILED', 'ACTIVE']);
  assert.equal(runtime.get('mel.healthy').status, 'ACTIVE');
  assert.equal(runtime.metrics().active, 1);
  assert.ok(runtime.metrics().errors >= 2);
});

test('plugin contract rejects hidden capabilities and supports deactivation', async () => {
  const runtime = createPluginRuntime({ permissions: ['plugin.echo'] });
  const hidden = plugin({ capabilities: { hidden: async () => true } });

  await assert.rejects(runtime.register(hidden), (error) => error.code === 'PLUGIN_CAPABILITY_UNDECLARED');

  const candidate = plugin();
  await runtime.register(candidate);
  const record = await runtime.deactivate('mel.echo');
  assert.equal(record.status, 'DISABLED');
  assert.equal(candidate.state.deactivated, 1);
  assert.equal(runtime.metrics().active, 0);
});
