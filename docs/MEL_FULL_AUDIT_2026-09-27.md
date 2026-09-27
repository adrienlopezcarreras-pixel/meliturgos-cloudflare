# MEL — Audit complet, réconciliation et expérience de la semaine

Date : 2026-09-27

## 1. Verdict exécutif

- La production Cloudflare a bien reçu le lot Android/GEN2-58 validé sur le SHA `c8e65fe1dc8e5cd0e4bf1a80e001195d4164dab3` via le workflow canonique `deploy-cloudflare-release`, run `36302365325`.
- L'étape `Deploy exact approved SHA to production` est `SUCCESS`. Les gates pré-déploiement — approbation, identité SHA, lockfile, sécurité runtime, syntaxe, suite complète, bundle critique R2 et preuve Workers AI zéro-coût — sont `SUCCESS`.
- Le workflow global reste rouge parce que la phase post-déploiement `Prepare and prove production autonomy launch evidence` a échoué sur la phase `backup` avec trois réponses Cloudflare `503 / error code 1102`. Le contrôle HTTP final a donc été sauté. Ce rouge ne signifie pas que le Worker n'a pas été déployé ; il signifie que la chaîne de preuve post-déploiement n'est pas complètement fermée.
- ShardVault est volontairement `PAUSED_FOR_ROADMAP`. Le workflow a correctement respecté cette consigne et a sauté la preuve 7/7 externe sans réactiver ShardVault.
- `main` a continué à avancer après la release ; le HEAD observé au début de ce lot d'audit est `ae782ae692eae0f4489326dd7be89979dd6c368f`, qui inclut le correctif GEN2-42 de snapshot d'inspection concurrente.
- La roadmap contient actuellement 125 occurrences `DONE_VERIFIED`, 5 `DONE`, 10 `BLOCKED_HUMAN`, 2 `PARTIAL`, 2 `IN_PROGRESS` et 2 `PLANNED` dans la source canonique.

## 2. Nettoyage et réconciliation effectués

Les PR suivantes ont été fermées comme obsolètes ou fonctionnellement absorbées :

- `#237` Android 0.6.17 legacy MINI BLE — supersédée par le lot Android 0.6.43.
- `#532` Android 0.6.43 pairing controls — supersédée par la PR de réconciliation `#557`, fusionnée.
- `#353` ancien hotfix Android fallback chat — supersédé par le runtime actuel.
- `#229` Android 0.6.15 — supersédée par Android 0.6.43.
- `#495` visual web cards vers MINI — signatures fonctionnelles `extractImageUrl`, `og:image`, `twitter:image` et `image_url` déjà présentes dans `main`.
- `#511` Windows DPI-safe + télémétrie — fonctionnalités déjà absorbées dans `main`; le compagnon C# est même passé au-delà de la version de la PR.
- `#552` ancienne réconciliation roadmap — obsolète car elle voulait remettre MEL-DEVICE-02 en `BLOCKED_HUMAN` alors que la validation Windows réelle l'a depuis certifiée.

PR volontairement conservées :

- `#221` MINI v0.4.6 stockage interne sans microSD : le code `storage.internal`, `/melstore` et wear-levelling n'est pas présent dans `main`; c'est donc un vrai lot non absorbé.
- `#540` LoRA entrypoint newlines : reste sous responsabilité de la page LoRA ; aucun changement ni fermeture depuis cet audit.

État de la candidate historique : `candidate/mel-clean-autonomy` reste très divergente de `main` avec environ 105 commits devant et 671 derrière au moment du contrôle. Elle ne doit pas être fusionnée en bloc ni forcée. La méthode sûre est désormais la promotion ciblée de lots validés sur une branche fraîche créée depuis le `main` courant.

## 3. Déploiement et discipline de release

