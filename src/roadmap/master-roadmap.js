export const ROADMAP_STATUSES = Object.freeze({
  DONE: 'DONE',
  VERIFIED: 'DONE_VERIFIED',
  IN_PROGRESS: 'IN_PROGRESS',
  PARTIAL: 'PARTIAL',
  PLANNED: 'PLANNED',
  BLOCKED_HUMAN: 'BLOCKED_HUMAN',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL'
});

const phase = (id, title, items) => ({ id, title, items });
const item = (id, title, status, next = '', priority = 'P2') => ({ id, title, status, next, priority });
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const normalizeRoadmapText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Product-level roadmap used by the control center.
 * This intentionally goes beyond the historical GEN2-01..63 checklist and
 * includes the product targets agreed for MEL: multi-AI council, Work,
 * continuous memory, voice/avatar, Android/Windows companions, evolution,
 * resilience and deployment maturity.
 *
 * One item = one deliverable. Related layers may coexist, but duplicated
 * deliverables are consolidated here rather than tracked twice.
 */
export const MASTER_ROADMAP = Object.freeze([
  phase('P01', 'Fondations, identité et contrats', [
    item('GEN2-01', 'Core minimal: config, erreurs, HTTP, sécurité, audit', 'DONE_VERIFIED', 'Maintenir les tests de non-régression', 'P0'),
    item('GEN2-02', 'Identité MEL et System Prompt portable', 'PARTIAL', 'Extraire définitivement la persona hors du legacy worker', 'P1'),
    item('GEN2-03', 'Model Registry provider-neutral', 'DONE_VERIFIED', 'Ajouter les métadonnées de qualité mesurées', 'P0'),
    item('GEN2-04', 'Model Router + fallback', 'DONE_VERIFIED', 'Brancher les scores réels de qualité/latence/coût', 'P0'),
    item('GEN2-51', 'Versioning API', 'PARTIAL', 'Migrer progressivement les anciennes routes', 'P2'),
    item('GEN2-52', 'Versioning prompts et stratégies', 'PLANNED', 'Créer registre versionné avec rollback', 'P2')
  ]),

  phase('P02', 'Conversation, contexte et continuité', [
    item('GEN2-06', 'Conversation Service', 'DONE_VERIFIED', 'Retirer les derniers chemins legacy', 'P0'),
    item('GEN2-08', 'Archivage exhaustif des messages', 'DONE', 'Garantir archivage non conditionnel', 'P1'),
    item('MEL-CONTEXT-01', 'Saisie continue pendant la réflexion / file de messages', 'DONE_VERIFIED', 'Valider sur mobile réel', 'P0'),
    item('MEL-CONTEXT-02', 'Contexte long avec compression sans perte de décisions', 'PARTIAL', 'Compiler les résumés hiérarchiques', 'P1'),
    item('MEL-CONTEXT-03', 'Open loops: reprendre automatiquement les travaux inachevés', 'PLANNED', 'Lier tâches, conversations et événements', 'P1')
  ]),

  phase('P03', 'Mémoire personnelle et connaissance', [
    item('GEN2-09', 'Memory 2.0 cognitive', 'DONE_VERIFIED', 'Consolider MemoryService unique', 'P0'),
    item('GEN2-10', 'Contradictions, provenance et temporalité', 'DONE', 'Rendre la résolution automatique explicable', 'P1'),
    item('GEN2-11', 'Knowledge Graph', 'DONE', 'Lier davantage les entités aux projets et décisions', 'P1'),
    item('GEN2-12', 'Timeline personnelle', 'PLANNED', 'Construire une chronologie requêtable', 'P1'),
    item('GEN2-13', 'Projects / Decisions', 'PLANNED', 'Créer objets projet, décision, justification et état', 'P1'),
    item('GEN2-25', 'Personal Search / RAG', 'DONE_VERIFIED', 'Étendre aux fichiers et connecteurs', 'P0'),
    item('GEN2-56', 'Import contexte ChatGPT', 'DONE_VERIFIED', 'Valider les gros exports réels et la compatibilité entre versions', 'P0'),
    item('MEL-MEM-01', 'Memory Compiler: faits, préférences, décisions, compétences', 'IN_PROGRESS', 'Déduplication + confiance + provenance', 'P0'),
    item('MEL-MEM-02', 'Synchronisation continue des nouveaux échanges vers la mémoire', 'PLANNED', 'Créer pipeline incrémental idempotent', 'P1'),
    item('MEL-MEM-03', 'Export mémoire portable et lisible', 'PARTIAL', 'Ajouter manifeste, checksums et version de schéma', 'P1')
  ]),

  phase('P04', 'Capability Bus, outils et accès au code', [
    item('GEN2-14', 'Capability Bus central', 'PARTIAL', 'Faire passer tous les outils par le bus', 'P0'),
    item('MEL-CODE-01', 'Lecture sécurisée du propre code de MEL', 'IN_PROGRESS', 'Valider le chat de bout en bout en production', 'P0'),
    item('MEL-CODE-02', 'Recherche sécurisée dans le dépôt', 'IN_PROGRESS', 'Valider recherche naturelle depuis le chat', 'P0'),
    item('MEL-CODE-03', 'Diagnostic self-code et branche réellement déployée', 'IN_PROGRESS', 'Exposer et valider branche + commit déployés dans le self-check', 'P0'),
    item('GEN2-15', 'Plugin SDK', 'PLANNED', 'Stabiliser contrat manifest + permissions', 'P1'),
    item('GEN2-50', 'Compatibilité MCP', 'PLANNED', 'Mapper CapabilityBus vers MCP', 'P2')
  ]),

  phase('P05', 'Multi-IA, .augmentio et Council', [
    item('MEL-AUG-01', '.augmentio fan-out parallèle', 'DONE_VERIFIED', 'Mesurer qualité et latence par fournisseur', 'P0'),
    item('MEL-AUG-02', 'Zero-Euro Governor fail-closed', 'IN_PROGRESS', 'Refuser tout coût inconnu ou non autorisé', 'P0'),
    item('GEN2-05', 'Model Council / benchmarks', 'IN_PROGRESS', 'Passer du squelette à un Council réellement connecté aux providers', 'P0'),
    item('MEL-COUNCIL-01', 'Pré-audit multi-IA obligatoire avant développement', 'DONE_VERIFIED', 'Brancher le Council réel au Module Lab', 'P0'),
    item('MEL-COUNCIL-02', 'Critiques indépendantes + synthèse MEL', 'PARTIAL', 'Ajouter rôles architecte, sécurité, test, produit', 'P1'),
    item('MEL-COUNCIL-03', 'Teacher escalation vers ChatGPT/autres IA', 'PARTIAL', 'Standardiser provenance et paquet de revue', 'P1'),
    item('MEL-COUNCIL-04', 'Apprentissage du meilleur modèle selon la tâche', 'PLANNED', 'Stocker score qualité/coût/latence par tâche', 'P1')
  ]),

  phase('P06', 'Module Lab, évolution et apprentissage', [
    item('GEN2-16', 'Module Lab', 'PARTIAL', 'Brancher préflight Council -> spec -> code -> tests', 'P0'),
    item('GEN2-17', 'Dev Agent / auto-évolution supervisée', 'PARTIAL', 'Prouver plusieurs cycles cohérents complets sur candidate avant toute promotion', 'P0'),
    item('MEL-EVOL-01', 'Détecter une compétence manquante à partir d’une demande', 'PARTIAL', 'Valider le gap detector dans le chat et le relier au développement sans doublon', 'P0'),
    item('MEL-EVOL-02', 'Proposer ou générer un module', 'PLANNED', 'Relier gap detector au Module Lab', 'P0'),
    item('MEL-EVOL-03', 'Tests, benchmark, critique et correction en boucle', 'PARTIAL', 'Unifier runner de preuves', 'P0'),
    item('MEL-EVOL-04', 'EVOLUTION_LEDGER immuable et explicable', 'PARTIAL', 'Persister chaque évolution et ses preuves', 'P1'),
    item('MEL-EVOL-05', 'Skill Registry durable', 'PLANNED', 'Compiler les acquis système dans un registre portable', 'P1'),
    item('MEL-EVOL-06', 'Fine-tuning / LoRA open-weight optionnel', 'PLANNED', 'Séparer apprentissage système et poids du modèle', 'P3'),
    item('GEN2-18', 'Self Healing contrôlé', 'PLANNED', 'Limiter à détection, rollback approuvé et réparation testée', 'P2'),
    item('GEN2-20', 'Learning Engine', 'PARTIAL', 'Brancher apprentissage durable sur résultats vérifiés', 'P1')
  ]),

  phase('P07', 'Work, agents et automatisations', [
    item('MEL-WORK-01', 'Work Engine persistant', 'PARTIAL', 'État de tâche, artefacts, checkpoints, reprise', 'P0'),
    item('GEN2-38', 'Tasks / goals / planning', 'PARTIAL', 'Créer planning engine unique', 'P1'),
    item('GEN2-39', 'Agents / automations', 'PLANNED', 'Exécution par capacités et permission tiers', 'P1'),
    item('GEN2-40', 'Event Bus idempotent / follow-ups', 'PLANNED', 'Transporter événements et relances idempotentes entre services', 'P1'),
    item('GEN2-41', 'Notifications', 'PLANNED', 'Web Push + compagnons', 'P2'),
    item('MEL-WORK-02', 'Planifier, reprendre et terminer un travail multi-étapes', 'PARTIAL', 'Prouver reprise et terminaison sur plusieurs cycles autonomes cohérents', 'P0'),
    item('MEL-WORK-03', 'Actions destructives avec confirmation explicite', 'PARTIAL', 'Centraliser les approval gates', 'P0')
  ]),

  phase('P08', 'Connecteurs et web', [
    item('GEN2-32', 'Connector SDK', 'PARTIAL', 'Finaliser OAuth + scopes + health', 'P1'),
    item('GEN2-33', 'Gmail / Google', 'BLOCKED_HUMAN', 'Configurer OAuth et permissions', 'P1'),
    item('GEN2-34', 'Outlook / Microsoft', 'BLOCKED_HUMAN', 'Configurer OAuth et permissions', 'P2'),
    item('GEN2-35', 'OneDrive / SharePoint', 'BLOCKED_HUMAN', 'Configurer OAuth et permissions', 'P1'),
    item('GEN2-36', 'GitHub / Cloudflare / Vercel', 'PARTIAL', 'Étendre au-delà de la lecture GitHub', 'P0'),
    item('GEN2-37', 'Web / recherche', 'PARTIAL', 'Valider en production la recherche sourcée, les redirections et la qualité des sources', 'P1'),
    item('MEL-CONN-01', 'WordPress Vérité Interdite', 'PLANNED', 'Créer MEL publique isolée de la mémoire privée', 'P3'),
    item('MEL-CONN-02', 'Catalogue de connecteurs installables', 'PLANNED', 'Découverte, permissions, test santé, désactivation', 'P2')
  ]),

  phase('P09', 'Voix, avatar et multimodal', [
    item('GEN2-21', 'Images / vision', 'PARTIAL', 'Stabiliser activation et modèles vision', 'P1'),
    item('GEN2-22', 'Audio / transcription / voix', 'PARTIAL', 'Fallback navigateur gratuit + voix provider', 'P0'),
    item('GEN2-23', 'Vidéo', 'PARTIAL', 'Ajouter pipeline avatar parlant', 'P1'),
    item('GEN2-24', 'Documents', 'PARTIAL', 'Parsers PDF/doc plus robustes', 'P1'),
    item('MEL-VOICE-01', 'Réveil Bonjour MEL / Allô MEL', 'PLANNED', 'Détection locale/compagnon selon plateforme', 'P1'),
    item('MEL-VOICE-02', 'Conversation audio transcrite en mémoire', 'PARTIAL', 'Brancher archive systématique', 'P0'),
    item('MEL-AVATAR-01', 'Avatar animé temps réel', 'PLANNED', 'Animation légère navigateur', 'P1'),
    item('MEL-AVATAR-02', 'Talking avatar lip-sync', 'PLANNED', 'Adapter provider interchangeable, fallback zéro coût', 'P2'),
    item('MEL-AVATAR-03', 'Tenue/identité visuelle moderne de MEL', 'PLANNED', 'Créer modèle visuel cohérent sans dépendance à un costume fixe', 'P2')
  ]),

  phase('P10', 'Téléphone, PC et appareils', [
    item('GEN2-07', 'Sync PC / téléphone', 'DONE', 'Valider avec clients réels', 'P1'),
    item('GEN2-29', 'Device Bus', 'DONE_VERIFIED', 'Brancher vrais compagnons', 'P0'),
    item('GEN2-26', 'PWA', 'PARTIAL', 'Cache/offline/install améliorés', 'P2'),
    item('GEN2-27', 'Android Companion runtime / app', 'PLANNED', 'Implémenter le client Android autonome et sa synchronisation', 'P0'),
    item('GEN2-58', 'Build et release Android', 'PLANNED', 'Pipeline CI APK signé localement/secret protégé', 'P1'),
    item('GEN2-28', 'Windows Companion runtime / agent', 'PLANNED', 'Implémenter l’agent local Windows et ses capacités', 'P0'),
    item('GEN2-59', 'Build et release Windows', 'PLANNED', 'Packaging, signature et mises à jour', 'P2'),
    item('GEN2-30', 'Computer Use abstraction', 'PLANNED', 'Permission tiers et sandbox', 'P0'),
    item('GEN2-31', 'Browser capability', 'PLANNED', 'Navigateur contrôlé via compagnon/Work', 'P1'),
    item('MEL-DEVICE-01', 'Ouvrir/fermer applications et fichiers', 'PLANNED', 'Agent PC avec allowlist et confirmation', 'P1'),
    item('MEL-DEVICE-02', 'Commandes système / arrêt contrôlé', 'PLANNED', 'Permissions élevées explicites; arrêt propriétaire prioritaire', 'P2'),
    item('MEL-DEVICE-03', 'Wake-on-LAN séparé', 'PLANNED', 'Module réseau indépendant', 'P3')
  ]),

  phase('P11', 'Sécurité, audit et gouvernance', [
    item('GEN2-44', 'Observability / diagnostics', 'PARTIAL', 'Dashboard santé unifié', 'P0'),
    item('GEN2-45', 'Audit log', 'DONE', 'Persistance et corrélation de toutes les actions sensibles', 'P0'),
    item('GEN2-46', 'Secrets / authentification', 'PARTIAL', 'Passer de Basic Auth à auth plus robuste', 'P0'),
    item('MEL-SEC-01', 'Prompt-injection firewall outils/RAG', 'PARTIAL', 'Étiqueter données vs instructions partout', 'P0'),
    item('MEL-SEC-02', 'Permissions par capacité', 'PARTIAL', 'Enforcement systématique', 'P0'),
    item('MEL-SEC-03', 'Supply-chain / dépendances / CI', 'PARTIAL', 'SBOM et dépendances runtime fail-closed', 'P1'),
    item('MEL-SEC-04', 'Owner shutdown always wins', 'DONE_VERIFIED', 'Conserver invariant dans toutes les évolutions', 'P0'),
    item('MEL-SEC-05', 'Pas de réplication cachée ni récolte de secrets', 'DONE_VERIFIED', 'Conserver tests de sécurité', 'P0')
  ]),

  phase('P12', 'Résilience, sauvegarde et indépendance', [
    item('GEN2-47', 'Backups / export système', 'PARTIAL', 'Automatiser snapshots vérifiés de l’ensemble du système', 'P1'),
    item('GEN2-48', 'Restore / disaster recovery', 'PARTIAL', 'Faire drill complet de restauration', 'P1'),
    item('GEN2-49', 'Portabilité système provider-neutral', 'PLANNED', 'Bundle complet indépendant des fournisseurs', 'P1'),
    item('MEL-RES-01', 'Survival Mode: NORMAL/DEGRADED/READ_ONLY/RECOVERY/HALTED', 'DONE_VERIFIED', 'Brancher télémétrie runtime', 'P0'),
    item('MEL-RES-02', 'Recovery Bundle', 'DONE_VERIFIED', 'Ajouter vérification périodique de l’artefact de récupération', 'P0'),
    item('MEL-RES-03', 'Provider Escape Capsule', 'PARTIAL', 'Documenter le remplacement AI/storage/runtime sans redéployer toute l’architecture', 'P1'),
    item('MEL-RES-04', 'Cold standby autorisé', 'PLANNED', 'Préparer restauration manuelle/approuvée', 'P2'),
    item('MEL-RES-05', 'Intégrité mémoire et sauvegardes chiffrées', 'PARTIAL', 'Checksums + chiffrement + restore test', 'P1')
  ]),

  phase('P13', 'Évaluation et amélioration continue', [
    item('GEN2-42', 'Capability Watch planifié', 'PLANNED', 'Exécuter régulièrement les benchmarks par compétence', 'P1'),
    item('GEN2-43', 'Model Watch / découverte', 'PLANNED', 'Découvrir et benchmarker de nouveaux modèles autorisés', 'P1'),
    item('MEL-EVAL-01', 'Suites de benchmark conversation / code / recherche / mémoire', 'PARTIAL', 'Maintenir une suite de score stable réutilisée par les watches', 'P1'),
    item('MEL-EVAL-03', 'Qualité mesurée avant/après évolution', 'PLANNED', 'Bloquer toute régression significative', 'P0')
  ]),

  phase('P14', 'Interface et expérience', [
    item('GEN2-54', 'Control Center / Mode complet', 'IN_PROGRESS', 'Afficher roadmap, diagnostics et vraies capacités dans une interface contemporaine unique', 'P0'),
    item('MEL-UI-01', 'Accueil minimal et contemporain', 'DONE_VERIFIED', 'Polish mobile continu', 'P0'),
    item('MEL-UI-02', 'Avatar grand / cible tactile mobile', 'DONE_VERIFIED', 'Tester sur Android réel', 'P0'),
    item('MEL-UI-03', 'Favicon visage MEL', 'DONE_VERIFIED', '—', 'P3'),
    item('MEL-UI-05', 'État réel, pas de cartes factices', 'IN_PROGRESS', 'Toutes cartes reliées à API/health', 'P0')
  ]),

  phase('P15', 'Release, migration et maturité finale', [
    item('GEN2-53', 'Canary pré-release / rollback', 'PARTIAL', 'Tester une release candidate avant promotion et prouver le rollback', 'P0'),
    item('GEN2-57', 'Migration Gen1 sans perte', 'IN_PROGRESS', 'Réduire progressivement worker legacy', 'P0'),
    item('GEN2-55', 'Data integrity / final maturity tests', 'PLANNED', 'Suite finale après stabilisation', 'P1'),
    item('GEN2-60', 'Completion matrix', 'PLANNED', 'Générer automatiquement depuis ce registre', 'P2'),
    item('GEN2-61', 'Final status report', 'PLANNED', 'Générer au jalon mature', 'P2'),
    item('GEN2-62', 'human-actions-required', 'PARTIAL', 'Maintenir blockers humains exacts', 'P1'),
    item('GEN2-63', 'Règle NON-IDLE / continue-when-blocked', 'IN_PROGRESS', 'Continuer sur tâches non bloquées', 'P1'),
    item('MEL-REL-01', 'Release figée sur commit exact', 'DONE_VERIFIED', 'Répéter pour chaque déploiement', 'P0'),
    item('MEL-REL-02', 'CI complet vert avant déploiement', 'DONE_VERIFIED', 'Conserver gate', 'P0'),
    item('MEL-REL-03', 'Smoke tests production après déploiement', 'PARTIAL', 'Automatiser code self-check, chat, mémoire, UI', 'P0')
  ])
]);

