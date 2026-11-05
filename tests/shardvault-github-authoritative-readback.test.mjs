import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {githubMirrorContentsApiUrl,readAuthoritativeGitHubMirror} from '../src/continuity/github-mirror-authoritative.js';

const sha='a'.repeat(40);
const objectId='code-'+sha.slice(0,12)+'-shard-06-github';
const url='https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/refs/heads/shardvault-preview-mirror/shardvault-code/'+sha+'/'+objectId+'.bin';

test('only the fixed exact public repo, branch and shard identity produce an API URL',()=>{
  assert.equal(githubMirrorContentsApiUrl(url),
    'https://api.github.com/repos/adrienlopezcarreras-pixel/meliturgos-cloudflare/contents/shardvault-code/'+sha+'/'+objectId+'.bin?ref=shardvault-preview-mirror');
  for(const altered of [
    url.replace('https:','http:'),
    url.replace('raw.githubusercontent.com','example.org'),
    url.replace('shardvault-preview-mirror','main'),
    url.replace('/'+sha+'/','/'+'b'.repeat(40)+'/'),
    url.replace('meliturgos-cloudflare','different-repo'),
    url.replace('shard-06','shard-08'),
    'https://raw.githubusercontent.com@evil.invalid/'+url.split('/').slice(3).join('/'),
  ])assert.equal(githubMirrorContentsApiUrl(altered),null,altered);
});

test('independent exact byte read from GitHub Contents API supports line-wrapped base64',async()=>{
  const fragment=Uint8Array.from({length:273883},(_,i)=>(i*43+7)%256);
  const encoded=Buffer.from(fragment).toString('base64');
  const wrap=encoded.match(/.{1,76}/g).join('\n');
  let called='';
  const got=await readAuthoritativeGitHubMirror(url,{maxBytes:fragment.length,fetchImpl:async(request,options)=>{
    called=request;
    assert.equal(options.method,'GET');
    assert.equal(options.headers.accept,'application/vnd.github+json');
    return Response.json({type:'file',encoding:'base64',size:fragment.length,content:wrap});
  }});
  assert.ok(called.startsWith('https://api.github.com/repos/'));
  assert.equal(Buffer.compare(Buffer.from(got),Buffer.from(fragment)),0);
});

test('remote absence, invalid base64 or inconsistent byte length never prove a mirror',async()=>{
  const a=await readAuthoritativeGitHubMirror(url,{fetchImpl:async()=>new Response('missing',{status:404})});
  assert.equal(a,null);
  for(const body of [
    {type:'file',encoding:'base64',size:4,content:'AAEC'},
    {type:'file',encoding:'base64',size:1,content:'\u0000'},
    {type:'symlink',encoding:'base64',size:2,content:'AAE='},
    {type:'file',encoding:'base64',size:12,content:'AAE='},
  ]){
    const r=await readAuthoritativeGitHubMirror(url,{maxBytes:10,fetchImpl:async()=>Response.json(body)});
    assert.equal(r,null);
  }
});
test('runtime preserves exact byte equality before accepting a cached relay marker',async()=>{
  const runtime=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.ok(runtime.includes('readAuthoritativeGitHubMirror(remoteUrl,{fetchImpl:fetchTimed,maxBytes:payload.length,readToken:env?.MEL_GITHUB_TOKEN})'));
  assert.ok(runtime.includes('if(published&&byteArraysEqual(published,payload))return {remoteUrl};'));
  assert.ok(runtime.includes("if(!byteArraysEqual(roundtrip,shard))throw new Error('CODE_FRAGMENT_ROUNDTRIP_MISMATCH')"));
  assert.ok(runtime.includes('readAuthoritativeGitHubMirror(remote,{fetchImpl:fetchTimed,'));
});

