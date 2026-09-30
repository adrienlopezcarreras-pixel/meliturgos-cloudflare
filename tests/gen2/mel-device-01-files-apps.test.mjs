import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  COMPUTER_USE_ACTIONS,
  COMPUTER_USE_RISK,
  classifyComputerUseAction,
  evaluateComputerUsePlan,
  normalizeComputerUseRequest,
} from '../../src/devices/computer-use.js';

const base={
  session_id:'device-01-session',
  device:{id:'pc-1',capabilities:['computer.use']},
  sandbox:{
    allowed_apps:['notepad','explorer'],
    allowed_paths:['C:\\Users\\Adrien\\Documents','C:\\Users\\Adrien\\Desktop'],
    allowed_origins:[],
    max_steps:10,
  },
};

function approval(step){
  return {approved:true,session_id:base.session_id,step_id:step.id,action:step.action};
}

test('MEL-DEVICE-01 app/file open-close are sensitive, raw file IO remains denied',()=>{
  for(const action of [
    COMPUTER_USE_ACTIONS.OPEN_APP,
    COMPUTER_USE_ACTIONS.CLOSE_APP,
    COMPUTER_USE_ACTIONS.OPEN_FILE,
    COMPUTER_USE_ACTIONS.CLOSE_FILE,
  ]){
    assert.equal(classifyComputerUseAction(action),COMPUTER_USE_RISK.SENSITIVE);
  }
  assert.equal(classifyComputerUseAction('file.read'),COMPUTER_USE_RISK.DENY);
  assert.equal(classifyComputerUseAction('file.write'),COMPUTER_USE_RISK.DENY);
  assert.equal(classifyComputerUseAction('file.delete'),COMPUTER_USE_RISK.DENY);
  assert.equal(classifyComputerUseAction('process.spawn'),COMPUTER_USE_RISK.DENY);
});

test('MEL-DEVICE-01 file open inside paired path requires exact step approval',()=>{
  const step={id:'open-file',action:COMPUTER_USE_ACTIONS.OPEN_FILE,path:'C:\\Users\\Adrien\\Documents\\note.txt'};
  const blocked=evaluateComputerUsePlan({...base,steps:[step]});
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'EXPLICIT_STEP_APPROVAL_REQUIRED');

  const allowed=evaluateComputerUsePlan({...base,steps:[step],approvals:[approval(step)]});
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.request.steps[0].path,step.path);
});

test('MEL-DEVICE-01 file path cannot escape the paired allowlist',()=>{
  const step={id:'outside',action:COMPUTER_USE_ACTIONS.OPEN_FILE,path:'C:\\Windows\\System32\\drivers\\etc\\hosts'};
  const result=evaluateComputerUsePlan({...base,steps:[step],approvals:[approval(step)]});
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'PATH_OUTSIDE_SANDBOX');
});

test('MEL-DEVICE-01 rejects traversal, relative and UNC paths',()=>{
  for(const path of [
    'C:\\Users\\Adrien\\Documents\\..\\secret.txt',
    '.\\relative.txt',
    '\\\\server\\share\\file.txt',
  ]){
    const step={id:'bad-'+path.length,action:COMPUTER_USE_ACTIONS.OPEN_FILE,path};
    const result=evaluateComputerUsePlan({...base,steps:[step],approvals:[approval(step)]});
    assert.equal(result.allowed,false,path);
    assert.equal(result.reason,'PATH_OUTSIDE_SANDBOX',path);
  }
});

test('MEL-DEVICE-01 file close requires a path and explicit approval',()=>{
  const missing={id:'close-missing',action:COMPUTER_USE_ACTIONS.CLOSE_FILE};
  const missingResult=evaluateComputerUsePlan({...base,steps:[missing],approvals:[approval(missing)]});
  assert.equal(missingResult.allowed,false);
  assert.equal(missingResult.reason,'FILE_PATH_REQUIRED');

  const step={id:'close-file',action:COMPUTER_USE_ACTIONS.CLOSE_FILE,path:'C:\\Users\\Adrien\\Desktop\\draft.md'};
  const result=evaluateComputerUsePlan({...base,steps:[step],approvals:[approval(step)]});
  assert.equal(result.allowed,true);
});

test('MEL-DEVICE-01 app close requires app allowlist plus approval',()=>{
  const blockedApp={id:'close-shell',action:COMPUTER_USE_ACTIONS.CLOSE_APP,app:'powershell'};
  const denied=evaluateComputerUsePlan({...base,steps:[blockedApp],approvals:[approval(blockedApp)]});
  assert.equal(denied.allowed,false);
  assert.equal(denied.reason,'APP_OUTSIDE_SANDBOX');

  const step={id:'close-notepad',action:COMPUTER_USE_ACTIONS.CLOSE_APP,app:'notepad'};
  const allowed=evaluateComputerUsePlan({...base,steps:[step],approvals:[approval(step)]});
  assert.equal(allowed.allowed,true);
});

test('MEL-DEVICE-01 path normalization keeps only absolute local Windows roots',()=>{
  const normalized=normalizeComputerUseRequest({
    ...base,
    sandbox:{
      ...base.sandbox,
      allowed_paths:[
        'C:/Users/Adrien/Documents',
        'C:\\Users\\Adrien\\Documents',
        '\\\\server\\share',
        'relative',
      ],
    },
    steps:[{action:COMPUTER_USE_ACTIONS.SCREENSHOT}],
  });
  assert.deepEqual(normalized.sandbox.allowed_paths,[
    'C:\\Users\\Adrien\\Documents',
  ]);
});

test('MEL-DEVICE-01 installer persists and pairs the local path allowlist',async()=>{
  const asset=await readFile(new URL('../../assets/MEL-Computer-Setup.ps1',import.meta.url),'utf8');
  const dist=await readFile(new URL('../../dist/MEL-Computer-Setup.ps1',import.meta.url),'utf8');
  assert.equal(asset,dist);
  assert.match(asset,/\$allowedPaths\s*=\s*@\(/);
  assert.match(asset,/allowed_paths\s*=\s*\$allowedPaths/);
  assert.match(asset,/version\s*=\s*"1\.1\.0"/);
});

test('MEL-DEVICE-01 Windows companion revalidates local paths and closes gracefully',async()=>{
  const asset=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const dist=await readFile(new URL('../../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(asset,dist);
  assert.match(asset,/function Resolve-AllowedPath/);
  assert.match(asset,/PATH_OUTSIDE_LOCAL_ALLOWLIST/);
  assert.match(asset,/NETWORK_PATH_NOT_ALLOWED/);
  assert.match(asset,/"app\.close"/);
  assert.match(asset,/"file\.open"/);
  assert.match(asset,/"file\.close"/);
  assert.match(asset,/CloseMainWindow\(\)/);
  assert.match(asset,/Test-Path -LiteralPath \$path -PathType Leaf/);
  assert.match(asset,/FILE_NOT_FOREGROUND/);
  assert.doesNotMatch(asset,/Stop-Process/);
  assert.doesNotMatch(asset,/Invoke-Expression/);
  assert.doesNotMatch(asset,/Start-Process\s+powershell/i);
});
