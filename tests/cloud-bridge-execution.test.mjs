// CODEX: execute the actual Linux cloud workflow locally, with a bare Git
// remote only. No GitHub dispatch, Windows host, token or production mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { LocalDevBridge } from '../src/dev/dev-bridge.js';

function stepScript(workflow, name) {
  const start = workflow.indexOf('      - name: ' + name + '\n');
  assert.ok(start >= 0, name);
  const end = workflow.indexOf('\n      - name:', start + 1);
  const step = workflow.slice(start, end < 0 ? undefined : end);
  const script = step.slice(step.indexOf('        run: |\n') + '        run: |\n'.length);
  return script.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
}

test('cloud workflow writes approved bytes, runs real syntax/tests and publishes one commit with no PC', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'mel-cloud-execution-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bridge = new LocalDevBridge({ repoRoot: process.cwd(), candidateRoot: path.join(root, 'candidates') });
  const candidate = await bridge.createCandidate('cloud-fixture');
  const cwd = candidate.dir;
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('switch', '-c', 'candidate/cloud-fixture');
  await writeFile(path.join(cwd, 'src/__cloud_value.js'), 'export const value=1;\n');
  await mkdir(path.join(cwd, 'tests'), { recursive: true });
  await writeFile(path.join(cwd, 'tests/__cloud_value.test.mjs'), "import assert from 'node:assert/strict'; import {value} from '../src/__cloud_value.js'; assert.equal(value,2);\n");
  const pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
  pkg.scripts.test = 'node --test tests/__cloud_value.test.mjs';
  pkg.scripts['test:smoke'] = 'node --test tests/__cloud_value.test.mjs';
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  git('add', '--all'); git('commit', '-qm', 'cloud fixture baseline');
  const before = git('rev-parse', 'HEAD');
  const remote = path.join(root, 'remote.git');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  git('remote', 'add', 'origin', remote); git('push', '-q', 'origin', 'HEAD:candidate/cloud-fixture');
  const jobFile = path.join(root, 'job.json');
  await writeFile(jobFile, JSON.stringify({ id: 'cloud-fixture', files_json: [{ path: 'src/__cloud_value.js', content: 'export const value=2;\n' }], tests_json: [{ name: 'real-value', command: 'test:smoke' }] }));
  const workflow = await readFile(new URL('../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  const env = { ...process.env, BRIDGE_JOB_FILE: jobFile, GITHUB_OUTPUT: path.join(root, 'outputs'), JOB_ID: 'cloud-fixture', CANDIDATE_BRANCH: 'candidate/cloud-fixture', CANDIDATE_SHA: before, RUNNER_TEMP: process.env.RUNNER_TEMP || root };
  function run(script) {
    const result = spawnSync('bash', ['-c', script], { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, String(result.stdout) + String(result.stderr));
  }
  run(stepScript(workflow, 'Apply bounded approved files'));
  assert.equal(await readFile(path.join(cwd, 'src/__cloud_value.js'), 'utf8'), 'export const value=2;\n');
  run(stepScript(workflow, 'Run exact bounded requested tests'));
  const receipt = JSON.parse(await readFile(path.join(cwd, 'bridge-apply-result.json'), 'utf8'));
  assert.equal(receipt.mode, 'GITHUB_CLOUD_BRIDGE');
  assert.equal(receipt.needs_repair, false);
  assert.ok(receipt.tests.length >= 2 && receipt.tests.every(row => row.passed && row.exit_code === 0));
  // Execute the original commit/push block against the local remote. Stop
  // before its GitHub HTTP dispatch, which requires real OIDC/Actions identity.
  run(stepScript(workflow, 'Commit and push exact candidate change').split('  # A push made')[0].split('# A push made')[0]);
  const after = git('rev-parse', 'HEAD');
  assert.notEqual(after, before);
  assert.equal(git('ls-remote', 'origin', 'refs/heads/candidate/cloud-fixture').split(/\s/)[0], after);
  assert.deepEqual(git('diff-tree', '--no-commit-id', '--name-only', '-r', after).split('\n'), ['src/__cloud_value.js']);
  assert.equal(git('show', after + ':src/__cloud_value.js'), 'export const value=2;');
  assert.notEqual(receipt.status, 'DONE_VERIFIED', 'local cloud execution is not Council/CI/production verification');
  // A second mission moves the remote after the first mission's tests. The
  // workflow must preserve it and request reconciliation, not silently rebase.
  await writeFile(path.join(cwd, 'src/__other_mission.js'), 'export const concurrent=true;\n');
  git('add', '--all'); git('commit', '-qm', 'other mission');
  git('push', '-q', 'origin', 'HEAD:candidate/cloud-fixture');
  const concurrent = git('rev-parse', 'HEAD');
  git('checkout', '--detach', after);
  env.CANDIDATE_SHA = after;
  await writeFile(path.join(cwd, 'src/__late_package.js'), 'export const late=true;\n');
  run(stepScript(workflow, 'Commit and push exact candidate change').split('# A push made')[0]);
  const rejected = JSON.parse(await readFile(path.join(cwd, 'bridge-apply-result.json'), 'utf8'));
  assert.equal(rejected.needs_repair, true);
  assert.equal(rejected.tests.at(-1).error, 'CANDIDATE_PUSH_NOT_FAST_FORWARD');
  assert.equal(git('ls-remote', 'origin', 'refs/heads/candidate/cloud-fixture').split(/\s/)[0], concurrent);

});
