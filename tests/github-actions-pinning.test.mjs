import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('all third-party GitHub Actions are pinned to immutable commit SHAs', async () => {
  const root=new URL('../.github/workflows/', import.meta.url);
  const files=(await readdir(root)).filter(name=>/\.ya?ml$/i.test(name));
  const violations=[];
  for(const name of files){
    const source=await readFile(new URL(name,root),'utf8');
    for(const match of source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)){
      const action=match[1];
      if(action.startsWith('./')) continue;
      if(!/@[0-9a-f]{40}$/i.test(action)) violations.push(name+': '+action);
    }
  }
  assert.deepEqual(violations,[]);
});
