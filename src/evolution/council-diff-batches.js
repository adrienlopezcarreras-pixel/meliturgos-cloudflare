// Fail-closed, file-complete Council review partition planning.
// This prepares review batches ONLY. It never grants approval or changes the
// production/promotion state. A Council still has to approve every batch and
// the combined integration before any large candidate may be promoted.
export const COUNCIL_REVIEW_BATCH_LIMIT_BYTES = 44_000;
export const COUNCIL_REVIEW_TOTAL_LIMIT_BYTES = 512_000;
export const COUNCIL_REVIEW_MAX_BATCHES = 32;

const bytes = value => new TextEncoder().encode(value).byteLength;
const failed = (code, extra = {}) => Object.freeze({ ok: false, code, ...extra });
const headerPath = section => {
  const firstLine = section.split('\n', 1)[0];
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(firstLine);
  return match?.[2] || null;
};

/** A reviewable unit is one whole Git file diff, never part of a hunk.
 * Even a single over-limit file is rejected rather than truncated.
 * Re-joining all returned batch.diff strings must give the original diff.
 */
export function planCouncilDiffBatches(diff, {
  maxBatchBytes = COUNCIL_REVIEW_BATCH_LIMIT_BYTES,
  maxTotalBytes = COUNCIL_REVIEW_TOTAL_LIMIT_BYTES,
  maxBatches = COUNCIL_REVIEW_MAX_BATCHES,
} = {}) {
  if (typeof diff !== 'string' || !diff.startsWith('diff --git a/')
      || !Number.isSafeInteger(maxBatchBytes) || maxBatchBytes < 1024
      || maxBatchBytes > 48_000 || !Number.isSafeInteger(maxTotalBytes)
      || maxTotalBytes < maxBatchBytes || maxTotalBytes > COUNCIL_REVIEW_TOTAL_LIMIT_BYTES
      || !Number.isSafeInteger(maxBatches) || maxBatches < 1
      || maxBatches > COUNCIL_REVIEW_MAX_BATCHES)
    return failed('COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  const totalBytes = bytes(diff);
  if (totalBytes > maxTotalBytes) return failed('COUNCIL_REVIEW_TOTAL_TOO_LARGE', { totalBytes });
  const sections = diff.split(/(?=^diff --git a\/)/m).filter(Boolean);
  if (!sections.length || sections.join('') !== diff)
    return failed('COUNCIL_REVIEW_INCOMPLETE_SOURCE_DIFF');
  const batches = [];
  let items = [], paths = [], currentBytes = 0;
  for (const section of sections) {
    const path = headerPath(section);
    if (!path) return failed('COUNCIL_REVIEW_FILE_HEADER_INVALID');
    const size = bytes(section);
    if (size > maxBatchBytes) return failed('COUNCIL_REVIEW_SINGLE_FILE_TOO_LARGE', { path, fileBytes: size });
    if (currentBytes + size > maxBatchBytes && items.length) {
      batches.push({ number: batches.length + 1, diff: items.join(''), paths, bytes: currentBytes });
      items = []; paths = []; currentBytes = 0;
    }
    items.push(section);
    paths.push(path);
    currentBytes += size;
  }
  if (items.length) batches.push({ number: batches.length + 1, diff: items.join(''), paths, bytes: currentBytes });
  if (batches.length > maxBatches) return failed('COUNCIL_REVIEW_TOO_MANY_BATCHES', { count: batches.length });
  if (batches.map(batch => batch.diff).join('') !== diff
      || batches.reduce((sum, batch) => sum + batch.bytes, 0) !== totalBytes)
    return failed('COUNCIL_REVIEW_INCOMPLETE_SOURCE_DIFF');
  return Object.freeze({ ok: true, status: 'PENDING_ALL_BATCH_REVIEWS',
    totalBytes, fileCount: sections.length, batchCount: batches.length,
    batches: Object.freeze(batches.map(batch => Object.freeze(batch))),
  });
}
