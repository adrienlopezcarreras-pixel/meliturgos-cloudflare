# MINI — Waveshare ESP32-S3-Touch-LCD-3.5-C

Target matériel : Waveshare ESP32-S3-Touch-LCD-3.5-C (écran 320x480, tactile FT6336, caméra OV5640, codec ES8311, PMIC AXP2101).

Le firmware MINI v0.4.2 est construit sur la base officielle Waveshare épinglée au commit `283ec84c566c096f8c30493b93dcd4b0bb608de7`. La CI compile avec ESP-IDF 5.4.2 afin que la caméra utilise le nouveau pilote I2C/SCCB et n'entre pas en conflit avec le bus I2C moderne déjà utilisé par l'écran, le tactile et l'audio.

Parcours normal :
1. MINI démarre d'abord l'écran, le tactile et l'interface locale.
2. L'écran Wi-Fi permet de scanner les réseaux, choisir un SSID, saisir le mot de passe avec le clavier tactile, ou saisir un SSID manuellement.
3. Les identifiants Wi-Fi sont mémorisés en NVS et MINI tente automatiquement la reconnexion aux démarrages suivants.
4. L'icône MEL ouvre l'écran d'appairage. Le code créé dans MEL > MINI est saisi directement sur l'écran tactile.
5. Après appairage, le bouton PARLER enregistre le micro ES8311, envoie la voix à MEL, affiche la réponse, puis tente la restitution vocale au haut-parleur.
6. La caméra OV5640, le heartbeat vers Professor, le téléchargement d'assets et l'OTA restent intégrés au runtime.

Le démarrage matériel doit rester prioritaire : un périphérique optionnel indisponible ne doit pas empêcher l'écran/tactile/Wi-Fi de démarrer.
