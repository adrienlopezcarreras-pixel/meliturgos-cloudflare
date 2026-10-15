import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const yaml=readFileSync('.github/workflows/live-connections-production-proof.yml','utf8');
const snippet=yaml.match(/node -e '([^'\n]*graphVerified[^'\n]*)' "\$\{out\}" "\$\{name\}"/)?.[1];
if(!snippet)throw new Error('EXACT_SHAREPOINT_GRAPH_PROOF_VALIDATOR_REQUIRED');

function check(name,payload){
  const dir=mkdtempSync(path.join(os.tmpdir(),'mel-sharepoint-graph-truth-'));
  try{
    const filename=path.join(dir,'response.json');
    writeFileSync(filename,JSON.stringify(payload));
    return spawnSync(process.execPath,['-e',snippet,filename,name],
      {encoding:'utf8',timeout:8000});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('SharePoint linked Pipedream account plus HTTP 200 never proves real Graph reading',()=>{
  const r=check('microsoft_sharepoint_pipedream_graph',{ok:true,project_found:true,authenticated:true});
  assert.equal(r.status,3,r.stderr);
  assert.match(r.stdout,/SHAREPOINT_GRAPH_TARGET_READ_UNVERIFIED/);
});
test('SharePoint Pipedream Graph site GET needs explicit privacy and read-only proofs',()=>{
  const good={ok:true,graph_site_read_proven:true,read_only:true,private_content_returned:false};
  assert.equal(check('microsoft_sharepoint_pipedream_graph',good).status,0);
  assert.equal(check('microsoft_sharepoint_pipedream_graph',{...good,read_only:false}).status,3);
  assert.equal(check('microsoft_sharepoint_pipedream_graph',{...good,private_content_returned:true}).status,3);
  assert.equal(check('microsoft_sharepoint_pipedream_graph',{...good,graph_site_read_proven:false}).status,3);
  assert.equal(check('microsoft_sharepoint_pipedream_graph',{...good,ok:false}).status,2);
});
test('native Microsoft SharePoint needs exact connector ID and a true live Graph probe',()=>{
  const good={ok:true,provider:'microsoft',connector_id:'microsoft-sharepoint',live_probe:true};
  assert.equal(check('microsoft_sharepoint',good).status,0);
  assert.equal(check('microsoft_sharepoint',{ok:true,provider:'microsoft'}).status,3);
  assert.equal(check('microsoft_sharepoint',{...good,connector_id:'microsoft-onedrive'}).status,3);
});
test('optional SharePoint never blocks baseline zero-cost MEL, without claiming Graph proof',()=>{
  assert.doesNotMatch(yaml,/if \\[ "\\\$\\{MICROSOFT_SHAREPOINT_OK\\}" != "1" \\] \\|\\| \\[ "\\\$\\{MICROSOFT_SHAREPOINT_READ_PROVEN\\}" != "1" \\]; then FAILURES=/);
  assert.match(yaml,/sharepoint_graph_read_required:false/);
  assert.match(yaml,/sharepoint_status:process\\.env\\.MICROSOFT_SHAREPOINT_READ_PROVEN==='1'\\?'VERIFIED':'OPTIONAL_UNAVAILABLE'/);
  assert.match(yaml,/free_document_alternatives:\\['google_drive','microsoft_onedrive'\\]/);
  assert.match(yaml,/sharepoint_graph_read_proven:process\\.env\\.MICROSOFT_SHAREPOINT_READ_PROVEN==='1'/);
  assert.match(yaml,/MICROSOFT_SHAREPOINT_READ_PROVEN.*!= "1"/);
  assert.match(yaml,/OPTIONAL_UNAVAILABLE/);
});
