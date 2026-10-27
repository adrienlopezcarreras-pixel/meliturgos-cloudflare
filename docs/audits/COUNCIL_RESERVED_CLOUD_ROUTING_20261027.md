# Council — routage Cloud réservé à travers les enveloppes

Base : fb2f7630de1dfb47cff70fab15c8cb99a32e5149. Worker observé : 07b2c5272da3536a80b4ab0e43e94de0c64b9c6f.

## Preuves de production

La lecture D1 protégée40544038754 rapporte cinq identifiants Cloud annoncés, coupés à12000ms, avec neuf tentatives et aucune exclusion persistée. Le propriétaire a fourni la commande909cf6a4-ef77-49a9-bed8-427dccc77702, PENDING sur le PC appairé à16:49:38UTC. Son JSON base64 utilise qwen3:8b et contient un avis du Council technique, rôle TESTS_EVIDENCE, pour MEL-FOUNDER-05. Cette commande prouve le mauvais routage ; des IDs Cloud dans un rapport ne prouvaient pas les modèles réellement exécutés.

## Cause et correction

L’entrée déployée applique withNeuronBudget avant le runtime. Le binding conservé dans MEL_CLOUD_AI est donc toujours enveloppé par la politique qui essaie le PC en premier pour tout texte. Les deux purposes du Council pré-développement ne marquaient pas neuron_reserve et n’activaient pas non plus l’option non-reasoning déjà prévue pour Gemma/Nemotron.

Les quatre purposes Council connus utilisent désormais neuron_reserve. Le codeur local respecte ce marqueur et rejoint le binding Cloud conservé, qui continue de vérifier et mesurer le budget. Une réponse explicitement locale est refusée comme vote Cloud. Le développement ordinaire reste sur le codeur local opt-in. Aucun quorum ou budget n’est abaissé et aucun délai n’est augmenté dans ce lot.

Le filtre des exclusions persistées autorise désormais @ et / : les IDs réels workers-ai:@cf/... n’étaient auparavant jamais mémorisés.

## Validation locale

Le test des vraies couches budget + codeur + Council échoue avant correction avec six appels au même substitut local et zéro liaison Cloud. Après correction, au moins deux IDs sont réellement appelés via les bindings Cloud simulés, aucun substitut local n’est invoqué, et toutes ces requêtes sont comptabilisées. Budget épuisé : refus, sans substitut local ni appel Cloud. Une réponse locale trompeuse est explicitement rejetée.

53 tests ciblés verts : ces couches, options non-reasoning, compteur, PC, runtime, exclusions et récupération du job original. Aucun appel IA externe dans ces tests. CI complète et preuve de production encore requises.

## Reprise de l’original

Depuis la demande initiale, un nouveau reset propriétaire a annulé le doublon nommé et créé un troisième job actif FOUNDER-01. Le runner de récupération sauvegarde maintenant aussi ces remplaçants du même objectif, les annule par CAS sans supprimer leur journal, puis rétablit le job original. Il continue de ne supprimer physiquement que le doublon explicitement demandé. États en cours d’exécution : refus, aucun écrasement.

XP MEL : NON — les règles existantes de Council réellement multi-modèle, provenance exacte et binding explicite couvrent déjà ce principe ; aucun doublon ajouté.
