# MEL — Règle permanente d’unicité du déploiement

## Source de vérité

La seule candidate déployable est `candidate/mel-clean-autonomy` jusqu’à décision explicite de remplacement.

## Règles obligatoires pour MEL, Teacher Bridge et les agents de développement

- Une seule branche/candidate peut être considérée déployable à un instant donné.
- Un seul chemin de release doit exister.
- Toute fonctionnalité utile développée sur une autre branche doit être comparée puis intégrée à la candidate canonique.
- Une branche secondaire ne doit jamais devenir une seconde version concurrente de MEL.
- Après absorption de son contenu unique, elle est considérée RETIRED/SUPERSEDED et ne doit plus servir de source de déploiement.
- Aucun travail validé ou nécessaire ne doit rester suspendu dans une branche oubliée.
- Avant de créer une branche, vérifier qu’un chantier équivalent n’existe pas déjà.
- Avant tout déploiement, vérifier que la candidate canonique contient tous les changements uniques encore pertinents des branches actives.
- Les prototypes remplacés par une implémentation plus récente ne doivent pas être réintroduits uniquement pour préserver leur ancien historique.

## But

Éviter les doublons, les conflits de versions, les déploiements ambigus, les chemins de code parallèles et la charge inutile qui ralentit MEL, le Teacher Bridge et les agents.
