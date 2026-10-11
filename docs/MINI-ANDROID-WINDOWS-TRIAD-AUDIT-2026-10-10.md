# Audit intégré MINI / Android / Companion Windows — 10 octobre 2026

## Périmètre et règle de preuve

Audit du code présent sur `main` au SHA `af9993043272744a57dc5254275ec11d2a1246da`
plus les modifications de la PR #1208. Les preuves GitHub Actions de cette PR
sont des **preuves de code/CI**, pas des tests physiques sur les appareils.

**Statut de l'intégration : BLOQUÉ** tant que les rôles GATT et le protocole de
l'APK ne correspondent pas à ceux de la MINI. Une CI verte d'un composant
ne vaut jamais preuve que le trio fonctionne ensemble.

## Relecture documentaire

- Waveshare : `firmware/waveshare-terminal/README.md` et base Waveshare officielle
  ESP32-S3-Touch-LCD-3.5 (commit épinglé `283ec84c...`).
- Architecture : `docs/mini-firmware-safe-update-rollback.md`, et l'ancien
  prototype `docs/mini-android-link-v2-architecture.md` de la PR #1142.
- Android : `android-companion/README.md`, `.agents/ANDROID_APP_100_CYCLES_20260923.md`,
  `android-companion/app/src/main/AndroidManifest.xml`, `MelViewModel`,
  `MelApiClient`, `MelBleBridgeService`, TTS, arrière-plan et tests.
- Windows : `windows-companion/MEL-Companion.cs`,
  `assets/MEL-Computer-Companion.ps1`, serveur `computer-companion-api.js`,
  workflows de release et tests.
- Références amont :
  - https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-3.5
  - https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
  - https://developer.android.com/develop/background-work/services/fgs/service-types
  - https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener
  - https://docs.espressif.com/projects/esp-idf/en/v5.4.2/esp32/api-reference/system/ota.html

## Blocage P0 — incompatibilité réelle des rôles BLE

- MINI `0.6.14-pa-ctrl` : service GATT NimBLE **périphérique/serveur**
  (`mel_link_v2_server.cpp`) ; protocole binaire `M2` version 2,
  service ABF0 et caractéristiques ABF1/ABF2/ABF3.
- APK sur `main` : `0.6.58-mini-stable-bridge` ;
  `MelBleBridgeService.kt` ouvre un serveur GATT avec publicité BLE et
  `MainActivity.kt` démarre ce service. Le client central
  `MelLinkV2ClientService.kt` et `MelLinkV2Protocol.kt` ne sont
  **pas intégrés** dans `main`.
- Le manifeste Android n'a pas `BLUETOOTH_SCAN`, permission requise
  pour la découverte centrale Android moderne.
- Un serveur GATT Android ne peut pas initier, à lui seul, une liaison
  client vers un second serveur GATT MINI. Les tests Android actuellement
  verts peuvent donc être entièrement locaux au protocole historique.

Le brouillon PR #1142 contient un client V2 et une synthèse TTS locale
(`0.7.9-mini-local-fr-tts`), **mais est toujours un brouillon divergent**.
Ne pas copier son APK ou ses anciens firmwares sans audit de dépendances,
validation exacte-SHA et tests interopérables.

### Critères obligatoires de correction

1. Porter/reconstruire proprement le client BLE Android V2 sur `main`
   sans écraser les fonctionnalités actuelles du chat Android.
2. Déclarer et demander à l'exécution `BLUETOOTH_SCAN` et `BLUETOOTH_CONNECT` ;
   service `connectedDevice`, MTU, découverte ABF0, ABF1/ABF2/ABF3,
   CCCD, HELLO/SESSION, CRC16, crédit/backpressure et reconnection bornée.
3. Désactiver l'ancien serveur/annonceur Android comme chemin de communication
   avec la MINI, puis migrer les indications de statut et les utilisateurs.
4. Prouver TTS Android `onBeginSynthesis`/`onAudioAvailable` -> mono PCM48k
   -> Link V2 -> ES8311, STT ADPCM -> WAV16k -> MEL, STOP VOIX,
   gestion des interruptions, des délais et des reconnexions.