test('scoped preview GitHub token is passed only to the fixed Contents API as an HTTP header',async()=>{
  const secret='github-actions-test-token-NEVER-LOG';
  let request;
  let options;
  const result=await readAuthoritativeGitHubMirror(url,{
    readToken:secret,maxBytes:3,
    fetchImpl:async (u,o)=>{request=u;options=o;return Response.json({type:'file',encoding:'base64',size:3,content:'AAEC'});},
  });
  assert.deepEqual(Array.from(result),[0,1,2]);
  assert.ok(request.startsWith('https://api.github.com/repos/adrienlopezcarreras-pixel/meliturgos-cloudflare/contents/'));
  assert.ok(!request.includes(secret));
  assert.equal(options.redirect,'manual');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.authorization,'Bearer '+secret);
  assert.equal(options.headers['cache-control'],'no-cache');
  assert.equal(githubMirrorContentsApiUrl(url.replace('shardvault-preview-mirror','main')),null);
  let badCalls=0;
  const rejected=await readAuthoritativeGitHubMirror(url.replace('raw.githubusercontent.com','evil.test'),{
    readToken:secret,fetchImpl:async()=>{badCalls++;return Response.json({ok:true});}
  });
  assert.equal(rejected,null);
  assert.equal(badCalls,0);
});

test('realistic GitHub Content-Length with escaped wrapped base64 is accepted for 275 KiB fragments',async()=>{
  const bytes=Uint8Array.from({length:274554},(_,i)=>((i*79+11)%256));
  const b64=Buffer.from(bytes).toString('base64');
  const wrapped=b64.match(/.{1,60}/g).join(String.fromCharCode(10));
  const body=JSON.stringify({type:'file',encoding:'base64',size:bytes.length,content:wrapped,name:'code-a-shard-06-github.bin'});
  const oldHeaderLimit=Math.ceil(bytes.length/3)*4+4096+2048;
  assert.ok(Buffer.byteLength(body)>oldHeaderLimit,'reproduce previous false rejection');
  let requests=0;
  const output=await readAuthoritativeGitHubMirror(url,{
    maxBytes:bytes.length,
    fetchImpl:async (requested,opts)=>{
      requests++;
      assert.ok(requested.startsWith('https://api.github.com/repos/'));
      assert.equal(opts.redirect,'manual');
      return new Response(body,{status:200,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}});
    },
  });
  assert.equal(requests,1);
  assert.ok(output instanceof Uint8Array);
  assert.equal(Buffer.compare(Buffer.from(output),Buffer.from(bytes)),0);
});

test('body still fails closed when GitHub JSON is too large or decoded content exceeds shard size',async()=>{
  const data=Uint8Array.from({length:100},(_,i)=>i);
  const body=JSON.stringify({type:'file',encoding:'base64',size:100,content:Buffer.from(data).toString('base64')});
  const excessive=await readAuthoritativeGitHubMirror(url,{
    maxBytes:100,fetchImpl:async()=>new Response(body,{status:200,headers:{'content-length':'99999999'}}),
  });
  assert.equal(excessive,null);
  const oversizedBytes=await readAuthoritativeGitHubMirror(url,{
    maxBytes:99,fetchImpl:async()=>Response.json({type:'file',encoding:'base64',size:100,content:Buffer.from(data).toString('base64')}),
  });
  assert.equal(oversizedBytes,null);
});


test('Workers-compatible fetch reads the authoritative mirror without unsupported redirect modes',async()=>{
  let calls=0;
  const result=await readAuthoritativeGitHubMirror(url,{
    maxBytes:3,readToken:'private-fixture',
    fetchImpl:async(request,init,timeoutMs)=>{
      if(init.redirect==='error')throw new TypeError('Invalid redirect value, must be follow or manual');
      assert.equal(init.redirect,'manual');
      assert.equal(timeoutMs,12000,'keep the caller timeout contract');
      calls++;
      return Response.json({type:'file',encoding:'base64',size:3,content:'AAEC'});
    },
  });
  assert.equal(calls,1);
  assert.deepEqual(Array.from(result||[]),[0,1,2]);
});

