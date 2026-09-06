#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith("--")?[v.slice(2),a[i+1]]:[]).filter(Boolean));
const blocked=/(^|\/)(\.env|secrets?|credentials?|wrangler\.jsonc)|auth|dns|production|bindings?|r2|d1/i;
const root=process.cwd(), patch=args.patch, task=args.task;
if(args.rollback){execFileSync("git",["reset","--hard",args.rollback],{stdio:"inherit"});console.log(JSON.stringify({ok:true,rollback:args.rollback}));process.exit(0)}
if(!task||!patch){console.error("Usage: meliturgos-runner.mjs --task task.json --patch change.diff [--test command]");process.exit(2)}
const proposal=JSON.parse(readFileSync(task,"utf8"));const files=(proposal.files||[]).map(String);
if(files.some(f=>blocked.test(f))||blocked.test(String(proposal.objective||""))){console.error("BLOCKED: infrastructure, auth, secrets or production scope");process.exit(3)}
const branch=`runner/${Date.now()}`;execFileSync("git",["switch","-c",branch],{cwd:root,stdio:"inherit"});
try{execFileSync("git",["apply","--check",patch],{cwd:root,stdio:"inherit"});execFileSync("git",["apply",patch],{cwd:root,stdio:"inherit"});const test=args.test||"node --check worker.js";execFileSync("bash",["-lc",test],{cwd:root,stdio:"inherit"});console.log(JSON.stringify({ok:true,branch,tests:test,rollback:`git reset --hard HEAD~1`}))}catch(e){try{execFileSync("git",["reset","--hard","HEAD"],{cwd:root,stdio:"inherit"})}catch{}console.error(JSON.stringify({ok:false,branch,error:"patch or tests failed",rollback:`git reset --hard HEAD`}));process.exit(1)}
