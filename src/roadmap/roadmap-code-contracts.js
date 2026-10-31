// Every scheduled roadmap objective is a bounded software deliverable, never a declaration.
export const ROADMAP_CODE_CONTRACT_REVISION = '2026-10-29-code-v1';
export const ROADMAP_CODE_CONTRACTS = Object.freeze({
  "MEL-AUDIT-02": {
    "title": "Automatiser le rapport hebdomadaire du développement MAX",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/diagnostics/development-audit.js"
    ],
    "test_paths": [
      "tests/development-audit.test.mjs"
    ],
    "acceptance": [
      "Un jeu de missions livrées, bloquées et répétées produit un rapport persisté et un constat dédupliqué, sans lancer de réparation hors priorité roadmap."
    ],
    "max_attempts": 3
  },
  "MEL-AUDIT-03": {
    "title": "Raccorder les résultats chat, veille et WORK au rapport de domaine",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/diagnostics/domain-audit.js"
    ],
    "test_paths": [
      "tests/domain-audit.test.mjs"
    ],
    "acceptance": [
      "Des événements hors sujet, une veille expirée et une livraison WORK interrompue donnent trois constats corrélés aux preuves durables."
    ],
    "max_attempts": 3
  },
  "MEL-AUDIT-04": {
    "title": "Automatiser la réception et la validation du rapport architecture",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/diagnostics/architecture-audit-store.js"
    ],
    "test_paths": [
      "tests/architecture-audit.test.mjs"
    ],
    "acceptance": [
      "Un rapport signé exact-SHA est enregistré une fois; une identité invalide ou un rejeu ne crée pas de constat supplémentaire."
    ],
    "max_attempts": 3
  },
  "MEL-AUDIT-05": {
    "title": "Ajouter les contrôles mémoire, sessions et sauvegardes à l’audit",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/diagnostics/domain-audit.js"
    ],
    "test_paths": [
      "tests/domain-audit.test.mjs"
    ],
    "acceptance": [
      "Une horloge injectée détecte exactement mémoire ancienne, session expirée et sauvegarde absente; un état sain ne génère pas de réparation."
    ],
    "max_attempts": 3
  },
  "MEL-AUDIT-06": {
    "title": "Coder la comparaison du catalogue de modèles et la proposition de mesure",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/workers-ai-catalog-diff.mjs"
    ],
    "test_paths": [
      "tests/development-audit.test.mjs"
    ],
    "acceptance": [
      "Un modèle nouveau et autorisé crée une proposition de benchmark idempotente; modèle payant, supprimé ou déjà mesuré reste exclu."
    ],
    "max_attempts": 3
  },
  "MEL-AUDIT-07": {
    "title": "Raccorder les constats à une réparation suivie avant et après",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/diagnostics/outcome-loop.js"
    ],
    "test_paths": [
      "tests/outcome-loop.test.mjs"
    ],
    "acceptance": [
      "Un constat persistant est lié à un seul job, puis résolu seulement si la mesure après correction confirme sa disparition."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-01": {
    "title": "Fiabiliser le dispatch et le rendu des lectures Gmail, Agenda et Drive",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/api/agent-tools.js",
      "src/api/connected-data-intent.js",
      "src/capabilities/google-workspace-capabilities.js"
    ],
    "test_paths": [
      "tests/native-chat-connected-replay.test.mjs"
    ],
    "acceptance": [
      "Les lectures Gmail, Agenda et Drive passent par les connecteurs réels ou leurs erreurs d’authentification typées; reprise sans double message ni double action et aucun JSON d’appel brut rendu."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-02": {
    "title": "Corriger la reprise durable et le verrou unique de MAX",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/evolution/autonomy-runtime-core.js",
      "src/evolution/autonomy-runtime-lease.js"
    ],
    "test_paths": [
      "tests/autonomy-runtime.test.mjs"
    ],
    "acceptance": [
      "Trois ticks reprennent le même identifiant et son étape persistée, libèrent le lease et distinguent absence de progrès de réussite."
    ],
    "revision": "2026-10-31-code-v2",
    "max_attempts": 3
  },
  "MEL-FOUNDER-03": {
    "title": "Implémenter le parcours capacité absente vers développement persistant",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/evolution/autonomy-supervisor.js",
      "src/roadmap/evolution-storage.js",
      "src/capabilities/capability-bus.js"
    ],
    "test_paths": [
      "tests/autonomy-runtime-evolution-queue-progress.test.mjs"
    ],
    "acceptance": [
      "Une capacité manquante autorisée ouvre un seul objectif reprenable; sa livraison vérifiée enregistre la compétence sur le bus canonique."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-04": {
    "title": "Rendre le Council indépendant, borné et lié au SHA",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/teachers/augmentio-council.js"
    ],
    "test_paths": [
      "tests/augmentio-council.test.mjs"
    ],
    "acceptance": [
      "Deux modèles distincts et tous les rôles requis fournissent des avis persistés; timeout, quota ou modèle unique ne produisent jamais un quorum inventé."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-05": {
    "title": "Raccorder une demande WORK gratuite à un livrable consultable",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/work/autonomous-work-loop.js",
      "src/work/work-dag.js"
    ],
    "test_paths": [
      "tests/work-dag-resume.test.mjs"
    ],
    "acceptance": [
      "Un parcours simulant les fournisseurs autorisés persiste demande, exécution, artefact et reçu; un simple enqueue ne termine pas la mission."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-06": {
    "title": "Construire les tests de protocole Companion, Android et MINI hors matériel",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/devices/mini-usb-provision.js",
      "src/portability/companion-ci-provider-adapter.js"
    ],
    "test_paths": [
      "tests/full-interface-terminal.test.mjs"
    ],
    "acceptance": [
      "Le banc logiciel couvre appairage, arrêt, autorisations et déconnexion avec doubles explicites; la recette physique reste séparée et non validée."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-07": {
    "title": "Coder une restauration isolée et sa comparaison d’intégrité",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/backup/restore-service.js"
    ],
    "test_paths": [
      "tests/restore-service.test.mjs"
    ],
    "acceptance": [
      "Une copie isolée restaure ledger, conversations et jobs puis compare nombres et empreintes; aucune écriture ne cible la D1 de production."
    ],
    "max_attempts": 3
  },
  "MEL-FOUNDER-08": {
    "title": "Coder le garde de promotion LoRA et les reçus avant/après",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/learning/lora-plan.js",
      "src/learning/operator-actions.js"
    ],
    "test_paths": [
      "tests/lora-runtime-pipeline.test.mjs"
    ],
    "acceptance": [
      "Un adaptateur incompatible, sans benchmark ou sans gain est refusé; seul un reçu exact modèle, dataset, artefact et autorisation permet une proposition de promotion."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-01": {
    "title": "Construire un inventaire exécutable des contrôles de l’interface",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/ui-production-audit.mjs"
    ],
    "test_paths": [
      "tests/ui-audit-controls.test.mjs"
    ],
    "acceptance": [
      "Chaque contrôle visible est relié à son handler, API et résultat; le navigateur produit un reçu PASS, FAIL ou BLOCKED sans mutation non autorisée."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-02": {
    "title": "Automatiser la recette navigateur des parcours chat et média",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/ui-production-audit.mjs",
      "src/pages/mel-chat-stream.js",
      "src/pages/chat-rich-renderer.js"
    ],
    "test_paths": [
      "tests/full-interface-client-runtime.test.mjs"
    ],
    "acceptance": [
      "Envoi, interruption, streaming, reprise et pièces jointes conservent mode et références; erreur et résultat sont distingués dans le rendu et l’archive."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-03": {
    "title": "Automatiser la recette du panneau d’activité et de ses commandes",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/ui-production-audit.mjs",
      "src/pages/objective-panel-runtime.js",
      "src/evolution/autonomy-activity.js"
    ],
    "test_paths": [
      "tests/autonomy-activity-detail.test.mjs"
    ],
    "acceptance": [
      "Réduire, rouvrir, défiler et actualiser ne perdent aucun événement; attente et mission active sont affichées séparément avec compteur au maximum égal à un."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-04": {
    "title": "Aligner les boutons MAX et les états UI/API durables",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/evolution/autonomy-activity.js",
      "src/evolution/autonomy-control.js"
    ],
    "test_paths": [
      "tests/autonomy-activity-detail.test.mjs"
    ],
    "acceptance": [
      "Pause, reprise, trois échecs et release conservent le contrôle propriétaire; aucun blocage externe ne devient un succès ou une seconde mission active."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-05": {
    "title": "Automatiser la recette hors ligne des contrôles matériels",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/ui-production-audit.mjs",
      "src/api/native-companion-fallback.js"
    ],
    "test_paths": [
      "tests/full-interface-computer.test.mjs"
    ],
    "acceptance": [
      "Des réponses hors ligne, permission refusée et arrêt bloquent les contrôles appropriés; aucun double logiciel n’est présenté comme un test physique."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-06": {
    "title": "Automatiser la recette des contrôles WORK, mémoire, Council, LoRA et connexions",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/ui-production-audit.mjs",
      "src/professor-live-learning-entry.js"
    ],
    "test_paths": [
      "tests/full-interface-control-surface-audit.test.mjs"
    ],
    "acceptance": [
      "Chaque action affiche le reçu API réel, traite indisponibilité et refus, et ne double ni entraînement ni mission lors d’un second clic."
    ],
    "max_attempts": 3
  },
  "MEL-UI-AUDIT-07": {
    "title": "Automatiser la régression d’accessibilité et des parcours de release",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "scripts/ui-production-audit.mjs"
    ],
    "test_paths": [
      "tests/ui-audit-controls.test.mjs"
    ],
    "acceptance": [
      "La recette vérifie clavier, focus, navigation, états disabled et restauration en desktop/mobile; le rapport est lié au SHA testé."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-01": {
    "title": "Implémenter le registre calculé des priorités du manifeste",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/roadmap/manifest-01-acceptance.js"
    ],
    "test_paths": [
      "tests/autonomy-readiness.test.mjs"
    ],
    "acceptance": [
      "Les cinq indices métier restent des données du rapport, jamais des priorités P4; les statuts sont calculés depuis les preuves et le matériel absent reste en attente externe."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-02": {
    "title": "Ajouter la recette de reprise MAX après interruption et release",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/evolution/autonomy-runtime-lease.js",
      "src/evolution/autonomy-runtime-core.js"
    ],
    "test_paths": [
      "tests/autonomy-runtime-lease.test.mjs"
    ],
    "acceptance": [
      "Une interruption entre deux écritures reprend le même checkpoint après expiration du lease, sans double étape ni nouveau job."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-03": {
    "title": "Raccorder la livraison d’une compétence au CapabilityBus unique",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/capabilities/capability-bus.js"
    ],
    "test_paths": [
      "tests/expanded-capability-bus.test.mjs"
    ],
    "acceptance": [
      "Une livraison validée enregistre un descripteur unique; échec CI, conflit de nom ou preuve absente empêchent l’enregistrement."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-04": {
    "title": "Raccorder la sauvegarde vérifiée au garde de changement risqué",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/backup/system-backup-runtime.js",
      "src/backup/restore-service.js"
    ],
    "test_paths": [
      "tests/predeploy-d1-restore-proof.test.mjs"
    ],
    "acceptance": [
      "Le changement attend le reçu de sauvegarde et de restauration isolée; reçu périmé ou comparaison divergente bloque la promotion."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-05": {
    "title": "Corriger le comptage d’appels de l’audit profond",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/capabilities/capability-audit-capability.js",
      "src/capabilities/self-audit-capability.js"
    ],
    "test_paths": [
      "tests/self-audit-deep.test.mjs"
    ],
    "acceptance": [
      "Les compteurs séparent appel exécuté, refus, échec et vérification déclarative; le mode lecture seule exclut toute mutation et tout appel payant."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-06": {
    "title": "Renforcer la recette d’époque et de non-reprise des jobs annulés",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/evolution/autonomy-job-epoch.js"
    ],
    "test_paths": [
      "tests/autonomy-runtime-epoch.test.mjs"
    ],
    "acceptance": [
      "Un reset conserve l’historique mais exclut les anciennes missions; un job annulé ne peut reprendre même si ses timestamps changent."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-07": {
    "title": "Rendre l’admission des découvertes atomique et dédupliquée",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/evaluation/capability-watch-runtime.js"
    ],
    "test_paths": [
      "tests/gen2/capability-watch.test.mjs"
    ],
    "acceptance": [
      "Deux admissions concurrentes pour la même découverte créent un seul job; la veille reste passive tant qu’une mission roadmap est disponible."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-08": {
    "title": "Coder le contrat des cinq lectures Gmail et de leurs erreurs",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/capabilities/google-workspace-capabilities.js",
      "src/connectors/google-oauth-runtime.js"
    ],
    "test_paths": [
      "tests/native-chat-connected-replay.test.mjs"
    ],
    "acceptance": [
      "Cinq messages sont rendus depuis un vrai reçu ou le code d’erreur exact est conservé; absence de compte et erreur réseau ne sont pas une lecture réussie.",
      "La version existante ne le prouve pas (Council 31/10) : ajouter dans le test de régression un reçu de cinq messages rendus et un cas absence de compte et un cas erreur réseau qui gardent leur code exact."
    ],
    "revision": "2026-10-31-code-v2",
    "verify_existing": false,
    "max_attempts": 3
  },
  "MEL-MANIFEST-09": {
    "title": "Implémenter le lien écart mesuré vers compétence versionnée",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/roadmap/evolution-storage.js"
    ],
    "test_paths": [
      "tests/autonomy-runtime-evolution-queue-progress.test.mjs"
    ],
    "acceptance": [
      "Seul un écart avec preuves ouvre une évolution idempotente; l’ancienne compétence reste active jusqu’à la livraison vérifiée de la nouvelle."
    ],
    "max_attempts": 3
  },
  "MEL-MANIFEST-10": {
    "title": "Coder l’agrégation vérifiable de l’avancement du manifeste",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/roadmap/manifest-01-acceptance.js"
    ],
    "test_paths": [
      "tests/autonomy-readiness.test.mjs"
    ],
    "acceptance": [
      "Les lignes calculées distinguent code livré, preuves d’usage et acceptation externe; une dépendance absente ou un appareil non testé interdit 100 pour cent."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-01": {
    "title": "Compléter les cas contrastifs du dispatch d’intention du chat",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/api/chat-media-intent.js"
    ],
    "test_paths": [
      "tests/chat-media-understanding.test.mjs"
    ],
    "acceptance": [
      "Demande de média, explication, négation et exemple JSON sont distingués sans appel supplémentaire; les formulations polies conservent la même intention."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-02": {
    "title": "Fiabiliser livraison, archive et relecture des médias du chat",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/api/chat-media.js",
      "src/api/generated-media.js",
      "src/pages/chat-rich-renderer.js"
    ],
    "test_paths": [
      "tests/chat-media-chain.test.mjs"
    ],
    "acceptance": [
      "Image, son, vidéo et document conservent source et référence privée après reprise; auth, Range, erreur et doublon sont testés explicitement."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-03": {
    "title": "Raccorder les preuves de lecture des octets multimédias au rendu",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/media/image-vision-runtime.js",
      "src/media/video-runtime.js"
    ],
    "test_paths": [
      "tests/chat-verified-media-context.test.mjs"
    ],
    "acceptance": [
      "Une miniature ou une URL ne vaut pas analyse complète; transcription absente laisse la vision partielle avec portée et erreur exactes."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-04": {
    "title": "Compléter le diagnostic de code par lectures fixées au SHA",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/capabilities/github-code-capabilities.js"
    ],
    "test_paths": [
      "tests/chat-code-investigation.test.mjs"
    ],
    "acceptance": [
      "Le diagnostic cite les fichiers et lignes réellement lus; recherche partielle et erreur d’accès restent explicites sans test ou déploiement inventé."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-05": {
    "title": "Corriger le classement et la couverture de recherche de symboles",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/capabilities/github-code-capabilities.js"
    ],
    "test_paths": [
      "tests/github-code-search-relevance.test.mjs"
    ],
    "acceptance": [
      "Un symbole hors documentation est retrouvé dans la borne de lecture; fichier sauté, arbre tronqué et absence partielle restent visibles."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-06": {
    "title": "Implémenter le corpus versionné et le collecteur de recette chat",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/learning/operator-actions.js"
    ],
    "test_paths": [
      "tests/operator-learning-actions.test.mjs"
    ],
    "acceptance": [
      "Chaque cas associe entrée, version, outils exécutés, résultat et métriques; fixtures, modèle réel et indisponibilité ne sont jamais mélangés dans le score."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-07": {
    "title": "Raccorder les sous-demandes et corrections utilisateur au garde qualité",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/api/response-quality.js"
    ],
    "test_paths": [
      "tests/response-quality.test.mjs"
    ],
    "acceptance": [
      "Une réponse conserve les sous-demandes et la dernière correction; faits, hypothèses, refus et sources consultées sont distingués par la recette."
    ],
    "max_attempts": 3
  },
  "MEL-CHAT-08": {
    "title": "Fiabiliser les contrats de dispatch et de rendu des outils du chat",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/capabilities/capability-bus.js",
      "src/capabilities/google-workspace-capabilities.js",
      "src/api/agent-tools.js"
    ],
    "test_paths": [
      "tests/expanded-capability-bus.test.mjs"
    ],
    "acceptance": [
      "Validation, permission, dispatch, résultat typé et rendu partagent le même identifiant; quota, timeout et rejeu ne produisent ni faux succès ni double action."
    ],
    "max_attempts": 3
  },
  "MEL-COUNCIL-OPS-01": {
    "title": "Raccorder le catalogue opérationnel au contexte des avis Council",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/council/operational-catalog.js"
    ],
    "test_paths": [
      "tests/council-operational-catalog.test.mjs"
    ],
    "acceptance": [
      "Les avis reçoivent les descripteurs réellement enregistrés avec permissions et disponibilité; un outil absent reste absent de la recommandation exécutable."
    ],
    "max_attempts": 3
  },
  "MEL-COUNCIL-OPS-02": {
    "title": "Implémenter les demandes Council typées vers les files canoniques",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/council/operational-catalog.js",
      "src/council/model-task-learning.js"
    ],
    "test_paths": [
      "tests/council-operational-catalog.test.mjs"
    ],
    "acceptance": [
      "Une recommandation LoRA, veille ou WORK devient une demande liée au parent avec clé idempotente; aucune activation ou exécution non autorisée n’est implicite."
    ],
    "max_attempts": 3
  },
  "MEL-LORA-CHAT-01": {
    "title": "Raccorder les défauts comportementaux au corpus LoRA et à sa recette",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/learning/lora-objective-observer.js",
      "src/learning/lora-canonical-dataset.js",
      "src/learning/lora-impact-benchmark.js"
    ],
    "test_paths": [
      "tests/lora-training-heartbeat.test.mjs"
    ],
    "acceptance": [
      "Défaut de code ou quota reste une réparation; seule une lacune comportementale validée crée un exemple puis une demande LoRA avec modèle et corpus compatibles."
    ],
    "max_attempts": 3
  },
  "MEL-LORA-MODE-01": {
    "title": "Fiabiliser le routage UNCENSORED et ses preuves de modèle effectif",
    "mode": "IMPLEMENT",
    "required_proof": "DIFF_TESTS_EXACT_SHA_CI",
    "code_paths": [
      "src/learning/chat-lora-binding.js"
    ],
    "test_paths": [
      "tests/chat-lora-binding.test.mjs"
    ],
    "acceptance": [
      "Adaptateur Mistral et modèle Qwen ne sont jamais confondus; absence, quota ou panne refusent explicitement le mode sans repli silencieux."
    ],
    "max_attempts": 3
  }
});

