// GitHub mirror readback must not depend exclusively on raw.githubusercontent
// CDN propagation. This is an independent, read-only retrieval from GitHub's
// public Contents API. The caller still verifies exact bytes or shard MAC.
const REPO='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const RAW_PATTERN=/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/refs\/heads\/(shardvault-mirror|shardvault-preview-mirror)\/shardvault-code\/([a-f0-9]{40})\/(code-[a-f0-9]{12}-shard-0[0-6]-github)\.bin$/;

export function githubMirrorContentsApiUrl(rawUrl) {
  let u;
  try{u=new URL(String(rawUrl||''));}catch{return null;}
  if(u.protocol!=='https:'||u.hostname!=='raw.githubusercontent.com'||u.port
    ||u.username||u.password)return null;
  const m=RAW_PATTERN.exec(u.pathname);
  if(!m||m[1]+'/'+m[2]!==REPO ||m[5].slice(5,17)!==m[4].slice(0,12))return null;
  return 'https://api.github.com/repos/'+m[1]+'/'+m[2]
    +'/contents/shardvault-code/'+m[4]+'/'+m[5]+'.bin?ref='+m[3];
}

export async function readAuthoritativeGitHubMirror(rawUrl,{fetchImpl=fetch,maxBytes=8*1024*1024,readToken=null}={}){
  const url=githubMirrorContentsApiUrl(rawUrl);
  if(!url||typeof fetchImpl!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1)return null;
  // The fixed GitHub API URL has already passed the repository/branch/SHA
  // allowlist. A short-lived Actions token is available to the isolated
  // preview and avoids GitHub's low anonymous rate limit. Never put it in
  // the URL, log it, or follow a redirect to an unexpected origin.
  const headers={'accept':'application/vnd.github+json','cache-control':'no-cache','user-agent':'MEL-ShardVault/1.0'};
  const token=typeof readToken==='string'?readToken.trim():'';
  if(token&&!/[\\r\\n]/.test(token))headers.authorization='Bearer '+token;
  let response;
  try{
    response=await fetchImpl(url,{method:'GET',redirect:'error',headers},12000);
  }catch{return null;}
  if(!response?.ok)return null;
  const headerSize=Number(response.headers?.get?.('content-length')||0);
  const maxEncoded=Math.ceil(maxBytes/3)*4+4096;
  if(headerSize>0&&headerSize>maxEncoded+2048)return null;
  let data;
  try{data=await response.json();}catch{return null;}
  if(data?.type!=='file'||data?.encoding!=='base64'||typeof data?.content!=='string')return null;
  const clean=data.content.replace(/\s/g,'');
  if(clean.length===0||clean.length>maxEncoded||!/^[A-Za-z0-9+/]*={0,2}$/.test(clean))return null;
  let arr;
  try{
    const decoded=atob(clean);
    if(decoded.length>maxBytes)return null;
    arr=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  }catch{return null;}
  if(Number.isSafeInteger(data.size)&&data.size!==arr.length)return null;
  return arr;
}
