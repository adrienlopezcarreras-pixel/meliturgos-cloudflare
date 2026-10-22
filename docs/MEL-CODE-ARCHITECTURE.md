# MEL CODE — architecture zero coût additionnel (proposition de conception)

**État : DRAFT, non implémenté, non déployé.** Rédaction [ChatGPT-GPT6], 2026-10-22.
**Base inspectée :** candidate/mel-clean-autonomy au SHA bca69cea5d4afdccf90dace6eeb4a3da05e43937.
**Interdictions de cette phase :** aucune mutation de main, de production, de D1, des secrets, du Companion, de MAX ou des workflows actifs. Pas de fusion automatique. Ne pas présenter une spécification comme une fonction opérationnelle.

## 1. Invariant majeur : MEL reste un assistant généraliste

MEL CODE est une **capacité spécialisée**, pas un second assistant ni un remplacement du chat.
La conversation ordinaire (GENERAL, REASONING, mémoire, outils, voix, projets, WORK) conserve son routeur, ses budgets de délai et ses fonctions existantes. Aucun lancement de tâche code sur une simple occurrence textuelle de « code » dans un message : une intention explicite et les permissions existantes sont nécessaires.
Une mission CODE longue est persistée et suivie séparément de la réponse du chat, qui doit rester réactif. Aucune compétition de leases entre chat et programmation.
Les quotas et fournisseurs du développement ne doivent pas vider silencieusement les ressources réservées au dialogue.

## 2. Inventaire vérifié et décisions de réutilisation

| Fonction | Existant constaté | Décision |
| --- | --- | --- |
| Choix de modèles général/code | src/models/ModelRegistry.js, ModelRouter.js (capacité CODE, tâche GENERAL) | **Réutiliser**, préserver les deux rôles |
| Preuve de coût nul | src/augmentio/zero-euro-governor.js, default-pool.js, workers-ai-zero-cost-proof.js | **Réutiliser** le fail-closed, ne jamais déduire gratuité de cost=0 seul |
| Mentor et réparations de propositions | src/learning/mentor-engine.js, mentor-code-contract.js | **Étendre**, pas de second mentor ; conserver validateurs AST et extraits bornés |
| Teacher et approbation corrélée | src/teachers/runtime-teacher-bridge.js, teacher-handoff-packet.js | **Réutiliser** |
| Planification/inspection | src/evolution/autonomy-implementation-planner.js | **Réutiliser**, ne pas élargir les fichiers non inspectés |
| Jobs/concurrence/états | src/dev/d1-dev-job-repository.js, src/dev/dev-job-service.js, src/evolution/autonomy-runtime*.js | **Réutiliser** les transitions, leases, CAS et preuves existantes |
| Exécution et CI | src/dev/bridge-job-runner.js, scripts/mel-dev-bridge.mjs, scripts/github-action-relay-runner.mjs, cloud bridge | **Réutiliser** GitHub et sandbox candidates ; Companion facultatif |
| Reconciliation CI | src/teachers/github-completion-reconciler.js | **Réutiliser**, preuve exacte SHA / run / branche |
| Conseil | workflow Council existant | **Réutiliser**, pas d'auto-approbation |

Les port/adapters "DevAgent" dans src/dev/dev-agent.js sont un contrat partiellement scaffoldé : ne pas les déclarer pleinement opérationnels. Le document docs/ARCHITECTURE-ACTIVE.md décrit certains modules comme partiels/scaffoldés ; toute implémentation doit vérifier le chemin runtime réellement chargé par wrangler.jsonc.

## 3. Flux cible sans doublon

