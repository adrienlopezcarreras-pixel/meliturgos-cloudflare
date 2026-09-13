import { createGitHubCodeReader } from './github-code-capabilities.js';

export const DEFAULT_INTEGRITY_PATHS = Object.freeze([
  'src/index.js',
  'src/api/native-chat.js',
  'src/core/orchestrator/gen2-runtime.js',
  'package.json',
  'wrangler.jsonc',
]);

const MERGE_MARKER = /^(?:<<<<<<<(?: .*)?|=======$|>>>>>>>(?: .*)?)$/m;
const SHA40 = /^[a-f0-9]{40}$/i;

function nonEmptyString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function exactGitSha(value) {
  const sha = nonEmptyString(value)?.toLowerCase() || null;
  return sha && SHA40.test(sha) ? sha : null;
}

export function resolveDeploymentIdentity(env = {}) {
  const compiledBranch = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined'
    ? nonEmptyString(MEL_DEPLOYED_GIT_BRANCH)
    : null;
  const compiledShaRaw = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined'
    ? nonEmptyString(MEL_DEPLOYED_GIT_SHA)
    : null;
  const runtimeBranch = nonEmptyString(env.MEL_DEPLOYED_GIT_BRANCH);
  const runtimeShaRaw = nonEmptyString(env.MEL_DEPLOYED_GIT_SHA);
  const branch = compiledBranch || runtimeBranch;
  const commit = exactGitSha(compiledShaRaw || runtimeShaRaw);
  const source = compiledBranch || compiledShaRaw
    ? 'compile_time_define'
    : runtimeBranch || runtimeShaRaw
      ? 'runtime_env'
      : 'unavailable';

  return {
    repository: nonEmptyString(env.MEL_GITHUB_REPOSITORY) || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch,
    commit,
    branch_known: Boolean(branch),
    commit_known: Boolean(commit),
    exact_identity_known: Boolean(branch && commit),
    commit_format_valid: compiledShaRaw || runtimeShaRaw ? Boolean(commit) : null,
    source,
  };
}

function uniquePaths(paths) {
  const source = Array.isArray(paths) && paths.length ? paths : DEFAULT_INTEGRITY_PATHS;
  return [...new Set(source.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 12);
}

function failure(code, detail = {}) {
  return { code, ...detail };
}

function normalizeHead(value) {
  const raw = value && typeof value === 'object' ? value.sha : value;
  const sha = String(raw || '').trim();
  if (!SHA40.test(sha)) throw Object.assign(new Error('CODE_HEAD_SHA_INVALID'), { code: 'CODE_HEAD_SHA_INVALID' });
  return sha;
}

export async function inspectCodeIntegrity({ reader, paths, expectedHead, deploymentIdentity = null } = {}) {
  if (!reader || typeof reader.head !== 'function' || typeof reader.read !== 'function') {
    throw Object.assign(new Error('CODE_READER_REQUIRED'), { code: 'CODE_READER_REQUIRED' });
  }

  const selectedPaths = uniquePaths(paths);
  const expected = expectedHead == null || expectedHead === '' ? null : String(expectedHead).trim();
  if (expected && !SHA40.test(expected)) {
    throw Object.assign(new Error('EXPECTED_HEAD_INVALID'), { code: 'EXPECTED_HEAD_INVALID' });
  }

  const failures = [];
  let head = null;
  try {
    head = normalizeHead(await reader.head());
  } catch (error) {
    failures.push(failure(error?.code || 'HEAD_READ_FAILED'));
  }

  if (expected && head && head.toLowerCase() !== expected.toLowerCase()) {
    failures.push(failure('HEAD_MISMATCH', { expected_head: expected, actual_head: head }));
  }

  const files = [];
  for (const path of selectedPaths) {
    try {
      const row = await reader.read(path);
      const content = String(row?.content || '');
      const mergeMarkers = MERGE_MARKER.test(content);
      const record = {
        path,
        blob_sha: row?.sha || null,
        bytes: new TextEncoder().encode(content).byteLength,
        merge_markers: mergeMarkers,
      };
      files.push(record);
      if (mergeMarkers) failures.push(failure('MERGE_MARKER_FOUND', { path }));
    } catch (error) {
      files.push({ path, blob_sha: null, bytes: 0, merge_markers: false, error: error?.code || error?.message || 'READ_FAILED' });
      failures.push(failure(error?.code || 'FILE_READ_FAILED', { path }));
    }
  }

  const deployed = deploymentIdentity && typeof deploymentIdentity === 'object'
    ? deploymentIdentity
    : null;
  const selfCode = deployed ? {
    ...deployed,
    inspected_branch: reader.branch || null,
    inspected_head: head,
    inspected_branch_matches_deployment: deployed.branch
      ? String(reader.branch || '') === String(deployed.branch)
      : null,
    inspected_head_matches_deployment: deployed.commit && head
      ? head.toLowerCase() === String(deployed.commit).toLowerCase()
      : null,
  } : null;

  return {
    status: failures.length ? 'FAIL' : 'PASS',
    repository: reader.repository || null,
    branch: reader.branch || null,
    head,
    expected_head: expected,
    head_matches: expected ? Boolean(head && head.toLowerCase() === expected.toLowerCase()) : null,
    self_code: selfCode,
    checked_files: files.length,
    files,
    failures,
  };
}

export function registerCodeIntegrityCapability(bus, env = {}, { reader } = {}) {
  const codeReader = reader || createGitHubCodeReader({
    repository: env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: env.MEL_GITHUB_BRANCH || 'candidate/mel-clean-autonomy',
    token: env.MEL_GITHUB_TOKEN || '',
    fetchImpl: env.MEL_GITHUB_FETCH || fetch,
  });
  const deploymentIdentity = resolveDeploymentIdentity(env);

  bus.discover({
    id: 'code.integrity',
    name: 'Intégrité du code MEL',
    category: 'code',
    version: '1.1.0',
    provider: 'mel',
    description: 'Verifies the configured code branch and reports the exact deployed branch/commit identity when available, without modifying code.',
    input_schema: {
      type: 'object',
      properties: {
        paths: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 260 } },
        expected_head: { type: 'string', minLength: 0, maxLength: 40 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, input => inspectCodeIntegrity({
    reader: codeReader,
    paths: input.paths,
    expectedHead: input.expected_head,
    deploymentIdentity,
  }));

  return bus;
}
