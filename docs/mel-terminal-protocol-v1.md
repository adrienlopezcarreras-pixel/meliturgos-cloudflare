# MEL Terminal Protocol v1.0

Target initial: `waveshare-esp32-s3-touch-lcd-3.5-c`.

## But

Le terminal n'exécute pas le grand modèle localement. Il est l'interface matérielle de MEL : écran tactile, microphone, caméra, audio, microSD, Wi-Fi, télémétrie et récupération. L'intelligence conversationnelle reste sur le runtime MEL.

## États

`UNPROVISIONED -> WIFI_CONFIGURED -> PAIRING -> PAIRED -> ONLINE`.

États transitoires: `DEGRADED`, `UPDATING`, `RECOVERY`.

Le bouton BOOT au démarrage efface uniquement la configuration MEL du terminal et retourne à `UNPROVISIONED`.

## Provisioning

Au premier démarrage, le terminal crée un point d'accès local WPA2 `MEL-SETUP-xxxx` et sert `http://192.168.4.1`.

L'utilisateur saisit:
- SSID Wi-Fi;
- mot de passe Wi-Fi;
- code d'appairage MEL à usage unique.

Le mot de passe opérateur MEL n'est jamais envoyé ni stocké sur le terminal.

## Appairage

Le propriétaire crée côté MEL un code temporaire de 8 caractères, durée 10 minutes.

`POST /api/device/v1/pair`

Requête minimale:
```json
{
  "device_id": "mel-A1B2C3",
  "model": "waveshare-esp32-s3-touch-lcd-3.5-c",
  "firmware": "0.1.0",
  "protocol_version": "1.0",
  "pair_code": "ABCDEFGH"
}
```

Réponse: jeton appareil aléatoire + `protocol_version`. Le code est consommé une fois. Le terminal conserve le jeton dans NVS et supprime le code.

## Authentification appareil

Toutes les routes appareil après appairage utilisent:
- `Authorization: Bearer <device-token>`
- `X-MEL-Device-ID: <device-id>`

Le serveur stocke seulement le hash du jeton.

## Heartbeat

`POST /api/device/v1/heartbeat` toutes les ~15 secondes.

Champs actuels: firmware, protocol_version, Wi-Fi RSSI, heap libre, IP, uptime, caméra, microphone, haut-parleur, microSD, phase.

L'interface MEL considère un terminal en ligne si son dernier contact date de moins de 30 secondes.

## Conversation

`POST /api/device/v1/chat` transmet le texte au runtime conversationnel MEL avec une conversation liée au terminal.

`POST /api/device/v1/voice/transcribe` reçoit un multipart WAV et utilise la transcription vocale du runtime. Le texte transcrit repart ensuite vers `/chat`.

## Téléchargements et microSD

`GET /api/device/v1/manifest` fournit firmware et ressources.

`GET /api/device/v1/download?key=...` ne sert que les objets sous le préfixe privé du modèle. Les ressources listées dans le manifeste peuvent être synchronisées vers `/sdcard/mel/`.

## OTA

Deux partitions applicatives sont prévues. Le terminal télécharge le binaire publié, écrit la partition OTA inactive puis la définit comme partition de démarrage.

Publication sûre:
1. compiler la vraie cible ESP32-S3;
2. produire le binaire fusionné à l'offset 0;
3. calculer SHA-256;
4. téléverser le firmware;
5. publier le manifeste en dernier.

Le workflow de publication exige une approbation explicite et un SHA de source exact.

## Compatibilité

Version courante: `1.0`.

Le firmware envoie sa version de protocole pendant l'appairage. Le serveur refuse une version incompatible avec `PROTOCOL_UNSUPPORTED` au lieu de continuer silencieusement.

Toute évolution incompatible doit créer une nouvelle version de protocole. Les ajouts compatibles restent optionnels jusqu'à ce que firmware et serveur les annoncent tous deux.

## Preuves

Trois niveaux sont distincts:
1. tests backend/UI verts;
2. compilation ESP-IDF de la vraie carte + artefact flashable;
3. validation physique sur la carte réelle.

Les niveaux 1 et 2 ne doivent jamais être présentés comme une preuve du niveau 3.
