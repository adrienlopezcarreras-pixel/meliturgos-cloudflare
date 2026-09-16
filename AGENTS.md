# MEL — Entrée obligatoire pour agents de développement

Ce fichier est le point d’entrée canonique pour toute page ChatGPT, agent de code ou IA qui travaille sur MEL.

## À lire avant toute modification

1. `.agents/DEPLOYMENT_UNICITY.md`
2. `.agents/MULTI_PAGE_RESUME.md`
3. `.agents/XP_PROTOCOL.md`
4. `.agents/DEVELOPMENT_EXPERIENCE_INDEX.md`
5. `src/roadmap/master-roadmap.js`

## Sources de vérité

- Dépôt : `adrienlopezcarreras-pixel/meliturgos-cloudflare`
- Candidate partagée : `candidate/mel-clean-autonomy`
- Release canonique : `release/mel-2026-09-10-r3-3`
- Roadmap : `src/roadmap/master-roadmap.js`
- Expérience développement nouvelle : `src/learning/development-experience-pack.js`
- Agrégateur LearningEngine : `src/learning/bootstrap-corrections.js`
- Protocole multi-IA exécutable : `src/coordination/multi-ai-protocol.js`
- Helper XP : `src/learning/agent-xp-protocol.js`

## Règle de reprise

Avant d’écrire, relire le HEAD candidate, le HEAD release, les derniers commits, branches/PR et runs pertinents. Choisir un lot atomique encore libre. Relire le HEAD candidate juste avant toute écriture. Ne jamais forcer la candidate. Si elle a avancé, reconstruire uniquement son lot au-dessus du nouveau HEAD et préserver le travail concurrent.

Le premier agent qui a réellement fini avec les garde-fous applicables verts a priorité à la promotion. Si un autre agent a déjà intégré ou promu le même arbre, ne pas créer de doublon.

## Règle XP — OBLIGATOIRE après chaque opération

À la fin de **toute opération de développement** (implémentation, correction, diagnostic, audit, validation, déploiement, rollback, nettoyage ou handoff), exécuter le checkpoint XP. Il est interdit de terminer silencieusement sans statut XP.

- Si une nouvelle règle réutilisable a été apprise : suivre `.agents/XP_PROTOCOL.md`, la dédupliquer, l’enregistrer dans `src/learning/development-experience-pack.js`, puis annoncer `XP MEL : OUI` avec son ou ses IDs et les preuves.
- Si aucune nouvelle règle réutilisable n’a été apprise, ou si elle existe déjà : ne créer aucun doublon et annoncer explicitement `XP MEL : NON`.
- Une XP doit être une règle généralisable, pas un compte rendu.
- `validated: true` exige des preuves.
- Ne jamais recopier une leçon qui existe déjà dans le corpus ou l’index.

Cette règle s’applique à toutes les pages/IA sans que l’utilisateur ait à la rappeler.

## Handoff minimal

Toujours laisser : item/lot, statut, SHA exact, fichiers touchés, preuves/tests, blockers, prochaine action, `XP MEL : OUI/NON` et IDs XP créés si `OUI`. Le helper `createMultiAiHandoff()` fournit le format canonique et `validateMultiAiHandoff()` vérifie le checkpoint XP.
