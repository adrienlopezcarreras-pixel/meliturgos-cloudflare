# MELITURGOS — export et restauration D1

## Export

1. Appeler `GET /api/export` avec Basic Auth.
2. Conserver le fichier JSON dans un emplacement privé et chiffré.
3. Vérifier que `format` vaut `MELITURGOS_GENESIS_EXPORT`.

L’export contient des données privées. Il ne doit jamais être publié ni envoyé à un service tiers.

## Restauration additive

La restauration ne supprime et n’écrase aucune mémoire. Les interactions exportées restent dans le fichier de sauvegarde mais ne sont pas restaurées automatiquement.

1. Envoyer l’export à `POST /api/import` avec Basic Auth et `simulation: true`.
2. Vérifier `writes: 0`, `eligible`, `rejected` et conserver le `simulation_checksum` retourné.
3. Pour confirmer exactement le même contenu, renvoyer l’export avec :
   - `simulation: false` ;
   - `confirmation: "RESTORE_ADD_ONLY"` ;
   - le `simulation_checksum` obtenu à l’étape précédente.
4. Vérifier `policy: "add_only"` et `overwritten: 0`.
5. Exécuter `PRAGMA quick_check` après restauration.

Une modification du contenu entre simulation et confirmation invalide le checksum. Les doublons sont ignorés avec `INSERT OR IGNORE`.

## Rollback applicatif

Restaurer ensemble le Worker et sa configuration Wrangler depuis le dossier de rollback indiqué dans le compte rendu de la candidate. Le rollback applicatif ne modifie pas les données D1 ni les objets R2.
