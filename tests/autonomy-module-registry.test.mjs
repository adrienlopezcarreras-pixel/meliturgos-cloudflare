import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRunner } from '../src/modules/module-runner.js';

test('canonical ModuleRunner has no hidden prototype execution path', async () => {
  const runner=new ModuleRunner({});
  await assert.rejects(
    ()=>runner.run('connector:any',{value:1},{owner:'adrien',permissions:[],requestId:'m1'}),
    /MODULE_EXECUTOR_UNCONFIGURED/
  );
});

test('ModuleRunner delegates exactly once to the CapabilityBus', async () => {
  const calls=[];
  const runner=new ModuleRunner({},{
    async execute(id,input,context){calls.push({id,input,context});return{ok:true};}
  });
  const result=await runner.run('connector:test',{value:42},{owner:'adrien',permissions:['connector.test'],requestId:'m2'});
  assert.equal(result.success,true);
  assert.equal(result.moduleId,'connector:test');
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].input,{value:42});
});