1. L'utilisateur parle à MEL. La voie chat GENERAL traite et répond normalement.
2. Une demande de développement explicitement autorisée crée ou réutilise un job dans la file évolutive existante ; dédoublonner avec travaux et PR existants.
3. MAX qualifie l'objectif, y compris décision « déjà implémenté » si preuve fonctionnelle indépendante.
4. Teacher/inspection lisent les fichiers à un SHA épinglé ; Council donne les autorisations requises.
5. Mentor CODE choisit des fournisseurs éligibles et produit **uniquement** des edits ciblés, bornés, applicables aux sources réellement inspectées.
6. L'exécuteur déjà autorisé applique ces edits dans un environnement isolé, sans secrets de production.
7. Tests et CI ; si rouge, retour au réparateur existant avec diagnostics, limites de tentatives/temps et nouveau SHA approuvé si nécessaire.
8. Conseil, PR candidate, publication et release **selon les gates existantes** ; jamais de publication directe sur main.
9. DONE_VERIFIED uniquement à partir de preuve suffisante associée au bon SHA et au bon environnement.

Aucun nouveau scheduler, state machine, registre D1, Council parallèle ni pipeline GitHub concurrent. Un futur composant "MEL CODE" pourra être une façade légère/nom de capacité au-dessus de la chaîne existante, pas un service autonome supplémentaire.

## 4. Sélection du moteur IA, zéro euro additionnel

- Utiliser d'abord le ProviderPool de src/augmentio et les fournisseurs CODE **effectivement disponibles et autorisés** par ZeroEuroGovernor. Les registres de modèles ne prouvent ni quota disponible ni absence de frais.
- Les modèles dans ModelRegistry sont des candidats, **pas une liste de modèles opérationnels**.
- Le governor exige provenance de coût vérifiée, autorisation liée à l'adapter, frais additionnels exactement nuls ; aucune désactivation de ce contrôle pour « améliorer la disponibilité ».
- Utiliser les benchmarks locaux/CI sur tâches de code, tests et historique réel de résultats pour ajuster les priorités ; mesurer succès CI réel, régressions, temps, tentatives, qualité des edits. Ne pas sacrifier la fiabilité du chat GENERAL au classement du CODE.
- Fallback borné entre modèles éligibles. Si rien n'est disponible : état BLOCKED_PROVIDER_ZERO_COST / équivalent état existant, preuve de blocage, reprise différée contrôlée, **aucun succès artificiel**.
- Ollama / GPU / Companion locaux sont **facultatifs** et exigent consentement explicite, prévalidation du matériel et coût additionnel compatible avec la politique. Cloud prioritaire ; PC absent ne force pas le fallback local.
- Aucune utilisation détournée des comptes ChatGPT, Claude ou Grok comme API gratuite. Aucun contournement de quota ou de conditions d'utilisation.
- Pas de nouveau LLM entraîné ni de nouvelle LoRA avant preuve d'une lacune mesurable justifiant cette dépense de ressources.

## 5. Contrats et séparation des responsabilités

**Voie conversationnelle inchangée :** src/models/ModelRouter.js conserve GENERAL et les deadlines CHAT. Les demandes CODE doivent créer un job asynchrone explicite ; le résultat est consultable via le flux existant, non injecté comme une exécution longue synchrone dans le chat.

**Contrat de tâche CODE :** id stable, objectif, propriétaire/permissions, branche et SHA approuvés, périmètre de fichiers, preuves Teacher/Council, budget (zéro coût ajouté), compteur de tentatives, timestamps/leases, progression, références CI et artifacts. Réutiliser le schéma disponible et ne migrer D1 qu'en présence d'un champ indispensable documenté.

**Contrat de proposition :** source inspection ancrée au SHA, liste explicite d'edits, tests autorisés, risques, provenance fournisseur, échec structuré. Le modèle ne peut pas déclarer lui-même que son edit a été appliqué ou testé. Approbation Council indépendante.

**Contrat d'exécution :** checkout exact SHA ; fichiers vérifiés ; contrôle anti-stub/exports/classes ; commandes bornées/allowlist ; worktree isolé ; diff --check ; tests appropriés ; refuse une candidate déplacée ; push jamais forcé ; preuve CI exacte. Code généré considéré non fiable, aucune exposition des secrets.

**Récupération :** pas de retry infini ni loop report/analyse ; borne par tâche et par session ; conserver checkpoints; classer échec (quota, syntaxe, mauvais SHA, régression test, refus autorisation) ; passage au réparateur existant uniquement si récupérable.

