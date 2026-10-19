import { readFile, writeFile } from 'node:fs/promises';
import { zeroCostProofPublicationSql } from '../src/augmentio/zero-cost-proof-store.js';

const workers_ai = JSON.parse(await readFile('workers-ai-zero-cost-proof.json', 'utf8'));
const browser_run = JSON.parse(await readFile('browser-run-zero-cost-proof.json', 'utf8'));
await writeFile('zero-cost-proof-publication.sql', zeroCostProofPublicationSql({ workers_ai, browser_run }), { mode: 0o600 });
console.log('Fresh Cloudflare zero-cost evidence validated for canonical D1 publication.');
