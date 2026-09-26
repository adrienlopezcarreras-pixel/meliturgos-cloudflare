# MINI — Waveshare ESP32-S3-Touch-LCD-3.5-C

Target matériel : Waveshare ESP32-S3-Touch-LCD-3.5-C (écran 320x480, tactile FT6336, caméra OV5640, codec ES8311, PMIC AXP2101).

Le firmware MINI v0.4.6 est construit sur la base officielle Waveshare épinglée au commit `283ec84c566c096f8c30493b93dcd4b0bb608de7`. La CI compile avec ESP-IDF 5.4.2 afin que la caméra utilise le nouveau pilote I2C/SCCB et n'entre pas en conflit avec le bus I2C moderne déjà utilisé par l'écran, le tactile et l'audio.

Parcours normal :
1. MINI démarre d'abord l'écran, le tactile et l'interface locale.
2. L'écran Wi-Fi permet de scanner les réseaux, choisir un SSID, saisir le mot de passe avec le clavier tactile, ou saisir un SSID manuellement.
3. Les identifiants Wi-Fi sont mémorisés en NVS et MINI tente automatiquement la reconnexion aux démarrages suivants.
4. L'icône MEL ouvre l'écran d'appairage. Le code créé dans MEL > MINI est saisi directement sur l'écran tactile.
5. Après appairage, le bouton PARLER enregistre le micro ES8311, envoie la voix à MEL, affiche la réponse, puis tente la restitution vocale au haut-parleur.
6. La caméra OV5640, le heartbeat vers Professor, le téléchargement d'assets et l'OTA restent intégrés au runtime. LVGL est isolé sur un cœur dédié; les tâches caméra et stress restent sur l'autre cœur afin d'éviter les blocages observés lors des changements de vues.

Le démarrage matériel doit rester prioritaire : un périphérique optionnel indisponible ne doit pas empêcher l'écran/tactile/Wi-Fi de démarrer.

## Validation physique connue

La carte réelle a validé le démarrage ESP-IDF 5.4.2, l'écran/tactile, l'AXP2101, l'ES8311, le Wi-Fi 2,4 GHz et une capture OV5640 320x480. Le chemin réel du bouton tactile MEL a été injecté 24 fois via `LV_EVENT_CLICKED`, avec ouverture/fermeture complète de la vue d’appairage à chaque cycle. La carte réelle a terminé `UI STRESS PASS` sans watchdog ni redémarrage, avec ~8,10 Mo de heap libre. Ces preuves doivent être reconfirmées sur tout firmware candidat final avant publication.

## Stockage média interne

MINI utilise désormais la partition FAT `storage` de la flash interne avec wear levelling. Elle est montée sur `/melstore`, auto-formatée si nécessaire puis testée en lecture/écriture au démarrage. Les ressources du manifeste sont téléchargées sous `/melstore/mel`; aucune carte microSD n'est requise pour cette fonction.
