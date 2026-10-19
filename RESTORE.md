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

## Récupération du code ShardVault

Le découpage, le chiffrement et la reconstruction existants sont conservés. La remise du code utilise les octets reconstruits depuis les fragments ; la copie locale de l'archive sert uniquement de contrôle facultatif. Son absence ou une erreur de lecture ne bloque plus la remise ; une copie lisible mais différente reste refusée. L'indépendance de l'archive locale ne signifie pas encore indépendance de Cloudflare : `readExternalCodeManifest()` lit actuellement le manifeste dans R2, et le Worker utilise le secret qui lui est injecté.

### Conserver le matériel de récupération chez le propriétaire

Avant l'épreuve finale, conserver dans un stockage privé chiffré sous ton contrôle, hors Cloudflare et hors du dépôt :

- **Le secret exact qui a chiffré le snapshot.** Si `recovery_key_source` vaut `MEL_RECOVERY_KEY`, conserver sa valeur base64url existante (au moins 32 octets décodés). Sinon, le runtime utilise `MELITURGOS_PASSWORD_DERIVED` : conserver le mot de passe exact utilisé pour ce snapshot ; la clé est `SHA-256(UTF-8("MEL-ShardVault/v1/recovery:" + mot_de_passe))`. Ne pas remplacer ou régénérer le secret pour cette récupération : une nouvelle clé ne déchiffre pas les anciens fragments. Le statut indique le mode configuré ; il ne prouve pas qu'une copie privée existe ni qu'elle déchiffre le snapshot retenu.
- **Une copie exacte du manifeste signé de ce même commit.** Il contient notamment les emplacements des fragments, leurs index et MAC, l'IV, les paramètres de reconstruction, la taille de l'archive, son SHA-256, `git_sha` et `manifestMac`. Conserver le JSON intact pour permettre la vérification de son MAC ; protéger également ses emplacements de lecture.
- **Le runtime existant et l'identité attendue.** Garder la version exacte du code de reconstruction et de ses dépendances, le SHA Git attendu et l'empreinte SHA-256 de l'archive associée au manifeste. Le SHA Git identifie le commit ; le SHA-256 identifie les octets de l'archive.

Les valeurs secrètes ne passent jamais par le chat, Git, les journaux ou une pièce de preuve publique. L'environnement Codex cloud n'est pas ton coffre personnel. Réutiliser une copie que tu détiens déjà dans ton gestionnaire de secrets ou ton stockage personnel ; aucune clé réelle n'est générée ou exportée par cette procédure. Sans copie propriétaire utilisable du secret correspondant, la récupération reste bloquée même si quatre fragments sont disponibles.

Pendant que Cloudflare est encore accessible, le manifeste peut être récupéré avec la commande Wrangler existante depuis ton ordinateur authentifié. Remplacer les chemins et le SHA par les valeurs vérifiées ; utiliser le bucket isolé si la preuve concerne une preview :

```sh
npx --no-install wrangler r2 object get \
  "meliturgos-private-media/shardvault/code-manifests/adrienlopezcarreras-pixel__meliturgos-cloudflare/<sha-exact>.json" \
  --remote --file "/chemin/prive/hors-depot/code-manifest.json"
```

Cette commande lit un manifeste, pas la clé ni l'archive locale. Vérifier que le `git_sha` récupéré correspond au commit attendu et conserver le manifeste hors Cloudflare avec son matériel de récupération. La présence des fichiers doit ensuite être confirmée par une récupération vérifiée avec la clé conservée chez toi. Aucun kit autonome supplémentaire n'est ajouté : le dossier `shardvault/` de ce dépôt contient des données de découverte et de qualification, pas un outil de restauration autonome.

### Épreuve finale, à la fin de l'étape 9 seulement

Conserver la pause pendant les étapes précédentes. À la fin de l'étape 9, retirer la pause puis exécuter l'épreuve sur la version réellement servie, liée au SHA exact : rendre trois fragments indisponibles pour la reconstruction, reconstruire avec les quatre restants, récupérer les octets réellement remis et comparer leur SHA-256 à celui de l'archive de ce commit. L'épreuve ne doit lire aucune copie locale de l'archive. Conserver le SHA servi, les trois index exclus, les quatre fragments utilisés, l'empreinte et le résultat dans une preuve sans secret.

`POST /api/gen2/shardvault/code-reconstruct` accepte déjà `{"simulate_missing":[0,2,5]}`. Cette exclusion évite de supprimer physiquement des fragments partagés ; la réponse de vérification seule ne prouve pas la remise des octets au destinataire. Les tests des 35 combinaisons de perte de trois fragments sur sept restent des preuves locales. Ni ces tests ni une ancienne preuve de preview ne clôturent l'épreuve sur la version servie. Une restauration sur un environnement indépendant doit en outre utiliser le manifeste et la clé conservés hors Cloudflare ; tant que ce chemin n'est pas éprouvé, ne pas annoncer une reprise complète après perte de Cloudflare.

Ajouter `"download":true` à cette même requête authentifiée remet l'archive reconstruite et interdit toute lecture de la copie locale de l'archive. Comparer le SHA-256 calculé sur les octets reçus à `x-mel-archive-sha256`, vérifier `x-mel-source-sha` contre le commit servi et `x-mel-local-copy-checked: 0`. Le manifeste est toujours lu et authentifié ; aucune clé n'est renvoyée.

## Rollback applicatif

Restaurer ensemble le Worker et sa configuration Wrangler depuis le dossier de rollback indiqué dans le compte rendu de la candidate. Le rollback applicatif ne modifie pas les données D1 ni les objets R2.
