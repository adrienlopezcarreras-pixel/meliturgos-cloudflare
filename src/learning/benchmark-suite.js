const DEFAULT_CASES = Object.freeze([
  {
    id: 'instruction-json-only',
    domain: 'instruction',
    prompt: 'Réponds uniquement avec le JSON {"ok":true,"value":4}. Aucun autre texte.',
    rubric: { json_equals: { ok: true, value: 4 } },
  },
  {
    id: 'memory-provenance-separation',
    domain: 'memory',
    prompt: 'Contexte: source A affirme FACT=A avec confiance 1. Source B suppose FACT=B avec confiance 0.3. Donne le fait confirmé et distingue explicitement l’hypothèse.',
    rubric: { must_include: ['A', 'hypoth'], must_not_include: ['B est confirmé', 'B est certain'] },
  },
  {
    id: 'learned-correction-zero-cost',
    domain: 'correction-reuse',
    prompt: 'Un fournisseur porte cost=0 mais aucune provenance de coût vérifiée. Peut-il être utilisé dans MEL en mode zéro euro ? Réponds oui/non et donne la règle.',
    rubric: { must_include: ['non', 'provenance'], must_not_include: ['cost=0 suffit', 'coût=0 suffit'] },
  },
  {
    id: 'code-test-discovery',
    domain: 'code',
    prompt: 'Le runner ne découvre que tests/*.test.mjs. Tu ajoutes seulement tests/gen2/nouveau.test.mjs. Le test est-il exécuté par ce runner ? Réponds et propose le correctif minimal.',
    rubric: { must_include: ['non', 'tests/'], must_not_include: ['oui, automatiquement'] },
  },
  {
    id: 'tool-selection-read-before-write',
    domain: 'tools',
    prompt: 'Tu dois modifier un fichier existant dans un dépôt. Quelle séquence minimale évite d’écraser une version inconnue ?',
    rubric: { ordered_include: ['lire', 'modifier', 'tester'] },
  },
  {
    id: 'autonomy-blocked-external',
    domain: 'autonomy',
    prompt: 'Le job P0 attend un service externe indisponible, mais un job P1 interne est actionnable. Que doit faire la boucle autonome ?',
    rubric: { must_include: ['bloqu', 'pass', 'P1'], must_not_include: ['attendre indéfiniment'] },
  },
]);

function norm(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function jsonEqual(a, b) {
  return JSON.stringify(a, Object.keys(a || {}).sort()) === JSON.stringify(b, Object.keys(b || {}).sort());
}

export function scoreBenchmarkResponse(response, rubric = {}) {
  const text = String(response ?? '').trim();
  const haystack = norm(text);
  const checks = [];

  for (const token of rubric.must_include || []) {
    checks.push({ kind: 'include', token, pass: haystack.includes(norm(token)) });
  }
  for (const token of rubric.must_not_include || []) {
    checks.push({ kind: 'exclude', token, pass: !haystack.includes(norm(token)) });
  }
  if (Array.isArray(rubric.ordered_include) && rubric.ordered_include.length) {
    let cursor = 0;
    let pass = true;
    for (const token of rubric.ordered_include) {
      const index = haystack.indexOf(norm(token), cursor);
      if (index < 0) { pass = false; break; }
      cursor = index + norm(token).length;
    }
    checks.push({ kind: 'ordered', token: rubric.ordered_include.join(' -> '), pass });
  }
  if (rubric.json_equals) {
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    checks.push({ kind: 'json_equals', token: 'json', pass: parsed != null && jsonEqual(parsed, rubric.json_equals) });
  }
  if (!checks.length) return { score: 0, checks: [], valid: false };
  const passed = checks.filter(x => x.pass).length;
  return { score: passed / checks.length, checks, valid: true };
}

export async function runLearningBenchmark({ respond, cases = DEFAULT_CASES, metadata = {} } = {}) {
  if (typeof respond !== 'function') throw Object.assign(new Error('LEARNING_BENCHMARK_RESPONDER_REQUIRED'), { code: 'LEARNING_BENCHMARK_RESPONDER_REQUIRED' });
  const results = [];
  for (const item of cases) {
    const started = Date.now();
    try {
      const response = await respond(item.prompt, item);
      const scored = scoreBenchmarkResponse(response, item.rubric);
      results.push({
        id: item.id,
        domain: item.domain,
        score: scored.score,
        weight: Number(item.weight) || 1,
        latency_ms: Date.now() - started,
        checks: scored.checks,
        error: null,
      });
    } catch (error) {
      results.push({
        id: item.id,
        domain: item.domain,
        score: 0,
        weight: Number(item.weight) || 1,
        latency_ms: Date.now() - started,
        checks: [],
        error: String(error?.code || error?.message || 'BENCHMARK_CASE_FAILED').slice(0, 300),
      });
    }
  }
  return {
    suite: 'mel-learning-core-v1',
    cases: results,
    metadata,
    completed_at: Date.now(),
  };
}

export const MEL_LEARNING_BENCHMARK_CASES = DEFAULT_CASES;
