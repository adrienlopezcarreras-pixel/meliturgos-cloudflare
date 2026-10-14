#include "../firmware/waveshare-terminal/main/mel_mini_phase_capability.h"
#include <cassert>
int main() {
    MelMiniPhaseCapability c;
    assert(!c.permits(7,true));
    assert(!c.grant(7,false,true,true));
    assert(!c.grant(7,true,false,true));
    assert(!c.grant(7,true,true,false));
    assert(!c.grant(0,true,true,true));
    assert(c.grant(7,true,true,true));
    assert(c.permits(7,true));
    assert(!c.permits(8,true));
    assert(!c.permits(7,false));
    assert(!c.grant(9,true,false,true)); // Failed renegotiation revokes old grant
    assert(!c.permits(7,true));
    assert(c.grant(9,true,true,true));
    c.clear(); // Disconnect or new SESSION
    assert(!c.permits(9,true));
    MelMiniPhaseOptInV1 opt;
    const uint8_t good[] = {1,1,7,0,0,0};
    const uint8_t disabled[] = {1,0,7,0,0,0};
    const uint8_t bad_version[] = {2,1,7,0,0,0};
    const uint8_t zero[] = {1,1,0,0,0,0};
    assert(mel_mini_phase_opt_in_v1_decode(good,6,&opt));
    assert(opt.requested && opt.generation == 7);
    assert(!mel_mini_phase_opt_in_v1_decode(good,5,&opt));
    assert(!mel_mini_phase_opt_in_v1_decode(good,7,&opt));
    assert(!mel_mini_phase_opt_in_v1_decode(disabled,6,&opt));
    assert(!mel_mini_phase_opt_in_v1_decode(bad_version,6,&opt));
    assert(!mel_mini_phase_opt_in_v1_decode(zero,6,&opt));
    assert(!mel_mini_phase_opt_in_v1_decode(nullptr,6,&opt));
    assert(!mel_mini_phase_opt_in_v1_decode(good,6,nullptr));
    assert(!c.permits(7,true)); // A parsed request must never grant a phase.

}
