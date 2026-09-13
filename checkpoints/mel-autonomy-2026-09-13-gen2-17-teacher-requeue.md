# MEL Autonomie — checkpoint GEN2-17 Teacher requeue

- `job_id`: `mel-autonomy-gen2-17-1`
- `stage`: `WAITING_RUNTIME_RECONCILIATION_AFTER_NEEDS_CHANGES`
- `canonical_branch`: `candidate/mel-clean-autonomy`
- `teacher_request_id`: `9e0f3a67-b435-4ee6-96c0-cc3f74a03408`
- `teacher_request_target_sha`: `a8dc7253e9a30a0dadef72a82d4ace1196b7a166`
- `teacher_verdict`: `NEEDS_CHANGES`
- `teacher_reply_commit`: `3d2adf10504c1582181fd165e8300e8c9000d2eb`
- `teacher_reply_ci`: `full-candidate-ci` run `34772760187` = `success`
- `teacher_smoke`: run `34772760150` = `success`
- `budget_policy_proof_commit`: `1b6a30866193ebafe5aaa8aed041408a079117d3`
- `budget_policy_proof_ci`: `full-candidate-ci` run `34772934135` = `success`

## État vérifié

Le Council live de GEN2-17 a réellement couvert les rôles `ARCHITECTURE_REUSE`, `SECURITY_GOVERNANCE`, `TESTS_EVIDENCE` et `PRODUCT_INTEGRATION`, avec synthèse MEL `COMPLETE`. La demande Teacher restait liée à l’ancien SHA `a8dc...` alors que la candidate avait avancé, donc aucune implémentation ne devait être autorisée à partir de cette preuve périmée.

Une réponse Teacher corrélée `NEEDS_CHANGES` a été ajoutée pour demander une régénération sur le HEAD canonique courant. Le smoke immédiatement déclenché par ce commit a encore vu l’ancienne demande en attente : il s’agit d’un instantané antérieur au prochain heartbeat runtime, pas d’une nouvelle erreur. Ne pas dupliquer cette réponse tant que le même `request_id` reste présent.

Le candidat contient déjà la politique Council `ZERO_ADDED_COST_FAIL_CLOSED`. Un test ciblé supplémentaire (`tests/public-teacher-budget-policy.test.mjs`) verrouille maintenant l’exposition publique de cette preuve et le comportement fail-closed pour une politique absente/inconnue. La full candidate CI est verte sur ce changement.

## Blocage exact

Le heartbeat runtime MEL doit encore consommer la réponse `NEEDS_CHANGES`, remettre le job interne en `QUEUED`, refaire le Council/preflight et produire une nouvelle demande GEN2-17 liée au HEAD canonique du moment. Aucun blocage humain ni coût n’est requis.

## NEXT_ACTION

Au prochain run, commencer par lire le HEAD exact puis le Teacher Bridge live. Si `9e0f3a67-b435-4ee6-96c0-cc3f74a03408` a disparu et qu’une nouvelle demande interne GEN2-17 existe, vérifier sa branche `candidate/mel-clean-autonomy`, son SHA exact, les quatre rôles Council, la synthèse MEL et `budget_policy=ZERO_ADDED_COST_FAIL_CLOSED`, puis produire immédiatement le verdict Teacher corrélé. Si l’ancienne demande est toujours en attente, ne pas répéter la réponse : considérer l’attente comme passive et poursuivre le prochain point roadmap interne actionnable.
