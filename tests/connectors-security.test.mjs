import test from 'node:test';
import assert from 'node:assert/strict';
import { connectorDefinitions } from '../src/connectors/registry.js';
import { ModuleRunner } from '../src/modules/module-runner.js';

test('connector catalog is declarative, unique and stores only secret references', () => {
  assert.ok(connectorDefinitions.length>=10);
  const ids=connectorDefinitions.map(row=>row.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const row of connectorDefinitions){
    assert.ok(row.id);
    assert.ok(row.auth_type);
    assert.ok(Array.isArray(row.capabilities));
    assert.ok(Array.isArray(row.secret_references));
    const serialized=JSON.stringify(row);
    assert.doesNotMatch(serialized,/Bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9]{8,}/i);
  }
});

test('connector execution stays fail-closed until an authorized bus adapter is supplied', async () => {
  const runner=new ModuleRunner({});
  await assert.rejects(()=>runner.run('gmail.messages.read',{}),/MODULE_EXECUTOR_UNCONFIGURED/);
});
