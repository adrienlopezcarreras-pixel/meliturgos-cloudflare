#pragma once
#include <stdint.h>
#include <stddef.h>

// Candidate capability request wire format; NOT wired to BLE authorization.
// [version=1, consent=1, generation uint32 little-endian] (6 bytes).
// An authenticated SESSION and explicit local support must still be checked
// before a caller may grant any capability.
struct MelMiniPhaseCapabilityRequestV1 {
    uint32_t generation;
};

inline bool mel_mini_phase_capability_request_v1_decode(
    const uint8_t *bytes, size_t len, MelMiniPhaseCapabilityRequestV1 *out) {
    if (!bytes || !out || len != 6 || bytes[0] != 1 || bytes[1] != 1) return false;
    const uint32_t generation = uint32_t(bytes[2]) |
        (uint32_t(bytes[3]) << 8) | (uint32_t(bytes[4]) << 16) |
        (uint32_t(bytes[5]) << 24);
    if (!generation) return false;
    out->generation = generation;
    return true;
}
