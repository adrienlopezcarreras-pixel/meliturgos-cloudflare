# Recertification des points de roadmap

La couleur d’un point provient des reçus runtime sur sept jours, pas uniquement de son statut historique. « Preuve récente manquante » ne signifie ni absence d’implémentation ni preuve que le point n’a jamais été exécuté.

Sous MAX, sans préemption de la mission active, les points historiquement vérifiés qui manquent de preuve sont réconciliés avec le planning :

- 32 recettes logicielles explicites, enregistrées sur le CapabilityBus core, deviennent des missions `VERIFY_RUNTIME` dans le créneau atomique existant. Elles utilisent des entrées vides, sans appel de modèle, mutation de connecteur, activation LoRA ou commande matérielle. Certaines exigent des données réelles présentes dans D1 : leur absence reste un échec de preuve et ne justifie pas de données inventées.
- Les autres manques restent des obligations `BLOCKED_EXTERNAL`, à résoudre par une recette adaptée ou le reçu réel nécessaire. Un outil LOW ou un nom finissant par `.verify` ne suffit pas à autoriser un appel automatique.
- Une vérification réussie exige le SHA exact du Worker, `ok:true` et l’événement audité SUCCEEDED de cette exécution. Un ancien reçu, une simple déclaration, une sortie sans audit ou un arrêt propriétaire ne suffit pas. Les reçus expirés ne clôturent pas une recertification.
- Les échecs restent visibles et soumis aux limites d’essais existantes. Ils ne déclenchent pas de génération de code arbitraire. Les critères matériels et d’entraînement restent distincts.
- Une file admissible vide avec des obligations restantes ne constitue pas une fin de roadmap.

Le contrôle `release-proof-<sha>` du ledger est une autre opération : chaque release vérifie l’intégrité et l’idempotence du journal avec deux événements existants rattachés à MEL-EVOL-04. L’activité le nomme contrôle du journal de déploiement et ne le présente plus comme une nouvelle mission MAX. Les événements immuables, leurs identifiants et les gates de release restent conservés.

Les interventions sur modèles/routage/LoRA restent soumises à `WORKERS_AI_DEPRECATION_20261106.md`. Cette recertification n’autorise aucun remplacement de modèle ni surcoût et ne lève aucune pause.
