# Audit intégré MEL MINI / APK Android / Companion Windows
**Date : 10 octobre 2026 — PR #1212 — preuve source et CI uniquement**

## Périmètre

- MINI : Waveshare ESP32-S3-Touch-LCD-3.5-C, firmware `0.6.14-pa-ctrl`,
  code basé sur Waveshare `283ec84c566c096f8c30493b93dcd4b0bb608de7`,
  ESP-IDF 5.4.2, audio ES8311, caméra OV5640, tactile, BLE NimBLE.
- APK MEL Android candidat `0.7.10-mini-v2-integration`, versionCode 88,
  Android central GATT, UI Compose, voix française locale et secours réseau.
- Companion Windows : build contrôlé et contrats API/autorisation locale.
- Backend MEL : API propriétaire, jetons MINI, garde-fous du contrôle PC.

## Correctifs appliqués (PR #1212)

1. **BLE** : Android utilise un client central ABF0/ABF1/ABF2/ABF3 et non
   un second serveur GATT ; permissions `BLUETOOTH_SCAN` et
   `BLUETOOTH_CONNECT` sur Android 12+, localisation sur Android 6–11.
2. **Sécurité** : écriture GATT chiffrée, BLE Secure Connections et bonds
   conservés en NVS. Pairing Android système avant négociation MTU ;
   la MINI initie la procédure de sécurité. *Just Works ne garantit
   pas la résistance à un homme-du-milieu actif.*
3. **Vérité de session** : réception HELLO seule = lien GATT, **pas**
   protocole opérationnel. MINI valide l'horloge SESSION et envoie
   `ACK / SESSION_OK` depuis une tâche distincte du callback NimBLE ;
   Android n'annonce `protocolReady` qu'après cet acquittement.
   Délai de dix secondes, diagnostic de timeout et reconnexion.
   `internetReady` exige en outre une réponse MEL authentifiée.
4. **Fiabilité** : scan Bluetooth résilient aux permissions révoquées,
   refus et `connectGatt == null`. Pas de readiness sur anciennes
   notifications provenant d'un GATT fermé.
5. **Voix** : flux IMA-ADPCM échantillonné et limité à sa taille
   annoncée ; WAV16k vers STT ; synthèse locale fr-FR Android en
   PCM48/ADPCM vers la MINI, STOP VOIX et secours audio.
6. **Réseau/mémoire** : lecture HTTP bornée à 512 Kio pour les réponses
   STT et 8 Mio pour les réponses générales, même sans Content-Length.
   Test JVM réel du lecteur avec 1 000 tailles aléatoires et
   simulation d'un flux sans fin.
7. **Médias** : synchronisation du profil vocal « OK MEL », rendu MIMG
   borné et vérification HTTPS de l'image distante.
8. **Préservation** : aucune tâche GitHub ne peut reset la MINI ;
   l'ancien updater 0.4.37 est manuel et archivé, aucun flash OTA
   automatique ; la NVS ne s'efface plus automatiquement en cas
   d'erreur de démarrage.
9. **Intégration** : merge à deux parents des évolutions MEL `main`
   sans écraser le code MINI ou les autres fonctionnalités.

## Matrice des preuves

| Test | Preuve | Limite |
|---|---|---|
| 10 000 trames Link V2 | Encodeur/parseur C++ réel sur runner | Pas de vraie liaison radio |
| ~50 000 entrées invalides | Rejets CRC/taille/séquences C++ | Pas d'interférences RF |
| 1 000 blocs ADPCM | Codec C++ et comparaison de blocs | Pas d'ES8311 physique |
| 10 000 trames + 1 000 blocs | Kotlin Android sur JVM | Pas de Bluetooth physique |
| 1 000 corps HTTP aléatoires | Kotlin JVM, plus flux sans fin | Pas de réponse réseau réelle |
| APK | Build et signature de test vérifiés | Installation sur téléphone non faite |
| Android Compose | Tests instrumentés émulateur | Le BLE vrai n'est pas émulé |
| Companion Windows | Exécutable/paquet validé sur runner Windows | PC utilisateur non testé |
| Backend complet | Suite `npm test` en CI | Services tiers/production non exhaustifs |
| Architecture | Audit croisé bloquant si contrat divergent | Contrôles source, pas un handshake matériel |

La réussite du SHA historique `234800a9d207c901427ae1db36f90fb9eb448085`
est prouvée par les quatre workflows de la PR et les ZIP téléchargés
puis contrôlés localement. **Les correctifs ultérieurs doivent avoir
leurs propres CI vertes sur le SHA exact** ; les preuves précédentes
ne valident pas une version modifiée.

## Contrôles à réaliser uniquement avec opérateur présent

- Sauvegarder NVS, partitions et identifiants avant tout flash ;
  ne pas utiliser `mini-first-install.bin` sur une MINI déjà appairée.
- Appairage BLE réel, autorisation système, perte/rétablissement
  permissions, 30 déconnexions/reconnexions et vérification du bond.
- 10 commandes STT, 10 synthèses TTS locales françaises, arrêt de
  voix pendant la lecture, multi-tour, Wi-Fi + Bluetooth simultanés,
  perte internet, audio sans tonalité ni saturation.
- Caméra, écran, tactile, mémoire, charge batterie, sommeil,
  redémarrage, authentification Companion Windows.
- Vérifier explicitement le rollback OTA **sur la carte**, car deux
  partitions OTA ne prouvent pas que le rollback auto est actif.
- Évaluer authentification anti-MITM adaptée à la MINI sans écran
  de saisie sûr avant mise en production large.

**Statut : candidat logiciel avec preuves CI, PAS `DONE_VERIFIED` matériel.**
Aucune OTA, installation, reset, suppression de NVS ou commande PC
sur les appareils utilisateur n'est autorisée par cet audit.

## Références
- `docs/mini-firmware-safe-update-rollback.md`
- https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-3.5
- https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- https://docs.espressif.com/projects/esp-idf/en/v5.4.2/esp32/api-reference/system/ota.html
- https://mynewt.apache.org/v1_10_0/network/ble_hs/ble_gap.html
