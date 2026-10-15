#include "../firmware/waveshare-terminal/main/mel_mini_phase_negotiation_v1.h"
#include <cassert>
#include <cstdint>
#include <initializer_list>
int main() {
    uint8_t b[MEL_MINI_PHASE_NEGOTIATION_SIZE] = {};
    MelMiniPhaseNegotiationV1 in = {MEL_MINI_PHASE_NEGOTIATION_REQUEST, 0x12345678};
    MelMiniPhaseNegotiationV1 out = {};
    assert(mel_mini_phase_negotiation_v1_encode(in,b,sizeof(b)));
    assert(b[0]==1 && b[1]==1 && b[2]==0x78 && b[5]==0x12);
    assert(mel_mini_phase_negotiation_v1_decode(b,sizeof(b),&out));
    assert(out.action==1 && out.session_generation==0x12345678);
    assert(!mel_mini_phase_negotiation_v1_decode(b,5,&out));
    assert(!mel_mini_phase_negotiation_v1_decode(nullptr,6,&out));
    assert(!mel_mini_phase_negotiation_v1_decode(b,6,nullptr));
    b[0]=2; assert(!mel_mini_phase_negotiation_v1_decode(b,6,&out)); b[0]=1;
    b[1]=4; assert(!mel_mini_phase_negotiation_v1_decode(b,6,&out)); b[1]=1;
    b[2]=b[3]=b[4]=b[5]=0;
    assert(!mel_mini_phase_negotiation_v1_decode(b,6,&out));
    assert(!mel_mini_phase_negotiation_v1_encode({2,0},b,6));
    assert(!mel_mini_phase_negotiation_v1_encode({4,7},b,6));
    assert(!mel_mini_phase_negotiation_v1_encode({1,7},nullptr,6));
    assert(!mel_mini_phase_negotiation_v1_encode({1,7},b,5));
    for(uint8_t action : {uint8_t(1), uint8_t(2), uint8_t(3)}) {
        MelMiniPhaseNegotiationV1 candidate{action, 0xabcdef01u};
        assert(mel_mini_phase_negotiation_v1_encode(candidate,b,sizeof(b)));
        MelMiniPhaseNegotiationV1 parsed{};
        assert(mel_mini_phase_negotiation_v1_decode(b,sizeof(b),&parsed));
        assert(parsed.action == action && parsed.session_generation == candidate.session_generation);
    }

}
