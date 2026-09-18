# MEL — Règle permanente d’unicité du déploiement

## Source de vérité

La seule ligne de développement exécutable et candidate déployable est `candidate/mel-clean-autonomy` jusqu’à décision explicite de remplacement.

La branche `release/mel-2026-09-10-r3-3` est uniquement un pointeur de production validé : elle peut être en retard sur la candidate, mais ne doit jamais contenir une ligne concurrente ou divergente.

`teacher-bridge/runtime` est un transport de métadonnées Teacher, jamais une branche de code exécutable.

Les branches explicitement consacrées au travail LoRA sont temporairement isolées pendant le chantier LoRA en cours. Elles ne doivent pas être absorbées ou déplacées par les autres chantiers. À la fin du chantier LoRA, elles devront à leur tour être intégrées puis retirées des lignes actives.

## Règles obligatoires pour MEL, Teacher Bridge et les agents de développement

- Une seule branche/candidate peut être considérée comme ligne de développement active à un instant donné.
- Aucun agent ne doit créer une branche concurrente pour une tâche ordinaire quand le travail peut être réalisé sur la candidate canonique.
- Une branche technique temporaire, lorsqu’elle est indispensable, doit être comparée, intégrée puis rendue ancêtre de la candidate canonique avant la fin du chantier.
- Un statut Git `diverged` entre la candidate canonique et une branche de développement active non exemptée est une anomalie à corriger, pas un état normal.
- Un seul chemin de release doit exister.
- Toute fonctionnalité utile développée sur une autre branche doit être comparée puis intégrée à la candidate canonique.
- Une branche secondaire ne doit jamais devenir une seconde version concurrente de MEL.
- Après absorption de son contenu unique, elle est considérée `RETIRED/SUPERSEDED` et ne doit plus servir de source de déploiement.
- Aucun travail validé ou nécessaire ne doit rester suspendu dans une branche oubliée.
- Avant de créer une branche, vérifier qu’un chantier équivalent n’existe pas déjà.
- Avant tout déploiement, vérifier la syntaxe, la suite de tests complète et l’intégrité de la candidate ou de la release exacte à déployer.
- Les prototypes remplacés par une implémentation plus récente ne doivent pas être réintroduits uniquement pour préserver leur ancien historique.
- Le contenu des anciennes branches absorbées reste conservé dans l’historique Git ; leur ancien arbre n’est pas réappliqué s’il est obsolète ou redondant.

## Garde automatique

Le workflow `.github/workflows/canonical-branch-unicity.yml` vérifie que toutes les lignes de développement actives non exemptées sont des ancêtres de `candidate/mel-clean-autonomy`. Une nouvelle divergence doit faire échouer ce contrôle.

## But

Éviter les doublons, les conflits de versions, les déploiements ambigus, les chemins de code parallèles et la charge inutile qui ralentit MEL, le Teacher Bridge et les agents.
