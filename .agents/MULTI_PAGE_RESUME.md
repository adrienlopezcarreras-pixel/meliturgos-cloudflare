# MEL — Prompt canonique de reprise multi-pages

Ce document évite de reconstituer les règles de coordination à chaque nouvelle page.

## Prompt à réutiliser

```text
Tu vas travailler avec d’autres pages/IA sur MEL et continuer la roadmap sans collision.

Dépôt : adrienlopezcarreras-pixel/meliturgos-cloudflare
Candidate canonique partagée : candidate/mel-clean-autonomy
Release canonique : release/mel-2026-09-10-r3-3
Roadmap source : src/roadmap/master-roadmap.js
Production Professor : https://meliturgos.adrien-lopezcarreras.workers.dev/professor

Avant toute écriture :
- relis `.agents/MEL_OPERATING_MANUAL.md` et l’expérience pertinente ;
- relis le HEAD actuel de la candidate et de la release ;
- inspecte les derniers commits, branches, PR et workflows/runs pertinents ;
- relis la roadmap source ;
- vérifie que le lot prévu est encore libre, utile et non déjà implémenté par une autre page ;
- choisis un lot atomique et non chevauchant.

Pendant le travail :
- évite toute collision de fichiers/ressources partagés ;
- n’empile pas de versions ou de commits inutiles ;
- ne force jamais candidate/mel-clean-autonomy ;
- juste avant d’écrire, relis encore son HEAD ;
- si une autre page l’a avancé, reconstruis uniquement ton lot sur le nouveau HEAD et conserve tout le travail plus récent ;
- si une autre page a déjà corrigé/implémenté la même cause, ne duplique pas son patch ;
- mets à jour la source de vérité dans le même lot quand l’état roadmap change.

Validation :
- exécute les tests ciblés du lot ;
- exige la full candidate CI verte sur le SHA exact ;
- exige le smoke Teacher/runtime vert sur ce même SHA ;
- exige la preview isolée verte quand le workflow s’applique ;
- n’interprète jamais un smoke étroit comme remplacement de la CI complète.

Déploiement :
- celui qui finit réellement avec tous les garde-fous verts a priorité au déploiement ;
- relis la release immédiatement avant promotion ;
- promeus uniquement l’arbre exact de la candidate validée ;
- si une autre page a déjà promu le même arbre, ne republie rien ;
- vérifie le workflow de déploiement puis un smoke live post-déploiement ;
- conserve les IDs de runs/jobs comme preuve.

Fin de chaque passage — NETTOYAGE / UNIFICATION / RÉCONCILIATION / ADAPTATION OBLIGATOIRES :
- relis l’expérience pertinente ;
- nettoie tout doublon, wrapper, chemin mort ou comportement remplacé que ton passage rend obsolète ;
- unifie chaque responsabilité autour d’une seule source de vérité et d’un seul chemin runtime ;
- réconcilie branches, roadmap, tests et preuves ; aucune branche non exemptée ne doit rester divergente ;
- adapte tests, documentation, UI, prompts et règles au comportement réellement conservé ;
- si ces points ne sont pas fermés, garde le statut IN_PROGRESS.

Fin de toute opération — CHECKPOINT XP OBLIGATOIRE :
- laisse un handoff avec item, statut, SHA exact, fichiers, preuves/tests, blockers et prochaine action ;
- exécute toujours .agents/XP_PROTOCOL.md ;
- si une nouvelle règle réutilisable et non dupliquée a été apprise, enregistre-la et termine par `XP MEL : OUI` avec son ID et ses preuves ;
- sinon termine explicitement par `XP MEL : NON` ;
- ne termine jamais une opération sans statut XP.
```

## Version machine

Le même contrat est exposé par `src/coordination/multi-ai-protocol.js` via `MULTI_AI_PROTOCOL`, `buildMultiPageResumePrompt()`, `createMultiAiHandoff()` et `validateMultiAiHandoff()`.
