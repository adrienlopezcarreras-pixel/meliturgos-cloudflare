# MEL Terminal Protocol v1.0

Target initial: `waveshare-esp32-s3-touch-lcd-3.5-c`.

## But

Le terminal n'exécute pas le grand modèle localement. Il est l'interface matérielle de MEL : écran tactile, microphone, caméra, audio, microSD, Wi-Fi, télémétrie et récupération. L'intelligence conversationnelle reste sur le runtime MEL.

## États

`UNPROVISIONED -> WIFI_CONFIGURED -> PAIRING -> PAIRED -> ONLINE`.

États transitoires: `DEGRADED`, `UPDATING`, `RECOVERY`.

La reconfiguration se fait depuis l'interface tactile Wi-Fi/appairage. La configuration persistante reste en NVS entre les mises à jour applicatives.

## Provisioning

Au premier démarrage, MINI ouvre son écran Wi-Fi tactile. L'utilisateur peut scanner les réseaux 2,4 GHz, choisir un SSID, saisir le mot de passe avec le clavier tactile ou entrer un SSID manuellement.

Après connexion, le code d'appairage MEL à usage unique est saisi directement sur MINI. Le mot de passe opérateur MEL n'est jamais envoyé ni stocké sur le terminal. Les identifiants Wi-Fi et le jeton appareil sont conservés en NVS pour la reconnexion automatique.

## Appairage

Le propriétaire crée côté MEL un code temporaire de 8 caractères, durée 10 minutes.

`POST /api/device/v1/pair`

Requête minimale:
```json
{
  "device_id": "mel-A1B2C3",
  "model": "waveshare-esp32-s3-touch-lcd-3.5-c",
  "firmware": "0.4.5-stability",
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

## Liaison locale Bluetooth MINI ↔ Android

Le transport Bluetooth est complémentaire au Wi-Fi. Il permet à l'application Android MEL de détecter MINI et de garder une liaison locale même lorsque le terminal n'est pas joignable par le cloud.

MINI agit comme périphérique BLE / serveur GATT et annonce le nom `MEL-MINI`. Android agit comme central / client GATT.

UUID MEL v1:
- service: `7d4b0001-6d65-4c49-4e49-2d4252494447`;
- état read + notify: `7d4b0002-6d65-4c49-4e49-2d4252494447`;
- commandes write: `7d4b0003-6d65-4c49-4e49-2d4252494447`.

État minimal JSON:
```json
{"v":1,"online":true,"state":0}
```

Commandes v1:
- `ping`: demande une notification d'état;
- `status`: demande une notification d'état;
- `voice`: déclenche le chemin vocal local de MINI.

L'adresse du MINI validé peut être mémorisée côté Android pour accélérer la reconnexion. En cas d'échec, l'application recommence un scan filtré par UUID de service.

Le BLE v1 n'est pas présenté comme un accès Internet. Le Wi-Fi reste le transport réseau principal de MINI. Un éventuel proxy Internet téléphone → MINI devra être spécifié séparément avant activation.


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
2. produire deux images distinctes : l'image applicative `mel-terminal.bin` pour OTA et l'image fusionnée `mini-first-install.bin` pour une première installation USB à l'offset 0;
3. calculer les SHA-256 des deux images;
4. téléverser d'abord les deux binaires;
5. publier le manifeste en dernier.

Une image fusionnée ne doit jamais être écrite directement dans une partition OTA. Les mises à jour OTA utilisent uniquement l'image applicative ESP-IDF.

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