Le lot Android a d'abord été reconstruit sur la candidate courante via `#557`. Ses preuves exactes ont inclus hardware-lab, UI Android émulateur et APK signé. Un premier échec APK provenait d'un HTTP 500 externe pendant le téléchargement Gradle 8.9 avant tout test du code ; le job a été relancé sans patch inutile. Une ancienne assertion UI ambiguë sur `OUTILS // MEL` a été retirée après preuve qu'elle sélectionnait deux nœuds alors que l'interface fonctionnait.

Après validation, la candidate entière n'a pas été poussée vers `main` car elle était déjà fortement divergente. Un lot de promotion propre `#566` a été construit directement au-dessus du `main` courant avec uniquement les fichiers Android/GEN2-58 et les corrections de garde associées. Un contrôle `current-fact-reliability` a alors détecté que la copie candidate de `src/api/native-chat.js` était plus ancienne que le durcissement présent sur `main`. La promotion a été corrigée en conservant la version `main`, ce qui a évité de réintroduire une régression sur les faits actuels et la recherche web.

La PR `#566` a été fusionnée sur `main` puis le pointeur de release canonique `release/mel-hardware-v0.1.0` a été avancé vers le SHA exact `c8e65fe1...`, déclenchant le workflow de production autorisé.

## 4. Autonomie / MAX / GEN2-42

Les travaux récents ont renforcé la préparation d'autonomie sans démarrage implicite :

- les releases héritant d'un état RUNNING/MAX sont remises en PAUSED avant preuve ;
- le propriétaire reste requis pour Resume/MAX ;
- le restore proof doit correspondre au SHA déployé ;
- les correctifs du 27/09 ont traité le backup chiffré, le compact restore proof et l'ordre de bootstrap avant GEN2-42 ;
- le dernier `main` contient également le snapshot immuable d'inspection GEN2-42 afin que les commits concurrents sur candidate ne modifient pas les preuves en cours de revue.

Le point restant critique n'est pas MAX lui-même mais la chaîne de backup release : la phase HTTP `backup` exécute encore un export D1 complet dans une requête Worker et a dépassé le budget Cloudflare avec `1102`. Tant que ce point n'est pas borné/repris de manière sûre, la preuve `GO_FOR_SUPERVISED_AUTONOMY` de ce SHA ne doit pas être déclarée complète.

## 5. Résilience, backups et ShardVault

Depuis le 20/09, les contrôles ont établi : backup lié au SHA, exclusion des tables internes `_cf_*`, chiffrement AES-GCM pour les sauvegardes configurées, preuve de restore et reconstruction ShardVault. Des validations réelles ont certifié MEL-RES-05 et les chemins de restore.

Règle opérationnelle conservée : ShardVault reste en pause pendant la fermeture de la roadmap et n'est rallumé qu'à la fin. La release actuelle respecte cette règle via `MEL_ROADMAP_SHARDVAULT_PAUSED=true` et ne transforme pas l'absence de preuve 7/7 en réactivation automatique.

Risque actuel : `prepareAutonomyLaunchBackup()` force encore `runScheduledSystemBackup(..., force:true)` dans la requête de bootstrap. Avec la croissance de D1, ce travail monolithique peut dépasser la limite CPU Cloudflare. La correction future doit rendre la préparation de backup bornée/reprenable ou découplée du seul cycle HTTP, sans réduire l'exigence de preuve de restauration.

## 6. Android, voix, BLE et appareil réel

La semaine a fait progresser Android d'une série 0.6.x vers la 0.6.43 :

- correction de la file BLE où une ancienne réponse pouvait bloquer transcription → réponse → TTS ;
- stabilisation BLE et gestion des réponses audio ;
- wake profile, long TTS, barge-in, présence compagnon et commandes natives ;
- UI MINI-aligned, mode complet natif, réglages, bouton parole et waveform ;
- APK persistently signed afin de pouvoir installer les versions successives sans casser l'identité applicative ;
- tests UI émulateur, screenshots réels et tests unitaires Android ;
- validation de GEN2-22 Whisper Android réel, MEL-VOICE-02 voice-to-memory réel et GEN2-27 appareil Android réel.

