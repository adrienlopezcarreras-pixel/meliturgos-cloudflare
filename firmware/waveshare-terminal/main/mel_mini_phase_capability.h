#pragma once
#include <stdint.h>
#include <stddef.h>

// Pure opt-in negotiation state. Not connected to BLE, screen or audio.
// The transport must authenticate the peer before calling grant(), and
// must clear() on disconnect, HALT, SESSION renewal or authorization loss.
struct MelMiniPhaseCapability {
    uint32_t generation = 0;
    bool granted = false;

    void clear() { generation = 0; granted = false; }

    bool grant(uint32_t proposed_generation, bool encrypted_session_ready,
               bool explicit_peer_opt_in, bool local_support_enabled) {
        clear();
        if (!encrypted_session_ready || !explicit_peer_opt_in ||
            !local_support_enabled || !proposed_generation) return false;
        generation = proposed_generation;
        granted = true;
        return true;
    }

    bool permits(uint32_t candidate_generation, bool encrypted_session_ready) const {
        return granted && encrypted_session_ready && generation != 0 &&
               candidate_generation == generation;
    }
};

 
// Strict six-byte proposed opt-in payload. Parsing it NEVER grants capability.
// The authenticated SESSION and the MINI's own opt-in must still be verified
// before a caller may invoke MelMiniPhaseCapability::grant().
struct MelMiniPhaseOptInV1 {
    uint32_t generation = 0;
    bool requested = false;
};

inline bool mel_mini_phase_opt_in_v1_decode(const uint8_t *data, size_t len,
                                             MelMiniPhaseOptInV1 *out) {
    if (!data || !out || len != 6 || data[0] != 1 || data[1] != 1) return false;
    const uint32_t generation = uint32_t(data[2]) |
        (uint32_t(data[3]) << 8) | (uint32_t(data[4]) << 16) |
        (uint32_t(data[5]) << 24);
    if (!generation) return false;
    out->generation = generation;
    out->requested = true;
    return true;
}
