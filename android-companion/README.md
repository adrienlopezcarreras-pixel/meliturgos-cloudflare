# MEL Android Companion

Premier lot natif de **GEN2-27**.

## Sécurité

- Le téléphone n'enregistre jamais le mot de passe propriétaire.
- Le propriétaire génère un code de pairing à usage unique via `POST /api/android/v1/pair-code`.
- L'app échange ce code contre un jeton appareil via `POST /api/android/v1/pair`.
- Le jeton est chiffré avec une clé AES/GCM non exportable d'Android Keystore.
- Le manifeste interdit le trafic HTTP en clair.
- Le serveur ne conserve que le hash SHA-256 du jeton.
- Le propriétaire peut révoquer un appareil avec `POST /api/android/v1/revoke`.

## Protocole

- `POST /api/android/v1/heartbeat`
- `POST /api/android/v1/chat`
- `GET /api/android/v1/sync?conversation_id=...`
- `POST /api/android/v1/sync/ack`
- `POST /api/android/v1/voice/transcribe`

La synchronisation est incrémentale : le checkpoint représente le dernier message effectivement acquitté. Les polls suivants retournent uniquement les messages de timestamp strictement supérieur.

## État

Ce lot livre le protocole, le stockage sécurisé du jeton et une Activity native minimale pour pairing/chat/sync. La capture micro Android continue, les notifications, le service de fond et la construction APK signée restent des lots suivants avant `DONE_VERIFIED`.
