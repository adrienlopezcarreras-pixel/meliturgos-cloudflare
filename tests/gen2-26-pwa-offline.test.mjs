import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';

function harness() {
  const handlers = new Map();
  const entries = new Map();
  let offline = false;
  const cache = {
    async put(url, response) { entries.set(typeof url === 'string' ? url : url.url, response); },
    async match(request) { return entries.get(request.url); }
  };
  const scope = {
    self: { location: { origin: 'https://mel.example' }, addEventListener(name, fn) {handlers.set(name,fn);}, skipWaiting:async()=>{}, clients:{claim:async()=>{}} },
    caches: { open:async()=>cache, keys:async()=>[], delete:async()=>true },
    fetch: async request => {
      if (offline) throw Error('OFFLINE');
      const url = typeof request === 'string' ? request : request.url;
      return { ok:true, text:async()=>url.includes('normal-runtime.js')?'NORMAL_RUNTIME':'ASSET', clone(){return this;} };
    },
    URL, Promise
  };
  vm.runInNewContext(SERVICE_WORKER_SOURCE,scope);
  async function get(path) {
    const request={url:'https://mel.example'+path,method:'GET',mode:'cors',headers:{get:()=>''}};
    let response;
    handlers.get('fetch')({request,respondWith(promise){response=promise;},waitUntil(){}});
    return response?await response:null;
  }
  return {get,entries,setOffline(value){offline=value;}};
}
test('PWA normal runtime uses fresh network and falls back to last successful cache offline',async()=>{
 const app=harness();
 assert.equal(await (await app.get('/normal-runtime.js')).text(),'NORMAL_RUNTIME');
 assert.ok(app.entries.has('https://mel.example/normal-runtime.js'));
 app.setOffline(true);
 assert.equal(await (await app.get('/normal-runtime.js')).text(),'NORMAL_RUNTIME');
});
test('PWA service worker does not intercept /api/ responses offline',async()=>{
 const app=harness();
 assert.equal(await app.get('/api/private'),null);
 assert.equal(app.entries.size,0);
});
test('uncached runtime fails closed offline rather than returning fabricated response',async()=>{
 const app=harness();
 app.setOffline(true);
 await assert.rejects(app.get('/normal-runtime.js'),/OFFLINE/);
});
