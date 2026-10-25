// MEL finds, by herself, the public training sets and benchmarks a measured
// gap needs (issue #2650). Hugging Face's public API is free; only permissive
// licences, public and non-gated datasets are kept, each pinned to its exact
// revision so the provenance of every training or test file is controlled.
const HF_API = 'https://huggingface.co/api/datasets';
const PERMISSIVE = new Set(['apache-2.0', 'mit', 'cc-by-4.0', 'cc-by-sa-4.0', 'cc0-1.0', 'odc-by', 'bsd-3-clause', 'openrail']);

// What to look for, per gap the observer can report.
export const SKILL_QUERIES = Object.freeze({
  AGENTIC_EXECUTION_BELOW_OBJECTIVE: { train: ['function calling', 'tool use agent', 'agent trajectories'], test: ['function calling leaderboard', 'bfcl', 'tool calling benchmark'] },
  TECHNICAL_DEPTH_BELOW_OBJECTIVE: { train: ['code instructions', 'code reasoning'], test: ['humaneval', 'code benchmark'] },
  OVER_REFUSAL_REGRESSED: { train: ['over-refusal', 'helpful harmless'], test: ['over refusal benchmark', 'xstest'] },
});

function licenceOf(row) {
  const tag = (row?.tags || []).find(t => String(t).startsWith('license:'));
  return tag ? String(tag).slice(8).toLowerCase() : null;
}

// MEL answers in French and English; a set tagged only with other languages is skipped.
function speaksMelLanguages(row) {
  const langs = (row?.tags || []).filter(t => String(t).startsWith('language:')).map(t => String(t).slice(9));
  if (langs.length && !langs.includes('en') && !langs.includes('fr')) return false;
  // A set named after another language (turkish-…) is mostly that language,
  // even when it is also tagged English.
  return !/turkish|chinese|arabic|korean|japanese|german|spanish|russian|vietnamese|hindi|persian|indonesian|thai|portuguese|italian|polish|-zh|-ko|-ja|-tr\b/i.test(String(row?.id || ''));
}

// Benchmarks are for measuring, never for training on.
export function looksLikeBenchmark(row) {
  return /bench|leaderboard|eval|humaneval|xstest|bfcl|test/i.test(String(row?.id || ''));
}

export function eligibleDataset(row) {
  const licence = licenceOf(row);
  return Boolean(row?.id && row?.sha && !row.private && !row.gated && !row.disabled
    && licence && PERMISSIVE.has(licence) && Number(row.downloads || 0) >= 100 && speaksMelLanguages(row));
}

async function search(fetchImpl, query, limit) {
  const url = `${HF_API}?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=${limit}&full=true`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw Object.assign(new Error(`LORA_DISCOVERY_HTTP_${response.status}`), { code: 'LORA_DISCOVERY_HTTP' });
  return response.json();
}

export async function discoverLoraDatasets(reason, { fetchImpl = fetch, perQuery = 10, keep = 3 } = {}) {
  const queries = SKILL_QUERIES[reason];
  if (!queries) return { reason, status: 'NO_QUERY_FOR_GAP', train: [], test: [] };
  const pick = async (list, wantBenchmark) => {
    const seen = new Map();
    for (const query of list) {
      const rows = await search(fetchImpl, query, perQuery).catch(() => []);
      for (const row of Array.isArray(rows) ? rows : []) {
        if (eligibleDataset(row) && looksLikeBenchmark(row) === wantBenchmark && !seen.has(row.id)) {
          seen.set(row.id, { id: row.id, revision: row.sha, licence: licenceOf(row), downloads: Number(row.downloads || 0), query, url: `https://huggingface.co/datasets/${row.id}/tree/${row.sha}` });
        }
      }
    }
    return [...seen.values()].sort((a, b) => b.downloads - a.downloads).slice(0, keep);
  };
  const [train, test] = [await pick(queries.train, false), await pick(queries.test, true)];
  // A training set never doubles as its own benchmark.
  const testIds = new Set(test.map(row => row.id));
  return { reason, status: train.length && test.length ? 'FOUND' : 'INSUFFICIENT', train: train.filter(row => !testIds.has(row.id)), test, discovered_at: Date.now() };
}
