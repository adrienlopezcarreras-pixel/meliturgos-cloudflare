# GEN2-57 — Migration Gen1 sans perte

## Source historique réelle

Le dump canonique Gen1 conservé dans `backups/2026-09-04-v0.2.1/meliturgos-memory.sql`
prouve le schéma suivant :

```sql
CREATE TABLE interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  user_text TEXT NOT NULL,
  assistant_text TEXT NOT NULL,
  model TEXT NOT NULL,
  feedback INTEGER,
  correction TEXT
);
```

Une ligne Gen1 représente donc un échange complet et doit produire **deux**
événements Gen2 : un message `user` puis un message `assistant`.

## Stratégie sûre

La migration est implémentée dans
`src/persistence/gen1-interactions-migration.js`.

Principes :

- la table `interactions` n'est jamais supprimée ni renommée par le backfill ;
- le schéma historique est vérifié avant la première écriture ;
- un schéma inconnu échoue en `GEN1_INTERACTIONS_SCHEMA_UNSUPPORTED` ;
- les IDs Gen2 sont déterministes :
  - `legacy-gen1:<id>:user`
  - `legacy-gen1:<id>:assistant`
- `INSERT OR IGNORE` rend les reprises idempotentes ;
- `feedback`, `correction`, l'ID et le timestamp Gen1 restent dans les métadonnées ;
- le modèle historique est conservé sur le message assistant ;
- les données sont regroupées dans la conversation archivée `legacy-gen1` ;
- les lots sont bornés à 500 interactions.

## API propriétaire

### État

`GET /api/gen2/migration/gen1-status`

Retourne notamment :

- présence de la table source ;
- schéma reconnu / colonnes manquantes ;
- nombre d'interactions source ;
- nombre de messages Gen2 attendus et présents ;
- nombre d'interactions restantes ;
- `coverage_complete`.

### Backfill

`POST /api/gen2/migration/gen1-backfill`

Corps :

```json
{
  "after_id": 0,
  "limit": 500
}
```

Le résultat fournit `batch.last_id`. Pour une grosse base, le lot suivant utilise ce
dernier ID comme `after_id`.

## Critère de certification

GEN2-57 ne doit passer à `DONE_VERIFIED` que lorsque :

1. le schéma source réel est reconnu ;
2. `source_rows * 2 === archived_messages` ;
3. chaque interaction source possède ses deux messages déterministes ;
4. `remaining_interactions === 0` ;
5. `coverage_complete === true` ;
6. la table `interactions` est toujours présente et inchangée ;
7. la suite complète de régression est verte ;
8. une preuve sur la D1 réelle a été enregistrée.

Après certification, la table Gen1 peut rester en lecture seule comme archive. Sa
suppression n'est pas nécessaire à la migration et ne doit jamais être automatique.
