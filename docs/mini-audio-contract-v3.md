# MINI audio contract v3 — 0.6.0 rebuild

This document is the single source of truth for the MINI audio path.

## Physical codec contract

- ES8311 / esp_codec_dev input and output are treated as **PCM16 mono, 48,000 Hz**.
- No caller may interpret physical codec bytes as 16 kHz.
- Hardware self-test records and replays at 48 kHz.

## STT contract

- MINI captures the microphone at 48 kHz.
- MINI applies the shared 31-tap low-pass FIR then decimates by 3.
- Link V2 STT transports **IMA-ADPCM representing PCM16 mono, 16,000 Hz**.
- Android reconstructs a 16 kHz WAV for the transcription endpoint.
- Duration must be computed from the declared rate, never inferred from byte count alone.

## Wake-word contract

- Wake audio is read physically at 48 kHz.
- Each 48 kHz hop is filtered and decimated to 16 kHz before feature extraction.
- Wake templates and Goertzel frequencies remain defined against the 16 kHz feature stream.

## TTS contract

- The device TTS HTTP endpoint currently requests/returns PCM16 mono WAV at 48 kHz.
- Android Link V2 must preserve 48 kHz PCM for MINI playback. A legacy 16 kHz WAV may be upsampled to 48 kHz as a compatibility fallback.
- Link V2 TTS AUDIO_BEGIN metadata must declare rate=48000 and output_rate=48000.
- MINI writes the decoded 48 kHz PCM directly to esp_codec_dev.

## Media Wi-Fi contract

- Temporary media Wi-Fi may replace the STA configuration only for the duration of the media transfer.
- The previous STA configuration and reconnect intent must be restored on release or media-connect failure.
- Media completion must not permanently take MEL chat offline.

## Remaining 0.6.0 gates

- Explicit PA_CTRL mapping and speaker-amplifier control must be validated against the board schematic.
- Android bulk writes must move to WRITE_NO_RESPONSE with protocol-level flow control and temporary CONNECTION_PRIORITY_HIGH.
- French TTS migration to @cf/myshell-ai/melotts requires MP3 decode to PCM48 on Android before Link V2 playback.
- UTF-8 response rendering must replace ASCII transliteration with a font containing French glyphs.
