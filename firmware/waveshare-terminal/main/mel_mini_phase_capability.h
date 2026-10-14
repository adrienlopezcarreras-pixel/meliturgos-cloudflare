#pragma once
#include <stdint.h>

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
