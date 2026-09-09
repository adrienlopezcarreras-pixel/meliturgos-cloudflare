import test from 'node:test';
import assert from 'node:assert/strict';
import { setDefaultCapabilityEnvironment, createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

const context = { owner: 'adrien', permissions: [], requestId: 'legacy-bridge' };

test('legacy no-arg CapabilityBus inherits only required runtime bindings', async () => {
  const fakeFetch = async url => {
    const path = new URL(url).pathname;
    if (path.includes('/contents/src/router.js')) {
      return new Response(JSON.stringify({ content: Buffer.from('export default {}').toString('base64'), encoding: 'base64', sha: 'sha123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const status = setDefaultCapabilityEnvironment({
    AI: { run: async model => ({ response: 'ok '+model }) },
    DB: {},
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'must-not-be-exposed',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: 'release/test',
    MEL_GITHUB_FETCH: fakeFetch
  });
  assert.equal(status.ai, true);
  assert.equal(status.db, true);
  assert.equal(status.github_branch, 'release/test');
  assert.equal(JSON.stringify(status).includes('must-not-be-exposed'), false);

  const bus = createDefaultCapabilityBus();
  const bindings = await bus.execute('system.bindings', {}, context);
  assert.equal(bindings.ai, true);
  assert.equal(bindings.db, true);
  assert.equal(bindings.github_repository, 'owner/repo');
  assert.equal(bindings.github_branch, 'release/test');

  const code = await bus.execute('code.read', { path: 'src/router.js' }, context);
  assert.equal(code.repository, 'owner/repo');
  assert.equal(code.branch, 'release/test');
  assert.equal(code.content, 'export default {}');
});
