#include "../firmware/waveshare-terminal/main/mel_mini_phase_negotiation_v1.h"
#include <cassert>
#include <cstring>
int main() {
    uint8_t raw[MEL_MINI_PHASE_NEGOTIATION_V1_SIZE] = {};
    MelMiniPhaseNegotiationV1 decoded{};
    assert(!mel_mini_phase_negotiation_encode(1,0,raw,sizeof raw));
    assert(!mel_mini_phase_negotiation_encode(4,5,raw,sizeof raw));
    for (uint8_t kind=1; kind<=3; ++kind) {
        assert(mel_mini_phase_negotiation_encode(kind,0xfedcba98,raw,sizeof raw));
        assert(mel_mini_phase_negotiation_decode(raw,sizeof raw,&decoded));
        assert(decoded.kind==kind && decoded.generation==0xfedcba98);
    }
    raw[0]=2; assert(!mel_mini_phase_negotiation_decode(raw,sizeof raw,&decoded)); raw[0]=1;
    raw[2]=1; assert(!mel_mini_phase_negotiation_decode(raw,sizeof raw,&decoded)); raw[2]=0;
    raw[4]=raw[5]=raw[6]=raw[7]=0;
    assert(!mel_mini_phase_negotiation_decode(raw,sizeof raw,&decoded));
    assert(!mel_mini_phase_negotiation_decode(raw,sizeof raw-1,&decoded));
    assert(!mel_mini_phase_negotiation_decode(nullptr,sizeof raw,&decoded));
    assert(!mel_mini_phase_negotiation_decode(raw,sizeof raw,nullptr));
}
