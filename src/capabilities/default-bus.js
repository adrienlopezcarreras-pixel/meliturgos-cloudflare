import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';
import { registerTeacherCapabilities } from './teacher-capabilities.js';

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
  const githubBranch = branch || env.MEL_GITHUB_BRANCH || 'mel-current';
  const githubToken = token ?? env.MEL_GITHUB_TOKEN ?? '';
  const githubFetch = fetchImpl || env.MEL_GITHUB_FETCH || fetch;
  if (githubRepository) {
    registerGitHubCodeCapabilities(bus, { repository: githubRepository, branch: githubBranch, token: githubToken, fetchImpl: githubFetch });
  }

  const teacherRepository = env.MEL_TEACHER_GITHUB_REPOSITORY || githubRepository;
  const teacherToken = env.MEL_TEACHER_GITHUB_TOKEN || githubToken;
  if (teacherRepository && teacherToken) {
    registerTeacherCapabilities(bus, {
      repository: teacherRepository,
      branch: env.MEL_TEACHER_GITHUB_BRANCH || githubBranch,
      token: teacherToken,
      fetchImpl: env.MEL_TEACHER_GITHUB_FETCH || githubFetch
    });
  }
  return bus;
}
