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
}
