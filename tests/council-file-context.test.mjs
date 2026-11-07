import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCouncilFileContext } from '../src/evolution/council-file-context.js';
import { runCouncilReview } from '../src/evolution/council-review.js';

const head = 'a'.repeat(40);
const diff = 'diff --git a/src/diagnostics/domain-audit.js b/src/diagnostics/domain-audit.js\n@@ -62,2 +62,3 @@\n+  memory = measuredRows;\n';
const source = readFileSync('src/diagnostics/domain-audit.js', 'utf8');
const response = content => Response.json({type:'file',sha:'b'.repeat(40),content:Buffer.from(content).toString('base64')});

test('a patch review receives unchanged helpers and findings from the same immutable full file', async () => {
  const calls = [];
  const context = await resolveCouncilFileContext({}, {head,diff,fetchImpl:async(url,init)=>{
    calls.push({url:String(url),redirect:init.redirect}); return response(source);
  }});
  assert.equal(context.files[0].status,'COMPLETE_AT_EXACT_SHA');
  assert.equal(context.files[0].content, source);
  for(const symbol of ['const WEEK_MS','const time','MEMORY_UNCONSOLIDATED','SECURITY_EXPIRED_SESSIONS_KEPT','BACKUP_STALE'])
    assert.ok(context.files[0].content.includes(symbol), symbol+' must not be invented absent from a patch-only view');
  assert.ok(calls.every(call=>call.url.includes(head)&&call.redirect==='manual'));
  const asked=[];
  await runCouncilReview({AI:{async run(_model,input){asked.push(input.messages);return {response:'{"verdict":"APPROVE","blocking":[],"summary":"Full immutable code and tests examined"}'};}}},
    {diff,models:['a','b','c'],dependencyContext:context});
  assert.ok(asked.every(messages=>messages[1].content.includes('const WEEK_MS')));
});

test('oversized context is explicitly omitted rather than silently truncated', async () => {
  const context=await resolveCouncilFileContext({}, {head,diff,fetchImpl:async()=>response('x'.repeat(17000))});
  assert.deepEqual(context.files,[{path:'src/diagnostics/domain-audit.js',status:'OMITTED_CONTEXT_BUDGET'}]);
});

test('unavailable current source cannot be treated as missing code or an approval', async () => {
  await assert.rejects(resolveCouncilFileContext({}, {head,diff,fetchImpl:async()=>new Response('',{status:503})}),
    {code:'COUNCIL_FILE_CONTEXT_UNAVAILABLE'});
  await assert.rejects(resolveCouncilFileContext({}, {head:'main',diff}),{code:'COUNCIL_FILE_HEAD_INVALID'});
});

test('complete-file context stays inside the total budget without truncating an included file', async () => {
  const three = ['a','b','c'].map(name=>'diff --git a/src/'+name+'.js b/src/'+name+'.js\n+x\n').join('');
  const context=await resolveCouncilFileContext({}, {head,diff:three,fetchImpl:async()=>response('x'.repeat(12000))});
  assert.equal(context.files.filter(file=>file.status==='COMPLETE_AT_EXACT_SHA').length,2);
  assert.equal(context.files[2].status,'OMITTED_CONTEXT_BUDGET');
  assert.equal(context.files[0].content.length,12000);
});

test('independent GitHub reads start together rather than stacking per-file timeout budgets', async () => {
  const pending=[];
  const two='diff --git a/src/a.js b/src/a.js\n+x\ndiff --git a/src/b.js b/src/b.js\n+y\n';
  const result=resolveCouncilFileContext({}, {head,diff:two,fetchImpl:()=>new Promise(resolve=>pending.push(resolve))});
  await Promise.resolve();
  assert.equal(pending.length,2);
  pending.forEach(resolve=>resolve(response('export const value=1;')));
  assert.equal((await result).files.length,2);
});

test('Council sees added files as post-change snapshots rather than a second patch application', async () => {
  const patch = 'diff --git a/src/new-check.js b/src/new-check.js\nnew file mode 100644\n--- /dev/null\n+++ b/src/new-check.js\n@@ -0,0 +1 @@\n+export function check() { return true; }\n';
  const snapshot = 'export function check() { return true; }\n';
  const context = await resolveCouncilFileContext({}, { head, diff: patch,
    fetchImpl: async () => response(snapshot) });
  assert.equal(context.snapshot_role, 'POST_CHANGE_HEAD');
  assert.equal(context.head, head);
  assert.equal(context.files[0].content, snapshot);
  const asked = [];
  await runCouncilReview({ AI: { async run(_model, input) {
    asked.push(input.messages[1].content);
    return { response: '{"verdict":"APPROVE","blocking":[],"summary":"Post-change snapshot and patch examined separately"}' };
  } } }, { diff: patch, models: ['a', 'b', 'c'], dependencyContext: context });
  assert.ok(asked.length >= 2);
  assert.ok(asked.every(prompt => prompt.includes('POST_CHANGE_HEAD')
    && prompt.includes('Ne pas réappliquer le diff')
    && prompt.includes('ne prouve pas sa présence dans la base')
    && prompt.includes('Signaler tout vrai doublon ou conflit démontré')
    && prompt.includes('--- /dev/null')));
});
