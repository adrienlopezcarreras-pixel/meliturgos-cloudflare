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
réparation ni callback automatique ne réactive MAX après cet arrêt. Une ancienne
pause globale de réparation reste également fermée ; elle n'est pas convertie
silencieusement en autorisation nouvelle. Un état invalide, un budget épuisé ou
une preuve absente garde les autres missions bloquées avec un diagnostic.

Le lecteur des preuves GitHub utilise `redirect: manual` et refuse les réponses
3xx sans suivre leur destination. Ce contrat est testé dans workerd : le mode
`error`, accepté par Node, est rejeté par Workers avant tout envoi réseau.

Une nouvelle commande explicite du propriétaire peut lancer MAX après la
release vérifiée. Dans le workflow canonique, cette option est désactivée par
défaut et exige un lancement manuel par le propriétaire, le SHA déployé exact,
les vrais contrôles de production et la version du choix propriétaire reconnue
au lancement. Une version plus récente, notamment un nouvel arrêt pendant les
contrôles, annule la commande sans rallumer MAX. La préparation de lancement
complète et le contrôle atomique final restent obligatoires. Cette commande
n'exécute pas de mission ; le heartbeat ou le workflow de tick existant le fait.

Un veto attribué par le Council conserve aussi une empreinte des chemins et
contenus rejetés, avant la suppression des caches. Cette preuve négative est
bornée à la limite de réparation existante. Le même paquet ne devient pas neuf
par un autre résumé, un changement de fournisseur ou un ordre de fichiers
modifié : chargement préparé, génération, claim et precommit le refusent.
Une modification réelle du contenu reste admissible, avec tests et nouvelle
revue Council. Le nettoyage d’un test orphelin d’une candidate rejetée ne clôture
pas son objectif ; sa régression doit accompagner l’implémentation corrigée.

La revue ne transforme pas tous les commits historiques en missions du diff courant : les paquets annulés dont aucun fichier ne participe au diff sont exclus de ses critères et de ses mutations D1. Une mission partielle garde tous ses critères, et une provenance inconnue reste incluse par précaution. Cela ne termine aucune mission exclue.
