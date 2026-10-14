#include "../firmware/waveshare-terminal/main/mel_mini_phase_v1.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
int main() {
    uint8_t packet[14] = {1,3,0xe8,0x03,42,0,0,0,1,0,0,0,0x20,0x4e};
    MelMiniPhaseV1 phase{};
    assert(mel_mini_phase_v1_decode(packet, sizeof(packet), &phase));
    assert(phase.phase == 3 && phase.freshness_ms == 1000 && phase.session_generation == 42 && phase.phase_nonce == 1 && phase.validity_ms == 20000);
    assert(!mel_mini_phase_v1_decode(packet, 13, &phase));
    packet[0]=2; assert(!mel_mini_phase_v1_decode(packet,14,&phase)); packet[0]=1;
    packet[1]=7; assert(!mel_mini_phase_v1_decode(packet,14,&phase)); packet[1]=3;
    packet[4]=0; assert(!mel_mini_phase_v1_decode(packet,14,&phase)); packet[4]=42;
    packet[8]=0; assert(!mel_mini_phase_v1_decode(packet,14,&phase)); packet[8]=1;
    packet[12]=0; packet[13]=0; assert(!mel_mini_phase_v1_decode(packet,14,&phase));
    puts("TRIAD_PHASE firmware parser OK");
}
