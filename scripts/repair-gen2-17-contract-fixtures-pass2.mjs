import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, text) { await fs.writeFile(path, text, 'utf8'); }

function replaceExact(text, before, after, label, expected = 1) {
  const count = text.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} match(es), found ${count}`);
  return text.split(before).join(after);
}

// The default provider pool is production fail-closed. Unit tests explicitly
// opt into the Node-only proof that mocked Workers AI calls have zero external cost.
{
  const path = 'tests/council-api.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `import worker from '../src/index.js';\n\nconst auth`,
    `import worker from '../src/index.js';\n\nprocess.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';\n\nconst auth`,
    'council-api Node-only zero-cost fixture',
  );
  await write(path, text);
}

{
  const path = 'tests/autonomy-runtime.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';\n\nconst CANDIDATE_HEAD_SHA`,
    `import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';\n\nprocess.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';\n\nconst CANDIDATE_HEAD_SHA`,
    'autonomy runtime Node-only zero-cost fixture',
  );
  await write(path, text);
}

// Each reconciler test gets an isolated in-memory repository. A failed earlier
// test must never leak a pending Teacher request into the next test.
{
  const path = 'tests/github-reply-reconciler.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `const repo = new D1DevJobRepository(null);`,
    `const repo = new D1DevJobRepository(null, { memoryStore: new Map() });`,
    'reconciler repository isolation',
    2,
  );
  await write(path, text);
}

console.log('GEN2-17 fixture repair pass 2 applied.');
