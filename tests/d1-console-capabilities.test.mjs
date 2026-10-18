import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerD1ConsoleCapabilities } from '../src/capabilities/d1-console-capabilities.js';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { runtimeCapabilityPermissions } from '../src/security/runtime-permissions.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const OWNER = { owner: 'owner', permissions: ['d1.read'] };
const APPROVED = { owner: 'owner', permissions: ['d1.write'], approvedCapabilities: ['d1.write'] };

async function fixture() {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE mel_jobs (job_id TEXT PRIMARY KEY, status TEXT NOT NULL, lease_until INTEGER, secret_token TEXT)').run();
  await db.prepare('CREATE TABLE private_oauth_tokens (id INTEGER PRIMARY KEY, credential TEXT)').run();
  await db.prepare("INSERT INTO mel_jobs(job_id,status,lease_until,secret_token) VALUES ('a','RUNNING',10,'hidden'),('b','RUNNING',15,'hidden2'),('c','DONE',20,'hidden3')").run();
  const audit = [];
  const bus = new CapabilityBus({ audit: async event => { audit.push(event); } });
  registerD1ConsoleCapabilities(bus, { db });
  return { db, bus, audit };
}

test('registered in the existing runtime bus with accurate health and approval contract', () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  assert.equal(bus.describe('d1.schema').health, 'UNAVAILABLE');
  assert.equal(bus.describe('d1.read').permissions[0], 'd1.read');
  assert.equal(bus.describe('d1.write').approval.required, true);
  assert.equal(bus.contract('d1.write').explicit_approval_gate, true);
  assert.equal(bus.describe('d1.write').health, 'UNAVAILABLE');
  assert.equal(runtimeCapabilityPermissions({ MEL_OWNER_PERSONAL_AGENT:'true' }).includes('d1.read'), true);
  assert.equal(runtimeCapabilityPermissions({ MEL_OWNER_PERSONAL_AGENT:'true' }).includes('d1.write'), false);
});

test('schema and bounded rows are accessible to authenticated agent, protected fields are not', async () => {
  const { db, bus } = await fixture();
  try {
    const list = await bus.execute('d1.schema', {}, OWNER);
    assert.equal(list.tables.includes('mel_jobs'), true);
    assert.equal(list.tables.includes('private_oauth_tokens'), false);
    const schema = await bus.execute('d1.schema', { table:'mel_jobs' }, OWNER);
    assert.deepEqual(schema.columns.map(row => row.name), ['job_id','status','lease_until']);
    const rows = await bus.execute('d1.read', {
      table:'mel_jobs', where:{ status:'RUNNING' }, columns:['job_id','status'],
      order_by:'job_id', descending:true, limit:1, offset:0,
    }, OWNER);
    assert.deepEqual(rows.rows, [{ job_id:'b', status:'RUNNING' }]);
    assert.equal(rows.count,1);
    const defaults = await bus.execute('d1.read', {table:'mel_jobs'}, OWNER);
    assert.equal(defaults.rows[0].secret_token, undefined);
    await assert.rejects(bus.execute('d1.read', {table:'mel_jobs',columns:['secret_token']}, OWNER), /D1_PROTECTED_IDENTIFIER/);
    await assert.rejects(bus.execute('d1.read', {table:'private_oauth_tokens'}, OWNER), /D1_PROTECTED_IDENTIFIER/);
  } finally { db.close(); }
});

test('all D1 capabilities require authenticated owner, and reads require their own permission', async () => {
  const { db, bus } = await fixture();
  try {
    await assert.rejects(bus.execute('d1.schema', {}, {}), /AUTH_REQUIRED/);
    await assert.rejects(bus.execute('d1.schema', {}, {owner:'owner',permissions:[]}), /PERMISSION_DENIED/);
    await assert.rejects(bus.execute('d1.write', {
      operation:'update',table:'mel_jobs',values:{status:'IDLE'},where:{job_id:'a'}
    }, OWNER), /PERMISSION_DENIED/);
  } finally { db.close(); }
});

test('mutations require both permission and explicit scoped owner approval, and are bounded', async () => {
  const { db, bus, audit } = await fixture();
  try {
    const update = {operation:'update',table:'mel_jobs',values:{status:'RETRY'},where:{status:'RUNNING'}};
    await assert.rejects(bus.execute('d1.write', update, {owner:'owner',permissions:['d1.write']}), /EXPLICIT_APPROVAL_REQUIRED/);
    let unchanged = await bus.execute('d1.read', {table:'mel_jobs',where:{status:'RUNNING'}}, OWNER);
    assert.equal(unchanged.count,2);
    const result = await bus.execute('d1.write', update, APPROVED);
    assert.equal(result.changes,1);
    assert.equal(result.approved,true);
    unchanged = await bus.execute('d1.read', {table:'mel_jobs',where:{status:'RUNNING'}}, OWNER);
    assert.equal(unchanged.count,1);
    const inserted = await bus.execute('d1.write', {
      operation:'insert',table:'mel_jobs',values:{job_id:'d',status:'PENDING',lease_until:0}
    }, APPROVED);
    assert.equal(inserted.changes,1);
    const deleted = await bus.execute('d1.write', {
      operation:'delete',table:'mel_jobs',where:{job_id:'d'}
    }, APPROVED);
    assert.equal(deleted.changes,1);
    assert.ok(audit.some(event => event.capability === 'd1.write' && event.status === 'DENIED'));
    assert.ok(audit.some(event => event.capability === 'd1.write' && event.status === 'SUCCEEDED'));
  } finally { db.close(); }
});

test('identifier injection, unfiltered mass mutations and credential access fail closed', async () => {
  const { db, bus } = await fixture();
  try {
    await assert.rejects(bus.execute('d1.read',{table:'mel_jobs; DROP TABLE mel_jobs'},OWNER), /D1_PROTECTED_IDENTIFIER/);
    await assert.rejects(bus.execute('d1.read',{table:'mel_jobs',where:{'job_id OR 1=1':'a'}},OWNER), /D1_PROTECTED_IDENTIFIER/);
    await assert.rejects(bus.execute('d1.write',{operation:'delete',table:'mel_jobs'},APPROVED), /D1_FIELDS_REQUIRED/);
    await assert.rejects(bus.execute('d1.write',{operation:'update',table:'mel_jobs',values:{status:'BAD'},where:{}},APPROVED), /D1_INVALID_FIELDS/);
    await assert.rejects(bus.execute('d1.write',{operation:'insert',table:'mel_jobs',values:{job_id:'x',secret_token:'leak'}},APPROVED), /D1_PROTECTED_IDENTIFIER/);
    await assert.rejects(bus.execute('d1.write',{operation:'delete',table:'private_oauth_tokens',where:{id:1}},APPROVED), /D1_PROTECTED_IDENTIFIER/);
    await assert.rejects(bus.execute('d1.write',{operation:'delete',table:'mel_jobs',where:{status:'RUNNING'},limit:6},APPROVED), /INVALID_RANGE/);
    const still = await bus.execute('d1.read',{table:'mel_jobs',limit:50},OWNER);
    assert.equal(still.rows.length,3);
  } finally { db.close(); }
});
