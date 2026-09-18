export function stripInternalCounters(value) {
  if (typeof value !== 'string' || !value) return value;
  return value
    .replace(/[^.!?\n]*\binteraction_count\b\s*[:=]?\s*\d+[^.!?\n]*[.!?]?/gi, ' ')
    .replace(/\binteraction_count\b\s*[:=]?\s*\d+/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
