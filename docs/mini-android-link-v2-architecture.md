# MEL MINI + Android — Link V2 architecture

Date: 2026-10-06
Status: redesign baseline — no release artifact is valid until the V2 gates below pass.

## Why V2

The 0.6.68 / 0.4.55 line accumulated transport-specific workarounds around a structurally fragile topology:
- Android acts as BLE peripheral/GATT server and ESP32-S3 as central/client.
- The same logical response may use notifications or characteristic reads.
- Large STT payloads are pushed through an HTTP-like framing layer over GATT.
- Physical speech is reduced to 8 kHz scalar 4-bit PCM before being reconstructed to 16 kHz.
- BLE and Wi-Fi share the ESP32-S3 2.4 GHz radio without the build explicitly locking the coexistence/core-placement recommendations.
- Multiple independent watchdog/reconnect paths can change link state.

V2 replaces the topology and the audio transport instead of adding another workaround.

## Roles

### MINI
- BLE peripheral / GATT server.
- Advertises one stable MEL service UUID.
- Owns the physical microphone, speaker, display and local state machine.
- Never needs Android to expose a GATT server.
- Wi-Fi remains a fallback transport, not a simultaneous competing recovery loop.

### Android
- BLE central / GATT client.
- Foreground service of type connectedDevice.
- Initial discovery by exact MEL service UUID.
- After association, reconnect with Android's GATT client auto-connect semantics.
- Owns Internet access and the authenticated Android MEL session.

This follows the platform's normal phone-to-peripheral BLE topology.

## GATT service V2

Service UUID remains 0000abf0-0000-1000-8000-00805f9b34fb to keep device discovery stable.

Characteristics:
1. CONTROL_RX (phone -> MINI)
   - UUID ABF1
   - WRITE with response
   - small reliable control frames only
2. EVENT_TX (MINI -> phone)
   - UUID ABF2
   - NOTIFY + INDICATE
   - indications for BEGIN/END/RESULT/control
   - notifications for paced bulk uplink
3. BULK_RX (phone -> MINI)
   - UUID ABF3
   - WRITE_NO_RESPONSE + WRITE
   - TTS/media bulk downlink with explicit credit/sequence protocol

No characteristic-read fallback is part of V2. One frame has one delivery path.

## Frame contract

Binary header (little endian):
- magic: 0x4d 0x32 ("M2")
- protocol_version: 2
- type: uint8
- flags: uint8
- stream_id: uint16
- seq: uint16
- payload_len: uint16
- crc16: uint16
- payload

Frame types:
- HELLO
- SESSION
- CLOCK
- REQUEST_BEGIN
- REQUEST_DATA
- REQUEST_END
- RESPONSE_BEGIN
- RESPONSE_DATA
- RESPONSE_END
- AUDIO_BEGIN
- AUDIO_DATA
- AUDIO_END
- CREDIT
- ACK
- ERROR
- PING
- PONG

Rules:
- sequence starts at zero for every stream.
- duplicate frames are idempotently ignored.
- a gap fails that stream explicitly; it never tears down a healthy BLE link.
- control frames use confirmed transport.
- bulk notifications use an application credit window (initial target: 6 frames).
- CRC failure rejects only the frame/stream, not the GATT connection.

## STT redesign

Remove scalar PCM4.

Capture:
- physical codec at its stable native rate.
- deterministic 48 kHz -> 16 kHz decimation with low-pass filtering.
- mono PCM16 internal representation.

Transport codec:
- IMA ADPCM 4-bit at 16 kHz, mono.
- state/predictor is reset at each AUDIO_BEGIN and block boundaries.
- each block carries its ADPCM state so a dropped block cannot corrupt the rest of the stream.
- Android decodes to 16 kHz PCM16 WAV before calling MEL.

Why:
- preserves speech dynamics far better than 4-bit scalar PCM.
- 4:1 size reduction vs PCM16/16 kHz.
- Cloudflare receives a normal WAV; the proprietary transport codec never reaches Workers AI.

Server:
- one canonical authenticated Android STT route.
- Workers AI primary: @cf/openai/whisper-large-v3-turbo.
- fallback: @cf/openai/whisper.
- exact error codes returned to MINI.
- no hidden second HTTP relay implementation.

