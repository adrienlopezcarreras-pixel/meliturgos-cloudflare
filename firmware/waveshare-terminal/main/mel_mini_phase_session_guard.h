#pragma once
#include "mel_mini_phase_v1.h"
#include <stdint.h>

// Pure state machine; deliberately NOT wired to BLE, ACK or screen.
// The caller must verify encrypted SESSION_OK and negotiated capability,
// and reset this state on disconnect, HALT, revocation or reboot.
struct MelMiniPhaseSessionGuard {
    uint32_t generation = 0;
    uint32_t last_nonce = 0;
    uint64_t deadline_ms = 0;
    uint8_t phase = 0;
    bool active = false;

    void clear() {
        generation = 0;
        last_nonce = 0;
        deadline_ms = 0;
        phase = 0;
        active = false;
    }

    bool accept(const MelMiniPhaseV1 &candidate, uint32_t negotiated_generation,
                bool encrypted_session_ready, bool capability_granted, uint64_t now_ms) {
        if (!encrypted_session_ready || !capability_granted || !negotiated_generation ||
            candidate.session_generation != negotiated_generation || !candidate.phase_nonce ||
            candidate.phase > 6 || candidate.freshness_ms > 30000 ||
            now_ms > UINT64_MAX - candidate.validity_ms ||
            !candidate.validity_ms || candidate.validity_ms > 30000 - candidate.freshness_ms) {
            clear();
            return false;
        }
        // No wrap, no nonce reuse; a new negotiated generation requires a
        // freshly cleared state, not an implicit reset upon an incoming packet.
        if (generation != 0 && generation != negotiated_generation) return false;
        if (candidate.phase_nonce <= last_nonce) return false;
        generation = negotiated_generation;
        last_nonce = candidate.phase_nonce;
        phase = candidate.phase;
        deadline_ms = now_ms + candidate.validity_ms;
        active = true;
        return true;
    }

    bool current(uint64_t now_ms, bool encrypted_session_ready, bool capability_granted) {
        if (!encrypted_session_ready || !capability_granted || !active ||
            now_ms >= deadline_ms) {
            clear();
            return false;
        }
        return true;
    }
};
