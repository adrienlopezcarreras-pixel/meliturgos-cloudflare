# MEL ShardVault — revalidation de preview isolée (2026-10-13)

## Point de départ vérifié

- Preview GitHub Actions n°38416190014 : échec de l'étape `Prove ShardVault external code reconstruction` après `QUORUM_COPIED` à 6/7, puis `RETRY_TARGETS` à 6/7.
- Les contrôles CI préalables ont réussi, mais ne constituent pas une preuve de reconstruction externe complète.
- La branche candidate et `main` sont divergentes : ne pas remplacer la candidate par `main` et ne pas forcer de rebase/reset sans réconciliation.
- La candidate emploie `scripts/fulfill-preview-code-mirror.mjs`, le bucket R2 isolé et la branche miroir `shardvault-preview-mirror`.
- Les corrections côté `main` sont suivies par les PR #1278 et #1279, toutes deux validées par leurs CI ciblées.

## Preuves requises pour clôturer ce point

1. Preview issue du SHA exact de cette branche candidate, avec D1 et R2 preview confirmés distincts de la production.
2. Sept fragments externes copiés, relus et vérifiés par hash ; au moins un fragment sur le miroir GitHub isolé.
3. Reconstruction 4/7 et épreuve de perte de trois fragments sur des réponses HTTP réelles, sans archive locale comme secours.
4. Stress API et UI, autonomie, apprentissage et contrôle final de mise en pause de la preview.
5. Artefacts et journaux GitHub Actions conservés, sans secrets et avec numéro de run et SHA exact.

L'ajout de ce fichier sur la branche candidate constitue une modification documentaire servant à relancer le workflow `deploy-candidate-preview` sur `push`. Il ne constitue pas, à lui seul, une validation 7/7.

## Revalidation ultérieure — SUCCÈS sur preview isolée (14 octobre 2026)

Le point de départ ci-dessus est conservé comme **historique**. L'échec #38416190014 n'est plus le dernier résultat.

- PR candidate [#1228](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/pull/1228), SHA **`2a8b3dd0ee7a8460b23ba3905e300b3451a570d4`** (brouillon, non fusionnée).
- Preview GitHub Actions **[#38515335142](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38515335142)**, job `115692739537` : **SUCCESS** au SHA ci-dessus.
- Ressources preview distinctes de la production : `PREVIEW_RESOURCES_ISOLATED`; identité Worker et taille exacte vérifiées : `PREVIEW_EXACT_SHA_AND_BUNDLE_SIZE_CONFIRMED`.
- Instantané ShardVault : sept fragments relus avec MAC valide (`SHARDVAULT_SEVEN_REAL_SHARDS_MAC_VERIFIED`).
- Code externe : **`COPIED endpoints=7/7`** après une progression `QUORUM_COPIED` 5/7 puis 6/7.
- Reconstruction externe indépendante de l'archive locale : `CODE_RECONSTRUCTION_VERIFIED`, `independent_of_local_archive: true`.
- Perte de trois fragments : simulation `[0,2,5]`, reconstruction `CODE_RECONSTRUCTION_VERIFIED`, **4 fragments sains sur 4 requis**.
- Stress API/UI et récupération : `Bounded preview stress and recovery tests passed.`
- Toutes les étapes de la preview sont `success`, y compris le test Teacher et **`Pause isolated preview after autonomy proof`**. Les six autres contrôles CI du même SHA (`unicity`, `full-suite`, `lora-runtime-contract`, `probe`, `smoke`, `capture`) sont `success`.

**Portée de la preuve :** succès de la *preview isolée* au SHA exact. Cela ne prouve **ni** que la production déployée exécute ce SHA, **ni** que tous les connecteurs, les compétences ou le MAX en production sont opérationnels. Aucun déploiement de production, fusion de #1228 ou activation MAX n'est autorisé par cette revalidation.

### Réconciliation avec `main`

Au 14/10/2026, le contenu de `src/continuity/shardvault-runtime.js` est identique entre `main` et la branche candidate (blob `3f1e32f0b07550818f942f386477138060874091`). Les workflows de preview diffèrent encore. L'ancienne PR #1228 est marquée `dirty` : `main` a avancé de nombreux commits depuis l'ancêtre commun `53ad603457a1d9a4571e5878593702035a437aba`.

**Action sûre :** réconcilier les éventuelles différences sur une branche neuve issue du `main` actuel, avec revue des fichiers et CI sur le SHA exact. Ne pas fusionner, rebaser de force, ni remplacer automatiquement les 246 commits récents de `main` par la candidate. La présente mise à jour est **uniquement documentaire**.
