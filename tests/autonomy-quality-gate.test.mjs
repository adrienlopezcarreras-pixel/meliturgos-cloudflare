import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('npm run check rejects a module whose import does not resolve', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'mel-check-'));
  for (const d of ['src/media', 'scripts', 'tests', 'browser-companion/chatgpt-collector']) await mkdir(join(dir, d), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { jsdom: '1' } }));
  await writeFile(join(dir, 'worker.js'), "import './src/ok.js';\n");
  await writeFile(join(dir, 'src/ok.js'), "import { readFile } from 'node:fs/promises';\nimport 'jsdom';\n// import x from 'not-real';\nexport const ok = () => import('./media/image.js');\n");
  await writeFile(join(dir, 'src/media/image.js'), "import { env } from '$fresh/runtime.ts';\nimport './missing.js';\nexport const a = env;\n");
  const script = new URL('../scripts/check-syntax.mjs', import.meta.url).pathname;
  const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Unresolved import in src\/media\/image\.js: \$fresh\/runtime\.ts, \.\/missing\.js/);
  assert.doesNotMatch(run.stderr, /src\/ok\.js/);
});

test('the cloud bridge always runs the syntax/import gate and never commits its result file', async () => {
  const wf = await readFile(new URL('../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(wf, /spawnSync\('npm',\['run','check'\]/);
  assert.match(wf, /name:'syntax-and-imports'/);
  const exclude = wf.indexOf("echo 'bridge-apply-result.json' >> .git/info/exclude");
  assert.ok(exclude > 0 && exclude < wf.indexOf('git add --all'));
});
