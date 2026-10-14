#pragma once
#include <stdint.h>
#include <stddef.h>

// Candidate TRIAD_PHASE v1 payload parser. Pure validation only: NO BLE
// receive handler, session authorization, ACK or display side effect.
struct MelMiniPhaseV1 {
    uint8_t phase;
    uint16_t freshness_ms;
    uint32_t session_generation;
    uint32_t phase_nonce;
    uint16_t validity_ms;
};

inline bool mel_mini_phase_v1_decode(const uint8_t *data, size_t len, MelMiniPhaseV1 *out) {
    if (!data || !out || len != 14 || data[0] != 1 || data[1] > 6) return false;
    const uint16_t age = (uint16_t)data[2] | (uint16_t(data[3]) << 8);
    const uint32_t generation = uint32_t(data[4]) | (uint32_t(data[5]) << 8) |
        (uint32_t(data[6]) << 16) | (uint32_t(data[7]) << 24);
    const uint32_t nonce = uint32_t(data[8]) | (uint32_t(data[9]) << 8) |
        (uint32_t(data[10]) << 16) | (uint32_t(data[11]) << 24);
    const uint16_t ttl = uint16_t(data[12]) | (uint16_t(data[13]) << 8);
    if (age > 30000 || !generation || !nonce || !ttl || ttl > 30000 - age) return false;
    *out = MelMiniPhaseV1{data[1], age, generation, nonce, ttl};
    return true;
}
