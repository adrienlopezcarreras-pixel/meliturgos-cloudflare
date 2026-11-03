#!/usr/bin/env node
// Content-free manifest for independent Council reviewers. Never approves.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { planCouncilDiffBatches } from '../src/evolution/council-diff-batches.js';

const [source, destination='council-review-manifest.json'] = process.argv.slice(2);
if (!source || !/^[-A-Za-z0-9_./]+$/.test(source) || !/^[-A-Za-z0-9_./]+$/.test(destination)) {
  process.stderr.write('COUNCIL_REVIEW_PATHS_REQUIRED\n');
  process.exit(2);
}
const sourceBytes = readFileSync(source);
const diff = new TextDecoder('utf-8',{fatal:true}).decode(sourceBytes);
const result = planCouncilDiffBatches(diff);
if (!result.ok) {
  process.stderr.write(result.code + '\n');
  process.exit(2);
}
const sha256 = data => createHash('sha256').update(data).digest('hex');
const manifest = {
  schema:'mel.council-review-batches/v1',
  status:'PENDING_INDEPENDENT_COUNCIL', approved:false,
  sha256:sha256(sourceBytes), total_bytes:result.totalBytes,
  file_count:result.fileCount, batch_count:result.batchCount,
  batches:result.batches.map(b=>({ number:b.number, paths:b.paths,
    bytes:b.bytes, sha256:sha256(b.diff), reviewed:false })),
};
if (manifest.batches.reduce((sum,b)=>sum+b.bytes,0)!==manifest.total_bytes)
  throw Error('COUNCIL_REVIEW_INCOMPLETE_SOURCE_DIFF');
writeFileSync(destination,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
process.stdout.write('COUNCIL_REVIEW_PENDING batches='+manifest.batch_count+' files='+manifest.file_count+
  ' bytes='+manifest.total_bytes+' (NO APPROVAL)\n');
