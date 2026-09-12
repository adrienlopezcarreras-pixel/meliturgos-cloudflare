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

export async function inspectCodeIntegrity({ reader, paths, expectedHead } = {}) {
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

  return {
    status: failures.length ? 'FAIL' : 'PASS',
    repository: reader.repository || null,
    branch: reader.branch || null,
    head,
    expected_head: expected,
    head_matches: expected ? Boolean(head && head.toLowerCase() === expected.toLowerCase()) : null,
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

  bus.discover({
    id: 'code.integrity',
    name: 'Intégrité du code MEL',
    category: 'code',
    version: '1.0.0',
    provider: 'mel',
    description: 'Verifies the current candidate HEAD and a bounded set of critical source files without modifying code.',
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
  }, input => inspectCodeIntegrity({ reader: codeReader, paths: input.paths, expectedHead: input.expected_head }));

  return bus;
}