## 6. Développement incrémental proposé (PR distinctes seulement si nécessaire)

**Phase A — preuves et régression, sans changer le runtime :**
- Établir le chemin d'invocation réel depuis le chat explicite vers le job développement et l'état D1.
- Construire tests reproductibles pour conversation intacte pendant tâche CODE, Companion absent, fournisseur gratuit absent, job concurrent, SHA périmé, VERIFY_EXISTING et interdiction d'exposition de secrets.
- Rejouer les régressions historiques MEL-FOUNDER-02 (work-dag.js) et MEL-FOUNDER-04 (autonomy-runtime.js), liées au validateur de la candidate #2354.

**Phase B — compétence CODE testée :**
- Ajouter uniquement les mécanismes manquants d'inspection multi-fichiers et edits ciblés dans le Mentor/planner existants.
- Alimenter un évaluateur de capacité CODE avec des cas reproductibles et les métriques déjà collectées.
- Préserver toutes les APIs publiques et le chat GENERAL.

**Phase C — itérations/réparations et livraison :**
- Étendre au besoin le passage de diagnostics test/CI vers REPAIR_REQUIRED, sans nouveau scheduler.
- Démontrer une PR créée par MEL elle-même avec test et CI verts ; distinguer code Codex/GPT/humain de code MEL.
- Prendre la décision Council et la publication exclusivement selon les gates existantes.

## 7. Tests d'acceptation minimaux

1. Le chat généraliste répond sans attente de la tâche CODE ; ses fonctions existantes restent accessibles.
2. Aucune tâche CODE n'est créée par simple mention du mot « code » dans une question.
3. Un fournisseur annoncé cost=0 mais sans provenance ZeroEuroGovernor est refusé.
4. Si tous les fournisseurs CODE gratuits sont indisponibles et le Companion absent, la tâche se suspend proprement avec raison traçable.
5. Deux jobs concurrents ne s'écrasent pas ; un SHA/lease obsolète est refusé.
6. Le Mentor ne peut pas supprimer un export ou remplacer un gros fichier par un stub non approuvé.
7. Une CI rouge ne devient jamais DONE_VERIFIED ; un chemin REPAIR_REQUIRED reprend par le mécanisme existant.
8. Un objectif déjà implémenté n'émet pas de faux patch et ne passe DONE_VERIFIED que sur preuve fonctionnelle.
9. Le modèle sélectionné possède une provenance et des résultats de benchmark reproductibles ; pas de faux « équivalent Codex ».
10. Une PR attribuée à MEL est réellement créée par son circuit, sur une branche candidate, avec CI verte et preuve d'origine.
11. Pas de changement dans main, production ou D1 dans les phases architecture et expérimentation.
12. Rollback limité aux artefacts candidates, aucun rollback de production implicite.

## 8. État, dépendances et condition préalable

- La PR #2354 (candidate safety) a été intégrée à candidate/mel-clean-autonomy au SHA bca69cea...
- La PR de promotion #2355 est distincte, toujours à examiner ; **elle ne doit pas incorporer cette spécification non approuvée**.
- La PR #2329 (Mentor) reste ouverte vers main à ce contrôle : analyser l'ascendance pour éviter le doublon.
- La disponibilité réelle des modèles, la qualité de la génération autonome et la capacité à publier une PR ne sont **pas encore prouvées** par ce document.
- Ne jamais fusionner un document de conception vers main comme si cela constituait une implémentation MEL CODE.

## 9. Ordre d'implémentation

1. Audit incrémental précis et inventaire de tests déjà présents.
2. Tests anti-régression et non-interférence du chat.
3. Développement minimal uniquement sur les lacunes révélées.
4. Test isolé de bout en bout, preuve exacte SHA.
5. Revue Council, PR et promotion contrôlée, sur décision explicite.

**Décision :** conserver MEL généraliste en intégralité et construire MEL CODE par extension des capacités existantes ; zéro frais additionnel prouvé ou suspension explicite.
