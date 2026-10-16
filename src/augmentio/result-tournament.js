function normalize(text = '') {
  return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
}

function finiteWeight(value) {
  const weight = Number(value ?? 0);
  // AI-provided NaN/Infinity/extreme scores must not dominate the ranking.
  return Number.isFinite(weight) ? Math.max(-1_000_000, Math.min(1_000_000, weight)) : 0;
}

export class ResultTournament {
  deduplicate(results = []) {
    const unique = new Map();
    for (const result of results) {
      const key = normalize(result?.text);
      if (!key) continue;
      // Keep the most evidenced variant, not whichever duplicate was received
      // first from concurrent model calls.
      const previous = unique.get(key);
      if (!previous || this.score(result) > this.score(previous)) unique.set(key, result);
    }
    return [...unique.values()];
  }

  score(result = {}) {
    const evidence = finiteWeight(result.evidenceScore);
    const tests = result.testsPassed === true ? 2 : 0;
    const provenance = result.provenance ? 1 : 0;
    const confidence = finiteWeight(result.confidence);
    return evidence + tests + provenance + confidence;
  }

  rank(results = []) {
    return this.deduplicate(results)
      .map((result) => ({ ...result, tournamentScore: this.score(result) }))
      .sort((a, b) => b.tournamentScore - a.tournamentScore);
  }
}
