# MEL Android — reconnaissance vocale FR / ES / PT

## Comportement réellement implémenté

- Android API 34+ : mode `AUTO` propose la détection et le basculement entre français, espagnol et portugais (PT-PT / PT-BR). Ces extras sont **facultatifs** pour le moteur vocal installé : il peut les ignorer.
- Android API <34 : pas de promesse de détection automatique. Bouton de sélection explicite dans la vue vocale : FR, ES, PT-PT, PT-BR.
- Sur toutes les versions : un choix manuel force `RecognizerIntent.EXTRA_LANGUAGE`, est conservé localement et s'applique à la prochaine dictée.
- Changement interdit pendant un enregistrement ou une conversation vocale active pour éviter de relancer le moteur au milieu d'un tour.
- En absence de prise en charge, la capture audio serveur reste un recours ; un recours ne signifie pas que le moteur Android local reconnaît la langue.

## Matrice de qualification physique

| Version Android | Mode | Preuve requise |
|---|---|---|
| API <34 | FR, ES, PT-PT, PT-BR | 10 énoncés par langue, mots non français, accents, ponctuation |
| API 34+ | AUTO | Vérifier que le moteur émet effectivement ses identifications et change de langue ; ne pas inférer le succès de la présence des extras |
| Toutes | Manuel | Sélection mémorisée après fermeture/réouverture, refus de changement en session active |
| Toutes | Panne | Moteur absent, modèle de langue manquant, perte réseau, abandon, reprise micro |
| Toutes | Conversation | Deux questions de suite, changement de sujet, interruption vocale, réponses longues |

Les tests de contrat dans `tests/android-manual-speech-locale-contract.test.mjs` confirment le câblage de l'interface et les barrières de version. Seuls des essais sur téléphone démontrent la reconnaissance effective.

## Documentation officielle

- https://developer.android.com/reference/android/speech/RecognizerIntent
- https://developer.android.com/reference/android/speech/SpeechRecognizer
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start

**Statut : validation CI candidate, pas DONE_VERIFIED matériel.**
