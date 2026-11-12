import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicFidesChat } from '../src/api/public-fides-chat.js';

function envWith(error, calls) {
  const rows = new Map();
  return {
    FIDES_PUBLIC_CHAT_ENABLED:'true',
    DB:{prepare(sql) {
      let values=[];
      return {
        bind(...args){values=args;return this;},
        async run() {
          if(sql.startsWith('INSERT INTO public_rate_limits')) {
            const [key,now,,before]=values;
            const old=rows.get(key);
            rows.set(key,!old||old.window_started<=before
              ?{window_started:now,count:1}:{window_started:old.window_started,count:old.count+1});
          }
          return {};
        },
        async first(){return rows.get(values[0])||null;}
      };
    }},
    AI:{async run(model){
      calls.push(model);
      if(model==='@cf/zai-org/glm-4.7-flash') throw error;
      return {response:'Saint Jean est un apôtre et un évangéliste de la tradition chrétienne.'};
    }}
  };
}
const req=()=>new Request('https://mel.test/api/public/fides/chat',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({message:'Qui est saint Jean ?'})
});

test('FIDES logs only categorized provider diagnostics and retries once on recoverable failures',async()=>{
  const calls=[],logs=[];
  const original=console.error;
  console.error=(...args)=>logs.push(args);
  try {
    const error=Object.assign(new Error('sensitive visitor content and key=secret123'),{
      statusCode:503,name:'ServiceError',code:'SERVICE_UNAVAILABLE'
    });
    const response=await handlePublicFidesChat(req(),envWith(error,calls));
    assert.equal(response.status,200);
    assert.deepEqual(calls,['@cf/zai-org/glm-4.7-flash','@cf/google/gemma-4-26b-a4b-it']);
    assert.equal(logs[0][0],'[FIDES public] primary inference failed');
    assert.deepEqual(logs[0][1],{status:503,code:'SERVICE_UNAVAILABLE',name:'ServiceError',messageKind:'UNCLASSIFIED'});
    assert.equal(logs[1][0],'[FIDES public] trying bounded free-model fallback');
    assert.ok(!JSON.stringify(logs).includes('sensitive visitor'));
    assert.ok(!JSON.stringify(logs).includes('secret123'));
  } finally {console.error=original;}
});

test('FIDES does not retry when provider statusCode or safe error class signals quota or authentication',async()=>{
  for(const error of [
    Object.assign(new Error('request failed'),{statusCode:429,name:'RateError'}),
    Object.assign(new Error('quota exhausted'),{name:'ProviderError'})
  ]){
    const calls=[],logs=[];
    const original=console.error;
    console.error=(...args)=>logs.push(args);
    try{
      const response=await handlePublicFidesChat(req(),envWith(error,calls));
      assert.equal(response.status,502);
      assert.deepEqual(calls,['@cf/zai-org/glm-4.7-flash']);
      assert.ok(!JSON.stringify(logs).includes('quota exhausted'));
    }finally{console.error=original;}
  }
});
