import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubCodeReader } from '../src/capabilities/github-code-capabilities.js';

test('MEL CODE source reader defaults to canonical main, not retired release', async () => {
  const urls=[];
  const sha='a'.repeat(40);
  const reader=createGitHubCodeReader({
    repository:'example/mel',
    fetchImpl:async url=>{
      urls.push(String(url));
      return {ok:true,json:async()=>({object:{sha}})};
    }
  });
  const result=await reader.head();
  assert.equal(result.branch,'main');
  assert.equal(result.sha,sha);
  assert.ok(urls[0].includes('/git/ref/heads/main'));
});
