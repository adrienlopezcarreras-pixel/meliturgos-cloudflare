import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const sample=[{
  id:'conv-compat',
  title:'Projet MEL',
  mapping:{
    a:{id:'a',parent:null,message:{id:'m1',author:{role:'user'},create_time:1700000001,content:{parts:['Bonjour MEL']}}},
    b:{id:'b',parent:'a',message:{id:'m2',author:{role:'assistant'},create_time:1700000002,content:{parts:['Bonjour Adrien']}}},
  }
}];

const auth='Basic '+Buffer.from('adrien:test').toString('base64');

test('legacy ChatGPT import URL is redirect-only and cannot become a second importer', async()=>{
  const response=await worker.fetch(new Request('https://mel.test/api/import/chatgpt-context',{
    method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(sample),redirect:'manual'
  }),{MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'},{});
  assert.equal(response.status,307);
  assert.equal(response.headers.get('location'),'/api/gen2/import/chatgpt-archive');
});

test('canonical ChatGPT archive endpoint supports safe preview without D1 writes', async()=>{
  const response=await worker.fetch(new Request('https://mel.test/api/gen2/import/chatgpt-archive',{
    method:'POST',headers:{authorization:auth,'content-type':'application/json'},
    body:JSON.stringify({archive:sample,preview:true})
  }),{MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'},{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.preview,true);
  assert.equal(body.conversations,1);
  assert.equal(body.messages,2);
});
