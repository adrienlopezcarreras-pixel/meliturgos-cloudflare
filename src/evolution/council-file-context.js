import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { resolveCouncilImportContext } from './council-import-context.js';
import { councilSourceFacts } from './council-source-facts.js';

// Complete small files, never truncated snippets falsely labelled complete.
export async function resolveCouncilFileContext(env, {head, diff, fetchImpl = fetch} = {}) {
  if (!/^[a-f0-9]{40}$/.test(String(head))) throw Object.assign(new Error('COUNCIL_FILE_HEAD_INVALID'), {code:'COUNCIL_FILE_HEAD_INVALID'});
  const sections = String(diff || '').split(/(?=^diff --git )/m);
  const paths = new Map(), addedPaths = new Set();
  for (const section of sections) {
    const path = /^diff --git a\/[^\n]+ b\/([^\n]+)$/m.exec(section)?.[1];
    if (path && /\.(?:js|mjs|ts|c|h|cpp|kt)$/.test(path)) {
      paths.set(path, /^\+\+\+ \/dev\/null$/m.test(section));
      if (/^--- \/dev\/null$/m.test(section)) addedPaths.add(path);
    }
  }
  const reader = createGitHubCodeReader({
    repository: env?.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    pinnedSha: head, token: String(env?.MEL_GITHUB_TOKEN || ''),
    fetchImpl: (url, init = {}) => fetchImpl(url, {...init, redirect:'manual', signal:init.signal || AbortSignal.timeout(15000)}),
  });
  const entries = [...paths];
  if (entries.length > 40) throw Object.assign(new Error('COUNCIL_FILE_CONTEXT_TOO_LARGE'), {code:'COUNCIL_FILE_CONTEXT_TOO_LARGE'});
  // Bound wall time as well as bytes: slow GitHub reads must not stack into
  // a new multi-minute Council timeout before the actual votes even start.
  const reads = await Promise.all(entries.map(async ([path, deleted], index) => {
    if (deleted) return null;
    try { return {file:await reader.read(path)}; } catch(error) { return {error}; }
  }));
  const files = [];
  const facts = [], sourceImports = new Set();
  let factsRemaining = 16000;
  const prioritized = [...entries.keys()].sort((a, b) =>
    Number(addedPaths.has(entries[b][0])) - Number(addedPaths.has(entries[a][0]))
      || (reads[a]?.file?.content?.length ?? Infinity) - (reads[b]?.file?.content?.length ?? Infinity));
  for (const index of prioritized) {
    const [path, deleted] = entries[index];
    const content = reads[index]?.file?.content;
    if (deleted || typeof content !== 'string' || !/\.(?:js|mjs)$/.test(path)) continue;
    const fact = {path, ...councilSourceFacts(content)};
    // Resolve unchanged imports too: absence from a changed hunk proves nothing.
    for (const specifier of fact.local_imports || []) {
      const parts = path.split('/').slice(0, -1);
      let valid = true;
      for (const part of specifier.split('/')) {
        if (part === '..') { if (!parts.length) { valid = false; break; } parts.pop(); }
        else if (part && part !== '.') parts.push(part);
      }
      if (valid) sourceImports.add(parts.join('/'));
    }
    const size = new TextEncoder().encode(JSON.stringify(fact)).byteLength;
    if (size <= factsRemaining) { facts.push(fact); factsRemaining -= size; }
    else facts.push({path, status:'OMITTED_STATIC_FACTS_BUDGET'});
  }
  let remaining = 32000;
  for (const index of prioritized) {
    const [path, deleted] = entries[index];
    if (deleted) { files.push({path, status:'DELETED_AT_EXACT_SHA'}); continue; }
    if (remaining <= 0) { files.push({path, status:'OMITTED_CONTEXT_BUDGET'}); continue; }
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
  return {head, snapshot_role:'POST_CHANGE_HEAD', source:'github-immutable-tree', files,
    static_facts: facts, source_imports: [...sourceImports]};
}

export async function resolveCouncilReviewContext(env, options) {
  const files = await resolveCouncilFileContext(env, options);
  const imports = await resolveCouncilImportContext(env, {...options, sourceImports:files.source_imports});
  return {...imports, reviewed_files:files.files, static_source_facts:files.static_facts,
    file_context_head:files.head, file_context_snapshot_role:files.snapshot_role};
}
