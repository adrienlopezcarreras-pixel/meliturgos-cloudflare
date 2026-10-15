#pragma once
#include <stddef.h>
#include <stdint.h>

// Wire contract only: this does not authorize, send, ACK or display phases.
// A receiver must validate an authenticated Link V2 session separately.
static constexpr uint8_t MEL_MINI_PHASE_NEGOTIATION_VERSION = 1;
static constexpr uint8_t MEL_MINI_PHASE_NEGOTIATION_REQUEST = 1;
static constexpr uint8_t MEL_MINI_PHASE_NEGOTIATION_ACCEPT = 2;
static constexpr uint8_t MEL_MINI_PHASE_NEGOTIATION_REJECT = 3;
static constexpr size_t MEL_MINI_PHASE_NEGOTIATION_SIZE = 6;

struct MelMiniPhaseNegotiationV1 {
    uint8_t action = 0;
    uint32_t session_generation = 0;
};

inline bool mel_mini_phase_negotiation_v1_decode(
    const uint8_t *payload, size_t size, MelMiniPhaseNegotiationV1 *out) {
    if (!payload || !out || size != MEL_MINI_PHASE_NEGOTIATION_SIZE ||
        payload[0] != MEL_MINI_PHASE_NEGOTIATION_VERSION ||
        payload[1] < MEL_MINI_PHASE_NEGOTIATION_REQUEST ||
        payload[1] > MEL_MINI_PHASE_NEGOTIATION_REJECT) return false;
    const uint32_t generation = uint32_t(payload[2]) |
        (uint32_t(payload[3]) << 8) | (uint32_t(payload[4]) << 16) |
        (uint32_t(payload[5]) << 24);
    if (generation == 0) return false;
    out->action = payload[1];
    out->session_generation = generation;
    return true;
}

inline bool mel_mini_phase_negotiation_v1_encode(
    const MelMiniPhaseNegotiationV1 &candidate, uint8_t *out, size_t capacity) {
    if (!out || capacity < MEL_MINI_PHASE_NEGOTIATION_SIZE ||
        candidate.action < MEL_MINI_PHASE_NEGOTIATION_REQUEST ||
        candidate.action > MEL_MINI_PHASE_NEGOTIATION_REJECT ||
        candidate.session_generation == 0) return false;
    out[0] = MEL_MINI_PHASE_NEGOTIATION_VERSION;
    out[1] = candidate.action;
    out[2] = uint8_t(candidate.session_generation);
    out[3] = uint8_t(candidate.session_generation >> 8);
    out[4] = uint8_t(candidate.session_generation >> 16);
    out[5] = uint8_t(candidate.session_generation >> 24);
    return true;
}
