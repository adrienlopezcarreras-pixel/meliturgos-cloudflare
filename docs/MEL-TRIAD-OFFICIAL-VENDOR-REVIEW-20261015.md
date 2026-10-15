# MEL — intégration MINI + Android + Companion : sources officielles (15/10/2026)

Statut : recherche et exigences techniques, pas de validation physique ni de DONE_VERIFIED. Base GitHub examinée : cd9bb1eb28bfa903fbaedb8898887f151a110572.

## Documents fabricants
- Waveshare ESP32-S3-Touch-LCD-3.5 / version -C : https://www.waveshare.com/esp32-s3-touch-lcd-3.5.htm
- Waveshare exemples ES8311 et caméra : https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-3.5
- Waveshare FAQ OV5640 : https://docs.waveshare.com/ESP32-S3-Touch-LCD-3.5/FAQ
- Espressif coexistence Wi-Fi/BLE : https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/coexist.html
- Espressif NimBLE MTU : https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/kconfig-reference.html
- Espressif OTA rollback : https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html
- Android TTS listener : https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener
- Microsoft UI Automation : https://learn.microsoft.com/windows/win32/winauto/entry-uiauto-win32
- Microsoft Windows Graphics Capture : https://learn.microsoft.com/windows/apps/develop/media-authoring-processing/screen-capture

## Implémentation et recette
1. Vérifier variante 3.5-C (ST7796/FT6336, ES8311, OV5640) avant tout portage de broches ou pilotes. Ne pas mélanger 3.5B.
2. Android : callbacks TTS sur threads multiples; alignement format audio, ordre des trames, annulation, limite mémoire, langues FR/ES/PT réellement hors réseau. PR #1594 corrige le blocage possible du constructeur TTS séparément.
3. BLE : réutiliser uniquement le MTU négocié, contrôler crédits, CRC, numéros de séquence, STOP, dédoublonnage et expiration de session. Just Works bonding ne garantit pas protection MITM ; identité applicative obligatoire pour les secrets/commandes.
4. Tester latence et débit audio lorsque Wi-Fi et BLE coexistent sur la radio ESP32-S3, y compris caméra active et après 30 ruptures/reconnexions.
5. Companion Windows : UI Automation pour éléments sémantiques et Graphics Capture consentie pour la vision; approbation locale révocable, résultat d'exécution et non simple ACK ; mode autonome mobile si Companion absent.
6. Firmware OTA : vérifier configuration effective rollback, pas simplement la présence ota_0/ota_1 ; sauvegarde NVS, signature/SHA, intervention physique autorisée et récupération USB sans erase_flash par défaut.
7. Déclarer succès uniquement après preuve SHA exact sur les trois builds et les trois appareils physiques.

## Documents MEL compatibles à préserver
- docs/MEL-TRIAD-INTEGRATION-CONTRACT-20261014.md
- firmware/waveshare-terminal/README.md
- docs/mini-firmware-safe-update-rollback.md
- android-companion/app/src/main/java/fr/veriteinterdite/mel/MelMiniVoiceSynthesizer.kt
- android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt

Ce document ne remplace ni les tests hardware ni l'audit détaillé des branches parallèles.