Le lot 0.6.43 est maintenant présent dans le `main` de production. Les symptômes historiques — transcription puis réflexion sans réponse, bruit audio, crash/déconnexion, boutons d'appairage manquants — ont servi de base aux correctifs de queue, BLE, UI et présence. Toute nouvelle certification de comportement MINI/Android doit encore distinguer CI/émulateur et preuve physique sur le matériel réel.

## 7. MINI / terminal Waveshare

Le firmware physique a validé écran, tactile, audio, micro, OV5640, Wi-Fi et BLE. Une correction importante a été l'ordre d'initialisation caméra/BLE afin d'éviter des conflits DMA et des instabilités. La carte réelle a fourni des preuves de stress UI et de connectivité.

Le lot `#221` propose le stockage média dans une partition FAT interne `/melstore` avec wear levelling pour supprimer la dépendance microSD. Ce lot n'est pas dans `main` et doit rester distinct jusqu'à compilation, validation et preuve physique finales.

## 8. Windows / MEL-DEVICE

MEL-DEVICE-01 a été validé sur Windows réel pour ouverture/fermeture d'applications et fichiers avec refus attendu hors allowlist. MEL-DEVICE-02 a ensuite été corrigé sur les appels shutdown/restart, environnement et arguments préservés, puis certifié sur PC réel. GEN2-59 a également été vérifié pour l'upgrade Windows signé.

Les anciens travaux DPI-safe et télémétrie fusionnée sont déjà dans `main`; leur PR historique a été fermée. La discipline reste : commande système sensible bornée, pas de shell libre, approbation propriétaire exacte et preuve réelle avant DONE_VERIFIED.

## 9. Web, navigateur et faits actuels

GEN2-31 Browser capability a été certifié avec Browser Run réel, HTTP 200, audit COMPLETED et health HEALTHY. Le runtime de recherche web a gagné une qualité/provenance explicite et les cartes visuelles incluent les images `og:image`/Twitter sûres.

Une leçon importante du lot Android est que les fichiers partagés — en particulier `src/api/native-chat.js` — évoluent rapidement sur `main`. Une promotion ciblée ne doit jamais recopier aveuglément une version candidate plus vieille. Le CI `current-fact-reliability` a précisément empêché la régression de l'officeholder/current-fact guard.

## 10. Council, modèles et LoRA

Le Council a évolué vers une architecture provider-neutral avec fan-out indépendant, déduplication provider/modèle, timeouts isolés, résultats partiels, synthèse séparée et provenance. Les preuves zéro-euro restent fail-closed et la certification live a exigé plusieurs modèles réellement distincts.

Le travail LoRA de la semaine a traité la continuité Kaggle, le checkpoint courant, la filiation parent, les timeouts/concurrences bornés, la persistance des preuves benchmark et le recovery benchmark-only. Wrangler OAuth a été autorisé avec le scope Workers AI nécessaire. Ce domaine reste géré par la page LoRA et n'a pas été modifié dans ce lot d'audit.

## 11. Mémoire, historique et apprentissage

Les travaux mémoire ont renforcé la complétude d'archive ChatGPT, les pièces jointes, le retrieval unifié avec provenance, la migration GEN1 et la préparation des observations mémoire. La release smoke vérifie l'état de l'archive et le backfill mémoire sans transformer automatiquement une archive brute en vérité certaine.

Le système XP canonique est `src/learning/development-experience-pack.js`, agrégé par `bootstrap-corrections.js`, puis consommé par `LearningEngine.corrections()` et `trainingBundle()`. L'index `.agents/DEVELOPMENT_EXPERIENCE_INDEX.md` sert à dédupliquer avant ajout.

## 12. Planning, Work, agents, plugins et connecteurs

GEN2-38 a introduit un planning DAG durable, Goal/Tasks D1, historique append-only filtré, matérialisation/synchronisation et génération IA validée par capacités/schémas. Les travaux agents/plugins ont ajouté registres D1, runtime agent, automation policy et rollback de versions.

