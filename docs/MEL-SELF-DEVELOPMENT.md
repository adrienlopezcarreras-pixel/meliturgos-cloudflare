# MEL self-development bridge

## Canonical collaboration loop

MEL développe uniquement sur `candidate/augmentio-core`. ChatGPT Teacher peut lire, critiquer et corriger ce travail. La production reste une étape séparée, après preuves et autorisation propriétaire.

1. **Comprendre** — reformuler le but et les critères de réussite sans l'élargir.
2. **State of play / Council** — interroger plusieurs perspectives quand le préflight l'exige; conserver provenance et limites.
3. **Inspecter** — lire/rechercher le code réel avant de proposer un changement. Ne jamais raisonner depuis une version supposée.
4. **Plan minimal** — identifier les fichiers strictement nécessaires, les risques et le test qui prouvera le résultat.
5. **Candidate only** — écrire uniquement sur la branche candidate.
6. **Tests** — syntaxe + tests ciblés + suite complète selon le changement.
7. **Teacher review** — fournir à ChatGPT Teacher : objectif, SHA de départ, diff, tests, résultats, incertitudes.
8. **Correction** — appliquer les remarques justifiées, ajouter une leçon généralisable dans `docs/MEL-TEACHER-LESSONS.md`.
9. **Preuve** — ne déclarer terminé que si le résultat est observable et les tests verts.
10. **Production** — jamais automatique depuis MEL; promotion séparée avec validation propriétaire.

## Première mission réelle — mémoire/conversation

Inspecter `src/api/native-chat.js`, `src/conversations/`, `src/conversations/intercept.js` et `src/pages/mvp-behavior-enhancer.js`.

Objectif : ne plus concaténer le contenu des fichiers dans le texte utilisateur. Introduire un contrat séparé `text` / `attachments` / `file_context`, provenance `chat|voice|file|chat+file`, archivage du texte réel et métadonnées de pièces jointes, avec tests de non-pollution mémoire et limite de contexte.

Livrable attendu : diagnostic court + patch candidate minimal + tests verts + paquet Teacher.

## Deuxième mission réelle — continuité autonome

Prendre un seul écart P0/P1 de `MEL-TOMORROW-READY-2026-09-12.md`, le préparer via Council, l'implémenter sur candidate, reprendre correctement après interruption si nécessaire, puis fournir preuves de terminaison.

## Invariants

- coût ajouté : zéro; tout coût inconnu est refusé;
- aucun secret dans prompts, logs, commits ou artefacts;
- aucune suppression d'une fonction active sans inventaire et preuve de remplacement;
- aucun déploiement production autonome;
- le shutdown propriétaire et les permissions restent prioritaires;
- `ANSWER_FIRST` concerne la qualité de réponse, pas le contournement des protections nécessaires contre un dommage grave.

## Pont local optionnel

Pour un poste local autorisé :
1. `cd ~/meliturgos-cloudflare && export MEL_DEV_BRIDGE_TOKEN='<local-secret>'`
2. `npm run mel:dev-bridge`
3. ouvrir `/professor`.

Le bridge local reste lié à `127.0.0.1`, refuse les chemins secrets et les commandes arbitraires.
