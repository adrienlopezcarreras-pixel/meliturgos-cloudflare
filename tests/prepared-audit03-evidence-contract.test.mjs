import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import {architectureFindings,readArchitectureReport} from '../src/diagnostics/architecture-audit-store.js';
import {hasLeakedToolProtocol,isToolProtocolExampleRequest} from '../src/api/agent-tools.js';

const packet=JSON.parse(readFileSync('prepared/MEL-AUDIT-03.json','utf8'));
const source=packet.changes.find(row=>row.path==='src/diagnostics/domain-audit.js').content;
const {runDomainAudit}=runInNewContext(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')
 +'\n({runDomainAudit});',{architectureFindings,readArchitectureReport,hasLeakedToolProtocol,isToolProtocolExampleRequest},{timeout:1000});

test('the actual serialized AUDIT-03 packet correlates a finding to a persisted row',async t=>{
 assert.equal(packet.roadmap_id,'MEL-AUDIT-03');
 assert.deepEqual(packet.changes.map(row=>row.path),['src/diagnostics/domain-audit.js','tests/domain-audit.test.mjs']);
 const db=sqliteD1();t.after(()=>db.close());
 await db.prepare('CREATE TABLE capability_watch_state(id TEXT PRIMARY KEY,state_json TEXT,updated_at INTEGER)').run();
 const now=Date.parse('2026-11-06T10:00:00Z'),at=now-3_600_000;
 await db.prepare('INSERT INTO capability_watch_state VALUES(?,?,?)')
  .bind('watch-proof',JSON.stringify({interval_ms:3_600_000,last_run_at:now-24*3_600_000}),at).run();
 const report=JSON.parse(JSON.stringify(await runDomainAudit(db,{now})));
 assert.equal(report.findings.length,1);assert.equal(report.findings[0].code,'WATCH_STALLED');
 assert.deepEqual(report.findings[0].evidence_refs,[{table:'capability_watch_state',id:'watch-proof',at}]);
 assert.equal(report.findings[0].evidence_refs_omitted,0);
 assert.equal((await db.prepare('SELECT id FROM capability_watch_state').first()).id,'watch-proof');
});

test('the real preparation CLI accepts a delivered snapshot and still rejects a pending collision',t=>{
 const root=mkdtempSync(join(tmpdir(),'audit03-prepare-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
 const paths=['src/diagnostics/domain-audit.js','tests/domain-audit.test.mjs'];
 for(const file of paths){mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),'export const prior=true;\n');}
 mkdirSync(join(root,'prepared'));
 const old={roadmap_id:'MEL-AUDIT-05',changes:paths.map(path=>({path,base_sha256:'a'.repeat(64),content:'export const prior=true;\n'}))};
 writeFileSync(join(root,'prepared','MEL-AUDIT-05.json'),JSON.stringify(old));
 git('add','.');git('commit','-qm','delivered fixture');const base=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',base);
 git('switch','-c','proposal');for(const file of paths)writeFileSync(join(root,file),'export const correlated=true;\n');
 git('add','.');git('commit','-qm','new proposal');git('checkout','--detach',base);
 const script=fileURLToPath(new URL('../scripts/prepare-mission.mjs',import.meta.url));
 const run=()=>spawnSync(process.execPath,[script,'MEL-AUDIT-03','proposal','correlated evidence'],{cwd:root,encoding:'utf8',env:{...process.env,PREPARE_ALLOW_COLLISION:'false'}});
 const accepted=run();assert.equal(accepted.status,0,accepted.stderr);
 const result=JSON.parse(readFileSync(join(root,'prepared','MEL-AUDIT-03.json'),'utf8'));
 assert.deepEqual(result.changes.map(row=>row.path).sort(),paths);
 assert.ok(result.changes.every(row=>row.content==='export const correlated=true;\n'));
 old.changes[0].content='export const pending=true;\n';writeFileSync(join(root,'prepared','MEL-AUDIT-05.json'),JSON.stringify(old));
 const refused=run();assert.notEqual(refused.status,0);assert.match(refused.stderr,/PREPARED_PACKAGE_FILE_COLLISION/);
});

test('the active Bridge preparer consumes AUDIT-03 and preserves its base guard',async()=>{
 const {preparedMissionPackage}=await import('../src/evolution/autonomy-bridge-preparer.js');
 const {assertRoadmapCodeChanges,roadmapContractRevision}=await import('../src/roadmap/roadmap-code-contracts.js');
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const inspected=packet.changes.map(row=>({path:row.path,content:execFileSync('git',['show',`HEAD:${row.path}`],{encoding:'utf8'})}));
 const body=JSON.stringify(packet);
 const fetchImpl=async url=>String(url).includes('prepared/MEL-AUDIT-03.json')
  ?Response.json({type:'file',sha:'a'.repeat(40),size:Buffer.byteLength(body),content:Buffer.from(body).toString('base64')})
  :new Response('',{status:404});
 const job={requested_by:'mel-autonomy',optional_context:{roadmap_id:'MEL-AUDIT-03',roadmap_contract_revision:roadmapContractRevision('MEL-AUDIT-03')}};
 const code={repository:'o/r',branch:'candidate/x',candidate_sha:sha};
 const loaded=await preparedMissionPackage({},code,job,inspected,fetchImpl);
 assert.ok(loaded);assert.equal(loaded.proposal.provenance.source,'prepared-package');
 assert.doesNotThrow(()=>assertRoadmapCodeChanges(job,loaded.proposal.changes));
 assert.deepEqual(loaded.proposal.changes.map(row=>row.content),packet.changes.map(row=>row.content));
 assert.equal(await preparedMissionPackage({},code,job,[{...inspected[0],content:'unrelated new source'},inspected[1]],fetchImpl),null);
});
