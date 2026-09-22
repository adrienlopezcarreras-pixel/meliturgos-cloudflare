import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

const SHA = 'a'.repeat(40);
const BRANCH = 'release/mel-hardware-v0.1.0';

test('production code capabilities prefer deployed build defines over stale configured branch and pin reads to exact SHA', async () => {
  const previousBranch = globalThis.MEL_DEPLOYED_GIT_BRANCH;
  const previousSha = globalThis.MEL_DEPLOYED_GIT_SHA;
  const requested = [];
  globalThis.MEL_DEPLOYED_GIT_BRANCH = BRANCH;
  globalThis.MEL_DEPLOYED_GIT_SHA = SHA;

  const fakeFetch = async (url) => {
    const value = String(url);
    requested.push(value);
    if (value.includes('/git/ref/heads/')) {
      return new Response(JSON.stringify({ object:{ sha:SHA } }), {
        status:200,
        headers:{'content-type':'application/json'},
      });
    }
    if (value.includes('/contents/src/index.js?ref=')) {
      return new Response(JSON.stringify({
        type:'file',
        size:30,
        sha:'file-sha',
        content:Buffer.from('// deployed source').toString('base64'),
      }), {
        status:200,
        headers:{'content-type':'application/json'},
      });
    }
    return new Response('{}', { status:404, headers:{'content-type':'application/json'} });
  };

  try {
    const bus = createDefaultCapabilityBus({
      env:{
        MEL_GITHUB_BRANCH:'candidate/mel-clean-autonomy',
        MEL_GITHUB_FETCH:fakeFetch,
      },
    });

    const bindings = await bus.execute('system.bindings', {}, {
      owner:'owner',
      permissions:[],
      requestId:'deployed-identity-bindings',
    });
    assert.equal(bindings.github_branch, BRANCH);

    const read = await bus.execute('code.read', { path:'src/index.js' }, {
      owner:'owner',
      permissions:[],
      requestId:'deployed-identity-read',
    });
    assert.equal(read.branch, BRANCH);
    assert.match(read.content, /deployed source/);
    assert.ok(
      requested.some(url => url.includes('/contents/src/index.js?ref='+SHA)),
      'code.read must use the immutable deployed SHA as its content ref',
    );
  } finally {
    if (previousBranch === undefined) delete globalThis.MEL_DEPLOYED_GIT_BRANCH;
    else globalThis.MEL_DEPLOYED_GIT_BRANCH = previousBranch;
    if (previousSha === undefined) delete globalThis.MEL_DEPLOYED_GIT_SHA;
    else globalThis.MEL_DEPLOYED_GIT_SHA = previousSha;
  }
});