Les connecteurs OAuth multi-fournisseurs ont appris à distinguer scopes métier obligatoires et scopes `authorization_only` comme `offline_access`/`openid`, évitant les faux rejets tout en restant fail-closed. Les travaux ont visé Google/Gmail ainsi que Microsoft/Yahoo et les fournisseurs mail additionnels, avec séparation entre autorisation, coffre de tokens et capacités runtime.

## 13. Roadmap et gouvernance de preuve

La règle suivie cette semaine est de fermer tous les `DONE` en `DONE_VERIFIED` avant d'attaquer les `BLOCKED_HUMAN`. Le comptage actuel montre que ce travail a fortement réduit le stock de DONE non certifiés. Une capacité n'est promue qu'avec une preuve correspondant au niveau revendiqué : code/tests, preview, runtime live, ou appareil réel selon le cas.

La garde `canonical-branch-unicity` a été corrigée : elle ne doit pas considérer chaque branche historique du dépôt comme une branche active. Elle contrôle désormais les branches réellement actives contre la candidate, tout en gardant les exceptions strictes et path-bounded des labs matériel/MINI/Godot. Les PR obsolètes doivent être fermées au lieu de polluer cette garde.

## 14. Chronologie synthétique de la semaine 20–27 septembre

- 20/09 : Launch Gate, restore lié au SHA, ShardVault 7/7, retry cap, exclusions `_cf_*`, audits et corpus expert.
- 21–22/09 : mémoire complète/provenance, Browser réel, Council provider-neutral, capacités plateformes GitHub/Cloudflare/Vercel, observabilité et release exact-SHA.
- 23–24/09 : chaîne Android signée, Windows tooling, MINI hardware réel, caméra/BLE, premières versions Android/MINI alignées.
- 25/09 : planning Work/GEN2-38, Timeline D1, réconciliation roadmap et séparation stricte des chantiers parallèles.
- 26/09 : stress tests Android/MINI/Windows, voix réelle, encrypted backups, fermeture progressive des DONE_VERIFIED, OAuth multi-fournisseurs.
- 27/09 : LoRA benchmark/recovery, MEL-DEVICE-02 réel, GEN2-42 fixes, Android 0.6.43 réconcilié, garde branch-unicity corrigée, promotion ciblée #566, production `c8e65fe1...`, nettoyage PR et audit.

## 15. Risques et travaux restant réellement ouverts

1. P0 — phase post-déploiement `backup` : Cloudflare 1102 sur la release `c8e65fe1...`; le déploiement est fait mais la preuve post-release complète reste ouverte.
2. P0/P1 — divergence de `candidate/mel-clean-autonomy` : 105 ahead / 671 behind au contrôle ; ne jamais merger/forcer en bloc. Rebuild ciblé requis.
3. P1 — `#221` MINI stockage interne : vrai code non absorbé, doit être recompilé et validé physiquement avant promotion.
4. P1 — `#540` LoRA : chantier actif appartenant à l'autre page ; ne pas dupliquer.
5. P2 — HTTP final de la release actuelle : sauté parce que la phase post-déploiement a échoué ; une vérification live indépendante doit accompagner la fermeture du 1102.

## 16. Conclusion d'audit

MEL est nettement plus cohérente qu'au début de la semaine : davantage de capacités sont prouvées sur des chemins réels, la roadmap est majoritairement DONE_VERIFIED, les releases sont exact-SHA et les anciens faux signaux de branche/CI ont été réduits. Les principales dettes ne sont plus des fonctionnalités de base manquantes mais des problèmes de convergence de branche historique et de coût d'exécution des preuves de release à grande échelle.

La règle de suite est : ne pas confondre un Worker déployé avec une release entièrement prouvée, ne jamais promouvoir une candidate divergente en bloc, préserver les durcissements plus récents de `main`, fermer les PR historiques uniquement après preuve d'absorption fonctionnelle, respecter l'état explicite PAUSED de ShardVault, et rendre toute preuve lourde bornée/reprenable avant de la mettre dans un bootstrap HTTP.
