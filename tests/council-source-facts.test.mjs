import test from 'node:test';
import assert from 'node:assert/strict';
import { councilSourceFacts } from '../src/evolution/council-source-facts.js';
import { resolveCouncilReviewContext } from '../src/evolution/council-file-context.js';

test('source facts parse one actual module without replaying its patch or executing it', () => {
  const fact = councilSourceFacts("import { decode } from './unchanged.js';\nexport function manifestFunctionalEvidence() {}\ntest('actual case',()=>{throw Error('must not execute')});");
  assert.equal(fact.syntax_status, 'VALID_MODULE');
  assert.equal(fact.top_level_declarations.manifestFunctionalEvidence, 1);
  assert.deepEqual(fact.exports, ['manifestFunctionalEvidence']);
  assert.deepEqual(fact.local_imports, ['./unchanged.js']);
  assert.deepEqual(fact.test_cases, ['actual case']);
  assert.equal(fact.scope, 'STATIC_ONLY_NOT_EXECUTED');
  assert.equal('passed' in fact, false);
});

test('a real duplicate export is invalid rather than dismissed as a snapshot artifact', () => {
  assert.equal(councilSourceFacts('export function same() {}\nexport function same() {}').syntax_status, 'INVALID_MODULE');
});

test('bounded full-file omissions retain syntax facts and resolve unchanged local imports', async () => {
  const head = 'a'.repeat(40), path = 'src/large.js';
  const content = "import { decode } from './unchanged.js';\nexport const valid=1;\n" + '// padding\n'.repeat(1800);
  const context = await resolveCouncilReviewContext({}, { head,
    diff: `diff --git a/${path} b/${path}\n@@ -2 +2 @@\n-export const valid=0;\n+export const valid=1;\n`,
    fetchImpl: async url => String(url).includes('/git/trees/')
      ? Response.json({truncated:false,tree:[{path:'src/unchanged.js',type:'blob',sha:'b'.repeat(40)}]})
      : Response.json({type:'file',sha:'c'.repeat(40),content:Buffer.from(content).toString('base64')}) });
  assert.equal(context.reviewed_files[0].status, 'OMITTED_CONTEXT_BUDGET');
  assert.equal(context.static_source_facts[0].syntax_status, 'VALID_MODULE');
  assert.deepEqual(context.static_source_facts[0].exports, ['valid']);
  assert.equal(context.imports[0].status, 'EXISTS_AT_EXACT_SHA');
  assert.equal(context.imports[0].path, 'src/unchanged.js');
  assert.equal(context.file_context_head, head);
});

test('files beyond the old first-twelve cutoff retain independently parsed exports', async () => {
  const paths = Array.from({length:15},(_,i)=>`src/module-${i}.js`);
  const context = await resolveCouncilReviewContext({}, {head:'a'.repeat(40),
    diff:paths.map(path=>`diff --git a/${path} b/${path}\n+export const value=1;\n`).join(''),
    fetchImpl:async()=>Response.json({type:'file',sha:'b'.repeat(40),content:Buffer.from('export const value=1;').toString('base64')})});
  assert.equal(context.static_source_facts.length,15);
  assert.equal(context.reviewed_files.filter(row=>row.status==='COMPLETE_AT_EXACT_SHA').length,15);
});
