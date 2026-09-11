# MEL — Règle d’unicité du déploiement

Cette règle est une contrainte permanente du projet MEL.

## Principe

Il ne doit exister qu’une seule ligne de travail réellement déployable à un instant donné : la branche canonique `candidate/augmentio-core`, jusqu’à décision explicite de la remplacer.

## Obligations pour MEL et les agents

- Toute fonctionnalité utile développée ailleurs doit être comparée à la branche canonique puis intégrée dans celle-ci.
- Une branche secondaire ne doit jamais devenir une seconde version concurrente de MEL.
- Après reprise de son contenu unique, une branche secondaire doit être fermée, archivée ou supprimée.
- Aucun travail validé ou nécessaire ne doit rester suspendu dans une branche oubliée.
- Un seul chemin de release doit être maintenu. Aucun déploiement ne doit partir d’une branche secondaire tant qu’elle n’a pas été intégrée à la branche canonique.
- Avant de créer une nouvelle branche de travail, vérifier qu’un chantier équivalent n’existe pas déjà.
- Avant tout déploiement, vérifier que la candidate contient les fonctions uniques encore pertinentes de toutes les branches actives.

## But

Éviter les doublons, les conflits de versions, les déploiements ambigus et la charge inutile qui ralentit MEL, le Teacher Bridge et les agents de développement.
