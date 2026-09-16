# MEL — Protocole canonique d’envoi d’XP

But : une page ou une IA ne doit plus rechercher dans tout le dépôt comment transmettre une expérience à MEL.

## Où écrire

Les nouvelles expériences de développement vont dans :

`src/learning/development-experience-pack.js`

`src/learning/bootstrap-corrections.js` agrège automatiquement le corpus historique et ce pack ; `LearningEngine.corrections()` puis `LearningEngine.trainingBundle()` les rendent donc disponibles à MEL.

Ne pas modifier `src/learning/bootstrap-corrections-legacy.js` pour une nouvelle XP : ce fichier conserve l’historique antérieur.

## Avant d’ajouter une XP

1. Relire le HEAD de `candidate/mel-clean-autonomy`.
2. Relire `src/learning/development-experience-pack.js` et `.agents/DEVELOPMENT_EXPERIENCE_INDEX.md`.
3. Vérifier que la règle n’existe pas déjà par son sens, même si son nom diffère.
4. Ne créer une XP que si la leçon est généralisable à une situation future.

## Forme canonique

Une XP contient :

- `id` : identifiant unique et stable ;
- `source` : provenance de la leçon ;
- `domain` : domaine technique ;
- `task` : compétence apprise ;
- `input` : situation qui déclenche la règle ;
- `before` : comportement à éviter ;
- `after` : comportement que MEL doit préférer ;
- `rationale` : raison technique ;
- `tests` : preuves exactes (tests, SHA, runs/jobs quand disponibles) ;
- `tags` : indexation ;
- `validated` : `true` seulement si la leçon est réellement soutenue par les preuves ;
- `quality` : confiance 0..1 ;
- `created_at` : timestamp.

Le helper `src/learning/agent-xp-protocol.js` expose `validateAgentExperience()`, `createAgentExperience()` et `formatExperienceHandoff()`.

## Ce qui constitue une bonne XP

Mauvais : « J’ai corrigé la CI. »

Bon : « Avant de corriger une CI rouge en multi-agent, attribuer l’échec au lot en comparant avec son parent/HEAD précédent ; si la cause est héritée ou déjà corrigée ailleurs, ne pas dupliquer le patch. »

Une XP décrit donc une préférence de comportement future, pas un journal d’activité.

## Validation et anti-collision

- Une XP non prouvée reste `validated: false` et n’est pas admise comme préférence validée.
- Ne jamais inventer une preuve ou un SHA.
- Juste avant l’écriture, relire la candidate.
- Si la candidate a bougé, porter uniquement l’XP au-dessus du nouveau HEAD.
- Si une autre page a ajouté la même leçon, ne rien ajouter.
- L’ajout XP doit rester atomique avec les tests ou la preuve qui démontrent son chargement.

## Handoff de fin de lot

Toujours pouvoir produire :

```text
XP MEL : OUI/NON
XP ID : <id si oui>
FICHIER : src/learning/development-experience-pack.js
RÈGLE APPRISE : <after>
PREUVES : <tests / runs / SHA>
```

Cela suffit à la page suivante : aucune recherche globale du mécanisme d’apprentissage n’est nécessaire.
