import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectOnlineSovereigntyCompanion,
  enqueueCompanionSovereigntyCommand,
} from '../../src/portability/companion-sovereignty-command-bridge.js';

function fakeDb(device, inserts=[]) {
  return {
    prepare(sql) {
      const params = [];
      const statement = {
        bind(...values) { params.push(...values); return statement; },
        async first() { return device; },
        async run() {
          if (/INSERT INTO computer_commands/i.test(sql)) inserts.push(params);
          return { success: true };
        },
      };
      return statement;
    },
  };
}

test('sovereignty relay fails closed for offline, halted and non-Windows companions', async () => {
  const now=1_800_000_000_000;
  for (const [overrides, code] of [
    [{last_seen_at: now-20_001}, 'COMPANION_SOVEREIGNTY_DEVICE_OFFLINE'],
    [{halted:1}, 'OWNER_HALT_ACTIVE'],
    [{platform:'android'}, 'COMPANION_SOVEREIGNTY_WINDOWS_REQUIRED'],
  ]) {
    const device={id:'device-1',name:'test',platform:'windows',halted:0,last_seen_at:now,metadata:'{}',...overrides};
    await assert.rejects(
      selectOnlineSovereigntyCompanion({DB:fakeDb(device)},{now}),
      {code},
    );
  }
});

test('sovereignty relay rejects unapproved actions before touching the database', async () => {
  await assert.rejects(
    enqueueCompanionSovereigntyCommand({},{
      layer:'source_control',action:'system.exec',payload:{command:'Remove-Item -Recurse C:\\'},
    }),
    {code:'COMPANION_SOVEREIGNTY_ACTION_FORBIDDEN'},
  );
  await assert.rejects(
    enqueueCompanionSovereigntyCommand({},{
      layer:'firmware',action:'flash',payload:{address:'0x0'},
    }),
    {code:'COMPANION_SOVEREIGNTY_ACTION_FORBIDDEN'},
  );
});

test('approved source-control command is queued, not executed on the server', async () => {
  const now=Date.now();
  const inserts=[];
  const device={id:'device-1',name:'test',platform:'windows',halted:0,last_seen_at:now,metadata:'{}'};
  const queued=await enqueueCompanionSovereigntyCommand({DB:fakeDb(device,inserts)},{
    layer:'source_control',action:'health',now,
  });
  assert.equal(queued.status,'PENDING');
  assert.equal(queued.device_id,device.id);
  assert.equal(inserts.length,1);
  const [id,deviceId,sessionId,serializedPlan,status,createdAt]=inserts[0];
  assert.equal(id,queued.command_id);
  assert.equal(deviceId,device.id);
  assert.ok(sessionId);
  assert.equal(status,'PENDING');
  assert.equal(createdAt,now);
  const plan=JSON.parse(serializedPlan);
  assert.equal(plan.schema,'mel.sovereignty.local-command/v1');
  assert.equal(plan.steps[0].action,'sovereignty.source_control.health');
  assert.equal(plan.owner_halt,false);
  assert.equal(plan.steps[0].payload.command,undefined);
});

test('desktop-control requests cannot bypass the separate authenticated consent gate', async () => {
  for (const [layer,action] of [
    ['desktop','view'],['desktop','mouse'],['desktop','keyboard'],
    ['desktop','shell'],['maintenance','powershell'],['firmware','flash'],
  ]) {
    await assert.rejects(
      enqueueCompanionSovereigntyCommand({}, {
        layer,action,payload:{local_approved:true,owner_authenticated:true,command:'whoami'},
      }),
      {code:'COMPANION_SOVEREIGNTY_ACTION_FORBIDDEN'},
    );
  }
});
