export const SERVICE_WORKER_SOURCE = `
const CACHE='meliturgos-gen2-v4';
const FALLBACK='/';
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.add(FALLBACK)).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING'||event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response && response.ok && request.url.startsWith(self.location.origin)) cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch(error){
    return (await cache.match(request)) || (request.mode==='navigate' ? await cache.match(FALLBACK) : Promise.reject(error));
  }
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;
  if(request.mode==='navigate' || (request.headers.get('accept')||'').includes('text/html')){
    event.respondWith(networkFirst(request));
    return;
  }
  if(url.pathname==='/sw.js') return;
  event.respondWith(networkFirst(request));
});
`;
