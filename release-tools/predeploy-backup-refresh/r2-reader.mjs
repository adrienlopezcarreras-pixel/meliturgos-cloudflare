// Same authenticated R2 object endpoint as the pinned Wrangler CLI, without a
// process per object. GET only, fixed origin and backup namespace, bounded bodies.
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function createR2BackupReader({accountId,apiToken,bucket='meliturgos-private-media',fetchImpl=fetch,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 accountId=String(accountId||'').trim();apiToken=String(apiToken||'').trim();
 if(!/^[a-f0-9]{32}$/i.test(accountId)||!apiToken||! /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))fail('ISOLATED_R2_CREDENTIALS_REQUIRED');
 let blockedUntil=0;
 return {async getBytes(key,{maxBytes=32*1024*1024}={}) {
  if(typeof key!=='string'||!key.startsWith('backups/system/')||key.length>2048||key.includes('\0')||key.split('/').some(part=>part==='.'||part==='..'))fail('ISOLATED_R2_KEY_INVALID');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>512*1024*1024)fail('ISOLATED_R2_READ_BUDGET_INVALID');
  const path=key.split('/').map(encodeURIComponent).join('/');
  const url=`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${path}`;
  for(let attempt=0;attempt<3;attempt++) {
   while(blockedUntil>now())await sleep(blockedUntil-now());
   let response;
   try {response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(120000),headers:{authorization:'Bearer '+apiToken}});}
   catch {if(attempt===2)fail('ISOLATED_R2_TRANSPORT_FAILED');await sleep(1000*(attempt+1));continue;}
   if(!response.ok) {
    await response.body?.cancel().catch(()=>{});
    if(response.status===404)return null;
    if(response.status===401||response.status===403)fail('ISOLATED_R2_ACCESS_DENIED');
    if(![429,500,502,503,504].includes(response.status)||attempt===2)fail(response.status===429?'ISOLATED_R2_RATE_LIMITED':'ISOLATED_R2_DOWNLOAD_FAILED');
    const raw=response.headers.get('retry-after');
    const seconds=raw===null?NaN:Number(raw);
    const delay=raw===null?1000*(attempt+1):Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(raw)-now());
    if(!Number.isFinite(delay)||delay>300000)fail('ISOLATED_R2_RATE_LIMITED');
    if(response.status===429)blockedUntil=Math.max(blockedUntil,now()+delay);
    else await sleep(delay);
    continue;
   }
   const length=response.headers.get('content-length');
   if(length!==null&&Number(length)>maxBytes){await response.body?.cancel().catch(()=>{});fail('ISOLATED_R2_READ_BUDGET_EXCEEDED');}
   try {
    const chunks=[];let total=0;
    if(!response.body){if(length==='0')return Buffer.alloc(0);fail('ISOLATED_R2_BODY_UNAVAILABLE');}
    for await(const chunk of response.body){total+=chunk.byteLength;if(total>maxBytes)fail('ISOLATED_R2_READ_BUDGET_EXCEEDED');chunks.push(chunk);}
    return Buffer.concat(chunks,total);
   }catch(error){
    if(String(error?.code||'').startsWith('ISOLATED_'))throw error;
    if(attempt===2)fail('ISOLATED_R2_TRANSPORT_FAILED');await sleep(1000*(attempt+1));
   }
  }
 }};
}
