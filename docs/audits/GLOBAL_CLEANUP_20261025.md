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

## Suite : progression durable et bail

Main `22c63139` (#2610, fixtures WORK) réconcilié sans perte.
L'orchestrateur conserve désormais sa phase et son domaine dans le verrou
canonique D1 avant/après chaque opération. Le checkpoint compare propriétaire,
état et expiration dans la même écriture. Un bail expiré ou perdu interdit toute
étape suivante ; aucune expiration n'implique une reprise automatique. La levée
vérifiée conserve les métadonnées de progression au lieu de les écraser.

Trois tests SQL réels couvrent propriétaire étranger, expiration, interruption
au domaine WORK, refus des domaines suivants, conservation du verrou et levée
explicite. Leurs preuves de restauration/arrêt sont des fixtures locales ; elles
ne constituent jamais une attestation production. Cela ne raccorde pas encore
les sept adaptateurs ni une procédure de récupération opérable à distance.

34 tests ciblés réussis, syntaxe vérifiée. Deux fixtures explicites du scheduler
WORK oubliées par #2610 ont été complétées avec sa même option maintenanceFence,
sans changer le fail-closed runtime. La CI maintenance couvre désormais aussi
ces tests. Le test élargi work-improvement-watch a été interrompu : ses recherches
Internet réelles échouaient et prolongeaient la suite ; il n'est pas déclaré PASS.

## Restauration indépendante — préparation exécutable

#2609 fusionnée, main `42d2a2c5` réconcilié, améliorations MAX concurrentes
conservées. Le runner D1 existant restaure déjà les tables dans SQLite et compare
l'export complet et le patrimoine. Le nouveau coordinateur réutilise ce runner,
le codec AES-GCM et `restoreR2ObjectBytes` ; il restaure les octets dans des fichiers
temporaires isolés, relus et vérifiés. Les clés d'objet ne deviennent jamais des
chemins locaux. Les fichiers sont supprimés à la fin, seuls les compteurs,
empreintes et identifiant du snapshot figurent dans le reçu.

Le workflow existant `mel-res-05-encrypted-backup-ci.yml` accepte maintenant
`snapshot_key`, après fusion sur main uniquement. Il réutilise les quatre secrets
Cloudflare/chiffrement déjà présents. Aucun nouveau secret, bucket ou D1 requis.
Le runner distant n'invoque que `wrangler r2 object get --remote`, aucune mutation
Cloudflare. Le job attend la CI complète et n'est jamais lancé sur une PR.

Procédure après revue/fusion et CI : lancer ce workflow sur main avec la clé
exacte `backups/system/<snapshot>.enc.json` d'un snapshot existant. Examiner le
reçu `isolated-restore-proof`. Un inventaire sans `r2_objects`, une couverture
incomplète (y compris tout préfixe exclu de l'inventaire sauvegardé), une corruption,
un objet absent ou le budget 256 Mio / 5000 objets dépassé produit BLOCKED. Ne
pas créer une preuve complète à partir d'une sauvegarde D1/R2 seulement partielle.
Aucun dispatch de restauration production n'a été exécuté à ce stade : la clé
exacte d'un snapshot adéquat et sa couverture réelle restent à établir.

Validation locale : 61 tests réussis (maintenance, Companion, WORK scheduler,
restauration SQL existante, R2 bytes et chiffrement). Les données de tests sont
synthétiques ; aucune preuve locale n'est une preuve sur les données production.
`cleanup_authorized:false` est conservé même après restauration réussie.

## Admission atomique des nouvelles missions

La création canonique `D1DevJobRepository.create` insère maintenant via
`INSERT ... SELECT ... WHERE NOT EXISTS` sur le verrou global PAUSED. Le contrôle
et l'insertion sont une seule instruction D1 : une pause acquise juste avant
l'insertion interdit la mission, sans fenêtre lecture/écriture. Un bail expiré
reste fermé jusqu'à récupération. Les producteurs qui passent par ce dépôt
partagent ce même garde, sans nouveau moteur. Aucun événement JOB_CREATED n'est
émis si l'insertion est refusée ; aucune mission préexistante n'est supprimée.
Le mode purement mémoire des tests/laboratoires reste distinct de D1 production.

65 tests locaux réussis, dont course réelle SQL, pause expirée, reprise après
libération vérifiée et suites voisines création, queue propriétaire et jobs.
Cela ne prouve PAS que les sept producteurs sont arrêtés : leurs autres écritures,
leurs exécutions en cours et les DAG WORK restent à drainer et vérifier.

CI complète sauvegarde/restauration réussie sur `a7a4cfed` (run 40170108826).
Le nouveau contrôle d'admission impose une nouvelle validation sur son propre
SHA ; ne pas lui attribuer rétroactivement le résultat du SHA précédent.

Les deux prises en charge D1 `claim` et `claimPrepared` portent aussi le prédicat
de verrou dans leur CAS : ni le Bridge Windows ni le relais cloud ne peuvent
prendre une mission existante sous maintenance. Test SQL réel sur une mission
legacy et un paquet Teacher corrélé : états inchangés sous verrou, reprise après
libération vérifiée et seconde prise refusée. 66 tests locaux réussis.

## Admission du runtime MAX

L'acquisition canonique du bail `runtime-lease:autonomy-heartbeat` porte maintenant
le prédicat de maintenance dans l'INSERT/UPSERT lui-même. Un verrou PAUSED bloque
la première acquisition et le remplacement d'un bail runtime expiré. Le propriétaire
d'un cycle existant peut encore libérer son bail pour drainer sans deadlock.
Le test SQL réel couvre ces états et la reprise après libération vérifiée du
verrou global. 71 tests locaux réussis avec les suites voisines. Cette admission
ne constitue ni une preuve de drain du cycle existant ni l'arrêt des sept domaines.

## Résultats réels et correction mémoire du codec

#2611 fusionnée dans main 9b7b9934. Lecture D1 réelle run 40170884401 :
MAX RUNNING, paused=false, max_autonomy=true. Simulation GitHub run 40171121567 :
2659 branches, 1951 proposées par l'autre outil, zéro suppression appliquée.
La proposition seule n'autorise aucune suppression ni ne prouve la sécurité des
mutations de cet outil. Dernière release vérifiée réussie : 40169084435 / 7d5daa4b.
Promotion après fusion différée par RELEASE_BATCH_WINDOW, pas de nouvelle release
manuelle concurrente créée.

Run réel 40170898667 sur snapshot system-20261025063233609 : CI complète réussie,
mais restauration isolée échouée avec exit 134, heap OOM et aucun reçu. Aucune
restauration réussie revendiquée. Les logs restent privés et ne sont pas committés.

Le codec partagé utilisait Uint8Array.from(string, mapper) pour convertir la
chaîne binaire : cette itération matérialise un intermédiaire coûteux. Reproduction
synthétique 16 Mio / heap 192 Mio : ancien code exit 134, code corrigé ROUNDTRIP_OK.
La conversion écrit désormais directement dans un Uint8Array préalloué. AES-GCM,
AAD, intégrité, format, validation base64 et clés restent inchangés. 27 tests
ciblés réussis, dont test du codec en sous-processus avec heap limité. Le test
réel devra être relancé après revue/fusion ; sa cause restante éventuelle n'est
pas inventée. Les sept adaptateurs et la purge restent non vérifiés.

XP MEL : NON — application des règles existantes de mémoire bornée et de preuve
réelle, sans ajout d'une leçon redondante. Mission BLOCKED, aucune purge production.

## Deuxième test réel et diagnostic borné

#2621 fusionnée (82e2268a). Run 40171881887 : suite complète main réussie,
plus de crash OOM ; le job échoue avec ISOLATED_RESTORE_FAILED et produit un reçu.
Le filtre initial masquait les codes sûrs BACKUP_* du codec. Correction : seuls
les identifiants internes bornés, l'étape CONFIGURATION/DOWNLOAD/DECRYPT/RESTORE
et la classe d'erreur sont conservés. Messages bruts, URLs, clés d'objet et données
restent exclus. 12 tests ciblés passent, dont tests de non-divulgation.

Le dispatch manuel de lecture seule conserve tests ciblés de restauration,
syntaxe et sécurité. La suite complète reste exigée sur les PR et les exécutions
sans snapshot ; elle n'est plus répétée pour le simple diagnostic distant sans
mutation production. Le job reste réservé à main et attend son job de validation.
Aucun garde de purge ou de production n'est assoupli. Ce diagnostic ne doit pas
être déclaré restauration réussie, ni autorisation de nettoyage.

## Preuve du blocage R2 et préparation de sa correction

#2624 fusionnée bd9e6c21. Troisième test réel 40172817025 : contrôles ciblés
réussis, déchiffrement abouti, échec RESTORE / ISOLATED_R2_BYTES_MANIFEST_REQUIRED.
La sauvegarde testée n'inclut pas r2_objects : aucun reçu de restauration complète
ni aucune autorisation de purge.

Le runner canonique reçoit une option explicite full_r2_backup, désactivée par
défaut, transmise via le dispatch canonique existant. L'option ajoute r2_objects au
snapshot chiffré. L'inventaire R2 est partagé/fixé entre les deux sources. Le
sidecar authentifié réutilise backupR2ObjectBytes, un objet par requête, et refuse
les sources de backups, les ETag changés et toute écriture hors du nouveau préfixe
backups/system/r2-bytes/<snapshot-id>/. Les originaux ne sont jamais effacés.

Prévalidation complète avant copie : 5000 objets maximum, 32 Mio par objet et
256 Mio au total. Dépassement => échec avant la première copie. Le mode par défaut
ne crée aucune copie R2 supplémentaire. Aucun autre chemin de déploiement ni
nouveau service. Les archives existantes restent exclues de la copie récursive
et protégées du nettoyage ; la portée copiée est exactement l'inventaire des
données applicatives R2 du snapshot, pas tous les anciens backups du bucket.

110 tests ciblés passent : copie/empreinte, préservation des originaux, budgets,
ETag périmé, auth sidecar, multipart, dispatch opt-in et suites voisines. Cette
preuve locale n'est pas une sauvegarde complète production. Il faut valider la
PR, attendre la fin de toute release active, déclencher une seule release avec
full_r2_backup=true, puis restaurer le nouveau snapshot réel indépendamment.
Les sept adaptateurs, le drain et le nettoyage réel restent à prouver.

## Exécution de la sauvegarde complète et protection WORK

#2630 fusionnée 1dbd8b96 après 11 contrôles réussis. Release précédente
40172136929 terminée SUCCESS sur e9d6d7da. Demande canonique full_r2_backup=true
acceptée (40174187587), release 40174216660 : arrêt avant déploiement au backup,
code BACKUP_R2_COPY_INVENTORY_INVALID. La prévalidation précède toute copie :
aucun original effacé et pas de sauvegarde complète revendiquée.
Lecture D1 après cet échec : run 40175137154, contrôle 121114087551, VERIFIED,
RUNNING, paused=false, max_autonomy=true. Aucun arrêt résiduel MAX observé.

Le précontrôle R2 distingue maintenant nombre/taille/budget et métadonnées invalides,
avec compteurs et raisons strictement bornés, sans clés ni ETag privés. Les limites
restent inchangées. Le motif réel de l'inventaire production devra être mesuré,
pas déduit d'une fixture ou de valeurs historiques.

Le bail WORK D1 est fermé atomiquement sous le verrou PAUSED, y compris reprise
manuelle/cron et bail global expiré. Les cycles streamDirectWork refusent avant
réseau/modèle/remise, et leur INSERT RUNNING porte également le prédicat atomique
contre une pause arrivée après le premier SELECT. Un refus ne crée pas un faux
cycle FAILED. Les cycles déjà admis peuvent terminer pour être drainés ; cette
admission seule ne prouve donc pas le drain des travaux en cours.

90 tests ciblés passent, dont course réelle SQL, DAG signé conservé octet pour
octet, reprise sans double exécution, schéma global absent fail-closed, budgets et
diagnostics R2 non divulguants. Aucune mutation de DAG signé ni de paiements.
Les fixtures sont explicitement initialisées avec le schéma de maintenance,
sans affaiblir le contrôle runtime. Nettoyage réel toujours BLOCKED.

Le diagnostic de restauration peut aussi décrire les seuls compteurs de
l'inventaire contenu dans un snapshot chiffré vérifié : source explicitement
SNAPSHOT_INVENTORY et date du snapshot. Ces valeurs historiques ne sont jamais
présentées comme état courant de production ni comme preuve de restauration.
Le prévalidateur R2 est partagé avec le créateur de sauvegarde, sans nouvelle
copie ni nouveau client de stockage. 91 tests ciblés réussis après cet ajout.

## Réconciliation du volume R2 déjà corrigé sur main

Main ea737e23 inclut #2634 (9ae82f39), qui accepte des inventaires bornés à
10000 objets et teste 7378 objets. Cette correction parallèle est conservée,
ainsi que les modifications Mentor, Taskmarket, UI et synchronisation candidate.
Le restaurateur conservait un défaut à 5000 : il aurait refusé un snapshot accepté
par le créateur. Les deux partagent désormais les constantes 10000 objets,
256 Mio au total et 32 Mio par objet ; seul le plafond de nombre déjà approuvé
sur main est repris, aucun budget d'octets augmenté. Le test de restauration
admet 7378 références mais refuse encore réellement les octets absents.

93 tests ciblés passent après résolution des conflits. Les valeurs du test ne
sont pas présentées comme une mesure fraîche de production. Aucune restauration
complète ni purge encore prouvée. XP MEL : NON.
