# Roadmap : réconciliation du périmètre au 6 novembre 2026

Source unique : `src/roadmap/master-roadmap.js`, contrats et dépendances adjacents.
Le nettoyage porte sur les 177 entrées, indépendamment de la liste de missions que le propriétaire a vidée. Il ne supprime aucune preuve D1 et ne relance pas une mission annulée.

## Quatre doublons retirés du planning

| Ancien objectif | Objectif conservé | Exigences conservées |
| --- | --- | --- |
| MEL-MANIFEST-02 | MEL-FOUNDER-02 | Reprise au checkpoint après interruption entre écritures et expiration du lease, sans étape doublée ; tests runtime et lease. |
| MEL-MANIFEST-03 | MEL-FOUNDER-03 | Enregistrement unique sur le CapabilityBus ; CI, preuve absente et collision de nom bloquantes. |
| MEL-MANIFEST-09 | MEL-FOUNDER-03 | Écart mesuré, évolution idempotente et version précédente active jusqu’à livraison vérifiée. |
| MEL-MANIFEST-10 | MEL-MANIFEST-01 | Agrégation calculée séparant code, usage et acceptation externe ; absence de preuve interdit 100 %. |

Les trois contrats conservés changent de révision : une preuve de l’ancien périmètre ne valide pas automatiquement le périmètre regroupé. Les autres révisions restent inchangées. Les paquets préparés 02 et 09 sont conservés sous leur identifiant canonique, sans application ni certification implicite.

Les anciens identifiants ne sont jamais des alias de preuve. Les anciennes missions passives sont annulées avec référence vers leur remplacement et conservation des votes, fichiers et reçus. Les exécutions, revues Bridge et missions terminées ne sont pas interrompues. Le sélecteur refuse les identifiants retirés même lorsque toute la roadmap est terminée.

## Actualisation des descriptions

- GEN2-36 : objectif courant GitHub/Cloudflare. La preuve Vercel reste historique ; Vercel est exclu du catalogue gratuit actuel.
- GEN2-63 : sélection d’un travail admissible, subordonnée aux arrêts propriétaire et pauses de réparation. L’ancienne formulation NON-IDLE n’autorise pas leur contournement.
- P16 : titre fonctionnel permanent plutôt qu’une date de cycle passée.
- Référence de versionnement du ModelRegistry alignée sur FOUNDER-03.

## Exigences conservées après examen

Les 133 entrées historiquement vérifiées restent dans l’historique produit : leur statut déclaré ne remplace pas les observations runtime actuelles. Les familles chat, mémoire, capacités, Council, WORK, connecteurs, médias, appareils, sécurité, continuité, audit, interface et release ne deviennent pas obsolètes parce que leur implémentation a été livrée.

Les 40 contrats logiciels restants sont des livrables de code et de régression bornés. AUDIT-03 et AUDIT-05 restent distincts : corrélation des preuves métier versus contrôles temporels mémoire/sessions/sauvegardes. UI-AUDIT-03 et 04 restent distincts : événements et navigation versus contrôles d’arrêt et de release. Les objectifs LoRA restent distincts : corpus, entraînement, routage et activation ne sont pas une même preuve.

Les acceptations externes FOUNDER-06, UI-AUDIT-05, FOUNDER-08, LORA-CHAT-01 et LORA-MODE-01 restent explicites. Le mode cloud permet le développement logiciel sans PC ; il ne prouve ni recette physique ni adaptateur entraîné et activé.

## Dépendances et compteur

Le graphe conserve les prérequis logiciels et reste acyclique. FOUNDER-03 conserve également le préalable COUNCIL-OPS-01 issu du versionnement. MANIFEST-01 peut être codé avant la clôture des lignes qu’il mesure : il doit afficher leur absence de preuve, sans attendre leur succès pour développer le rapport.

Le registre comporte 173 objectifs, dont 133 déclarations historiques et 40 contrats logiciels. La variation mécanique du pourcentage après consolidation n’est pas une nouvelle livraison. Seuls les reçus indépendants du SHA exact peuvent prouver les objectifs concernés ; ce changement ne certifie aucune mission.
