# MEL — capability parity against Google Home/Gemini and Alexa+ (October 2026)
STATUS: GAP MATRIX / REQUIREMENTS. No newly verified skills are claimed. Scope server capability orchestration and user-facing contracts only; concurrent MINI/APK/Companion relay/flash branches untouched.

## Evidence baseline
Production read-only inventory of 2026-10-13 at deployed SHA 4f8b47542424a3f8942d21112c3fc891c4f37e64: 165 enabled registrations, 109 HEALTHY, 48 DEGRADED, 8 UNAVAILABLE. Registry health is not execution proof. Four bounded LOW-risk actions actually executed: echo, project.list, skill.list, timeline.list. Eight unavailable adapters: image analyze/process/generate, audio transcribe/synthesize, video analyze/process/generate. Persistent 165-skill production stress NOT VERIFIED. Reference docs/MEL-CAPABILITY-LIVE-INVENTORY-20261013.md. Refresh at exact current deployed SHA before certification.

## Competitive baseline (public feature descriptions, verify market/locale availability)
Gemini for Home: natural language multi-intent voice, conversation, device control, timers/alarms, music, calendar, notes, lists, reminders, camera question answering (plan-dependent). Sources:
https://home.google.com/intl/fr_fr/gemini-for-home-voice-assistant/
https://support.google.com/googlehome/answer/16618650?hl=fr
Alexa+: natural conversation, personalized routines, smart home, media, calendars, home cameras, lists and service actions. Some features provider/region/plan dependent:
https://www.aboutamazon.fr/actualites/actualites/presentation-dalexa-en-france-la-nouvelle-generation-dalexa

## Parity matrix — requirement, not an implementation status
P0 Reliable voice assistant:
- STT/TTS FR incl. interruption/STOP VOIX; verified on Android speaker and MINI hardware.
- Wake trigger, consent, listening/speaking indicators based on real device events; 30 reconnect cycles.
- Timers, alarms, reminders; create/list/cancel and persistence across restart; timezone/DST tests.
- Multi-turn context, follow-up intent, disambiguation and multi-action safe transaction reporting.
P1 Personal organization:
- Read/write agenda, tasks, notes and lists; discover actual connected provider and per-user scopes.
- Email/contact read, draft/send with explicit confirmation and delivery receipts.
- Daily briefing (weather, agenda, reminders, news) grounded in available live sources and user permissions.
P1 Smart-home parity:
- Matter/Home Assistant device discovery, room resolution, device-scoped read/command; zero devices available must remain NOT_CONFIGURED.
- Scenes/routines with deterministic trigger/action logs, safe retry and physical confirmation.
- Camera queries only for explicitly paired cameras with privacy controls; no invented support.
P1 Media:
- Search/play/pause/volume/output switching only when a licensed/connected service is supported.
- Image/audio/video adapters must return explicit unavailable status until real provider evidence.
P1 Cross-device:
- Consistent session state between Android/MINI/Windows without duplicate actions; preserve owner interrupt.
- Offline controls: supported local alarms, basic controls, clear degradation; never imply cloud intelligence offline.
P2 Personalization:
- Opt-in preferences, household profiles, per-device privacy boundaries, memory export/delete.
- Proactive suggestions and routines only after user opt-in; visible control center.
P2 Quality and accessibility:
- Readable interfaces, TalkBack/UIA labels, large type, 48dp mobile targets, reduced motion.
- P95 voice intent latency and power budget baselines from measured target devices, not guesses.

## Each capability must pass seven gates
1 REGISTERED: tool/schema exists.
2 CONFIGURED: free/permitted real provider credential/permission bound.
3 HEALTHY: authenticated health probe with bounded semantics.
4 EXECUTED: representative real operation with redacted receipt.
5 RESULT_VERIFIED: real result matches intent (actual timer created/device changed/response delivered).
6 RECOVERY_VERIFIED: failures, offline, retries, cancellation and rollback where meaningful.
7 UX_VERIFIED: voice/text/device feedback and accessibility on target hardware.
Only gate 7 permits DONE_VERIFIED; attach exact SHA, device/provider/time and traces. Protected mutations require user authorization, never force operations in bulk stress.

## Implementation sequencing and ownership
Stage A: audit capabilities individually and group by user journey; choose 10 everyday tasks, assess actual functionality.
Stage B: repair intents, disambiguation and deterministic action response across existing tools before building new providers.
Stage C: add missing standard integrations only after explicit provider discovery, privacy/cost/security review and dedicated tests.
Stage D: 30-run voice and reconnection tests, structured E2E evidence, hardware acceptance.
Other pages retain all MINI firmware flash/USB recovery and ChatGPT-to-Companion relay tasks. This branch is DOCUMENTATION ONLY.

## First 10 acceptance dialogues (FR)
1 « Mets un minuteur de 8 minutes », query remaining, cancel.
2 « Rappelle-moi demain à 9 h de ... », confirm persisted reminder.
3 « Quel est mon prochain rendez-vous ? », cite connected calendar.
4 « Ajoute du lait à ma liste de courses », verify list item.
5 « Mets un réveil à 7 h », verify Android/alarm provider.
6 « Lis mes nouveaux messages », distinguish account permissions, do not send by mistake.
7 « Allume la lampe du salon », fail clearly if no smart-home device configured.
8 « Mets de la musique puis baisse le volume », only with connected permitted media service.
9 « Arrête de parler », stop actual TTS audio within bounded physical test.
10 « Reprends sur la MINI », preserve state across Android/BLE and recover from disconnect.

FAIL-CLOSED RULE: unsupported, unconfigured, incomplete CI, stale heartbeat, or simulated results must never be labeled working. Never bypass subscriptions, paid quotas or authentication. 
