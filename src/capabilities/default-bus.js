import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';

/** Safe deterministic capability bus used by the shipped chat runtime. */
export function createDefaultCapabilityBus({ audit, env = {}, repository, branch, token, fetchImpl } = {}) {
  const bus = new CapabilityBus({ audit });
  bus.discover({
    id: 'echo', name: 'Echo', category: 'utility', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value for integration tests',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));

  const githubRepository = repository || env.MEL_GITHUB_REPOSITORY || '';
  if (githubRepository) {
    registerGitHubCodeCapabilities(bus, {
      repository: githubRepository,
      branch: branch || env.MEL_GITHUB_BRANCH || 'mel-current',
      token: token ?? env.MEL_GITHUB_TOKEN ?? '',
      fetchImpl: fetchImpl || env.MEL_GITHUB_FETCH || fetch
    });
  }
  return bus;
}
