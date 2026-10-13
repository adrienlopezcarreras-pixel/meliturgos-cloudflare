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
  assert.equal(options.redirect,'error');
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
