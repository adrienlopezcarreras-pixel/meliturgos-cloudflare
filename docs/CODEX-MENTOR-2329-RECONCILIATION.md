# Réconciliation de la PR Mentor #2329

La PR #2329 existait déjà pour supprimer les formats contradictoires du prompt Mentor et limiter les modifications aux extraits inspectés. Elle n'était pas fusionnée et son moteur était en conflit avec main f5d5126cec5fd619d3ac9110e4cef552ded7656e. Aucune seconde PR de prompts n'est créée.

Le merge de synchronisation préserve les commits originaux de #2329 et les protections arrivées depuis dans main : fichiers complets conservés pour l'application des edits, budgets distincts cloud/Companion, mémoire bornée, appels initiaux et réparation avec délais, repli de fournisseurs, consentement requis pour le PC, provenance zéro coût et refus des imports/chemins/extraits invalides. Les instructions de génération et réparation de #2329 restent le chemin unique. Le formateur d'extraits respecte aussi l'extrait calculé pour chaque fournisseur : il ne réinjecte pas le fichier complet dans un prompt limité.

MENTOR_UNINSPECTED_PATH reste un refus, MENTOR_INVALID_CHANGE reste un refus, et un timeout n'est pas une proposition. Sans proposition entièrement valide, MENTOR_NO_VALID_CODE_PROPOSAL reste une erreur et aucun paquet n'est accepté. Teacher, SHA candidat, tests demandés et autorisation de release sont inchangés.

Validation de réconciliation : 52 tests locaux réussis dans mentor-engine, autonomy-bridge-preparer, mentor-runner, mentor-companion-provider, mentor-autonomy-read-fail-closed et autonomy-completion-mentor-learning. Ils couvrent les extraits bornés, la conservation de la fin des fichiers de plus de 100 000 caractères, les edits uniques, les chemins/imports refusés, la réparation structurée, les timeouts même sans coopération AbortSignal et le repli cloud. Les tests utilisent des fournisseurs contrôlés : aucune réponse réelle d'un fournisseur de production n'est revendiquée.

Les captures propriétaire après le reset indiquent MEL-FOUNDER-02 TEACHER_APPROVED avec des propositions invalides et des délais dépassés. Le PC désormais en ligne ne lève ni les refus du Mentor ni les garde-fous cloud. Aucune mission existante, aucun bail et aucune donnée de production ne sont modifiés par cette réconciliation. La réception d'un vrai paquet Mentor, son application candidate, sa CI et le Council de production restent à prouver après revue et déploiement séparément autorisés.

Ce travail de réconciliation est attribué à Codex, en complément de la correction ChatGPT-GPT6 originale ; il ne constitue pas du code généré par MEL. Ni main ni la release ne sont fusionnées/déployées automatiquement. XP MEL : NON.
