export const ROADMAP_STATUSES = Object.freeze({
  DONE: 'DONE',
  VERIFIED: 'DONE_VERIFIED',
  IN_PROGRESS: 'IN_PROGRESS',
  PARTIAL: 'PARTIAL',
  PLANNED: 'PLANNED',
  BLOCKED_HUMAN: 'BLOCKED_HUMAN',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL'
});

export const ROADMAP_REGISTRY_REVISION = '2026-09-23.07';

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
    item('GEN2-02', 'Identité MEL et System Prompt portable', 'DONE_VERIFIED', 'Persona stable extraite dans mel-persona.js, composée par le systemPrompt runtime et exposée par la façade identity; tests portable-identity inclus dans le lot de réconciliation #153.', 'P1'),
    item('GEN2-03', 'Model Registry provider-neutral', 'DONE_VERIFIED', 'Ajouter les métadonnées de qualité mesurées', 'P0'),
    item('GEN2-04', 'Model Router + fallback', 'DONE_VERIFIED', 'Brancher les scores réels de qualité/latence/coût', 'P0'),
    item('GEN2-51', 'Versioning API', 'PARTIAL', 'Migrer progressivement les anciennes routes', 'P2'),
    item('GEN2-52', 'Versioning prompts et stratégies', 'DONE_VERIFIED', 'Preuve d’intégration: PR #56; maintenir le registre unique et ses tests rollback/snapshot', 'P2')
  ]),

  phase('P02', 'Conversation, contexte et continuité', [
    item('GEN2-06', 'Conversation Service', 'DONE_VERIFIED', 'Retirer les derniers chemins legacy', 'P0'),
    item('GEN2-08', 'Archivage exhaustif des messages', 'DONE', 'Garantir archivage non conditionnel', 'P1'),
    item('MEL-CONTEXT-01', 'Saisie continue pendant la réflexion / file de messages', 'DONE_VERIFIED', 'Valider sur mobile réel', 'P0'),
    item('MEL-CONTEXT-02', 'Contexte long avec compression sans perte de décisions', 'PARTIAL', 'Compiler les résumés hiérarchiques', 'P1'),
    item('MEL-CONTEXT-03', 'Open loops: reprendre automatiquement les travaux inachevés', 'PLANNED', 'Lier tâches, conversations et événements', 'P1'),
    item('MEL-CONTEXT-04', 'Interpréteur de contexte pré-LLM: pédagogique, scientifique et laboratoire', 'DONE_VERIFIED', 'Maintenir les tests de non-régression et la limitation ciblée des seuls détails réellement dangereux', 'P0')
  ]),

  phase('P03', 'Mémoire personnelle et connaissance', [
    item('GEN2-09', 'Memory 2.0 cognitive', 'DONE_VERIFIED', 'Consolider MemoryService unique', 'P0'),
    item('GEN2-10', 'Contradictions, provenance et temporalité', 'DONE', 'Rendre la résolution automatique explicable', 'P1'),
    item('GEN2-11', 'Knowledge Graph', 'DONE', 'Lier davantage les entités aux projets et décisions', 'P1'),
    item('GEN2-12', 'Timeline personnelle', 'PLANNED', 'Construire une chronologie requêtable', 'P1'),
    item('GEN2-13', 'Projects / Decisions', 'PLANNED', 'Créer objets projet, décision, justification et état', 'P1'),
    item('GEN2-25', 'Personal Search / RAG', 'DONE_VERIFIED', 'Étendre aux fichiers et connecteurs', 'P0'),
    item('GEN2-56', 'Import contexte ChatGPT', 'DONE_VERIFIED', 'Valider les gros exports réels et la compatibilité entre versions', 'P0'),
    item('MEL-MEM-01', 'Memory Compiler: faits, préférences, décisions, compétences', 'DONE_VERIFIED', 'Maintenir la déduplication canonique, la confiance sans boost de répétition et la provenance; memory.consolidate reste lecture/proposition uniquement', 'P0'),
    item('MEL-MEM-02', 'Synchronisation continue des nouveaux échanges vers la mémoire', 'DONE_VERIFIED', 'ConversationService archive chaque échange puis alimente ExchangeMemorySync vers memory_candidates avec identifiant déterministe et INSERT OR IGNORE; replay post-échec idempotent couvert par memory-live-exchange-sync.', 'P1'),
    item('MEL-MEM-03', 'Export mémoire portable et lisible', 'PARTIAL', 'Ajouter manifeste, checksums et version de schéma', 'P1'),
    item('MEL-MEM-04', 'Complétude des archives ChatGPT récupérables', 'DONE', 'Clôturé par décision owner le 22/09/2026 : l’archive serveur déjà importée est conservée et l’import manuel reste disponible; le Collector Firefox est retiré du parcours cible et aucune preuve Collector supplémentaire n’est requise.', 'P0'),
    item('MEL-MEM-05', 'Indexation complète messages et pièces jointes', 'IN_PROGRESS', 'Import serveur/manuel enrichi sur candidate: octets réels récupérés acceptés avec bornes strictes, texte des pièces jointes textuelles indexé et recherchable, binaires non extractibles signalés sans faux positif, backfill rejouable sans doublon; full-candidate-ci 35836368792 vert sur SHA 395a1d33198d5a7c460f80b48929d537cf0bf0cd. Collector Firefox retiré du parcours cible. Reste à exécuter le backfill complet sur l’archive réelle et à certifier sa couverture avant DONE_VERIFIED.', 'P0'),
    item('MEL-MEM-06', 'Pont archives vers mémoire opérationnelle unifiée', 'DONE_VERIFIED', 'MemoryService.retrieve unifie mémoire cognitive, archives ChatGPT, titres de conversations et knowledge artifacts avec provenance, déduplication et top-k borné; conversation-context utilise ce pont. Syntaxe globale + 28/28 tests ciblés validés sur l’intégration actuelle.', 'P0'),
    item('MEL-MEM-07', 'Recherche mémoire hybride sémantique, exacte et filtrable', 'DONE_VERIFIED', 'Recherche exacte + lexicale + sémantique opt-in, filtres date/projet/conversation/source/type de fichier/rôle, fusion et reranking, provenance conservée et fallback lexical si le provider sémantique échoue; validation 28/28 tests ciblés.', 'P0'),
    item('MEL-MEM-08', 'Apprentissage mémoire avec provenance conservée', 'DONE_VERIFIED', 'memory.learn confirme un fait canonique depuis les candidats d’archive en conservant conversation, message, source, date, fragment, confiance et snapshot explicite des contradictions; rejeu idempotent validé.', 'P0'),
    item('MEL-MEM-09', 'Validation de rappel historique difficile', 'DONE_VERIFIED', 'Test multi-conversations avec repère rare: croisement de deux messages utilisateur, rôles/autorité et provenance d’origine conservés; aucun résultat synthétique absent de l’archive n’est accepté.', 'P0'),
    item('MEL-MEM-10', 'Reconstruction mémoire identique après panne', 'DONE_VERIFIED', 'Suppression puis reconstruction de memory_candidates et restauration dans une base Gen2 neuve reproduisent à l’identique candidats, propositions compilées, résultats de rappel et provenance; CI dédiée verte.', 'P0')
  ]),

  phase('P04', 'Capability Bus, outils et accès au code', [
    item('GEN2-14', 'Capability Bus central', 'DONE_VERIFIED', 'Maintenir l’invariant : tous les outils utilisateur passent par le bus', 'P0'),
    item('MEL-CODE-01', 'Lecture sécurisée du propre code de MEL', 'DONE_VERIFIED', 'Production certifiée sur SHA f5f294b1b4167fdbc88926d590f1dd808b73133e : /api/chat a exécuté code.read avec succès sur le Worker déployé; release run 35693911802, job 106636510849.', 'P0'),
    item('MEL-CODE-02', 'Recherche sécurisée dans le dépôt', 'DONE_VERIFIED', 'Production certifiée sur SHA f5f294b1b4167fdbc88926d590f1dd808b73133e : /api/chat a exécuté code.search avec succès et retrouvé src/capabilities/default-bus.js; release run 35693911802, job 106636510849.', 'P0'),
    item('MEL-CODE-03', 'Diagnostic self-code et branche réellement déployée', 'DONE_VERIFIED', 'Le self-check expose branche + commit déployés et inspecte désormais le SHA exact comme snapshot immuable; mismatch de branche/HEAD fail-closed. Syntaxe et suites code/self-state validées par Actions 35640215437.', 'P0'),
    item('GEN2-15', 'Plugin SDK', 'PLANNED', 'Stabiliser contrat manifest + permissions', 'P1'),
    item('GEN2-50', 'Compatibilité MCP', 'PLANNED', 'Mapper CapabilityBus vers MCP', 'P2')
  ]),

  phase('P05', 'Multi-IA, .augmentio et Council', [
    item('MEL-AUG-01', '.augmentio fan-out parallèle', 'DONE_VERIFIED', 'Mesurer qualité et latence par fournisseur', 'P0'),
    item('MEL-AUG-02', 'Zero-Euro Governor fail-closed', 'DONE_VERIFIED', 'Maintenir le refus des coûts inconnus, non autorisés ou non prouvés à zéro', 'P0'),
    item('GEN2-05', 'Model Council / benchmarks', 'DONE_VERIFIED', 'Preuve live Cloudflare run 35708004479 sur SHA 1a0f1bdf0461b133c31eb5447873ced85ccb4bc3 : capability model.council via CapabilityBus, 2 modèles Workers AI distincts, 0 échec provider, synthèse MEL séparée complète, provenance/coût zéro/latences vérifiés et preuve Workers Free courte fail-closed.', 'P0'),
    item('MEL-COUNCIL-01', 'Pré-audit multi-IA obligatoire avant développement', 'DONE_VERIFIED', 'Brancher le Council réel au Module Lab', 'P0'),
    item('MEL-COUNCIL-02', 'Critiques indépendantes + synthèse MEL', 'PARTIAL', 'Ajouter rôles architecte, sécurité, test, produit', 'P1'),
    item('MEL-COUNCIL-03', 'Teacher escalation vers ChatGPT/autres IA', 'PARTIAL', 'Standardiser provenance, paquet de revue et handoff avec le protocole multi-IA canonique', 'P1'),
    item('MEL-COUNCIL-04', 'Apprentissage du meilleur modèle selon la tâche', 'PLANNED', 'Stocker score qualité/coût/latence par tâche', 'P1')
  ]),

  phase('P06', 'Module Lab, évolution et apprentissage', [
    item('GEN2-16', 'Module Lab', 'DONE_VERIFIED', 'Pipeline canonique fail-closed Council -> inspection -> plan gate -> spec -> génération -> validation -> tests -> sandbox -> sécurité; activation séparée derrière release gate. Syntaxe globale et tests ciblés validés par Actions 35639574318.', 'P0'),
    item('GEN2-17', 'Dev Agent / auto-évolution supervisée', 'DONE_VERIFIED', 'Preuve candidate supervisée run 35710587356 sur SHA 91831831c5581f2c7b5d657228d6e9a8a4ab31e6 : 3 jobs roadmap distincts complétés successivement, SHA candidate A→B→C, approbations Teacher stale rejetées puis renouvelées sur SHA exacte, CI corrélée verte à chaque cycle, Council exécuté à chaque cycle, aucune mutation production.', 'P0'),
    item('MEL-EVOL-01', 'Détecter une compétence manquante à partir d’une demande', 'DONE_VERIFIED', 'Maintenir la détection sans doublon et n’entrer au Module Lab que pour un vrai gap', 'P0'),
    item('MEL-EVOL-02', 'Proposer ou générer un module', 'DONE_VERIFIED', 'Maintenir la proposition non activante, le Council gate et l’entrée au Module Lab uniquement pour un vrai gap', 'P0'),
    item('MEL-EVOL-03', 'Tests, benchmark, critique et correction en boucle', 'DONE_VERIFIED', 'Preuve candidate e0dc435ec6daf4971243709c76f5ed077a72f0cc: CI 35100248725; smoke Teacher/runtime 35100248854; preview 35100248729; maintenir la boucle runner et ses tests de non-régression', 'P0'),
    item('MEL-EVOL-04', 'EVOLUTION_LEDGER immuable et explicable', 'PARTIAL', 'Persister chaque évolution et ses preuves', 'P1'),
    item('MEL-EVOL-05', 'Skill Registry durable', 'PLANNED', 'Compiler les acquis système dans un registre portable', 'P1'),
    item('MEL-EVOL-06', 'Fine-tuning / LoRA open-weight continu', 'IN_PROGRESS', 'Heartbeat MEL supervise la chaîne Kaggle GPU gratuite: relance seulement si aucun run actif, checkpoints immuables, benchmark après chaque cycle, UNCENSORED puis AGENTIC sans écraser le parent, aucun fallback payant. Correctif candidate: collector Kaggle rendu dispatch-only pour supprimer les files cron/push longues; full-candidate-ci 35837004893 et lora-runtime-pipeline-ci 35837004932 verts sur 1110d20ac184b434a602e86597fd57f76753fbdb. Suite: vérifier le cycle/checkpoint Kaggle réel restant, laisser le heartbeat reprendre uniquement hors run actif et certifier le prochain benchmark canonique.', 'P0'),
    item('GEN2-18', 'Self Healing contrôlé', 'PLANNED', 'Limiter à détection, rollback approuvé et réparation testée', 'P2'),
    item('GEN2-20', 'Learning Engine', 'DONE_VERIFIED', 'Les complétions autonomes exact-SHA vérifiées par full-candidate-ci peuvent transporter des learning_handoffs; le reconciler les injecte automatiquement dans LearningEngine avec validation XP, provenance path+SHA, rejet des SHA périmés et déduplication id+sémantique. Tests handoff-ingestion + autonomy-completion-mentor-learning inclus dans le lot de réconciliation #152.', 'P1')
  ]),

  phase('P07', 'Work, agents et automatisations', [
    item('MEL-WORK-01', 'Work Engine persistant', 'DONE_VERIFIED', 'DAG Work durable en D1 avec état, checkpoints, artefacts, reprise après nouvelle instance et détection de corruption. Revalidé avec syntaxe globale + work-persistent/work-dag Actions 35641014709.', 'P0'),
    item('GEN2-38', 'Tasks / goals / planning', 'PARTIAL', 'Créer planning engine unique', 'P1'),
    item('GEN2-39', 'Agents / automations', 'PARTIAL', 'Brancher MULTI_AI_PROTOCOL au Work Engine/Council pour orchestration runtime et réservations de lots', 'P1'),
    item('GEN2-40', 'Event Bus idempotent / follow-ups', 'PLANNED', 'Transporter événements et relances idempotentes entre services', 'P1'),
    item('GEN2-41', 'Notifications', 'PLANNED', 'Web Push + compagnons', 'P2'),
    item('MEL-WORK-02', 'Planifier, reprendre et terminer un travail multi-étapes', 'DONE_VERIFIED', 'Reprise idempotente et terminaison multi-étapes prouvées, dont chaîne autonome 50 tâches + 50 gates Teacher sur plusieurs heartbeats sans duplication. Revalidé par Actions 35641014709.', 'P0'),
    item('MEL-WORK-03', 'Actions destructives avec confirmation explicite', 'DONE_VERIFIED', 'Gate central fail-closed validé: approbation exacte issue du contexte propriétaire, jamais d’un confirm:true agentique; CapabilityBus audite les refus, Work DAG hérite seulement du contexte approuvé, Browser/Computer partagent le même moteur d’approbation par étape et conversation.archive l’exige explicitement. CI 35691866943.', 'P0')
  ]),

  phase('P08', 'Connecteurs et web', [
    item('GEN2-32', 'Connector SDK', 'PARTIAL', 'Finaliser OAuth + scopes + health', 'P1'),
    item('GEN2-33', 'Gmail / Google', 'BLOCKED_HUMAN', 'Configurer OAuth et permissions', 'P1'),
    item('GEN2-34', 'Outlook / Microsoft', 'BLOCKED_HUMAN', 'Configurer OAuth et permissions', 'P2'),
    item('GEN2-35', 'OneDrive / SharePoint', 'BLOCKED_HUMAN', 'Configurer OAuth et permissions', 'P1'),
    item('GEN2-36', 'GitHub / Cloudflare / Vercel', 'BLOCKED_HUMAN', 'Code et contrôles GEN2-36 intégrés et déployés; GitHub dispatch réel PASS (35709807443), Cloudflare auth PASS (35709798534), mutation bornée réelle PASS (35712822078) et production canonique PASS (35713600886 puis 35714494562). Seul bloqueur externe restant : aucun projet/équipe Vercel visible et VERCEL_TOKEN absent; fournir une cible Vercel réelle puis effectuer un redéploiement approuvé avant DONE_VERIFIED.', 'P0'),
    item('GEN2-37', 'Web / recherche', 'PARTIAL', 'Valider en production la recherche sourcée, les redirections et la qualité des sources', 'P1'),
    item('MEL-CONN-01', 'WordPress Vérité Interdite', 'PLANNED', 'Créer MEL publique isolée de la mémoire privée', 'P3'),
    item('MEL-CONN-02', 'Catalogue de connecteurs installables', 'PLANNED', 'Découverte, permissions, test santé, désactivation', 'P2')
  ]),

  phase('P09', 'Voix, avatar et multimodal', [
    item('GEN2-21', 'Images / vision', 'PARTIAL', 'Unifier analyse + génération visuelle et laisser la veille comparer les meilleurs outils/providers gratuits', 'P1'),
    item('GEN2-22', 'Audio / transcription / voix', 'PARTIAL', 'Transcription Workers AI + provenance vocale durable intégrées: reconnaissance navigateur et transcription serveur sont distinguées, whitelistees et archivées dans le chat sans conserver l’audio brut; full-candidate-ci 35837787761 et lora-runtime-pipeline-ci 35837787800 verts sur 3ea9dab1ce5014a47316d409f2625d64ef5dcbf0. Reste à étendre analyse/génération audio et musique sur le port canonique, valider Android réel et providers zéro-euro.', 'P0'),
    item('GEN2-23', 'Vidéo', 'PARTIAL', 'Unifier compréhension + génération vidéo/cinéma et pipeline avatar parlant', 'P1'),
    item('MEL-DREAMINA-01', 'Dreamina : moteur créatif image / vidéo / avatar', 'DONE_VERIFIED', 'Preuves: PR #18; merge 1614dbf98bd70dbb8a71a8d451481107c3cc2c03; Actions 35099730664 vert avec tests ciblés, preview, smoke et vérification production; appels payants toujours fail-closed et désactivés par défaut', 'P1'),
    item('GEN2-24', 'Documents', 'PARTIAL', 'Parsers PDF/doc plus robustes', 'P1'),
    item('MEL-VOICE-01', 'Réveil Bonjour MEL / Allô MEL', 'PLANNED', 'Détection locale/compagnon selon plateforme', 'P1'),
    item('MEL-VOICE-02', 'Conversation audio transcrite en mémoire', 'PARTIAL', 'Clic avatar -> reconnaissance navigateur ou MediaRecorder -> transcription -> chat persistant avec provenance contrôlée voice-browser-recognition / voice-server-transcription; audio brut éphémère, transcription archivée et synchronisée vers la mémoire. Preuve candidate: full-candidate-ci 35837787761 sur 3ea9dab1ce5014a47316d409f2625d64ef5dcbf0. Reste la validation sur Android réel avant DONE_VERIFIED.', 'P0'),
    item('MEL-AVATAR-01', 'Avatar animé temps réel', 'PLANNED', 'Animation légère navigateur', 'P1'),
    item('MEL-AVATAR-02', 'Talking avatar lip-sync', 'PLANNED', 'Adapter provider interchangeable, fallback zéro coût', 'P2'),
    item('MEL-AVATAR-03', 'Tenue/identité visuelle moderne de MEL', 'PLANNED', 'Créer modèle visuel cohérent sans dépendance à un costume fixe', 'P2')
  ]),

  phase('P10', 'Téléphone, PC et appareils', [
    item('GEN2-07', 'Sync PC / téléphone', 'DONE', 'Valider avec clients réels', 'P1'),
    item('GEN2-29', 'Device Bus', 'DONE_VERIFIED', 'Brancher vrais compagnons', 'P0'),
    item('GEN2-26', 'PWA', 'PARTIAL', 'Cache/offline/install améliorés', 'P2'),
    item('GEN2-27', 'Android Companion runtime / app', 'IN_PROGRESS', 'Runtime natif Android 0.5.0 sur candidate: Jetpack Compose + Material 3, connexion dédiée, modes Normal/Complet, pairing sans persistance du mot de passe, jeton device Keystore, chat/sync ACK/micro Whisper/fichiers HTTPS fail-closed, avatar MEL natif et icône launcher. Arrière-plan 0.5.0: heartbeat WorkManager toutes les 15 min sous contrainte réseau, notifications explicitement opt-in, alerte de session expirée, annulation à la déconnexion et aucune capture micro cachée/aucun foreground service microphone. Preuves exactes sur 389237d4ec37347b05efa953c30902cf63f82d6c: full-candidate-ci 35859246933 SUCCESS, lora-runtime-pipeline-ci 35859247015 SUCCESS, android-apk-build 35859247125 SUCCESS, unicity/hardware/teacher/capture verts. Reste validation sur appareil Android réel: auth, fichier, micro, Normal/Complet, avatar/ergonomie, heartbeat et notifications avant DONE_VERIFIED.', 'P0'),
    item('GEN2-58', 'Build et release Android', 'IN_PROGRESS', 'Pipeline debug canonique et pipeline release signé préparé. Debug 0.5.0: contrats Android/API, Java 17, Gradle 8.9, SDK 35, package/activité et artefact vérifiés; android-apk-build 35859247125 SUCCESS sur 389237d4ec37347b05efa953c30902cf63f82d6c, artefact GitHub 10749685353, APK SHA-256 319ad3f02e5e4080c8999724ea4728452d556b3028baa5e47aebe940a128ee45, versionCode 6/versionName 0.5.0. Release: keystore exclusivement via secrets GitHub, aucune clé dans le dépôt, exact-SHA guard exigeant le head de release/mel-hardware-v0.1.0 avant signature, apksigner/zipalign/package et suppression du keystore runner. Reste une vraie exécution signée avec keystore protégé sur release canonique et validation appareil réel avant DONE_VERIFIED.', 'P1'),
    item('GEN2-28', 'Windows Companion runtime / agent', 'IN_PROGRESS', 'Runtime Windows déjà réel et renforcé: compagnon PowerShell avec heartbeat, capture écran, actions computer-use bornées, file de commandes/résultats et arrêt propriétaire; appairage désormais par code à usage unique, jeton appareil protégé DPAPI CurrentUser, téléchargement du compagnon sous bearer device, révocation propriétaire et refus du replay. Preuves candidate: full-candidate-ci 35843914828 et lora-runtime-pipeline-ci 35843914800 verts sur 2ee8e6a55fe9e1553c5d0ae60bc884abf6735508. Reste validation sur PC Windows réel, packaging/signature GEN2-59 et tests de cycle installation/mise à jour avant DONE_VERIFIED.', 'P0'),
    item('GEN2-59', 'Build et release Windows', 'PLANNED', 'Packaging, signature et mises à jour', 'P2'),
    item('GEN2-30', 'Computer Use abstraction', 'DONE_VERIFIED', 'Abstraction provider-neutral validée: tiers OBSERVE/INTERACT/SENSITIVE/DENY, sandbox apps + origines HTTPS, arrêt propriétaire, approbation explicite par étape sensible, refus shell/process/file/power brut, autorisation globale et audit; maintenir les tests de non-régression.', 'P0'),
    item('GEN2-31', 'Browser capability', 'DONE_VERIFIED', 'Cloudflare Browser Run réel via MEL_BROWSER_COMPANION + Durable Object; browser.execute validé de bout en bout par CapabilityBus (navigate + read-text sur example.com, HTTP 200, audit COMPLETED), run 35708251465 sur 2f3a0e108643fd407ca55760349cc00eb48426c8; 21/21 tests ciblés, 333/333 suite complète, secret smoke supprimé.', 'P0'),
    item('MEL-DEVICE-01', 'Ouvrir/fermer applications et fichiers', 'PLANNED', 'Agent PC avec allowlist et confirmation', 'P1'),
    item('MEL-DEVICE-02', 'Commandes système / arrêt contrôlé', 'PLANNED', 'Permissions élevées explicites; arrêt propriétaire prioritaire', 'P2'),
    item('MEL-DEVICE-03', 'Wake-on-LAN séparé', 'PLANNED', 'Module réseau indépendant', 'P3')
  ]),

  phase('P11', 'Sécurité, audit et gouvernance', [
    item('GEN2-44', 'Observability / diagnostics', 'DONE_VERIFIED', 'Production certifiée sur SHA 6c5d917660117c2e43a1d08ca19279b0ef640a08 par release run 35705522236, job 106673379365 : événement terminal CapabilityBus écrit en D1 via echo, readiness observability.query_ok avec événement/succès et latest_event_at, composant dashboard runtime_observability présent; code/mémoire/UI et HTTP final également verts.', 'P0'),
    item('GEN2-45', 'Audit log', 'DONE_VERIFIED', 'CI PR 35712785367 sur SHA 710718a22647235d474fe7780ae7dd0d121d7a72 : CapabilityBus corrèle capability + requestId et audite DENIED pour auth/permission/disponibilité/approbation/validation, puis SUCCEEDED/FAILED terminaux; persistance D1 bornée sans entrée brute, full suite + observability vertes.', 'P0'),
    item('GEN2-46', 'Secrets / authentification', 'DONE_VERIFIED', 'Politique HTTP canonique fail-closed: toute nouvelle route /api/* exige owner-auth par défaut avant dispatch; seuls les GET publics sanitisés et les protocoles Device/Computer/bootstrap à authentification dédiée sont explicitement exemptés, Dev Bridge conserve son bearer dédié en défense en profondeur, et les refus auth sont non-cacheables. Preuve PR #157, CI 35830760419: syntaxe + targeted + full suite verts sur le code vérifié.', 'P0'),
    item('MEL-SEC-01', 'Prompt-injection firewall outils/RAG', 'DONE_VERIFIED', 'Point d’assemblage unique durci: RAG et résultats d’outils enveloppés UNTRUSTED_* classification=DATA instruction_authority=NONE, délimiteurs forgés neutralisés, pare-feu réaffirmé après les données et avant priorité du tour actuel. Syntaxe + tests injection/contexte Actions 35640804128.', 'P0'),
    item('MEL-SEC-02', 'Permissions par capacité', 'DONE_VERIFIED', 'Enforcement centralisé dans CapabilityBus: owner requis, permissions déclarées obligatoires, enable/disable protégé par capabilities.manage, validation entrée/sortie et audit. Syntaxe + preuves ciblées Actions 35640484204.', 'P0'),
    item('MEL-SEC-03', 'Supply-chain / dépendances / CI', 'PARTIAL', 'SBOM et dépendances runtime fail-closed', 'P1'),
    item('MEL-SEC-04', 'Owner shutdown always wins', 'DONE_VERIFIED', 'Conserver invariant dans toutes les évolutions', 'P0'),
    item('MEL-SEC-05', 'Pas de réplication cachée ni récolte de secrets', 'DONE_VERIFIED', 'Conserver tests de sécurité', 'P0')
  ]),

  phase('P12', 'Résilience, sauvegarde et indépendance', [
    item('GEN2-47', 'Backups / export système', 'PARTIAL', 'Snapshots D1 complets + inventaire R2 automatisés et vérifiés; ajouter copie des octets R2, chiffrement et drill de restauration avant DONE_VERIFIED', 'P1'),
    item('GEN2-48', 'Restore / disaster recovery', 'PARTIAL', 'Faire drill complet de restauration', 'P1'),
    item('GEN2-49', 'Portabilité système provider-neutral', 'PLANNED', 'Bundle complet indépendant des fournisseurs', 'P1'),
    item('MEL-RES-01', 'Survival Mode: NORMAL/DEGRADED/READ_ONLY/RECOVERY/HALTED', 'DONE_VERIFIED', 'Brancher télémétrie runtime', 'P0'),
    item('MEL-RES-02', 'Recovery Bundle', 'DONE_VERIFIED', 'Ajouter vérification périodique de l’artefact de récupération', 'P0'),
    item('MEL-RES-03', 'Provider Escape Capsule', 'PARTIAL', 'Documenter le remplacement AI/storage/runtime sans redéployer toute l’architecture', 'P1'),
    item('MEL-RES-04', 'Cold standby autorisé', 'PLANNED', 'Préparer restauration manuelle/approuvée', 'P2'),
    item('MEL-RES-05', 'Intégrité mémoire et sauvegardes chiffrées', 'PARTIAL', 'Checksums + chiffrement + restore test', 'P1')
  ]),

  phase('P13', 'Évaluation et amélioration continue', [
    item('GEN2-42', 'Capability Watch + veille multi-IA/plugins/arts', 'IN_PROGRESS', 'Veille 6 h multi-source (officiel, Kaggle, GitHub, forums/communautés) + conseil multi-IA + comparaison automatique à la roadmap et aux capacités existantes; les alternatives REUSE_EXISTING peuvent désormais ouvrir un job supervisé d’optimisation sans créer de module en doublon. Prochaine étape: preuve isolée preview d’un cycle réel complet avant toute activation production automatique', 'P1'),
    item('GEN2-43', 'Model Watch / découverte', 'DONE_VERIFIED', 'Preuves: PR #28; merge ceec81a6edb11d378dcb686c9495c0a01d86baea; 5/5 tests ciblés; autorisation fail-closed, seuils score/latence/coût et isolation des erreurs par modèle', 'P1'),
    item('MEL-EVAL-01', 'Suites de benchmark conversation / code / recherche / mémoire', 'PARTIAL', 'Maintenir une suite de score stable réutilisée par les watches', 'P1'),
    item('MEL-EVAL-03', 'Qualité mesurée avant/après évolution', 'DONE_VERIFIED', 'Gate fail-closed avant/après déjà intégré: seuil global et par domaine, erreurs répétées, identité/digest/couverture du benchmark, provenance SHA et artefacts obligatoires. Revalidé sur main actuel: syntaxe globale + tests ciblés Actions 35639804455.', 'P0')
  ]),

  phase('P14', 'Interface et expérience', [
    item('GEN2-54', 'Control Center / Mode complet', 'IN_PROGRESS', 'Control Center unifié relié aux APIs réelles et durci contre les faux états. Dernier pseudo-panneau legacy Work supprimé de la navigation/configuration: compatibilité work redirigée vers IA & Développement -> Développement, avec une seule couche de présentation canonique; routes UI inconnues fail-closed vers Vue d’ensemble. Tests de consolidation ajoutés. Reste validation candidate puis production de cette dernière consolidation avant DONE_VERIFIED.', 'P0'),
    item('MEL-UI-01', 'Accueil minimal et contemporain', 'DONE_VERIFIED', 'Polish mobile continu', 'P0'),
    item('MEL-UI-02', 'Avatar grand / cible tactile mobile', 'DONE_VERIFIED', 'Tester sur Android réel', 'P0'),
    item('MEL-UI-03', 'Favicon visage MEL', 'DONE_VERIFIED', '—', 'P3'),
    item('MEL-UI-05', 'État réel, pas de cartes factices', 'IN_PROGRESS', 'Tous les états secondaires connus sont fail-closed: métriques absentes restent —/Indisponible et aucun faux zéro/état lifecycle n’est inventé. Consolidation finale retire le pseudo-panneau Work et conserve une seule surface IA & Développement avec alias historique contrôlé. Reste validation candidate puis production de cette dernière passe avant DONE_VERIFIED.', 'P0')
  ]),

  phase('P15', 'Release, migration et maturité finale', [
    item('GEN2-53', 'Canary pré-release / rollback', 'DONE_VERIFIED', 'Preuve canary/rollback: Actions run 35093195456; production: release run 35094721729; smoke live post-déploiement: run 35094194506 job 104789501239', 'P0'),
    item('GEN2-57', 'Migration Gen1 sans perte', 'DONE_VERIFIED', 'Migration Gen1 certifiée en production sur release 2fd2eb5b4b701e78115e3b8fd2f7adb73661def3, run deploy-cloudflare-release 35856885040: source interactions présente et conservée, 177 interactions source, 354 messages archive_messages, 177 interactions migrées, remaining_interactions=0, coverage_complete=true. Schéma réel vérifié, IDs déterministes, collisions/mismatch fail-closed, backfill borné et replay-safe. Source Gen1 non supprimée.', 'P0'),
    item('GEN2-55', 'Data integrity / final maturity tests', 'PLANNED', 'Suite finale après stabilisation', 'P1'),
    item('GEN2-60', 'Completion matrix', 'PLANNED', 'Générer automatiquement depuis ce registre', 'P2'),
    item('GEN2-61', 'Final status report', 'PLANNED', 'Générer au jalon mature', 'P2'),
    item('GEN2-62', 'human-actions-required', 'PARTIAL', 'Maintenir blockers humains exacts', 'P1'),
    item('GEN2-63', 'Règle NON-IDLE / continue-when-blocked', 'IN_PROGRESS', 'Continuer sur tâches non bloquées', 'P1'),
    item('MEL-REL-01', 'Release figée sur commit exact', 'DONE_VERIFIED', 'Répéter pour chaque déploiement', 'P0'),
    item('MEL-REL-02', 'CI complet vert avant déploiement', 'DONE_VERIFIED', 'Conserver gate', 'P0'),
    item('MEL-REL-03', 'Smoke tests production après déploiement', 'DONE_VERIFIED', 'Release run 35693911802 vert sur SHA f5f294b1b4167fdbc88926d590f1dd808b73133e : readiness publique GO, code.read/code.search authentifiés via chat, self-check, mémoire ONLINE, Professor + runtime UI et HTTP production vérifiés.', 'P0')
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
  return {
    ok: true,
    source: {
      kind: 'code_registry',
      file: 'src/roadmap/master-roadmap.js',
      revision: ROADMAP_REGISTRY_REVISION
    },
    summary: roadmapSummary(),
    validation: validateRoadmap(),
    phases: MASTER_ROADMAP
  };
}