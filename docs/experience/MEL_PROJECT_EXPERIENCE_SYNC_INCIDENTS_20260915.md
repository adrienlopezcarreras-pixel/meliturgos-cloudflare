# MEL — Addendum d’expérience : incidents de consolidation du 15 septembre 2026

**Schéma :** `mel.project.experience/v1`  
**Relation :** complément de `MEL_PROJECT_EXPERIENCE_FULL_HISTORY_20260915.md`  

## Catalogue causal complémentaire (3 entrées)

### 46. `mel-exp-046-remote-d1-transaction-semantics` — persistence — historical_error_resolved
**Période :** 2026-09-15

**Problème.** Le premier import de l’expérience consolidée vers D1 distant a échoué alors que les 45 entrées avaient été correctement parsées et la cible validée.

**Cause.** Le fichier SQL généré contenait `BEGIN TRANSACTION` / `COMMIT`. Wrangler D1 distant refuse les transactions SQL explicites dans ce mode et demande de laisser la plateforme gérer l’atomicité de l’exécution distante.

**Correction.** Retirer les instructions de transaction explicites du fichier d’import et conserver uniquement des UPSERT idempotents plus une requête de vérification.

**Leçon.** Les sémantiques d’exécution d’un outil distant font partie du contrat ; une syntaxe SQLite valide localement n’est pas nécessairement acceptée par l’interface D1 distante.

**Règle active.** Pour les imports D1 distants par Wrangler, ne pas encapsuler le fichier avec `BEGIN`/`COMMIT`; utiliser des écritures idempotentes et vérifier l’état final.

**Preuves / références.** GitHub Actions run 35013509747, étape `Import canonical experience into MEL production memory`; erreur Wrangler sur transaction explicite.

### 47. `mel-exp-047-validate-sql-structure-not-keywords` — testing — historical_error_resolved
**Période :** 2026-09-15

**Problème.** Après suppression des transactions explicites, la garde de sécurité a bloqué un SQL pourtant sûr avant même l’import.

**Cause.** La garde utilisait un `grep` insensible à la casse sur des mots comme `COMMIT`, `DELETE` ou `CREATE` dans tout le fichier, y compris à l’intérieur du texte des leçons. Un mot documentaire pouvait donc être confondu avec une instruction SQL.

**Correction.** Remplacer la recherche de mots-clés par une validation structurelle des instructions générées : exactement N lignes `INSERT INTO memories(...)` autorisées et une seule requête `SELECT COUNT(*)`, aucune autre instruction.

**Leçon.** Une validation de sécurité doit analyser la structure exécutable, pas faire confiance à une recherche lexicale qui mélange code et données citées.

**Règle active.** Pour les artefacts contenant code + données libres, valider l’AST/la structure ou les préfixes d’instruction autorisés ; ne jamais bloquer/autoriser uniquement sur des mots trouvés dans les chaînes de données.

**Preuves / références.** GitHub Actions run 35013649900, étape `Validate production D1 target`; correction au commit 3585fe84dd842d0c453de19704d21f29df658f50.

### 48. `mel-exp-048-dependency-audit-warning` — security — current_warning_unresolved
**Période :** 2026-09-15

**Problème.** `npm ci` du workflow de consolidation signale actuellement 3 vulnérabilités de sévérité élevée dans l’arbre de dépendances.

**Cause.** Le workflow installe le lockfile courant ; l’avertissement vient de l’audit npm de cet état de dépendances. La présence de MEL-SEC-03/SBOM ne signifie pas que cet avertissement doit être ignoré ni qu’un correctif automatique est sûr.

**Correction.** Conserver cet état comme alerte ouverte à examiner dans le flux sécurité/supply-chain ; ne pas lancer `npm audit fix --force` ni modifier automatiquement le lockfile sans analyse de compatibilité et tests complets.

**Leçon.** Un gate SBOM et un audit npm sont des preuves complémentaires ; un avertissement de dépendance doit être trié explicitement même si les tests applicatifs passent.

**Règle active.** Alerte de vulnérabilité élevée => diagnostic de paquet/chemin/version, correctif minimal testé, pas de mise à niveau forcée aveugle.

**Preuves / références.** GitHub Actions runs 35013509747, 35013649900 et 35013814949 : `npm ci` rapporte 3 high severity vulnerabilities.

## Politique de l’addendum

Ces trois entrées sont ingérées comme les autres leçons du projet avec provenance, statut temporel et fingerprint idempotent. L’entrée 48 reste une **alerte ouverte**, pas une preuve de compromission ni une autorisation de modifier automatiquement les dépendances.
