# MINI — Waveshare ESP32-S3-Touch-LCD-3.5-C

Target matériel: Waveshare ESP32-S3-Touch-LCD-3.5-C (écran 320x480, tactile FT6336, caméra OV5640, codec ES8311, PMIC AXP2101, microSD).

Le build est volontairement basé sur l'exemple officiel Waveshare épinglé au commit `283ec84c566c096f8c30493b93dcd4b0bb608de7`. Le dépôt MEL ne vendore pas leurs pilotes: la CI récupère ce commit, superpose les fichiers MEL de ce dossier, puis compile avec ESP-IDF.

Premier démarrage:
1. MINI crée un Wi-Fi WPA2 `MINI-SETUP-xxxx`; le mot de passe et l'adresse `192.168.4.1` sont affichés à l'écran.
2. Dans MEL > MINI, créer un code d'appairage valable 10 minutes.
3. Se connecter au Wi-Fi de MINI depuis un téléphone/PC, ouvrir `http://192.168.4.1`, saisir le Wi-Fi domestique et le code.
4. MINI rejoint Internet, échange le code contre un jeton appareil et n'enregistre jamais le mot de passe MEL.
5. Le bouton PARLER enregistre le micro, envoie la voix à MEL et affiche la réponse pendant le test v0.2. L'étape suivante ajoute la restitution TTS au haut-parleur.

Le bouton BOOT maintenu au démarrage efface uniquement la configuration Wi-Fi/appairage de MINI et relance MINI-SETUP.
