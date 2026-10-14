# MEL Avatar — Motion & UX implementation contract v1
Status: DESIGN SPECIFICATION ONLY — no hardware proof, no implementation claim.
Scope: Android APK, MINI ESP32-S3, Windows Companion. The supplied female cyborg portrait is the visual reference, not an automatically available deployable asset.

## Visual identity
Preserve recognisable face, dark hair, subtle blue facial circuitry, illuminated headset ring, collar lighting, and dark navy ambience. No new character redesign. The face is the focal point. Background remains quieter than the face. Use a single licensed/owner-approved master asset with separately authored layers or motion-ready video; do not infer that a static JPEG/PNG includes rigged eyes, lips, hair or true 3D depth.

## State machine
Canonical states: IDLE, LISTENING, THINKING, SPEAKING, ERROR, OFFLINE. Precedence: OFFLINE/ERROR > SPEAKING > LISTENING > THINKING > IDLE, based on real application events, never decorative simulated processing.
- IDLE: gentle 4–6s glow cycle (headset +-10% nominal luminance); blink only with a genuinely animated facial layer.
- LISTENING: ring glow follows smoothed microphone RMS (80–140ms attack, 180–260ms release); activity only when microphone permission and capture actually active.
- THINKING: subtle cheek/collar sweep 1.2–2.5s; only for an actual pending response; accessible textual state.
- SPEAKING: light energy follows actual TTS playback amplitude or playback status; lips animate only if a validated lipsync source exists.
- ERROR: one restrained warning pulse, then stable explanatory error text and retry affordance.
- OFFLINE: muted lights; show connection recovery status, not fake presence.
Transitions typically 120–300ms; return to IDLE 300–600ms. STOP VOIX must terminate SPEAKING effects immediately.

## Cross-platform design tokens
Background #06101D; raised surface #0B1B2A; primary cyan #22D3EE; blue #4A90FF; text #F1F7FF; muted text #91A6C5; error coral #FB7185. Contrast ratios must be measured against actual surfaces (WCAG AA for text). Prefer system typography with scalable text. Never communicate a status through color alone.

## Android
Jetpack Compose: avatar as stable composable, draw glow on a distinct low-cost overlay rather than repeatedly decoding a bitmap. Collect lifecycle-safe app/voice/BLE state and animate using Compose transition APIs; pause animations when off-screen or in background. Preserve real live connection and recording status. Buttons >=48dp touch target; semantics announces state changes sparingly, with no rapidly repeating live-region announcements. Respect system reduced-motion settings when available; provide a static fallback. Test portrait, landscape, large font, TalkBack, dark/light system settings and battery use.

## MINI
Treat this as a resource-constrained ESP32-S3 display: use a cropped pre-compressed static portrait plus a few LVGL overlays (headset/collar/cheek LEDs), not high-rate full-frame video. Budget animation at 12–20 FPS only when active and lower in IDLE; allocate zero new voice/audio thread blocking work. Confirm RAM/PSRAM, panel dimensions, render timing and heat/power on real device. No dependence on flash pipeline modifications.

## Windows Companion
Keep status and controls readable first: optional avatar panel with subtle low-frequency overlay, high-DPI aware scaling, keyboard focus and screen-reader status. Do not distract from maintenance controls. No remote desktop or relay permission changes.

## Single contract for animation events
UI receives {state, audio_level_0_to_1, online, source, updated_at_monotonic}. Reject stale data (>2s for audio activity); clamp audio [0,1] and low-pass filter. State must be sourced from transport/runtime truth; for stale data revert to an explicit UNKNOWN/OFFLINE diagnostic state rather than pretending to listen or speak. Cross-fade once per state change rather than restarting every rendering frame.

## Performance and accessibility acceptance
- Frame drops measured at target size/device; no audio underrun, ANR, BLE disconnect regression or notable background CPU drain.
- Reduced-motion static avatar fully functional; equivalent text labels for all 6 states.
- Accessibility text contrast >=4.5:1 for ordinary text, >=3:1 for large text and meaningful graphical indicators.
- 30 reconnect cycles, actual mic input, TTS start/stop, cancellation and recovery tests on real hardware before DONE_VERIFIED.
- No false voice, connection, or thinking indicator; explicit actual event source in diagnostics.

## Production sequence
1. Approve and preserve the master visual. License/source and derivative permission confirmed.
2. Produce layered asset or hand-authored overlay masks (separate ring/cheek/collar; face animation only if rigged).
3. Implement isolated animation-state adapter and tests in Android; no BLE protocol changes.
4. Implement MINI LVGL overlay behind compile-time gate, profiling CPU/PSRAM.
5. Add optional Windows avatar panel, preserving existing controls, DPI behavior and screen reader labels.
6. Run exact-SHA CI, visual snapshots at actual densities, accessibility passes, then hardware E2E proof.
7. Promote per platform only after independent verification and reconciliation against other active branches.

## Concurrency boundaries
Other sessions own relay, flashing, USB backup/recovery and deployment. This spec must not modify those subsystems, their GitHub branches, or main. PR remains DRAFT until implementation and visual/hardware verification.
