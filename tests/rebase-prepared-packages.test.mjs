import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rebasePreparedChange, rebasePreparedPackages } from '../scripts/rebase-prepared-packages.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

test('an appended mission keeps the prepared package append', () => {
  const committed = 'base\n';
  const current = 'base\nfounder\n';
  const content = 'base\nmanifest\n';
  const next = rebasePreparedChange({ committed, current, content, baseSha: sha(committed) });
  assert.equal(next.content, 'base\nfounder\nmanifest\n');
  assert.equal(next.baseSha, sha(current));
});

test('non-overlapping prepared insertions can rebase after another mission changes the same file', () => {
  const committed = Array.from({length:30},(_,i)=>'line-' + i + '\n').join('');
  const current = committed.replace('line-3\n', 'line-3\nmission-five\n');
  const content = committed.replace('line-24\n', 'line-24\nmission-seven\n');
  const next = rebasePreparedChange({ committed, current, content, baseSha: sha(committed) });
  assert.equal(next.conflict, undefined);
  assert.equal(next.content, current.replace('line-24\n', 'line-24\nmission-seven\n'));
  assert.equal(next.baseSha, sha(current));
});

test('overlapping edits or unproven bases never rebase a prepared package', () => {
  const committed = Array.from({length:20},(_,i)=>'line-' + i + '\n').join('');
  const current = committed.replace('line-10\n','owner-current\n');
  const content = committed.replace('line-10\n','prepared-different\n');
  assert.deepEqual(rebasePreparedChange({ committed, current, content, baseSha: sha(committed) }), { conflict: true });
  assert.deepEqual(rebasePreparedChange({ committed, current, content, baseSha: sha('wrong') }), { conflict: true });
});

test('a package already on the current file is left alone', () => {
  const current = 'same\n';
  assert.equal(rebasePreparedChange({ committed: 'old\n', current, content: current, baseSha: sha('old\n') }), null);
});

test('rebase writes only the drifted package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mel-rebase-'));
  const committed = 'base\n';
  fs.mkdirSync(path.join(root, 'prepared'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'a.mjs'), 'base\nfounder\n');
  fs.writeFileSync(path.join(root, 'prepared', 'MEL-MANIFEST-09.json'), JSON.stringify({
    roadmap_id: 'MEL-MANIFEST-09',
    changes: [{ path: 'tests/a.mjs', base_sha256: sha(committed), content: 'base\nmanifest\n' }],
  }));
  const written = rebasePreparedPackages(root, { readCommitted: () => committed });
  assert.deepEqual(written, ['prepared/MEL-MANIFEST-09.json']);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'prepared', 'MEL-MANIFEST-09.json'), 'utf8'));
  assert.equal(pkg.changes[0].content, 'base\nfounder\nmanifest\n');
  assert.equal(pkg.changes[0].base_sha256, sha('base\nfounder\n'));
});

test('a published prepared snapshot follows later edits without replaying its old source or tests',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mel-delivered-snapshot-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@example.invalid');
 git('config','commit.gpgsign','false');
 const paths=['src/domain.mjs','tests/domain.test.mjs'];
 const changes=paths.map(file=>({path:file,base_sha256:sha('original\n'),content:'delivered memory checks\n'}));
 for(const file of paths){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),changes[0].content);}
 fs.mkdirSync(path.join(root,'prepared'));
 fs.writeFileSync(path.join(root,'prepared','MEL-AUDIT-05.json'),JSON.stringify({roadmap_id:'MEL-AUDIT-05',changes}));
 const pending=JSON.stringify({changes:[{path:paths[0],base_sha256:sha('unproven'),content:'different pending work\n'}]});
 fs.writeFileSync(path.join(root,'prepared','PENDING.json'),pending);
 git('add','.');git('commit','-qm','published memory controls');
 const current='delivered memory checks\nnew chat/watch/work controls\n';
 for(const file of paths)fs.writeFileSync(path.join(root,file),current);
 assert.deepEqual(rebasePreparedPackages(root),['prepared/MEL-AUDIT-05.json']);
 const snapshot=JSON.parse(fs.readFileSync(path.join(root,'prepared','MEL-AUDIT-05.json'),'utf8'));
 for(const change of snapshot.changes){
  assert.equal(change.content,current);assert.equal(change.base_sha256,sha(current));
  assert.equal(fs.readFileSync(path.join(root,change.path),'utf8'),current);
 }
 assert.equal(fs.readFileSync(path.join(root,'prepared','PENDING.json'),'utf8'),pending,'an unproven pending proposal stays conflicted');
 assert.deepEqual(rebasePreparedPackages(root),[],'refresh is idempotent');
});
