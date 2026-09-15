# MEL — Résultat de synchronisation de l’expérience consolidée

- Date : 2026-09-15
- Branche isolée : `experience/full-history-20260915`
- Commit du workflow final : `5df8dbda930ae4811b0f0fe8b773547148a87f1c`
- GitHub Actions run : `35013942094`
- Statut : **SUCCESS**
- Documents sources : 2
- Expériences parsées : **48**
- Instructions autorisées validées : **48 UPSERT `memories` + 1 SELECT de contrôle**
- Import D1 distant : **SUCCESS**
- Base : `meliturgos-memory`
- Vérification finale : `SELECT COUNT(*) ... WHERE source='project_experience_consolidation_v1'` retourne **48**
- Provenance D1 : `full-history-20260915`
- Source D1 : `project_experience_consolidation_v1`
- Nature : `kind=lesson`
- Déduplication : fingerprint SHA-256 du contenu normalisé / UPSERT idempotent
- Production applicative : **aucun déploiement de code déclenché par cette consolidation** ; seule la mémoire D1 a été enrichie.

## Incidents appris pendant l’import

1. Le premier run a échoué car Wrangler D1 distant refuse `BEGIN TRANSACTION` / `COMMIT` explicites pour ce mode d’import. Aucun état partiel n’a été conservé par cet échec.
2. Le deuxième run a été arrêté avant import par une garde lexicale trop large qui confondait le mot `COMMIT` présent dans les données avec une instruction SQL. La garde a été remplacée par une validation structurelle des instructions autorisées.
3. Les runs signalent 3 vulnérabilités npm de sévérité élevée. Cette alerte a été ajoutée à l’expérience de MEL comme `current_warning_unresolved`; aucun `npm audit fix --force` n’a été lancé.

## Conclusion

La transmission demandée est effective : les 48 leçons causales consolidées sont présentes dans la mémoire D1 de MEL et l’archive lisible est conservée séparément dans GitHub et Google Drive.
