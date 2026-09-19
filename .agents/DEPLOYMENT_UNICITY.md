# MEL — Règle permanente d’unicité du déploiement

## Source de vérité

La seule ligne de développement exécutable et candidate déployable est `candidate/mel-clean-autonomy` jusqu’à décision explicite de remplacement.

Une branche `release/*` n’est qu’un pointeur temporaire vers le SHA exact de la candidate approuvée. Elle ne constitue jamais une seconde ligne de développement et ne doit pas diverger de `candidate/mel-clean-autonomy`.

`teacher-bridge/runtime` est un transport de métadonnées Teacher, jamais une branche de code exécutable. Le laboratoire `godot-private-test-*` est une exception non-MEL conditionnelle : sa divergence n’est admise que si son diff reste limité à `.github/workflows/godot-private-test.yml` et `ci-godot-test/*`.

`feature/mel-waveshare-terminal` est un laboratoire matériel isolé : il peut diverger uniquement dans les fichiers terminal/ordinateur explicitement autorisés. Il ne peut pas toucher les workflows GitHub, `wrangler*`, les entrypoints de production ni créer un chemin de déploiement. Toute sortie de cette allowlist fait échouer le garde.

Les branches LoRA/adapter/compatibilité actives sont désormais soumises à la même règle que tout autre développement : aucune divergence active n’est autorisée. Les anciens HEAD utiles peuvent être conservés uniquement sous `archive/*`, qui est historique et non déployable.

## Règles obligatoires pour MEL, Teacher Bridge et les agents de développement

- Une seule branche/candidate peut être considérée comme ligne de développement active à un instant donné.
- Aucun agent ne doit créer une branche concurrente pour une tâche ordinaire quand le travail peut être réalisé sur la candidate canonique.
- Une branche technique temporaire, lorsqu’elle est indispensable, doit être comparée, intégrée puis rendue ancêtre de la candidate canonique avant la fin du chantier.
- Un statut Git `diverged` entre la candidate canonique et une branche de développement active non exemptée est une anomalie à corriger, pas un état normal.
- Un seul chemin de mutation production doit exister : `.github/workflows/deploy-cloudflare-release.yml`, déclenché manuellement avec `DEPLOY_APPROVED`, une branche `release/*` et le SHA exact du HEAD canonique.
- Aucun workflow secondaire ne peut invoquer `wrangler deploy`, `wrangler publish`, `npm run deploy`, `cloudflare/wrangler-action` ou une API Workers de production. Les seuls déploiements secondaires autorisés sont des previews isolées et explicitement identifiées par leur configuration `preview`.
- Un workflow ajouté sur `main` ne doit jamais recevoir le rôle de déploiement production. `main` doit rester alignée avec la candidate canonique, ou être considérée en anomalie jusqu'à réalignement.
- Toute capacité fonctionnelle développée hors candidate (ex. ShardVault) doit être portée dans `candidate/mel-clean-autonomy` avant promotion, sans importer son éventuel mécanisme de déploiement parallèle.
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
- confirmer que les branches LoRA/adapter/compatibilité actives sont elles aussi convergentes ; conserver un ancien HEAD seulement sous `archive/*` si son historique doit rester consultable.

Un statut `diverged` non exempté à la fin d’un passage rend ce passage **INCOMPLET**.

## Garde automatique

Le workflow `.github/workflows/canonical-branch-unicity.yml` vérifie que toute branche de code MEL active est un ancêtre de `candidate/mel-clean-autonomy`. Une nouvelle divergence doit faire échouer ce contrôle. `teacher-bridge/runtime` transporte uniquement des métadonnées, `archive/*` conserve des HEAD historiques non déployables, et `godot-private-test-*` n’est accepté que comme laboratoire non-MEL sous allowlist stricte de chemins ; s’il touche un fichier hors de son namespace Godot, le contrôle doit échouer.

## But

Éviter les doublons, les conflits de versions, les déploiements ambigus, les chemins de code parallèles et la charge inutile qui ralentit MEL, le Teacher Bridge et les agents.