5. Avoir la **même révision de protocole** dans les deux binaires exact-SHA,
   puis test physique sur MINI/téléphone en présence de l'utilisateur.

## Risque supplémentaire P0 — confiance du canal GATT MINI

Dans `mel_link_v2_server.cpp`, les caractéristiques de contrôle et de
données ont actuellement les droits `BLE_GATT_CHR_F_WRITE` et
`BLE_GATT_CHR_F_WRITE_NO_RSP`, sans exigence explicite d'écriture BLE
chiffrée/authentifiée dans cette définition. Dans
`mel_link_v2_transport.cpp`, la réception d'un paquet `SESSION`
met `g_session_ready=true` même si l'analyse de l'horloge renvoie
`false` ; `MEDIA_CONFIG` peut aussi fournir des identifiants réseau.

**Conclusion conservatrice :** avant tout appairage final, établir et
tester une identité du central Android, une protection du transport
ou une authentification applicative des sessions et configurations.
Le simple CRC16 détecte des corruptions mais **ne constitue pas une
authentification**. Aucun test de sécurité matériel/pentest BLE n'a
été réalisé ; il ne faut pas prétendre qu'une exploitation distante a
été démontrée. Le script d'audit exige désormais un verrou explicite
sur ces deux invariants.

## Sécurité Companion / MINI

- `remote_access_enabled=false` reste le défaut au premier appairage
  Windows. Cela ne prouve pas à lui seul l'état de l'instance installée.
- Défaut confirmé et corrigé dans la PR #1208 : l'ancien runner pouvait
  déclencher `serial.hard_reset` via GitHub Actions sur simple variable
  `MEL_MINI_RESET_APPROVED=1`. Cette voie a été retirée du runner et de
  l'allowlist OIDC côté API. Un reset exige désormais le chemin propriétaire
  avec autorisation locale ; aucun reset automatique n'est admis.
- Pas de flash, de reset physique, de publication OTA ou de changement de
  permissions distant pendant l'absence du propriétaire.
- L'ancien `mini-windows-updater.yml` assemble encore la version 0.4.37 :
  il ne doit pas être utilisé comme installeur actuel.
- La présence des deux partitions OTA ne prouve pas que
  `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` est activé dans le firmware effectif.
  La récupération USB/NVS et un vrai essai de rollback sont encore nécessaires.

## Matrice de stress et limites

| Domaine | Charge | Type de preuve | Critère |
|---|---|---|---|
| MINI Link V2 | 10 000 trames, tailles 0–169 octets | vrai parseur/encodeur C++ | CRC, tailles, numéro de séquence, intégrité |
| MINI robustesse | ~50 000 injections rejetées | vrai parseur C++ | corruption et troncature explicitement rejetées |
| MINI codec | 1 000 blocs IMA ADPCM | vrai encodeur/décodeur C++ | longueur, reconstruction, indépendance |
| Android | Gradle unit tests + assembleDebug | compilation/JVM sans appareil | aucun échec logiciel |
| Windows | compilation et vérification paquet | runner Windows sans ordinateur utilisateur | somme/package conformes |
| Backend/Companion | tests API + `npm test` | Node/D1 mock | 0 échec |
| Ensemble | script `mini-triad-audit.mjs` | analyse de contrats à trois appareils | doit rester ROUGE si V2 non intégré |
| Physique | BLE 30 reconnexions, STT/TTS ×10, micro, HP, caméra, veille | **non exécuté** | présence et autorisations explicites requises |

Ne jamais présenter les essais CI/émulés comme une connexion réelle MINI ↔ Android.
Ne pas confondre tests de sécurité négatifs avec une preuve d'absence de toute
défaillance. L'audit doit garder ses blocages tant que les critères ci-dessus
n'ont pas de preuves positives.

## Trajectoire de correction

Priorité 1 : Link V2 Android / MINI exact-SHA ; 2 : preuve audio dans les deux
sens et résistance à 30 reconnexions ; 3 : cohérence d'état chat/Companion ;
4 : installation manuelle, sauvegarde des configurations, rollback et
qualité interface/performance ; 5 : bilan final matériel horodaté.

**Le système complet n'est pas `DONE_VERIFIED` à cette date.**