for(const status of [301,302,303,307,308])test(`authoritative mirror HTTP ${status} never follows a token-bearing redirect`,async()=>{
  const secret='mirror-private-token-never-forward';
  const calls=[];
  const result=await readAuthoritativeGitHubMirror(url,{
    maxBytes:3,readToken:secret,
    fetchImpl:async(request,init)=>{
      if(init.redirect==='error')throw new TypeError('Invalid redirect value');
      assert.equal(init.redirect,'manual');
      calls.push({request,authorization:init.headers.authorization});
      return new Response(null,{status,headers:{location:'https://foreign.example/collect'}});
    },
  });
  assert.equal(result,null);
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0].request).origin,'https://api.github.com');
  assert.ok(!calls[0].request.includes(secret));
});

test('the authoritative mirror decoder runs inside workerd with only one local GitHub response',async()=>{
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const source=await readFile(new URL('../src/continuity/github-mirror-authoritative.js',import.meta.url),'utf8');
  const calls=[];
  const secret='mirror-local-read-only-token';
  const options={modules:true,compatibilityDate:'2026-09-04',cf:false,
    script:source+'\nexport default {async fetch(){const bytes=await readAuthoritativeGitHubMirror('+JSON.stringify(url)+',{maxBytes:3,readToken:'+JSON.stringify(secret)+'});return Response.json({bytes:bytes?Array.from(bytes):null});}}',
    outboundService:async(request)=>{
      calls.push({url:request.url,authorization:request.headers.get('authorization')});
      assert.equal(request.url,githubMirrorContentsApiUrl(url));
      return Response.json({type:'file',encoding:'base64',size:3,content:'AAEC'});
    },
  };
  const runtime=new Miniflare(typeof convertV4MiniflareOptions==='function'?convertV4MiniflareOptions(options):options);
  try{
    const response=await runtime.dispatchFetch('http://localhost/read');
    assert.deepEqual(await response.json(),{bytes:[0,1,2]});
    assert.equal(calls.length,1);
    assert.equal(calls[0].authorization,'Bearer '+secret);
    assert.ok(!calls[0].url.includes(secret));
  }finally{await runtime.dispose();}
});

async function actualRuntimeFetchTimed(nativeFetch){
  const source=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  const start=source.indexOf('function isPrivate4('),end=source.indexOf('async function fetchRateAware(');
  assert.ok(start>=0&&end>start);
  // Execute the existing private transport and URL guard, rather than a
  // second imitation of its redirect loop. No real outbound network is used.
  return new Function('fetch',source.slice(start,end)+'\nreturn fetchTimed;')(nativeFetch);
}

test('actual ShardVault fetchTimed preserves explicit manual mode and never forwards the mirror token',async()=>{
  const calls=[];
  const secret='mirror-runtime-private-token';
  const transport=await actualRuntimeFetchTimed(async(request,init)=>{
    calls.push({request:String(request),authorization:init.headers?.authorization});
    if(calls.length===1)return new Response(null,{status:302,headers:{location:'https://foreign.example/token-collector'}});
    return Response.json({type:'file',encoding:'base64',size:3,content:'AAEC'});
  });
  const result=await readAuthoritativeGitHubMirror(url,{maxBytes:3,readToken:secret,fetchImpl:transport});
  assert.equal(result,null);
  assert.equal(calls.length,1,'the runtime wrapper itself must not follow the redirect');
  assert.equal(new URL(calls[0].request).origin,'https://api.github.com');
  assert.equal(calls[0].authorization,'Bearer '+secret);
});

test('ordinary ShardVault GET redirects keep their existing bounded follow behavior',async()=>{
  const calls=[];
  const transport=await actualRuntimeFetchTimed(async(request,init)=>{
    assert.equal(init.redirect,'manual','each native request remains observable to the URL guard');
    assert.ok(init.signal instanceof AbortSignal);
    calls.push(String(request));
    return calls.length===1
      ?new Response(null,{status:302,headers:{location:'https://storage.example/final'}})
      :new Response('ordinary shard');
  });
  const response=await transport('https://storage.example/initial',{method:'GET'},12000);
  assert.equal(await response.text(),'ordinary shard');
  assert.deepEqual(calls,['https://storage.example/initial','https://storage.example/final']);
});
