# Grand nettoyage — reprise du 25 octobre 2026

Statut : BLOCKED, aucune purge production exécutée.

## Correction de préservation

Le reset des travaux legacy utilisait une exclusion de quatre états terminaux.
Il pouvait donc annuler `DONE_VERIFIED`, `ACCEPTED`, `DELIVERED` et de futurs états.
La sélection canonique est maintenant une liste positive d'états actifs ; les
travaux prêts à revue/publication sont aussi conservés par prudence. Inventaire
et mutation utilisent le même prédicat. Le test SQL réel en mémoire vérifie les
lignes préservées intégralement et l'idempotence de l'annulation ciblée.

Les tests Companion étaient incohérents avec le script de diagnostic actuel :
regex ASCII doublement échappée et attente d'une confirmation destructive qui
n'existe plus. Les assertions gardent l'absence de `-Apply` et de dialogue de
purge. Ils sont maintenant exécutés dans la CI maintenance existante, dont les
filtres incluent les trois scripts Windows.

## État vérifié à la reprise

- Main : `43473685b0033d5ba76e9e766d31f5d9ad11e5b9`.
- #2609 : ouverte, test ciblé réussi ; fusion refusée par GitHub,
  `REVIEW_REQUIRED`, auto-merge désactivé. Aucun contournement administrateur.
- `executeGlobalMaintenance` reste une frontière injectée, sans appelant
  d'exécution production. Ne pas annoncer sept adaptateurs raccordés.
- Seul le scheduler WORK importe le verrou parmi les producteurs recherchés ;
  MAX et VEILLE ne prouvent pas encore un arrêt global coordonné.
- L'inspection HTTPS production répond 401 sans session propriétaire.
  Cela ne prouve aucun état de données, verrou ou préférence MAX.
- Aucune preuve de restauration complète isolée D1/R2 accessible à cet agent.
  Le code de backup distingue inventaire R2 et copie d'octets optionnelle :
  un reçu de snapshot ne suffit pas à affirmer leur restauration.
- Companion reste diagnostic/simulation, sans mutation globale.

## Blocages conservés

MAX, WORK, VEILLE, MENTOR, COUNCIL, FOUNDER, PLANIFICATEUR : nettoyage non
exécuté ; état live non vérifié. Requis : revue GitHub, adaptateurs de production
et arrêt/drain vérifiés de chaque producteur, environnement isolé de restauration,
preuve serveur des octets D1/R2 restaurés et accès propriétaire à la maintenance.
La levée du verrou puis le fonctionnement effectif des producteurs doivent être
vérifiés ; leur simple absence d'erreur ne vaut pas reprise.

XP MEL : NON — réutilisation des règles de préservation, de preuve indépendante
et de résultat factuel ; aucune nouvelle leçon dupliquée. Mission incomplète.
