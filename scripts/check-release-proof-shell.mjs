import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workflowPath = new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url);
const source = await fs.readFile(workflowPath, 'utf8');
const marker = '      - name: Prepare and prove production autonomy launch evidence';
const start = source.indexOf(marker);
if (start < 0) throw new Error('RELEASE_PROOF_STEP_NOT_FOUND');
const runMarker = '        run: |';
const runAt = source.indexOf(runMarker, start);
if (runAt < 0) throw new Error('RELEASE_PROOF_RUN_BLOCK_NOT_FOUND');
const blockStart = source.indexOf('\n', runAt) + 1;
const lines = source.slice(blockStart).split('\n');
const body = [];
for (const line of lines) {
  if (line.startsWith('      - name: ') || line.startsWith('      - uses: ')) break;
  if (!line.trim()) {
    body.push('');
    continue;
  }
  if (!line.startsWith('          ')) {
    if (/^\s{6,8}[A-Za-z_-]+:/.test(line)) break;
    throw new Error('RELEASE_PROOF_BLOCK_INDENT_INVALID:' + line.slice(0, 80));
  }
  body.push(line.slice(10));
}
if (!body.length) throw new Error('RELEASE_PROOF_BLOCK_EMPTY');
const tmp = path.join(os.tmpdir(), 'mel-release-proof-bash-n.sh');
await fs.writeFile(tmp, body.join('\n') + '\n', 'utf8');
const result = spawnSync('bash', ['-n', tmp], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'bash -n failed\n');
  process.exit(result.status || 1);
}
console.log('Release production proof shell parses cleanly.');
