# Audit MINI + Android — 2026-10-06

## Scope
Audited:
- main
- fix/mini-clock-voice-companion-ui (physical-test line: Android 0.6.68-stt-pcm4 / MINI 0.4.55-stt-pcm4)
- Android BLE bridge
- MINI NimBLE bridge
- physical voice capture / STT packaging
- Workers AI transcription route
- firmware and APK build workflows
- official Cloudflare, Android, ESP-IDF and Waveshare documentation

## Severity A — architectural causes

### A1. Wrong BLE role split for the target platform
Current physical-test line:
- Android = BLE peripheral + GATT server + advertiser
- MINI = central + GATT client + active scanner

The code itself contains recovery logic for duplicate/stale Android GATT services after app restarts, which is evidence that the topology is fighting the phone stack.

Decision:
- V2 flips the roles.
- MINI becomes the stable peripheral/GATT server.
- Android becomes the central/GATT client.

### A2. Two response transports for one logical stream
Current bridge can deliver the same response using:
- GATT notifications
- characteristic reads ("pull-only" fallback)

The implementation has ordering guards because BODY may be queued for pull while END can arrive by notification. This is a protocol-level race, not a presentation bug.

Decision:
- V2: a frame type has exactly one delivery mechanism.
- No read fallback.
- confirmed control + credited bulk stream.

### A3. Scalar PCM4 destroys information before ASR
Physical-test line:
1. codec capture at 48 kHz
2. simple 6:1 averaging to 8 kHz
3. normalize
4. scalar unsigned PCM8
5. quantize each sample independently to 4 bits
6. Android expands nibble -> PCM8 -> PCM16
7. every 8 kHz sample is duplicated to claim 16 kHz
8. WAV sent to Whisper

This is not genuine 16 kHz speech. The upsample step adds no information.

Decision:
- 48 kHz -> real 16 kHz filtered decimation
- block-independent IMA ADPCM 4-bit transport
- Android decodes to real PCM16/16 kHz WAV
- Cloudflare only receives normal WAV.

### A4. Generic HTTP-over-GATT became the device protocol
The bridge serializes HTTP method/path/content type/token/body over BLE and then reconstructs HTTP on Android. Large voice operations therefore inherit generic request framing, token routing, notification/read fallback, and HTTP timeout behavior.

Decision:
- V2 separates control, request, response and audio stream frame types.
- Android token never crosses BLE.
- STT is a first-class audio operation, not a special case buried in generic relay code.

### A5. Wi-Fi/BLE coexistence was not locked by the build
ESP32-S3 uses one 2.4 GHz RF path for Wi-Fi and BLE.
The audited build explicitly enabled NimBLE but did not explicitly assert:
- CONFIG_ESP_COEX_SW_COEXIST_ENABLE
- NimBLE / Wi-Fi core separation

Decision:
- coexistence is now an exact build assertion in the V2 branch.
- BLE bulk transfer suppresses aggressive Wi-Fi recovery work.

## Severity B — reliability causes

### B1. Physical link is recycled for transport/API symptoms
The old MINI write path can terminate/recycle GATT after write/read timeout/status errors. A slow Worker or GATT operation can therefore become a physical disconnect.

V2 rule:
- API/stream error aborts the stream.
- only a physical GATT failure changes physical link state.

### B2. Multiple independent recovery loops
Observed mechanisms include:
- Android BLE watchdog
- advertising restart
- MINI scan restart
- MINI link recycle
- request timeout handling
- Wi-Fi fallback/reconnect

They can race.

V2 rule:
- one explicit state machine per side.
- one owner for reconnect transitions.

### B3. Forced connection parameters
The MINI test branch overrides peer connection update requests with a fixed 30-40 ms window and 8 s supervision timeout.

V2:
- begin with conservative defaults/MTU 185.
- do not override peer timing without measured evidence.

### B4. Active scanning on MINI competes with Wi-Fi fallback
Current MINI actively scans indefinitely for Android and also has Wi-Fi recovery paths.

V2:
- MINI only advertises.
- phone performs discovery.
- no continuous MINI active scan.

## Severity C — test / release integrity

### C1. Two source truths
At audit time:
- main: Android 0.6.58 / MINI 0.4.38
- test branch: Android 0.6.68 / MINI 0.4.55

The branches had diverged substantially.

V2:
- exact-sha paired build.
- Android + MINI artifacts must assert protocol version 2 and same source SHA.

### C2. Synthetic STT probes were insufficient
The STT workflows proved that a reconstructed reference audio file could be accepted by Workers AI.
They did not prove:
- Waveshare physical microphone capture quality
- RF transfer integrity
- Android reconstruction from physical samples
- repeated real-device stability

V2:
- physical microphone gate is mandatory.
- ten consecutive physical STT requests required.

### C3. Active test branch and main STT server were not identical
main had evolved the production STT fallback route while the physical test branch still carried an older/simpler voice-transcribe implementation.

V2:
- device work branches from current main.
- no private fork of the canonical transcription handler.

## Documentation conclusions

### Cloudflare
Official 2026 documentation shows whisper-large-v3-turbo accepts base64 encoded audio through env.AI.run(). Therefore the remaining physical failure is not solved by changing the Workers AI call shape again.

### Android
Official guidance treats the phone as the GATT client connecting to a peripheral, and recommends a connectedDevice foreground service / companion-device mechanisms for long-lived background communication. Android also explicitly supports WRITE_TYPE_NO_RESPONSE for bulk characteristic writes.

### ESP-IDF
Official BLE docs describe:
- client writes / write-without-response
- server notify / indicate
and official coexistence docs require deliberate Wi-Fi/BLE coexistence configuration on the shared 2.4 GHz radio.

### Waveshare
The board is designed for voice use and exposes the ESP32-S3 + onboard audio codec/microphone path. The hardware is not the reason to reduce speech to scalar 4-bit 8 kHz samples.

## Disposition

Discard from the new architecture:
- Android GATT server / advertiser role
- MINI active scanning role
- notification + read dual-path response delivery
- PCM4 scalar codec
- fake 8 kHz -> 16 kHz sample duplication
- physical-link resets on server/API errors
- independent competing reconnect loops

Keep conceptually:
- foreground Android companion service
- exact UUID-based pairing
- conservative MTU target
- phone Internet/auth ownership
- MINI local microphone/speaker/UI
- phone clock synchronization
- Wi-Fi as independent fallback
- Cloudflare whisper-large-v3-turbo as primary ASR, with canonical fallback
