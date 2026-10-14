# MEL Link V2 — read-only TRIAD_PHASE v1 (candidate contract)

Status: **wire format specification only**. An assigned opcode is not a negotiation, BLE delivery, acknowledgement, or verified MINI display.

## Preconditions

Opcode `0x50` is reserved identically in Android and firmware, but MUST NOT be sent until both devices explicitly negotiate support for `triad_phase_v1` in the **current encrypted, bonded Link V2 session**. HELLO or an HTTP success alone must not imply support. Missing capability or old firmware means no transmission. A revoked appairing, HALT, disconnect, foreground loss or failed SESSION_OK disables the feature immediately.

## Small binary payload (14 bytes, little-endian)

| Offset | Length | Field | Constraint |
| --- | --- | --- | --- |
| 0 | 1 | schema_version | exactly 1 |
| 1 | 1 | phase | 0 IDLE, 1 CAPTURING, 2 TRANSCRIBING, 3 THINKING, 4 RESPONDING, 5 OTHER_BUSY, 6 ERROR |
| 2 | 2 | freshness_ms | 0..30000; age of source phase at emission |
| 4 | 4 | session_generation | nonzero random per negotiated session, **not** a persistent identifier |
| 8 | 4 | phase_nonce | nonzero monotonic serial within session, forbid wrap without new generation |
| 12 | 2 | validity_ms | 1..30000 and <= 30000 - freshness_ms |

The Link V2 frame uses type `0x50`, `stream_id=0`, and `seq` matching the low 16 bits of `phase_nonce`. The existing frame header and CRC remain unchanged. Never put conversation text, device token, pairing key, turn ID, audio, or Windows command into this payload.

## Receiver rules

- Reject unsupported capability, invalid encrypted SESSION, wrong generation, malformed length/version/enum, zero nonce, replay/out-of-order serial, impossible age or TTL, revoked link or HALT.
- The MINI display labels valid data explicitly `Android distant`, not local microphone status or synchronized conversation. An ACK must only follow successful validation and acceptance by the receiver, and must correlate session generation plus nonce; an underlying GATT write or generic Link V2 ACK is insufficient.
- On link loss, device reboot, HALT, revocation or expiry, immediately clear the display to `Android non vérifié`. Keep a monotonic local deadline and never prolong freshness on duplicated packets.
- Refreshes are optional and rate-limited, with **no streaming on the audio channel**. Link V2 audio opcodes, flow control credits, emergency STOP and Windows authorizations are unchanged.

## Acceptance

Implement sender, receiver, capability negotiation, ACK semantics and MINI screen separately, with explicit software and physical test evidence on exact SHAs. Until then, label this specification `CANDIDATE / NOT DONE_VERIFIED`.
