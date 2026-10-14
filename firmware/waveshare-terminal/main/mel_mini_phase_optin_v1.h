#pragma once
#include <cstddef>
#include <cstdint>

// Candidate opt-in envelope for a future authenticated, per-session exchange.
// Parsing this message NEVER grants authorization. The transport must separately
// validate encrypted SESSION, explicit peer consent and local support.
struct MelMiniPhaseOptInV1 {
    uint32_t session_generation;
    bool requested;
};

inline bool mel_mini_phase_optin_v1_decode(const uint8_t *data, size_t size,
                                          MelMiniPhaseOptInV1 *out) {
    if (!data || !out || size != 6 || data[0] != 1 ||
        (data[1] != 0 && data[1] != 1)) return false;
    const uint32_t generation = static_cast<uint32_t>(data[2]) |
        (static_cast<uint32_t>(data[3]) << 8) |
        (static_cast<uint32_t>(data[4]) << 16) |
        (static_cast<uint32_t>(data[5]) << 24);
    if (data[1] == 1 && generation == 0) return false;
    *out = {generation, data[1] == 1};
    return true;
}
