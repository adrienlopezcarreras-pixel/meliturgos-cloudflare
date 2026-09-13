# MEL autonomy checkpoint — 2026-09-13 13:20Z

- job_id: `GEN2-17`
- stage: `CI_REVERIFY_AFTER_LEARNING_CAPTURE`
- candidate_branch: `candidate/mel-clean-autonomy`
- last_fully_verified_sha: `f0979cad9e7f577f842818866aaa077f6f3a0417`
- current_parent_sha_before_checkpoint: `5de42257746a4af9b3abcc0dd1b47ca20412dac3`

## Travail fermé dans ce cycle

1. Le contrat Teacher production reste strict et fail-closed : Council complet, branche candidate canonique et `target_sha` exact n'ont pas été relâchés.
2. Les fixtures GEN2-17 obsolètes ont été alignées sur ce contrat avec un helper canonique `tests/helpers/teacher-review-fixtures.mjs`.
3. La canonicalisation des branches de test conserve explicitement les deux tests négatifs : branche Teacher non-candidate et divergence entre deux branches candidates.
4. La suite ciblée GEN2-17 a terminé avec `37/37` tests réussis dans le workflow de réparation.
5. Les scripts/workflow temporaires de réparation ont été supprimés après réussite afin de ne pas créer un orchestrateur parallèle durable.
6. `full-candidate-ci` run `34759380519` a réussi sur le SHA exact `f0979cad9e7f577f842818866aaa077f6f3a0417`.
7. `runtime-teacher-smoke` run `34759380520` a réussi sur le même SHA exact.
8. La correction utile a été transformée en apprentissage canonique dans `src/learning/bootstrap-corrections.js` : `bootstrap-teacher-contract-fixture-drift-20260913`, avec cause, avant/après, méthode, preuves, provenance, qualité et `validated=true` fondé sur les preuves ci-dessus.

## Fichiers principaux modifiés

- `tests/helpers/teacher-review-fixtures.mjs`
- `tests/autonomous-work-loop.test.mjs`
- `tests/autonomy-runtime.test.mjs`
- `tests/council-api.test.mjs`
- `tests/development-coordinator.test.mjs`
- `tests/github-reply-reconciler.test.mjs`
- `tests/public-teacher-api.test.mjs`
- `tests/work-dag-resume.test.mjs`
- `src/learning/bootstrap-corrections.js`

## Diagnostic corrigé

L'échec initial n'était pas une preuve que le contrat Teacher durci était erroné. Les tests utilisaient encore un Council ancien incomplet, des SHA courts ou absents et des branches historiques. Une première canonicalisation globale a aussi neutralisé par accident le test négatif de divergence. La réparation finale conserve le runtime strict et adapte seulement les preuves de test, avec un cas divergent intentionnel distinct.

## État roadmap

`GEN2-17` reste `PARTIAL` dans la roadmap canonique : ce cycle prouve un cycle cohérent complet et vert, mais le critère roadmap demande plusieurs cycles cohérents avant promotion. Ne pas le marquer `DONE_VERIFIED` sur cette seule preuve.

## NEXT_ACTION

Refetch HEAD exact, attendre/examiner `full-candidate-ci` et `runtime-teacher-smoke` déclenchés après l'ajout de la correction d'apprentissage et de ce checkpoint. Si le SHA courant est vert, poursuivre `GEN2-17` avec un deuxième cycle autonome cohérent réel sur la candidate (Teacher exact-SHA -> implémentation bornée -> tests ciblés -> full CI -> completion vérifiée), sans modifier la production et sans recréer de workflow de réparation temporaire.
