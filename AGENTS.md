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

## Règle XP

À la fin d’un lot, demander : « ai-je appris une règle de développement réutilisable que MEL ne connaît pas encore ? »

- Si non : ne rien ajouter.
- Si oui : suivre `.agents/XP_PROTOCOL.md` et ajouter la leçon à `src/learning/development-experience-pack.js`.
- Une XP doit être une règle généralisable, pas un compte rendu.
- `validated: true` exige des preuves.
- Ne jamais recopier une leçon qui existe déjà dans le corpus ou l’index.

## Handoff minimal

Toujours laisser : item/lot, statut, SHA exact, fichiers touchés, preuves/tests, blockers, prochaine action et IDs XP créés. Le helper `createMultiAiHandoff()` fournit le format canonique.
