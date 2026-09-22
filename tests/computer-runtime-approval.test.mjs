import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerComputerRuntimeCapabilities } from '../src/capabilities/computer-runtime-capabilities.js';
import { createExplicitApprovalProof } from '../src/security/explicit-approval.js';

function fakeDb() {
  const state = { inserts: [] };
  const device = {
    id:'pc-1',
    name:'PC',
    platform:'windows',
    capabilities:JSON.stringify(['computer.use']),
    allowed_apps:JSON.stringify(['chrome','notepad']),
    halted:0,
    created_at:Date.now(),
    last_seen_at:Date.now(),
    metadata:'{}',
  };
  return {
    state,
    prepare(sql) {
      const bound = [];
      return {
        bind(...args) { bound.push(...args); return this; },
        async run() {
          if (/INSERT INTO computer_commands/i.test(sql)) state.inserts.push({ sql, bound:[...bound] });
          return { success:true };
        },
        async first() {
          if (/COUNT\(\*\) AS n/i.test(sql)) return { n:1 };
          if (/FROM computer_devices/i.test(sql)) return { ...device };
          return null;
        },
        async all() {
          if (/FROM computer_devices/i.test(sql)) return { results:[{...device}] };
          return { results:[] };
        },
      };
    },
  };
}

test('computer.quick cannot self-approve with approve_sensitive=true', async () => {
  const db=fakeDb();
  const bus=new CapabilityBus();
  registerComputerRuntimeCapabilities(bus,{db});
  const input={kind:'open_app',app:'chrome',approve_sensitive:true};

  await assert.rejects(
    () => bus.execute('computer.quick',input,{owner:'owner',permissions:[],requestId:'computer-no-proof'}),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
  assert.equal(db.state.inserts.length,0);
});

test('computer.quick executes only after a trusted request-bound central approval', async () => {
  const db=fakeDb();
  const bus=new CapabilityBus();
  registerComputerRuntimeCapabilities(bus,{db});
  const input={kind:'open_app',app:'chrome',approve_sensitive:true};
  const proof=await createExplicitApprovalProof({
    capability:'computer.quick',
    input,
    requestId:'computer-proof',
    source:'owner-test',
  });

  const result=await bus.execute('computer.quick',input,{
    owner:'owner',
    permissions:[],
    requestId:'computer-proof',
    explicitApprovals:[proof],
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'PENDING');
  assert.equal(db.state.inserts.length,1);
});

test('non-interactive screenshot remains usable without explicit confirmation', async () => {
  const db=fakeDb();
  const bus=new CapabilityBus();
  registerComputerRuntimeCapabilities(bus,{db});
  const result=await bus.execute('computer.quick',{kind:'screenshot'},{
    owner:'owner',
    permissions:[],
    requestId:'computer-safe',
  });
  assert.equal(result.ok,true);
  assert.equal(db.state.inserts.length,1);
});
