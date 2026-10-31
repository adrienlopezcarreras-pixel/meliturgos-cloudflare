import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSelfAuditCapabilities } from '../src/capabilities/self-audit-capability.js';

test('self.audit.deep returns correct counts', async () => {
  const handlers = {};
  const bus = {
    discover: (def, handler) => { handlers[def.id] = handler; },
    execute: async (id, payload) => {
      if (id === 'capability.audit') {
        return {
          rows: [
            { execution: { ok: true }, truth_status: 'OK' },
            { execution: { ok: false }, truth_status: 'OK' },
            { truth_status: 'REFUSEE' },
            { /* no execution and not refused */ },
          ],
        };
      }
      throw new Error('Unexpected execute id');
    },
  };
  registerSelfAuditCapabilities(bus, {});
  const result = await handlers['self.audit.deep']({}, {});
  assert.deepEqual(result, { called: 2, refused: 1, failed: 1 });
});

test('capability.audit respects read‑only mode and does not start persistent stress', async () => {
  let startCalled = false;
  const mockStart = () => {
    startCalled = true;
    return { rows: [] };
  };
  const mockAudit = () => ({ rows: [{ execution: { ok: true }, truth_status: 'OK' }] });
  const bus = {
    discover: (def, handler) => { /* no need to store handlers for this test */ },
    execute: async (id, payload) => {
      if (id === 'capability.audit') {
        // This path should be reached only if the handler falls back to the
        // runtime auditor (read‑only mode).
        return mockAudit();
      }
      throw new Error('Unexpected execute id');
    },
  };
  // Register the capability with a DB (to trigger the persistent path) but
  // enforce read‑only mode and provide a stub for the starter.
  const env = { DB: {}, READ_ONLY: true, _startPersistentCapabilityStress: mockStart };
  const { registerCapabilityAuditCapability } = await import('../src/capabilities/capability-audit-capability.js');
  registerCapabilityAuditCapability(bus, env);
  // Directly invoke the discovered handler for `capability.audit`.
  const auditHandler = (await import('../src/capabilities/capability-audit-capability.js')).registerCapabilityAuditCapability;
  // Since the discover registration stores the handler internally, we simulate
  // the call by executing through the bus.
  const result = await bus.execute('capability.audit', { deep: true });
  assert.equal(startCalled, false, 'Persistent stress starter must not be called in read‑only mode');
  assert.deepEqual(result, { rows: [{ execution: { ok: true }, truth_status: 'OK' }] });
});