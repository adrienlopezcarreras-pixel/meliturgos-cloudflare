import { pathToFileURL } from 'node:url';

// Official Cloudflare account metrics API (also used by the pinned SDK).
// It does not expose monthly billing allowances or guarantee instantaneous data.
export async function readR2AccountUsage({accountId,apiToken,fetchImpl=fetch}={}) {
  const blocked=code=>({ok:false,status:'BLOCKED',code,billing_verified:false,cleanup_authorized:false});
  if(!/^[a-f0-9]{32}$/i.test(String(accountId||''))||!String(apiToken||'').trim())return blocked('R2_USAGE_CREDENTIALS_REQUIRED');
  try {
    const response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/metrics`,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+apiToken}});
    if(!response.ok){await response.body?.cancel().catch(()=>{});return blocked([401,403].includes(response.status)?'R2_USAGE_ACCESS_DENIED':'R2_USAGE_HTTP_FAILED');}
    let total=0;const chunks=[];
    for await(const chunk of response.body||[]){total+=chunk.byteLength;if(total>65536)return blocked('R2_USAGE_RESPONSE_TOO_LARGE');chunks.push(chunk);}
    const payload=JSON.parse(Buffer.concat(chunks,total).toString('utf8'));
    if(payload.success!==true||!payload.result||typeof payload.result!=='object')return blocked('R2_USAGE_DATA_INVALID');
    const classes={};
    for(const storageClass of ['standard','infrequentAccess']) {
      const states={};
      for(const state of ['published','uploaded']) {
        const row=payload.result[storageClass]?.[state];
        if(row===undefined)continue;
        const numbers={};
        for(const field of ['objects','payloadSize','metadataSize']) {
          if(row[field]===undefined)continue;
          if(!Number.isSafeInteger(row[field])||row[field]<0)return blocked('R2_USAGE_DATA_INVALID');
          numbers[field]=row[field];
        }
        if(Object.keys(numbers).length)states[state]=numbers;
      }
      if(Object.keys(states).length)classes[storageClass]=states;
    }
    if(!Object.keys(classes).length)return blocked('R2_USAGE_DATA_INCOMPLETE');
    return {ok:true,status:'ACCOUNT_METRICS_OBSERVED',source:'CLOUDFLARE_ACCOUNT_R2_METRICS',
      observed_at:new Date().toISOString(),may_be_delayed:true,classes,billing_verified:false,cleanup_authorized:false};
  }catch{return blocked('R2_USAGE_TRANSPORT_OR_DATA_FAILED');}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await readR2AccountUsage({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_API_TOKEN});
  console.log(JSON.stringify(result));
  console.error('::notice title=MEL R2 account usage::'+JSON.stringify(result));
  if(!result.ok)process.exitCode=1;
}
