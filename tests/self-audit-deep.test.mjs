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