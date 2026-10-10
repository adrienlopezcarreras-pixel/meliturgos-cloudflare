# MEL MINI — Waveshare ESP32-S3 Touch LCD 3.5-C

Firmware de base `0.6.14-pa-ctrl`, ESP-IDF 5.4.2, base officielle
Waveshare commit `283ec84c566c096f8c30493b93dcd4b0bb608de7`.
Caméra OV5640, écran/tactile, AXP2101, ES8311 et stockage interne FAT.

## Protocole

La MINI est **périphérique/serveur BLE Link V2**. L'APK doit être
central/client BLE pour ABF0/ABF1/ABF2/ABF3, MTU négocié et flux
audio ADPCM avec CRC, séquences et crédits. Le candidat de correction
impose une liaison chiffrée avec appairage/bonding BLE pour les
caractéristiques d'écriture, une SESSION horodatée valide et une
MEDIA_CONFIG uniquement après session sécurisée.
Une réception HELLO n'est **jamais** suffisante pour annoncer la
session opérationnelle. La MINI émet `ACK / SESSION_OK` uniquement
après validation de la SESSION et de l'horloge, hors du callback NimBLE.

Le transport reste en **candidat** : l'appairage Just Works doit encore
faire l'objet d'une analyse MITM et être testé avec le vrai téléphone.

## Validation

Les suites C++ sur GitHub Actions testent 10 000 trames aléatoires,
près de 50 000 corruptions/troncatures et 1 000 blocs ADPCM.
Ce ne sont PAS des tests micro ou haut-parleur sur carte réelle.

Le flash USB et la mise à jour OTA ne s'exécutent pas automatiquement.
Aucun reset ne peut venir de la routine planifiée GitHub.
Sur la carte réelle, vérifier micro, sortie vocale, caméra, Wi-Fi/BLE,
appairage, 30 reconnexions, 10 STT/TTS, mémoire et redémarrage.
La sauvegarde des paramètres/NVS précède toute installation physique.
Voir `docs/mini-firmware-safe-update-rollback.md`.

**Aucune déclaration DONE_VERIFIED sans preuve matérielle sur le SHA exact.**
