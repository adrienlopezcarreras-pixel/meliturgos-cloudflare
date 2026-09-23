// MEL / MELITURGOS — Développé par Adrien Lopez.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MARKER = 'Développé par Adrien Lopez';
const ACTIVE_DIRS = [
  '.github/workflows',
  'android-companion',
  'assets',
  'browser-companion',
  'docs',
  'firmware',
  'kaggle',
  'migrations',
  'notebooks',
  'runner',
  'scripts',
  'shardvault',
  'src',
  'teacher-bridge',
  'tests',
];
const ROOT_FILES = [
  'AGENTS.md',
  'CHECK_WINDOWS_SETUP.ps1',
  'README_SETUP.txt',
  'setup-cloudflare-codex.sh',
  'worker.js',
  'wrangler.dreamina-preview.jsonc',
  'wrangler.jsonc',
  'wrangler.memory-export-preview.jsonc',
  'wrangler.memory-sync-preview.jsonc',
];
const EXTENSIONS = new Set([
  '.js','.mjs','.cjs','.ts','.tsx','.jsx',
  '.kt','.kts','.ps1','.sh','.py',
  '.md','.txt','.yml','.yaml',
  '.html','.css','.sql','.jsonc','.xml','.properties',
]);
const EXCLUDED_SEGMENTS = [
  '/build/','/node_modules/','/generated/','/captures/','/screenshots/',
];

async function walk(dir) {
  const entries = await readdir(dir,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function relative(file){
  return path.relative(ROOT,file).replaceAll('\\','/');
}

function eligible(file){
  const rel=relative(file);
  if(EXCLUDED_SEGMENTS.some(part=>('/'+rel+'/').includes(part))) return false;
  return EXTENSIONS.has(path.extname(rel).toLowerCase());
}

const candidates=[];
for(const dir of ACTIVE_DIRS){
  try{
    for(const file of await walk(path.join(ROOT,dir))){
      if(eligible(file)) candidates.push(file);
    }
  }catch(error){
    if(error?.code!=='ENOENT') throw error;
  }
}
for(const file of ROOT_FILES){
  const full=path.join(ROOT,file);
  try{
    await readFile(full);
    if(eligible(full)) candidates.push(full);
  }catch(error){
    if(error?.code!=='ENOENT') throw error;
  }
}

const missing=[];
for(const file of [...new Set(candidates)].sort()){
  const content=await readFile(file,'utf8');
  if(!content.includes(MARKER)) missing.push(relative(file));
}

const pkg=JSON.parse(await readFile(path.join(ROOT,'package.json'),'utf8'));
if(pkg.author!=='Adrien Lopez') missing.push('package.json#author');

if(missing.length){
  console.error('MEL attribution gate failed. Missing Adrien Lopez attribution:');
  for(const file of missing) console.error(' - '+file);
  process.exit(1);
}
console.log(`MEL attribution gate passed for ${new Set(candidates).size} active files. Developer: Adrien Lopez.`);
