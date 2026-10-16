import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { taskmarketReadonlyPcCommand } from '../src/devices/taskmarket-readonly-companion.js';
import { COMPUTER_COMMAND_STATUS } from '../src/devices/computer-command-status.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ownerAuth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
function request(path, method='GET', body=null, authenticated=true) {
  return new Request('https://mel.test'+path, {
    method,
    headers: {
      ...(authenticated ? { authorization: ownerAuth } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function seededEnv({ halted=0, lastSeen=Date.now(), remoteAccess=true }={}) {
  const DB = sqliteD1();
  const env = { DB, MELITURGOS_USER:'adrien', MELITURGOS_PASSWORD:'test' };
  const init = await maybeHandleComputerApi(request('/api/computer/v1/status'), env);
  assert.equal(init.status, 200);
  await DB.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?, ?,?,?)')
    .bind('pc-taskmarket','unused-token-hash','Windows Companion','windows',JSON.stringify(['computer.use']),JSON.stringify([]),halted,Date.now(),lastSeen,JSON.stringify({ remote_access_enabled: remoteAccess }))
    .run();
  return { DB, env };
}

test('Taskmarket read-only command is fixed and cannot be replaced by browser payload', () => {
  const probe = taskmarketReadonlyPcCommand();
  assert.equal(probe.timeout_ms, 25000);
  assert.equal(probe.require_success_exit, true);
  assert.match(probe.command, /task list --status open --limit 20/);
  assert.match(probe.command, /TASKMARKET_CLI_NOT_FOUND/);
  assert.match(probe.command, /TASKMARKET_LIST_COMMAND_FAILED/);
  assert.match(probe.command, /TASKMARKET_RESPONSE_INVALID/);
  assert.match(probe.command, /mode='READ_ONLY'/);
  assert.doesNotMatch(probe.command, /task (claim|submit)|submitResult|privateKey|seedPhrase/i);
  assert.doesNotMatch(probe.command, /detail=|Exception\.Message|stdout=|stderr=/i, 'raw CLI diagnostics must not be returned to the UI');
});

test('Taskmarket probe requires owner authentication', async () => {
  const { DB, env } = await seededEnv();
  try {
    const response = await maybeHandleComputerApi(request('/api/computer/v1/pc-control','POST',{
      computer_id:'pc-taskmarket',action:'taskmarket.readonly.probe',
      payload:{command:'Write-Host INJECTED',script:'INJECTED'},
    },false),env);
    assert.equal(response.status,401);
  } finally { DB.close(); }
});

test('direct owner system.exec is denied; only the dedicated read-only action is available', async () => {
  const { DB, env } = await seededEnv();
  try {
    const response = await maybeHandleComputerApi(request('/api/computer/v1/pc-control','POST',{
      computer_id:'pc-taskmarket',action:'system.exec',
      payload:{command:"Write-Host INJECTED; task list --status open --limit 20"},
    }),env);
    assert.equal(response.status,403);
    assert.equal((await response.json()).code,'PC_CONTROL_ACTION_NOT_ALLOWED');
    const commands = await DB.prepare('SELECT id FROM computer_commands WHERE device_id=?').bind('pc-taskmarket').all();
    assert.equal(commands.results.length,0);
  } finally { DB.close(); }
});

test('Taskmarket probe queues only the fixed read-only command and canonical statuses', async () => {
  const { DB, env } = await seededEnv();
  try {
    const response = await maybeHandleComputerApi(request('/api/computer/v1/pc-control','POST',{
      computer_id:'pc-taskmarket',action:'taskmarket.readonly.probe',
      payload:{command:'Write-Host INJECTED',script:'INJECTED',args:['task','claim']},
    }),env);
    assert.equal(response.status,202);
    const reply = await response.json();
    const row = await DB.prepare('SELECT status,plan_json FROM computer_commands WHERE id=?').bind(reply.command_id).first();
    assert.equal(row.status, COMPUTER_COMMAND_STATUS.PENDING);
    const plan = JSON.parse(row.plan_json);
    assert.equal(plan.steps[0].action,'system.exec');
    assert.match(plan.steps[0].payload.command,/task list --status open --limit 20/);
    assert.doesNotMatch(plan.steps[0].payload.command,/INJECTED|task claim/);
    assert.equal(plan.steps[0].payload.timeout_ms,25000);
    assert.equal(plan.steps[0].payload.require_success_exit,true);
  } finally { DB.close(); }
});

test('Taskmarket probe fails closed when PC is offline or Owner HALT is active', async () => {
  for (const setup of [{lastSeen:Date.now()-60000},{halted:1},{remoteAccess:false}]) {
    const { DB, env } = await seededEnv(setup);
    try {
      const response = await maybeHandleComputerApi(request('/api/computer/v1/pc-control','POST',{
        computer_id:'pc-taskmarket',action:'taskmarket.readonly.probe',payload:{},
      }),env);
      assert.equal(response.status, setup.remoteAccess===false?403:409);
      const body = await response.json();
      assert.ok(['COMPUTER_OFFLINE','OWNER_HALT_ACTIVE','REMOTE_ACCESS_DISABLED_LOCALLY'].includes(body.code));
      const commands = await DB.prepare('SELECT id FROM computer_commands WHERE device_id=?').bind('pc-taskmarket').all();
      assert.equal(commands.results.length,0);
    } finally { DB.close(); }
  }
});
