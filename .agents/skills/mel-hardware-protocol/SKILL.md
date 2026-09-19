---
name: mel-hardware-protocol
description: Concevoir, faire évoluer, compiler et valider les protocoles de terminaux matériels utilisés par MEL. Utiliser pour ESP32/Waveshare, provisioning, appairage, télémétrie, voix, caméra, téléchargement, microSD, OTA et récupération.
---

# MEL Hardware Protocol Engineering

Cette compétence sert à MEL lorsqu'elle développe ou modifie un terminal matériel qui devient une extension de son runtime.

## Principe

Ne jamais traiter le firmware et le serveur comme deux projets indépendants. Ils forment un **contrat de protocole versionné**. Toute évolution doit être pensée simultanément côté appareil, backend, interface opérateur, tests, CI, mise à jour et récupération.

Le protocole de référence courant est documenté dans `docs/mel-terminal-protocol-v1.md`.

## Méthode obligatoire

1. Identifier le modèle matériel exact, ses pilotes constructeur et leurs versions.
2. Épingler la source constructeur par SHA avant de modifier le firmware.
3. Définir les états de l'appareil et les transitions avant d'ajouter des écrans ou endpoints.
4. Versionner explicitement le protocole.
5. Séparer l'identité opérateur de l'identité appareil.
6. Utiliser un appairage court/à usage unique puis un jeton appareil révocable.
7. Faire annoncer au terminal ses capacités et sa version au serveur.
8. Garder un heartbeat borné et une télémétrie minimale.
9. Encadrer tous les téléchargements par un préfixe de stockage et un manifeste.
10. Pour l'OTA, écrire la partition inactive, vérifier avant bascule, et conserver un chemin de récupération.
11. Prévoir une remise à zéro locale qui ne dépend pas du serveur.
12. Compiler la **vraie cible** en CI, pas seulement le backend ou des mocks.
13. Séparer les niveaux de preuve: tests logiciels, compilation de la cible, test matériel physique.
14. Après validation, enregistrer la leçon utile dans l'XP sans dupliquer une règle déjà connue.

## Contrat MEL Terminal v1

Modèle initial: `waveshare-esp32-s3-touch-lcd-3.5-c`.

Routes principales:
- `POST /api/device/v1/pair`
- `GET /api/device/v1/manifest`
- `POST /api/device/v1/heartbeat`
- `POST /api/device/v1/chat`
- `POST /api/device/v1/voice/transcribe`
- `GET /api/device/v1/download?key=...`

En-têtes appareil après appairage:
- `Authorization: Bearer <device-token>`
- `X-MEL-Device-ID: <device-id>`

Version courante: `1.0`.

Si firmware et serveur annoncent des versions incompatibles, **refuser proprement** au lieu de continuer silencieusement.

## Règles de sécurité

- Ne jamais stocker le mot de passe opérateur MEL dans le terminal.
- Ne jamais exposer un jeton appareil dans l'UI ou les logs.
- Ne pas transformer le terminal en serveur Internet entrant.
- Provisioning local uniquement.
- Les routes appareil doivent rester distinctes des routes opérateur.
- Un manifeste ne doit jamais rendre accessible un objet hors du préfixe du modèle.
- Une mise à jour ne devient stable qu'après build reproductible et preuve de checksum.

## Règles de preuve

**Logiciel vert** != **matériel validé**.

Pour annoncer:
- « protocole implémenté »: backend + tests du contrat verts;
- « firmware flashable »: build ESP-IDF réel + binaire fusionné + SHA256;
- « terminal validé »: démarrage, écran/tactile, Wi-Fi, appairage, micro, caméra, audio, stockage, OTA et récupération observés sur la carte physique.

Quand la carte n'est pas disponible, MEL doit continuer jusqu'au niveau firmware flashable et préparer le protocole de recette physique; elle ne doit pas inventer la dernière preuve.
