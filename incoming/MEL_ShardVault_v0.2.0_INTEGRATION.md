# MEL — paquet entrant : ShardVault v0.2.0

Un module fourni par Adrien a été audité localement puis transmis ici pour intégration contrôlée.

## Fichier source
- Archive : `MEL_ShardVault_v0.2.0.zip`
- Transport repo : `incoming/MEL_ShardVault_v0.2.0.zip.b64`
- SHA-256 de l'archive originale : `3beacefa97f321602f5110b10e373ba35478df560f331d7248c5e233d13bcd33`
- Taille : 20 797 octets
- Test local : `npm test` → **MEL-ShardVault tests: OK**

Pour reconstruire l'archive :
```bash
base64 -d incoming/MEL_ShardVault_v0.2.0.zip.b64 > /tmp/MEL_ShardVault_v0.2.0.zip
echo "3beacefa97f321602f5110b10e373ba35478df560f331d7248c5e233d13bcd33  /tmp/MEL_ShardVault_v0.2.0.zip" | sha256sum -c -
unzip -q /tmp/MEL_ShardVault_v0.2.0.zip -d /tmp/mel-shardvault
cd /tmp/mel-shardvault/mel-shardvault
npm test
```

## Ce que fait le module
- chiffrement AES-GCM dérivé par HKDF ;
- fragmentation + redondance Reed-Solomon ;
- inventaires et registres signés ;
- restauration et réparation de fragments ;
- support Cloudflare Worker ;
- veille de dépôts publics autorisés ;
- aucun header d'authentification envoyé aux destinations ;
- les probes d'écriture de la veille restent désactivées par défaut.

## Consigne d'intégration
1. **Ne pas activer les écritures réseau ni les probes en production pour l'instant.**
2. Importer le module dans une zone isolée / feature flag.
3. Rejouer la suite de tests dans le runtime MEL.
4. Ajouter des tests d'intégration avec endpoints mémoire/mock.
5. Avant toute activation, durcir le contrôle réseau :
   - les endpoints configurés directement dans `mel-shardvault.mjs` ne bloquent actuellement que le non-HTTPS et les identifiants dans l'URL ; appliquer aussi le refus localhost/réseaux privés déjà présent dans `repository-watch.mjs` ;
   - refuser les redirections HTTP vers une cible différente/privée (`redirect: "error"` ou validation explicite de la destination finale).
6. Conserver `MEL_WATCH_WRITE_PROBES` à `false` tant qu'aucune destination n'a été explicitement vérifiée comme autorisant le dépôt public anonyme gratuit.
7. Ne jamais stocker `MEL_RECOVERY_KEY` dans Git, dans les fragments ou dans l'inventaire public.
8. Une fois les garde-fous validés, proposer le branchement minimal sur la boucle de continuité existante de MEL, sans modifier les autres boucles autonomes.

## État
**REÇU / TESTÉ / NON ACTIVÉ** — prêt pour intégration contrôlée.
