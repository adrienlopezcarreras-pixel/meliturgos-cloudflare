# MINI 0.6.0 — Canonical audio contract

Status: foundation contract for Waveshare ESP32-S3-Touch-LCD-3.5-C.

## 1. Physical codec boundary

The physical ES8311/I2S boundary is **PCM signed 16-bit little-endian, mono, 48,000 Hz**.

The pinned Waveshare BSP historically initialized the I2S clock at 16 kHz while opening
`esp_codec_dev` at 48 kHz. MEL 0.6.0 patches the pinned BSP during the reproducible
firmware build so the I2S clock and the codec device are both explicitly 48 kHz.

A buffer must never be relabelled as another sample rate. Every rate change must be a
real sample-rate conversion.

## 2. Capture and STT

Microphone capture is physically 48 kHz PCM16 mono.

STT input is 16 kHz PCM16 mono. Firmware converts 48 -> 16 kHz with an anti-alias
low-pass FIR followed by decimation by 3. The same conversion rule is used by wake-word
features. A three-sample arithmetic average is not an acceptable sample-rate converter.

Required invariants:
- `VOICE_CAPTURE_RATE == 48000`
- `VOICE_STT_RATE == 16000`
- capture duration is computed from the physical 48 kHz rate
- STT duration is computed from the converted 16 kHz sample count
- no path may pass 48 kHz samples to STT while declaring them as 16 kHz

## 3. Speaker and TTS

MINI playback accepts **PCM16 mono at 48 kHz** at the codec boundary.

The NS4150B power amplifier is controlled by `PA_CTRL`, mapped by the Waveshare board
to TCA9554 P2. P1 remains the Waveshare display/reset sequence and must not be conflated
with the speaker amplifier.

Speaker transactions must:
1. enable PA_CTRL;
2. wait for amplifier settling;
3. set codec output volume;
4. write 48 kHz PCM;
5. mute codec output;
6. disable PA_CTRL.

`ESP_CODEC_DEV_OK` proves only that the codec write API accepted the buffer. It is not
sufficient evidence that the physical speaker was audible.

## 4. TTS service boundary

Until the Link V2/MeloTTS migration is complete, the existing Workers AI TTS route must
return self-describing WAV PCM16 mono at 48 kHz, matching the physical playback boundary.

The target Link V2 contract is:
- French synthesis: MeloTTS with `lang: "fr"`;
- MP3 is decoded on Android;
- Android resamples/normalizes to PCM16 mono 48 kHz;
- MINI receives only canonical 48 kHz PCM for playback.

No firmware MP3 decoder is required by this contract.

## 5. BLE transport target

Control frames remain acknowledged/reliable.

Bulk audio/media payloads use write-without-response plus the existing explicit
credit/backpressure protocol. Android requests high connection priority for a bulk
transaction and returns to balanced priority afterward.

A negotiated MTU below the protocol minimum is a hard failure, never a silent fallback.

## 6. Media Wi-Fi lifecycle target

A media operation may temporarily move Wi-Fi to the phone hotspot/local media path, but
it must snapshot the prior station state and restore it on success, error, timeout, or
cancellation. A successful photo/video/audio/browser operation must not leave chat
offline.

## 7. Acceptance gates

Static/CI gates:
- pinned BSP I2S clock is patched to 48 kHz and codec open rate is verified at 48 kHz;
- no obsolete 16 kHz physical-audio assertion remains;
- STT/wake use the explicit FIR decimator;
- TTS service advertises 48 kHz while the legacy WAV path remains active;
- PA_CTRL P2 enable/disable is explicit around speaker writes.

Hardware gates before declaring 0.6.0 stable:
- two-second microphone capture measures approximately two seconds at 48 kHz;
- known-tone capture confirms sample-rate/pitch correctness;
- STT succeeds on normal French speech after 48->16 conversion;
- speaker test is physically audible, with PA_CTRL state logged;
- TTS duration/pitch is correct and audible;
- long BLE audio transfer completes without ordering loss;
- media operation returns to the previous Wi-Fi/chat state;
- full path passes: talk -> capture -> STT -> chat -> visible UTF-8 answer -> audible TTS.

A green compile or an `ESP_CODEC_DEV_OK` result alone must never be treated as a
hardware-pass gate.
