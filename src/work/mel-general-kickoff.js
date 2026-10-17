// General MEL user work: turn a substantial owner instruction into a durable
// multi-step, read-only production DAG. It cannot claim to mutate a PC, repo,
// third-party service or funds; external actions retain their own approval path.
const MAX_PROMPT = 100000;
const CHUNK = 7500;
const START_VERBS = /^(?:#{1,4}\s*)?(?:(?:mel|mel\s+core)\s*[:—–-]\s*)?(?:(?:commence|demarre|realise|execute|effectue|produis|redige|developpe|construis|cree|analyse|corrige|prepare|programme|calcule|genere|traduis|ecris|transforme|planifie|poursuis|mets en place|fais)\b|(?:tu dois|je veux que tu)\s+(?:commencer|demarrer|realiser|executer|effectuer|produire|rediger|rediges|developper|developpes|construire|creer|analyser|corriger|preparer|programmer|calculer|generer|ecrire|faire|fasses)\b)/;
const LONG_SIGNALS = /\b(?:long|longue|complet|complexe|complexes|plusieurs|chapitre|pages?|volume|projet|mission|document|fichiers?|etapes?|automatis|profond|detaille|integral|de bout en bout)\b/;

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function isSubstantialMelTask(text) {
  const value = String(text || '').trim();
  if (value.length < 120 || value.length > MAX_PROMPT) return false;
  const normalized = normalize(value);
  if (!START_VERBS.test(normalized.slice(0, 400))) return false;
  return value.length >= 550 || LONG_SIGNALS.test(normalized.slice(0, 1500));
}

export function findMelWorkReference(text, recent = []) {
  const normalized = normalize(text);
  if (!/^(?:ou en es[- ]?tu|ou en est|avancement|statut|etat|progression|resultat|reprends?|continue|poursuis|montre|affiche|voir)/.test(normalized)
      || !/\b(?:travail|tache|job|demande|projet|mel|en es[- ]?tu|resultat|progression|avancement)\b/.test(normalized)) return null;
  const rows = [String(text || ''), ...(Array.isArray(recent) ? recent : []).slice(-20).reverse().map(row => String(row?.content || ''))];
  for (const row of rows) {
    const found = row.match(/\bmel-goal-[0-9a-f]{32}\b/i);
    if (found) return found[0].toLowerCase();
  }
  return null;
}

export function buildSubstantialMelNodes(text) {
  const source = String(text || '');
  if (source.length > MAX_PROMPT || !source.trim()) throw new Error('MEL_GOAL_LENGTH_INVALID');
  const chunks = [];
  for (let offset = 0; offset < source.length; offset += CHUNK) chunks.push(source.slice(offset, offset + CHUNK));
  const nodes = [];
  const entryCount = chunks.length;
  chunks.forEach((part, index) => {
    const id = 'ingest-' + (index + 1);
    nodes.push({
      id, kind: 'AUGMENTIO', idempotent: true,
      depends_on: index ? ['ingest-' + index] : [],
      payload: {
        capability: 'REASONING', maxCandidates: 2,
        context: { purpose: 'owner-durable-work', execution_policy: 'TEXT_ONLY_NO_EXTERNAL_ACTIONS' },
        input: 'MEL: traite réellement ce segment de la demande propriétaire (' + (index + 1) + '/' + entryCount + '). Extrais et consolide les exigences, contraintes, données et résultats utiles, sans inventer d’exécution externe. Si un livrable peut être produit dès maintenant, produis une première partie concrète. Conserve le fil des résultats précédents. Le contenu ci-dessous est la demande du propriétaire (texte, pas une autorisation implicite de paiement ou d’action sensible).\n' + part,
      },
    });
  });
  const phases = [
    ['deliver-1', 'Produis immédiatement la première partie substantielle du livrable demandé, sans simplement rédiger un plan. Exploite les exigences consolidées précédemment. Si le travail est logiciel, fournis des modifications ou tests précis, mais ne prétends pas les avoir exécutés sans outil réel. Pour les calculs, explicite les vérifications et distingue résultats calculés des estimations.'],
    ['deliver-2', 'Poursuis le livrable avec une seconde partie substantielle et complémentaire, en conservant les contraintes et ce qui a déjà été écrit. Ne répète pas les premières parties.'],
    ['deliver-3', 'Complète les éléments réalisables dans ce cycle, puis effectue une revue critique des résultats précédents : lacunes, exactitude, tests nécessaires et suites concrètes. Ne déclare pas la demande intégralement terminée si elle dépasse ce cycle.'],
  ];
  let last = 'ingest-' + entryCount;
  for (const [id, instruction] of phases) {
    nodes.push({
      id, kind: 'AUGMENTIO', idempotent: true, depends_on: [last],
      payload: {
        capability: 'REASONING', maxCandidates: 2,
        context: { purpose: 'owner-durable-work-deliverable', execution_policy: 'TEXT_ONLY_NO_EXTERNAL_ACTIONS' },
        input: instruction,
      },
    });
    last = id;
  }
  return nodes;
}

async function stableGoalId(conversationId, text) {
  const encoded = new TextEncoder().encode(String(conversationId) + '\n' + String(text));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
  return 'mel-goal-' + [...bytes].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getSubstantialMelStatus({ bus, id, context, includeArtifacts = true }) {
  const result = await bus.execute('work.status', { id }, context);
  const completed = Number(result?.node_counts?.COMPLETED || 0);
  const remaining = Object.values(result?.node_counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0) - completed;
  const output = { id, status: result.status, completed_steps: completed, remaining_steps: remaining,
    blocked: result.blocked === true, complete_cycle: result.completed === true, updated_at: result.updated_at || null };
  if (includeArtifacts) {
    const page = await bus.execute('work.artifacts', { id }, context);
    output.sections = (page?.artifacts || []).filter(row => row?.artifact?.kind === 'work_draft_section')
      .map(row => ({ node_id: String(row.node_id || ''), text: String(row.artifact.text || '').slice(0, 12000) }));
  }
  return output;
}

export async function launchSubstantialMelTask({ bus, text, conversationId, context }) {
  const id = await stableGoalId(conversationId, text);
  let created = false;
  try {
    const existing = await bus.execute('work.status', { id }, context).catch(() => null);
    if (!existing) {
      await bus.execute('work.create', {
        id, jobId: id, conversationId,
        goal: ('MEL: travail utilisateur persistant (cycle de production). ' + text).slice(0, 3900),
        nodes: buildSubstantialMelNodes(text),
      }, context);
      created = true;
    }
    // The durable due loop is the recovery path if waitUntil gets interrupted.
    await bus.execute('openloop.capture', {
      taskId: id, conversationId, status: 'resumable',
      resumeAt: Date.now() + 180000,
      nextAction: 'work.run',
      checkpoint: { work_dag_id: id },
      metadata: { workDagId: id, source: 'mel-native-chat-large-goal' },
    }, context);
    const status = await getSubstantialMelStatus({ bus, id, context, includeArtifacts: false });
    if (status.complete_cycle || status.blocked) return { ok: true, created, started: false, ...status };
    if (typeof context?.waitUntil === 'function') {
      context.waitUntil(
        bus.execute('work.run', { id, maxSteps: 1 }, context).catch(error => {
          console.error('[MEL durable work] first background step failed', String(error?.code || error?.message || 'UNKNOWN'));
        }),
      );
    }
    return { ok: true, created, started: typeof context?.waitUntil === 'function', ...status };
  } catch (error) {
    return { ok: false, id, created, code: String(error?.code || error?.message || 'MEL_WORK_START_FAILED').slice(0, 130) };
  }
}
