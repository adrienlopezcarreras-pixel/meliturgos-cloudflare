#include "../firmware/waveshare-terminal/main/mel_mini_phase_optin_v1.h"
#include "../firmware/waveshare-terminal/main/mel_mini_phase_capability.h"
#include <cassert>
int main() {
    const uint8_t request[] = {1, 1, 7, 0, 0, 0};
    MelMiniPhaseOptInV1 parsed{};
    MelMiniPhaseCapability permission;
    assert(mel_mini_phase_optin_v1_decode(request, sizeof(request), &parsed));
    assert(parsed.requested && parsed.session_generation == 7);
    assert(!permission.permits(7, true)); // Decode is never an implicit grant.
    assert(!mel_mini_phase_optin_v1_decode(nullptr, sizeof(request), &parsed));
    assert(!mel_mini_phase_optin_v1_decode(request, 5, &parsed));
    assert(!mel_mini_phase_optin_v1_decode(request, sizeof(request), nullptr));
    const uint8_t wrong_version[] = {2, 1, 7, 0, 0, 0};
    const uint8_t bad_flag[] = {1, 2, 7, 0, 0, 0};
    const uint8_t zero_generation[] = {1, 1, 0, 0, 0, 0};
    const uint8_t revoke[] = {1, 0, 0, 0, 0, 0};
    assert(!mel_mini_phase_optin_v1_decode(wrong_version, 6, &parsed));
    assert(!mel_mini_phase_optin_v1_decode(bad_flag, 6, &parsed));
    assert(!mel_mini_phase_optin_v1_decode(zero_generation, 6, &parsed));
    assert(mel_mini_phase_optin_v1_decode(revoke, 6, &parsed));
    assert(!parsed.requested);
}