## TTS redesign

- Android fetches canonical TTS.
- Android converts server audio once.
- bulk downlink uses BULK_RX and the same sequenced/credited stream contract.
- first implementation may send PCM16/16 kHz; IMA ADPCM downlink is allowed only after decoder tests are green.
- MINI playback begins only after a valid RESPONSE/AUDIO_BEGIN.

## BLE connection state machine

Both sides expose the same conceptual states:
DISCONNECTED -> DISCOVERING -> CONNECTING -> NEGOTIATING -> READY -> STREAMING -> READY

Errors:
- stream error: READY after explicit ERROR/abort
- physical disconnect: DISCONNECTED with bounded exponential reconnect
- GATT discovery/MTU failure: disconnect once, then backoff
- no independent watchdog is allowed to recycle a link while another state transition is in progress.

Android:
- scan exact service UUID.
- connectGatt as client.
- request conservative MTU (target 185 first).
- discover service.
- enable EVENT_TX notifications/indications.
- only then publish READY.

MINI:
- keep one GATT database for process lifetime.
- advertise whenever not connected.
- never scan for the phone.
- never depend on Android advertising.

## Wi-Fi / BLE coexistence

ESP32-S3 build must explicitly validate:
- software Wi-Fi/BLE coexistence enabled.
- NimBLE and Wi-Fi protocol tasks pinned to different cores where supported.
- no custom Wi-Fi connectionless timing unless measured.
- BLE is primary while Android is READY.
- Wi-Fi fallback does not scan/reconnect aggressively during a BLE bulk transfer.

## Authentication

- Android token never crosses BLE.
- MINI has a stable device identity.
- Android sponsors/relays allowed MINI operations using its authenticated Android session and explicit X-MEL-MINI-Device-ID.
- MINI receives only the minimum device/session result it needs.
- pairing and token recovery are explicit control operations, not side effects of generic HTTP proxying.

## Required gates before release

G1 protocol unit tests:
- encode/decode every frame type
- CRC rejection
- duplicate/gap behavior
- max payload / MTU 23 and MTU 185

G2 audio codec:
- deterministic IMA ADPCM roundtrip
- SNR threshold on reference speech
- physical-microphone WAV inspection
- no clipping/DC regressions

G3 Android BLE:
- client discovery/connect/MTU/service discovery/CCCD
- 30 disconnect/reconnect cycles
- app background/foreground cycle
- process restart and auto reconnect
- no GATT server/advertiser code remains active

G4 MINI BLE:
- server advertising survives 30 client reconnects
- no NimBLE reset
- no Wi-Fi/BLE starvation under coexistence test

G5 STT:
- synthetic reference speech -> Cloudflare transcript
- physical MINI microphone -> Android -> canonical Worker -> non-empty transcript
- 10 consecutive physical STT requests
- server 4xx/5xx does not drop BLE

G6 TTS:
- 10 consecutive voice replies
- bulk transfer interruption fails cleanly and reconnects
- no UI state loop

G7 release:
- exact SHA build
- APK + MINI firmware produced from the same protocol revision
- protocol_version=2 asserted in both artifacts
- no release if either side is not exact-match.

## Documentation basis

- Android BLE background communication and connectedDevice foreground service:
  https://developer.android.com/develop/connectivity/bluetooth/ble/background
- Android GATT APIs:
  https://developer.android.com/develop/connectivity/bluetooth/ble/connect-gatt-server
  https://developer.android.com/reference/android/bluetooth/BluetoothGattCharacteristic
- ESP-IDF BLE data exchange / GATT server:
  https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/ble/get-started/ble-data-exchange.html
- ESP-IDF RF coexistence:
  https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/coexist.html
- Cloudflare whisper-large-v3-turbo:
  https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
  https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/
- Waveshare ESP32-S3 Touch LCD 3.5 documentation:
  https://docs.waveshare.com/ESP32-S3-Touch-LCD-3.5B

## Release numbering

The V2 protocol is intentionally not a patch-level continuation:
- Android target: 0.7.0
- MINI target: 0.5.0
- protocol: 2.0

0.6.68 / 0.4.55 remain historical test builds only.
