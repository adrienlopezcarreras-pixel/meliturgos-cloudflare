import { port, requireValue } from '../core/contracts.js';
export const DEV_PIPELINE=Object.freeze(['DIAGNOSE','PLAN','BRANCH','EDIT','TEST','STAGE','COMPARE','RELEASE_CANDIDATE','APPROVE_ACTIVATE','MONITOR','ROLLBACK']);
export const methods=['diagnose','plan','branch','edit','test','stage','compare','report','releaseCandidate','rollback'];
/** Host Git adapter injected by runner. Worker never executes a shell or edits production. */
export class DevAgent {
  constructor(adapters={}) { Object.assign(this,port('dev-agent',methods,adapters)); }
}
export function ChangePlan({id=crypto.randomUUID(),base_commit,files,steps}) { requireValue(base_commit && Array.isArray(files) && Array.isArray(steps)); return {id,base_commit,files,steps,status:'PLAN'}; }
export function ChangeSet({plan_id,branch,base_commit,head_commit,files}) { requireValue(plan_id && branch?.startsWith('gen2/') && base_commit && head_commit && Array.isArray(files)); return {plan_id,branch,base_commit,head_commit,files}; }
export function TestResult({head_commit,command,exit_code}) { requireValue(head_commit && command && Number.isInteger(exit_code)); return {head_commit,command,exit_code,passed:exit_code===0}; }
export function ReleaseCandidate({change,tests}) { requireValue(tests?.length && tests.every(t=>t.passed && t.head_commit===change.head_commit),'TEST_EVIDENCE_REQUIRED',409); return {id:crypto.randomUUID(),change,tests,status:'RELEASE_CANDIDATE',activated:false}; }
