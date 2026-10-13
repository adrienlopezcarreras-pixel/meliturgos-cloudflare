// External ShardVault recovery uses strictly read-only GETs. Retry only
// transient transport failures; never retry 4xx auth/absence, malformed
// content, byte/length/MAC mismatch, or local storage errors.
const RETRYABLE_HTTP=new Set([408,425,429,500,502,503,504,520,521,522,523,524]);
export function isTransientCodeReadFailure(error){
  const name=String(error?.name||'');
  if(name==='AbortError'||name==='TimeoutError')return true;
  const message=String(error?.message||'');
  const match=/^READ_[A-Za-z0-9_.-]+_(\d{3})$/.exec(message);
  if(match)return RETRYABLE_HTTP.has(Number(match[1]));
  return name==='TypeError' && /^(fetch failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/i.test(message);
}

export async function downloadCodeFragmentWithRetry(read,{
  sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
}={}){
  if(typeof read!=='function')throw new TypeError('CODE_READ_REQUIRED');
  for(let attempt=0;attempt<3;attempt++){
    try{return await read();}
    catch(error){
      if(attempt===2||!isTransientCodeReadFailure(error))throw error;
      // Fixed finite schedule, not governed by untrusted Retry-After data.
      await sleep((attempt+1)*750);
    }
  }
  throw new Error('CODE_READ_RETRIES_EXHAUSTED');
}
