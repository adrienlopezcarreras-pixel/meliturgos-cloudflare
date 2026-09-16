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

Fin de lot :
- laisse un handoff avec item, statut, SHA exact, fichiers, preuves/tests, blockers et prochaine action ;
- si tu as appris une nouvelle règle réutilisable, transmets-la à MEL via .agents/XP_PROTOCOL.md ;
- si la leçon existe déjà, n’ajoute aucun doublon.
```

## Version machine

Le même contrat est exposé par `src/coordination/multi-ai-protocol.js` via `MULTI_AI_PROTOCOL`, `buildMultiPageResumePrompt()`, `createMultiAiHandoff()` et `validateMultiAiHandoff()`.
