import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { resolveCouncilImportContext } from './council-import-context.js';

// Complete small files, never truncated snippets falsely labelled complete.
export async function resolveCouncilFileContext(env, {head, diff, fetchImpl = fetch} = {}) {
  if (!/^[a-f0-9]{40}$/.test(String(head))) throw Object.assign(new Error('COUNCIL_FILE_HEAD_INVALID'), {code:'COUNCIL_FILE_HEAD_INVALID'});
  const sections = String(diff || '').split(/(?=^diff --git )/m);
  const paths = new Map();
  for (const section of sections) {
    const path = /^diff --git a\/[^\n]+ b\/([^\n]+)$/m.exec(section)?.[1];
    if (path && /\.(?:js|mjs|ts|c|h|cpp|kt)$/.test(path))
      paths.set(path, /^\+\+\+ \/dev\/null$/m.test(section));
  }
  const reader = createGitHubCodeReader({
    repository: env?.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    pinnedSha: head, token: String(env?.MEL_GITHUB_TOKEN || ''),
    fetchImpl: (url, init = {}) => fetchImpl(url, {...init, redirect:'manual', signal:init.signal || AbortSignal.timeout(15000)}),
  });
  const entries = [...paths];
  // Bound wall time as well as bytes: slow GitHub reads must not stack into
  // a new multi-minute Council timeout before the actual votes even start.
  const reads = await Promise.all(entries.map(async ([path, deleted], index) => {
    if (deleted || index >= 12) return null;
    try { return {file:await reader.read(path)}; } catch(error) { return {error}; }
  }));
  const files = [];
  let remaining = 32000;
  for (const [index, [path, deleted]] of entries.entries()) {
    if (deleted) { files.push({path, status:'DELETED_AT_EXACT_SHA'}); continue; }
    if (index >= 12 || remaining <= 0) { files.push({path, status:'OMITTED_CONTEXT_BUDGET'}); continue; }
    try {
      if (reads[index].error) throw reads[index].error;
      const file = reads[index].file;
      const size = new TextEncoder().encode(file.content).byteLength;
      if (size > 16000 || size > remaining) { files.push({path, status:'OMITTED_CONTEXT_BUDGET'}); continue; }
      remaining -= size;
      files.push({path, status:'COMPLETE_AT_EXACT_SHA', content:file.content});
    } catch (error) {
      if (error?.code === 'CODE_FILE_TOO_LARGE') { files.push({path, status:'OMITTED_CONTEXT_BUDGET'}); continue; }
      throw Object.assign(new Error('COUNCIL_FILE_CONTEXT_UNAVAILABLE'), {code:'COUNCIL_FILE_CONTEXT_UNAVAILABLE'});
    }
  }
  return {head, source:'github-immutable-tree', files};
}

export async function resolveCouncilReviewContext(env, options) {
  const [imports, files] = await Promise.all([
    resolveCouncilImportContext(env, options), resolveCouncilFileContext(env, options),
  ]);
  return {...imports, reviewed_files:files.files, file_context_head:files.head};
}
