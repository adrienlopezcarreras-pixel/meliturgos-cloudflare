function normalize(text = '') {
  return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
}

export class ResultTournament {
  deduplicate(results = []) {
    const seen = new Set();
    return results.filter((result) => {
      const key = normalize(result.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  score(result = {}) {
    const evidence = Number(result.evidenceScore ?? 0);
    const tests = result.testsPassed === true ? 2 : 0;
    const provenance = result.provenance ? 1 : 0;
    const confidence = Number(result.confidence ?? 0);
    return evidence + tests + provenance + confidence;
  }

  rank(results = []) {
    return this.deduplicate(results)
      .map((result) => ({ ...result, tournamentScore: this.score(result) }))
      .sort((a, b) => b.tournamentScore - a.tournamentScore);
  }
}