// A contract reworded after its attempts were exhausted carries its own
// revision: its old failures stop counting and it is retried, while every
// other objective (and its accepted evidence) keeps the global revision.
export function roadmapContractRevision(roadmapId) {
  return ROADMAP_CODE_CONTRACTS[roadmapId]?.revision || ROADMAP_CODE_CONTRACT_REVISION;
}

export function codeContractForRoadmapJob(job) {
  if (job?.requested_by !== 'mel-autonomy') return null;
  return ROADMAP_CODE_CONTRACTS[job?.optional_context?.roadmap_id] || null;
}

// A manifest/accounting objective must not edit its own declaration to pass.
// The approved code and regression files define the deliverable, not a status.
export function assertRoadmapCodeChanges(job, changes = []) {
  const contract = codeContractForRoadmapJob(job);
  if (!contract) return;
  if (job.optional_context?.roadmap_contract_revision !== roadmapContractRevision(job.optional_context?.roadmap_id))
    throw Object.assign(new Error('ROADMAP_CODE_CONTRACT_STALE'), { code: 'ROADMAP_CODE_CONTRACT_STALE' });
  const allowed = new Set([...contract.code_paths, ...contract.test_paths]);
  if (!Array.isArray(changes) || changes.some(change => !allowed.has(String(change?.path || ''))))
    throw Object.assign(new Error('ROADMAP_CODE_SCOPE_VIOLATION'), { code: 'ROADMAP_CODE_SCOPE_VIOLATION' });
  if (!changes.some(change => contract.code_paths.includes(change?.path))
      || !changes.some(change => contract.test_paths.includes(change?.path)))
    throw Object.assign(new Error('ROADMAP_CODE_AND_REGRESSION_REQUIRED'), { code: 'ROADMAP_CODE_AND_REGRESSION_REQUIRED' });
}
