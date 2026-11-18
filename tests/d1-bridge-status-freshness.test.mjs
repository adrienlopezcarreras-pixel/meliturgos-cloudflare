import test from 'node:test';
import assert from 'node:assert/strict';
import { D1BridgeRepository } from '../src/dev/d1-bridge-repository.js';

test('Bridge status reports online only with a recent explicit ONLINE heartbeat', async () => {
  const memoryState={row:null};
  const repository=new D1BridgeRepository(null,{memoryState});
  const now=Date.now();
  const scenarios=[
    {status:'ONLINE',last_seen:now-1000,expected:true},
    {status:'OFFLINE',last_seen:now-1000,expected:false},
    {status:'PAUSED',last_seen:now-1000,expected:false},
    {status:'ONLINE',last_seen:now-16*86400000,expected:false},
    {status:'ONLINE',last_seen:now+600000,expected:false},
    {status:'ONLINE',last_seen:0,expected:false},
    {status:'ONLINE',last_seen:'invalid',expected:false},
  ];
  for(const sample of scenarios){
    memoryState.row={bridge_id:'primary',status:sample.status,last_seen:sample.last_seen};
    const result=await repository.status();
    assert.equal(result.online,sample.expected,
      sample.status+' with last_seen='+sample.last_seen);
  }
});

test('Bridge heartbeat has an honest OFFLINE status after an OFFLINE heartbeat',async()=>{
  const repository=new D1BridgeRepository(null);
  await repository.heartbeat('OFFLINE');
  const result=await repository.status();
  assert.equal(result.status,'OFFLINE');
  assert.equal(result.online,false);
});
