# MEL — Règle permanente d’unicité du déploiement

## Source de vérité

La seule ligne de développement exécutable et candidate déployable est `candidate/mel-clean-autonomy` jusqu’à décision explicite de remplacement.

Une branche `release/*` n’est qu’un pointeur temporaire vers le SHA exact de la candidate approuvée. Elle ne constitue jamais une seconde ligne de développement et ne doit pas diverger de `candidate/mel-clean-autonomy`.

`teacher-bridge/runtime` est un transport de métadonnées Teacher, jamais une branche de code exécutable.

Les branches explicitement consacrées au travail LoRA sont temporairement isolées pendant le chantier LoRA en cours. Elles ne doivent pas être absorbées ou déplacées par les autres chantiers. À la fin du chantier LoRA, elles devront à leur tour être intégrées puis retirées des lignes actives.

## Règles obligatoires pour MEL, Teacher Bridge et les agents de développement

- Une seule branche/candidate peut être considérée comme ligne de développement active à un instant donné.
- Aucun agent ne doit créer une branche concurrente pour une tâche ordinaire quand le travail peut être réalisé sur la candidate canonique.
- Une branche technique temporaire, lorsqu’elle est indispensable, doit être comparée, intégrée puis rendue ancêtre de la candidate canonique avant la fin du chantier.
- Un statut Git `diverged` entre la candidate canonique et une branche de développement active non exemptée est une anomalie à corriger, pas un état normal.
- Un seul chemin de mutation production doit exister : `.github/workflows/deploy-cloudflare-release.yml`, déclenché manuellement avec `DEPLOY_APPROVED`, une branche `release/*` et le SHA exact du HEAD canonique.
- Toute fonctionnalité utile développée sur une autre branche doit être comparée puis intégrée à la candidate canonique.
- Une branche secondaire ne doit jamais devenir une seconde version concurrente de MEL.
- Après absorption de son contenu unique, elle est considérée `RETIRED/SUPERSEDED` et ne doit plus servir de source de déploiement.
- Aucun travail validé ou nécessaire ne doit rester suspendu dans une branche oubliée.
- Avant de créer une branche, vérifier qu’un chantier équivalent n’existe pas déjà.
- Avant tout déploiement, vérifier la syntaxe, la suite de tests complète et l’intégrité de la candidate ou de la release exacte à déployer.
- Les prototypes remplacés par une implémentation plus récente ne doivent pas être réintroduits uniquement pour préserver leur ancien historique.
- Le contenu des anciennes branches absorbées reste conservé dans l’historique Git ; leur ancien arbre n’est pas réappliqué s’il est obsolète ou redondant.

## Clôture obligatoire de chaque passage

L’unicité n’est pas seulement vérifiée avant un déploiement. Elle doit être **réconciliée après chaque passage** d’un agent ou d’une IA.

Avant de déclarer un passage terminé :
- relire toutes les branches/références pertinentes ;
- absorber tout historique non exempté qui serait redevenu concurrent ;
- supprimer les chemins logiques, wrappers ou sources de vérité rendus obsolètes par le passage ;
- confirmer qu’une seule ligne de développement exécutable reste active : `candidate/mel-clean-autonomy` ;
- adapter tests, docs et handoff au nouvel état ;
- laisser les exceptions temporaires LoRA/adapter séparées uniquement tant que ce chantier l’exige explicitement.

Un statut `diverged` non exempté à la fin d’un passage rend ce passage **INCOMPLET**.

## Garde automatique

Le workflow `.github/workflows/canonical-branch-unicity.yml` vérifie que toute branche du dépôt non exemptée — y compris les anciennes releases, archives, rollbacks et références temporaires — est un ancêtre de `candidate/mel-clean-autonomy`. Une nouvelle divergence doit faire échouer ce contrôle. Les seules exemptions temporaires sont le transport `teacher-bridge/runtime` et les branches explicitement LoRA/compatibilité/adaptateur pendant le chantier séparé.

## But

Éviter les doublons, les conflits de versions, les déploiements ambigus, les chemins de code parallèles et la charge inutile qui ralentit MEL, le Teacher Bridge et les agents.