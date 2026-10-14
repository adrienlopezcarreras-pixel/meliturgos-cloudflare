#pragma once
#include <stddef.h>
#include <stdint.h>

// Candidate negotiation message. No transport wiring or implicit grants.
// Type 1: Android REQUEST, type 2: MINI ACCEPT, type 3: MINI DENY.
// ACCEPT is valid only after the bonded encrypted SESSION and local opt-in.
struct MelMiniPhaseNegotiationV1 {
    uint8_t kind;
    uint32_t generation;
};
static constexpr size_t MEL_MINI_PHASE_NEGOTIATION_V1_SIZE = 8;

inline bool mel_mini_phase_negotiation_decode(
    const uint8_t *raw, size_t len, MelMiniPhaseNegotiationV1 *out) {
    if (!raw || !out || len != MEL_MINI_PHASE_NEGOTIATION_V1_SIZE ||
        raw[0] != 1 || raw[1] < 1 || raw[1] > 3 ||
        raw[2] != 0 || raw[3] != 0) return false;
    const uint32_t gen = uint32_t(raw[4]) |
        (uint32_t(raw[5]) << 8) | (uint32_t(raw[6]) << 16) |
        (uint32_t(raw[7]) << 24);
    if (gen == 0) return false;
    out->kind = raw[1];
    out->generation = gen;
    return true;
}

inline bool mel_mini_phase_negotiation_encode(
    uint8_t kind, uint32_t generation, uint8_t *raw, size_t len) {
    if (!raw || len != MEL_MINI_PHASE_NEGOTIATION_V1_SIZE ||
        kind < 1 || kind > 3 || generation == 0) return false;
    raw[0] = 1; raw[1] = kind; raw[2] = 0; raw[3] = 0;
    for (unsigned i = 0; i < 4; ++i) raw[4+i] = uint8_t(generation >> (i*8));
    return true;
}
