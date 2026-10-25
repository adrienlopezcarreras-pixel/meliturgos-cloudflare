import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Real local workerd/R2: no production bindings, credentials or external calls.
test('native R2 streaming backup verifies large objects and rolls back failed copies', {timeout: 120000}, async () => {
  const script = await build({bundle:true,write:false,format:'esm',platform:'browser',stdin:{
    resolveDir:process.cwd(),contents:`
      import { backupR2ObjectBytes } from './src/backup/r2-byte-backup.js';
      export default {async fetch(request, env) {
        const mode = new URL(request.url).pathname.slice(1);
        const size = mode === 'large' ? 40 * 1024 * 1024 : 16;
        const bucket = env.TEST_R2;
        const key = mode + '/source';
        const stream = new FixedLengthStream(size);
        const writer = stream.writable.getWriter();
        await Promise.all([bucket.put(key, stream.readable), (async()=>{
          for (let sent=0; sent<size; sent+=65536) await writer.write(new Uint8Array(Math.min(65536,size-sent)).fill(37));
          await writer.close();
        })()]);
        let sourceReads=0,bufferReads=0,putCount=0;
        const adapter = {
          list:()=>bucket.list({prefix:mode+'/'}),
          async get(k) {
            if(k===key && ++sourceReads===2 && mode==='changed') await bucket.put(key, new Uint8Array(size).fill(99));
            const object=await bucket.get(k);
            if(!object)return null;
            return {body:object.body,size:object.size,etag:object.etag,httpMetadata:object.httpMetadata,
              arrayBuffer(){bufferReads++;throw Error('FULL_BUFFER_FORBIDDEN');}};
          },
          async put(k,body,options) {
            putCount++;
            const result=await bucket.put(k,body,options);
            if(mode==='partial')throw Error('SYNTHETIC_AFTER_WRITE');
            if(mode==='corrupt')await bucket.put(k,new Uint8Array(size).fill(99));
            return result;
          },
          delete:k=>bucket.delete(k),
        };
        let result, code;
        try {result=await backupR2ObjectBytes(adapter,{snapshotId:'stream-'+mode,maxObjectBytes:64*1024*1024});}
        catch(error){code=error.code||error.message;}
        const source=await bucket.get(key);
        const digest=new crypto.DigestStream('SHA-256');
        await source.body.pipeTo(digest);
        const sourceHash=[...new Uint8Array(await digest.digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
        const backups=await bucket.list({prefix:'backups/system/r2-bytes/stream-'+mode+'/'});
        return Response.json({result,code,bufferReads,sourceReads,putCount,sourceHash,backupCount:backups.objects.length});
      }};
    `}});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:script.outputFiles[0].text,
    compatibilityDate:'2026-09-04',r2Buckets:['TEST_R2']}));
  try {
    const large=await(await mf.dispatchFetch('http://local/large')).json();
    assert.equal(large.code,undefined);assert.equal(large.result.totalBytes,40*1024*1024);
    assert.equal(large.bufferReads,0);assert.equal(large.sourceReads,2);assert.equal(large.backupCount,1);
    assert.equal(large.result.objects[0].sha256,large.sourceHash);
    for(const [mode,code] of [['changed','BACKUP_R2_SOURCE_CHANGED'],['partial','SYNTHETIC_AFTER_WRITE'],['corrupt','BACKUP_R2_COPY_INTEGRITY_MISMATCH']]) {
      const failure=await(await mf.dispatchFetch('http://local/'+mode)).json();
      assert.equal(failure.code,code,JSON.stringify(failure));
      assert.equal(failure.backupCount,0);assert.equal(failure.bufferReads,0);
      if(mode==='changed')assert.equal(failure.putCount,0);
    }
  }finally{await mf.dispose();}
});
