import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { readFile } from 'node:fs/promises';

const ownerAuth='Basic '+Buffer.from('adrien:test').toString('base64');

function ownerRequest(path,body){
  return new Request('https://mel.test'+path,{
    method:'POST',
    headers:{authorization:ownerAuth,'content-type':'application/json'},
    body:JSON.stringify(body||{})
  });
}

async function pairWindows(env,id='pc-power'){
  const response=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/pair',{
    computer_id:id,
    name:'PC Power',
    platform:'windows'
  }),env);
  assert.equal(response.status,200);
  return response.json();
}

test('power control requires exact owner confirmation',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    await pairWindows(env);

    const missing=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/power',{
      computer_id:'pc-power',
      action:'power.off'
    }),env);
    assert.equal(missing.status,403);
    assert.equal((await missing.json()).code,'OWNER_CONFIRMATION_REQUIRED');

    const wrong=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/power',{
      computer_id:'pc-power',
      action:'power.restart',
      confirmation:'POWER_OFF_APPROVED'
    }),env);
    assert.equal(wrong.status,403);
    assert.equal((await wrong.json()).code,'OWNER_CONFIRMATION_REQUIRED');
  }finally{DB.close();}
});

test('owner-approved power off is queued as a bounded dedicated command',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const paired=await pairWindows(env);

    const accepted=await maybeHandleComputerApi(ownerRequest('/api/computer/v1/power',{
      computer_id:'pc-power',
      action:'power.off',
      confirmation:'POWER_OFF_APPROVED'
    }),env);
    assert.equal(accepted.status,202);
    const body=await accepted.json();
    assert.equal(body.action,'power.off');
    assert.equal(body.owner_approved,true);

    const claimed=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/commands',{
      headers:{
        authorization:'Bearer '+paired.token,
        'x-mel-computer-id':'pc-power'
      }
    }),env);
    assert.equal(claimed.status,200);
    const command=(await claimed.json()).command;
    assert.equal(command.plan.schema,'mel.devices.power-command.v1');
    assert.equal(command.plan.owner_approved,true);
    assert.deepEqual(command.plan.steps,[{id:'power-1',action:'power.off'}]);
  }finally{DB.close();}
});

test('distributed Windows companion exposes only fixed shutdown and restart actions',async()=>{
  const script=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.match(script,/"power\.off"/);
  assert.match(script,/"power\.restart"/);
  assert.match(script,/System32\\shutdown\.exe/);
  assert.match(script,/@\("\/s","\/t","5"/);
  assert.match(script,/@\("\/r","\/t","5"/);
  assert.doesNotMatch(script,/Invoke-Expression/);
});
