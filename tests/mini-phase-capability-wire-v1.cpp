#include "../firmware/waveshare-terminal/main/mel_mini_phase_capability_wire_v1.h"
#include "../firmware/waveshare-terminal/main/mel_mini_phase_capability.h"
#include <cassert>
int main() {
    MelMiniPhaseCapabilityRequestV1 out{99};
    const uint8_t valid[6] = {1,1,0x78,0x56,0x34,0x12};
    assert(mel_mini_phase_capability_request_v1_decode(valid,6,&out));
    assert(out.generation == 0x12345678u);
    const uint8_t no_consent[6] = {1,0,1,0,0,0};
    const uint8_t future_version[6] = {2,1,1,0,0,0};
    const uint8_t zero_generation[6] = {1,1,0,0,0,0};
    assert(!mel_mini_phase_capability_request_v1_decode(nullptr,6,&out));
    assert(!mel_mini_phase_capability_request_v1_decode(valid,6,nullptr));
    assert(!mel_mini_phase_capability_request_v1_decode(valid,5,&out));
    assert(!mel_mini_phase_capability_request_v1_decode(valid,7,&out));
    assert(!mel_mini_phase_capability_request_v1_decode(no_consent,6,&out));
    assert(!mel_mini_phase_capability_request_v1_decode(future_version,6,&out));
    assert(!mel_mini_phase_capability_request_v1_decode(zero_generation,6,&out));
    // A valid request is NEVER sufficient to grant capability by itself.
    MelMiniPhaseCapability c;
    assert(!c.permits(out.generation,true));
    assert(!c.grant(out.generation,true,true,false));
    assert(!c.permits(out.generation,true));
}
