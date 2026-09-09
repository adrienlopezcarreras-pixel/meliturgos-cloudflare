import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';

/** Safe capability bus used by MEL's Gen2 runtime. */
export function createDefaultCapabilityBus({ audit, env = {}, repository, branch, token, fetchImpl } = {}) {
  const bus = new CapabilityBus({ audit });
  bus.discover({
    id: 'echo', name: 'Echo', category: 'utility', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value for integration tests',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));

  const githubRepository = repository || env.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const githubBranch = branch || env.MEL_GITHUB_BRANCH || 'mel-current';
  const githubToken = token ?? env.MEL_GITHUB_TOKEN ?? '';
  const githubFetch = fetchImpl || env.MEL_GITHUB_FETCH || fetch;
  registerGitHubCodeCapabilities(bus, {
    repository: githubRepository,
    branch: githubBranch,
    token: githubToken,
    fetchImpl: githubFetch,
  });

  bus.discover({
    id: 'augmentio.fanout', name: '.augmentio multi-AI', category: 'orchestration', version: '0.1.0', provider: 'mel',
    description: 'Parallel multi-model orchestration through the configured zero-cost provider pool.',
    input_schema: { type: 'object', additionalProperties: true },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: env.AI ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => ({ accepted: true, input }));

  return bus;
}
