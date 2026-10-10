# MEL MINI — procédure sûre de qualification et de retour arrière

**Statut : préparation uniquement.** Aucun flash, aucune publication R2 ni reset
ne doit être déclenché par cette procédure sans une action humaine explicite,
avec le propriétaire physiquement présent à proximité de la MINI.

## Verrous avant publication

1. La PR contenant le firmware est fusionnée ou explicitement qualifiée sur un
   SHA exact ; Hardware Lab et le build ESP-IDF ont conclu `SUCCESS` sur ce SHA.
2. L'archive GitHub Actions et ses entrées sont intègres, le `firmware-manifest.json`
   annonce un `source_sha` et un `build_sha` cohérents, et chaque taille et
   SHA-256 des deux fichiers binaires concordent avec les octets téléchargés.
3. Le manifeste du build CI est un **candidate** (`available=false`).
   Il **ne doit pas** être publié comme offre OTA stable.
4. Un responsable présent devant le matériel a confirmé l'alimentation stable,
   le modèle exact `waveshare-esp32-s3-touch-lcd-3.5-c`, la version installée,
   la connexion locale, et a conservé les journaux de diagnostic.
5. Une copie du firmware **actuellement fonctionnel**, de son empreinte SHA-256,
   de la table de partitions et des données nécessaires à la restauration
   (avec protection particulière des paramètres et secrets NVS) est disponible
   **hors de l'appareil** avant toute opération écrivant en flash.
6. Le Companion doit confirmer toute permission d'intervention distante
   nécessaire. `remote_access_enabled=false` interdit toute intervention
   distante qui en dépend. La seule présence du Companion ou d'un heartbeat
   ne vaut pas autorisation de flash.

## Publication (opération distincte de l'installation)

Le workflow `publish-waveshare-firmware` ne doit être déclenché que
manuellement sur `main`, avec `expected_sha`, les SHA-256 exacts des
binaires OTA et USB approuvés, et l'approbation littérale
`PUBLISH_FIRMWARE`. Il recompilera et refusera de publier si **l'une**
des empreintes change. La publication du manifeste stable doit être la
**dernière** opération, après les deux binaires.

Ne pas activer de publication automatique par push ni d'installation OTA
automatique. Une publication sur R2 rend seulement le firmware disponible :
elle n'autorise pas son installation sur la MINI.

## Installation (uniquement en présence de l'opérateur)

1. Vérifier une seconde fois la version installée, le SHA-256 prévu, la
   batterie/alimentation, la disponibilité d'une connexion de secours et
   la possibilité d'accéder physiquement à l'USB.
2. Lancer **manuellement** une seule mise à jour via l'interface prévue,
   qui écrit sur le slot OTA inactif et compare le SHA-256 reçu.
3. Observer le redémarrage, puis vérifier l'avatar et l'interface, la
   connexion BLE Link V2, Wi-Fi, microphone, sortie ES8311, STOP VOIX,
   caméra, mémoire interne, stockage, heartbeat et version exacte.
4. Consigner l'heure, le SHA du code, le SHA-256 binaire et les résultats.
   Ne déclarer `DONE_VERIFIED` qu'après la preuve matérielle de ces tests.

## Échec / rollback

- **Échec avant basculement du slot :** arrêter ; le firmware précédent
  est censé être conservé. Enregistrer l'erreur et éviter les retries
  automatiques.
- **Échec après redémarrage :** ne pas multiplier les resets. Si l'appareil
  reste utilisable, conserver les journaux et planifier la restauration
  manuelle d'une image antérieure **vérifiée** sous supervision locale.
- **Boot impossible :** attendre l'accès physique USB et vérifier la
  sauvegarde des partitions/NVS avant toute écriture. Ne pas utiliser
  `erase_flash` et ne pas appliquer aveuglément
  `mini-first-install.bin` à un appareil déjà appairé : une image complète
  peut écraser des données persistantes. Choisir les offsets de récupération
  à partir de la vraie table de partitions et des données sauvegardées.
- Le partitionnement courant prévoit `ota_0` et `ota_1`, mais cela **ne
  prouve pas** un rollback automatique au démarrage. Celui-ci exigerait
  une configuration du bootloader et une validation effective de l'image
  à tester sur matériel. Tant que cela n'est pas prouvé, le rollback est
  une **procédure humaine de récupération**, pas une garantie automatique.
- Un reset MINI n'est jamais déclenché par une tâche périodique. Il reste
  une action utilisateur distincte et intentionnelle.

## Critères d'arrêt

Ne pas publier, flasher ou déclarer la MINI terminée si un SHA ne correspond
pas, si une CI est absente/rouge, si la MINI est inaccessible, si le
Companion n'autorise pas l'action ou si aucune restauration locale
réaliste n'est possible.
