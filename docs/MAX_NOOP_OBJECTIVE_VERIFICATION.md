# Vérifier une mission déjà implémentée

MANIFEST-01 pouvait rester READY_FOR_REVIEW alors que tous les contenus de son
paquet étaient déjà présents au SHA initial approuvé. Sans nouveau commit, la
promotion en synchronisation ne produit pas de revue du paquet.

La reprise conserve la mission et son budget. Elle exige un objectif disposant
d'une lecture fonctionnelle, le contrat de fichiers et sa révision, les tests
réellement exécutés, et l'égalité de tous les contenus au **SHA initial** du plan.
L'égalité au dernier HEAD ne suffit jamais : une vraie modification attend sa
CI et son propre Council. Une revue déjà enregistrée, un veto mémorisé, une
annulation ou un arrêt propriétaire interdisent cette reprise. Une seule reprise
est permise ; les anciennes preuves restent archivées. Aucun statut terminé
n'est accordé par ce mécanisme.

Le paquet préparé complètement appliqué n'est plus réémis comme modification.
Un paquet partiellement appliqué reste utilisable sans écraser du code divergent.

Pour MANIFEST-01, VERIFY_EXISTING peut maintenant demander `autonomy.status`
par le CapabilityBus existant. La validation porte sur le rapport cohérent des
cinq priorités, les compteurs et les attentes externes. Un rapport correctement
incomplet peut satisfaire la mission de comptabilité ; il ne termine aucune
priorité sous-jacente. Seuls le résultat borné, le code et le nombre d'éléments
sont transmis, sans contenu du contrôle ou des travaux. Les étapes Teacher,
CI exacte et vote final Council restent exigées. Les autres objectifs sans
recette pertinente restent fermés ; Gmail ne prouve pas une persistance MAX.

Directive modèles : toute intervention Council/Teacher/modèles ou déploiement
reste soumise à `docs/WORKERS_AI_DEPRECATION_20261106.md` ; aucun remplacement
silencieux, surcoût, changement de quorum ou redémarrage fondé sur l'alerte seule.

Validation : tests fonctionnels `manifest-objective-live-proof.test.mjs`,
`noop-review-recovery.test.mjs`, régressions existantes Bridge/runtime/completion.
Cette modification ne prouve pas encore la clôture en production de MANIFEST-01.
