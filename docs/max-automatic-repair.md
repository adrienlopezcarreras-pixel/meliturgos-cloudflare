# MAX : réparation de la mission courante

Quand MAX est autorisé par le propriétaire et que son Bridge signale un échec,
le contrôle D1 réserve le créneau à cette mission (`mel.autonomy-repair/v1`).
Les autres missions restent passives. Les nouvelles admissions autonomes et
les prises de créneau sont refusées atomiquement pendant cette réparation.

La boucle existante Council / Teacher / Mentor répare ce même objectif, avec
son budget existant de huit réparations au maximum. Cette autorisation ne
supprime ni les dépendances roadmap, ni les tests, ni les votes, ni les limites
financières. Le plafond ordinaire des passages en file reste inchangé.

Une mission seulement déclarée terminée ne libère pas la file. Il faut son reçu
logiciel accepté, la CI complète et le Council du SHA exact, puis la release
canonique et ses contrôles de production réussis. Le dernier job de release
fait vérifier ces résultats GitHub par le serveur, sous OIDC, avant de lever
la réservation. Le prochain heartbeat reprend alors les missions normales.

L'arrêt du propriétaire reste global et prioritaire : aucun mécanisme de
réparation ou callback de release ne réactive MAX après cet arrêt. Une ancienne
pause globale de réparation reste également fermée ; elle n'est pas convertie
silencieusement en autorisation nouvelle. Un état invalide, un budget épuisé ou
une preuve absente garde les autres missions bloquées avec un diagnostic.

Le lecteur des preuves GitHub utilise `redirect: manual` et refuse les réponses
3xx sans suivre leur destination. Ce contrat est testé dans workerd : le mode
`error`, accepté par Node, est rejeté par Workers avant tout envoi réseau.
