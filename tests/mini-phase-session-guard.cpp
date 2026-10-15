#include "../firmware/waveshare-terminal/main/mel_mini_phase_session_guard.h"
#include <cassert>
int main() {
    MelMiniPhaseSessionGuard guard;
    MelMiniPhaseV1 p{3, 100, 42, 1, 1000};
    assert(!guard.accept(p,42,false,true,100));
    assert(!guard.active);
    assert(!guard.accept(p,42,true,false,100));
    assert(!guard.accept(p,99,true,true,100));
    assert(guard.accept(p,42,true,true,100));
    assert(guard.current(1099,true,true));
    assert(!guard.accept(p,42,true,true,200)); // replay does not prolong deadline
    assert(guard.current(1099,true,true));
    // Rekeying with a valid new session generation must not leave an old
    // phase appearing active even when the new frame is rejected.
    MelMiniPhaseV1 rekey{4, 20, 43, 2, 200};
    assert(!guard.accept(rekey,43,true,true,1099));
    assert(!guard.current(1099,true,true));
    // Reestablish the old generation only after explicit clearing.
    p.phase_nonce=1;
    assert(guard.accept(p,42,true,true,100));
    assert(!guard.current(1100,true,true)); // deadline clears everything
    p.phase_nonce=2;
    assert(guard.accept(p,42,true,true,2000));
    assert(!guard.accept(p,43,true,true,2001)); // no implicit generation switch
    assert(!guard.current(2001,true,true)); // wrong session clears state
    assert(!guard.current(2002,false,true)); // disconnect clears immediately
    p.phase_nonce=1;
    p.session_generation=43;
    assert(guard.accept(p,43,true,true,3000));
    assert(!guard.current(3001,true,false)); // capability revoked
    p.phase_nonce=0;
    assert(!guard.accept(p,43,true,true,3002));
    p.phase_nonce=0xffffffffu;
    assert(guard.accept(p,43,true,true,3003));
    p.phase_nonce=1;
    assert(!guard.accept(p,43,true,true,3004)); // wrap forbidden
    guard.clear();
    assert(!guard.active);
    p.phase_nonce=2;
    assert(!guard.accept(p,43,true,true,UINT64_MAX - 999)); // deadline would overflow
    assert(!guard.active);
    assert(guard.accept(p,43,true,true,UINT64_MAX - 1000)); // exact maximum is safe
    assert(guard.current(UINT64_MAX - 1,true,true));
    assert(!guard.current(UINT64_MAX,true,true));
}
