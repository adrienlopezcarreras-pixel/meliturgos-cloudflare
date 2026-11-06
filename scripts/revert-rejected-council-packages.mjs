import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA=/^[a-f0-9]{40}$/;
const JOB=/^[A-Za-z0-9_.:-]{1,200}$/;
const safePath=value=>typeof value==='string' && value && !value.startsWith('/')
  && !/[\r\n\0]/.test(value) && !value.split('/').some(part=>part==='..'||part==='.git');
const fail=code=>{throw Object.assign(new Error(code),{code});};

/** Stage the inverse of complete published packages; never commit or push. */
export function revertRejectedCouncilPackages({root=process.cwd(),base,head,review}={}){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000,
  maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 if(!SHA.test(String(base))||!SHA.test(String(head))||review?.decision!=='REJECTED'
   ||review.head!==head||(review.base&&review.base!==base))fail('COUNCIL_ROLLBACK_BINDING_REQUIRED');
 if(git('rev-parse','HEAD').trim()!==head)fail('COUNCIL_ROLLBACK_HEAD_CHANGED');
 if(git('status','--porcelain','--untracked-files=no').trim())fail('COUNCIL_ROLLBACK_DIRTY_WORKTREE');
 try{git('merge-base','--is-ancestor',base,head);}catch{fail('COUNCIL_ROLLBACK_BASE_NOT_ANCESTOR');}
 const jobs=Array.isArray(review.jobs)?review.jobs:[];
 if(Object.hasOwn(review,'revert_paths')&&(!Array.isArray(review.revert_paths)
   ||review.revert_paths.some(path=>!safePath(path))))fail('COUNCIL_ROLLBACK_PATH_INVALID');
 const explicit=Object.hasOwn(review,'rejected_jobs');
 if(explicit&&(!Array.isArray(review.rejected_jobs)
   ||review.rejected_jobs.some(id=>!JOB.test(id)||!jobs.includes(id))))
   fail('COUNCIL_ROLLBACK_JOB_SCOPE_INVALID');
 // Legacy Workers supplied paths but not culprit identities. A single known
 // mission is unambiguous; multiple missions require the new scoped verdict.
 const ids=explicit?review.rejected_jobs
  :jobs.length===1&&Array.isArray(review.revert_paths)&&review.revert_paths.length?jobs:[];
 const selected=new Set(ids);
 const commits=[];
 const found=new Set();
 if(selected.size){
  for(const commit of git('rev-list',`${base}..${head}`).trim().split('\n').filter(Boolean)){
   const subject=git('show','-s','--format=%s',commit).trim();
   const id=subject.match(/^GEN2-42: apply approved bridge package ([A-Za-z0-9_.:-]+)$/)?.[1];
   if(id&&selected.has(id)){commits.push(commit);found.add(id);}
  }
 }
 if([...selected].some(id=>!found.has(id)))fail('COUNCIL_ROLLBACK_PUBLICATION_NOT_FOUND');
 if(commits.length){
  // Git's inverse three-way merge preserves independent later edits. A
  // conflict leaves the remote untouched: the caller must not commit/push.
  try{git('revert','--no-commit',...commits);}catch{fail('COUNCIL_ATOMIC_ROLLBACK_CONFLICT');}
  return {mode:'ATOMIC_PACKAGE_REVERT',commits};
 }
 if(selected.size)fail('COUNCIL_ROLLBACK_PUBLICATION_NOT_FOUND');
 if(!explicit&&jobs.length>1)fail('COUNCIL_ROLLBACK_ATTRIBUTION_REQUIRED');
 const all=git('diff','--name-only',base,head).trim().split('\n').filter(Boolean);
 const requested=Array.isArray(review.revert_paths)?review.revert_paths.filter(safePath):[];
 const paths=explicit&&!selected.size?all:requested.length?requested:all;
 if(paths.some(path=>!safePath(path)))fail('COUNCIL_ROLLBACK_PATH_INVALID');
 for(const path of [...new Set(paths)]){
  let exists=true;try{git('cat-file','-e',`${base}:${path}`);}catch{exists=false;}
  if(exists)git('checkout',base,'--',path);
  else git('rm','-f','--ignore-unmatch','--',path);
 }
 return {mode:'PATH_RESTORE',paths:[...new Set(paths)]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [base,head,file]=process.argv.slice(2);
  const result=revertRejectedCouncilPackages({base,head,review:JSON.parse(readFileSync(file,'utf8'))});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){console.error(error?.code||'COUNCIL_ROLLBACK_FAILED');process.exitCode=1;}
}