export function flattenRoadmap() {
  return MASTER_ROADMAP.flatMap(p => p.items.map(i => ({ ...i, phase_id: p.id, phase: p.title })));
}

/** Structural guard against duplicate or contradictory registry entries. */
export function validateRoadmap() {
  const issues = [];
  const phaseIds = new Set();
  const itemIds = new Set();
  const titles = new Map();
  const validStatuses = new Set(Object.values(ROADMAP_STATUSES));

  for (const p of MASTER_ROADMAP) {
    if (phaseIds.has(p.id)) issues.push({ type: 'DUPLICATE_PHASE_ID', id: p.id });
    phaseIds.add(p.id);
    if (!String(p.title || '').trim()) issues.push({ type: 'EMPTY_PHASE_TITLE', id: p.id });

    for (const row of p.items) {
      if (itemIds.has(row.id)) issues.push({ type: 'DUPLICATE_ITEM_ID', id: row.id });
      itemIds.add(row.id);
      if (!validStatuses.has(row.status)) issues.push({ type: 'INVALID_STATUS', id: row.id, status: row.status });
      if (!VALID_PRIORITIES.has(row.priority)) issues.push({ type: 'INVALID_PRIORITY', id: row.id, priority: row.priority });

      const normalizedTitle = normalizeRoadmapText(row.title);
      if (!normalizedTitle) issues.push({ type: 'EMPTY_ITEM_TITLE', id: row.id });
      const previous = titles.get(normalizedTitle);
      if (previous) issues.push({ type: 'DUPLICATE_TITLE', ids: [previous, row.id], title: row.title });
      else titles.set(normalizedTitle, row.id);
    }
  }

  return { ok: issues.length === 0, issues };
}

export function roadmapSummary() {
  const rows = flattenRoadmap();
  const byStatus = {};
  const byPriority = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
  }
  const complete = (byStatus.DONE || 0) + (byStatus.DONE_VERIFIED || 0);
  return {
    total: rows.length,
    complete,
    percent_complete: rows.length ? Math.round((complete / rows.length) * 100) : 0,
    by_status: byStatus,
    by_priority: byPriority,
    generated_at: new Date().toISOString()
  };
}

export function getRoadmapPayload() {
  return { ok: true, summary: roadmapSummary(), validation: validateRoadmap(), phases: MASTER_ROADMAP };
}
