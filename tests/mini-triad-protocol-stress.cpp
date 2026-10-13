// Offline, host-native stress of the exact MINI firmware codec and frame parser.
// This never connects to a device, writes flash or touches BLE hardware.
#include "../firmware/waveshare-terminal/main/mel_link_v2_protocol.h"
#include "../firmware/waveshare-terminal/main/mel_ima_adpcm.h"
#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <vector>

static uint32_t next_random(uint32_t &state) {
    state ^= state << 13; state ^= state >> 17; state ^= state << 5;
    return state;
}

int main() {
    uint32_t seed = 0x1234ABCDu;
    uint64_t checked = 0, rejected = 0, audio = 0;
    for (int cycle = 0; cycle < 10000; ++cycle) {
        // MTU 185 => maximum ATT value 182 including 13-byte V2 header.
        size_t size = (size_t)(next_random(seed) % 170);
        std::vector<uint8_t> payload(size);
        for (auto &v : payload) v = (uint8_t)next_random(seed);
        uint16_t stream = (uint16_t)next_random(seed);
        uint16_t seq = (uint16_t)next_random(seed);
        uint8_t type = (uint8_t)((cycle % 6) + 0x10);
        uint8_t frame[192] = {};
        size_t written = mel_link_v2_encode(type, 0, stream, seq,
            payload.empty() ? nullptr : payload.data(),
            (uint16_t)payload.size(), frame, sizeof(frame));
        assert(written == payload.size() + MEL_LINK_V2_HEADER_SIZE);
        MelLinkV2Header h = {};
        const uint8_t *decoded = nullptr;
        assert(mel_link_v2_decode(frame, written, &h, &decoded));
        assert(h.type == type && h.stream_id == stream && h.seq == seq);
        assert(std::equal(payload.begin(), payload.end(), decoded));
        ++checked;

        uint8_t bad[192] = {};
        std::copy(frame, frame + written, bad);
        bad[2] = 1; // old protocol
        assert(!mel_link_v2_decode(bad, written, nullptr, nullptr));
        ++rejected;
        std::copy(frame, frame + written, bad);
        bad[9] ^= 0x01; // tamper with encoded length
        assert(!mel_link_v2_decode(bad, written, nullptr, nullptr));
        ++rejected;
        if (size > 0) {
            std::copy(frame, frame + written, bad);
            bad[MEL_LINK_V2_HEADER_SIZE] ^= 0x80; // CRC integrity
            assert(!mel_link_v2_decode(bad, written, nullptr, nullptr));
            ++rejected;
        }
        assert(!mel_link_v2_decode(frame, written - 1, nullptr, nullptr));
        ++rejected;
        assert(mel_link_v2_encode(type, 0, stream, seq, payload.data(),
           (uint16_t)size, frame, written - 1) == 0);
        ++rejected;
    }
    for (int cycle = 0; cycle < 1000; ++cycle) {
        size_t samples = (size_t)((cycle % MEL_IMA_ADPCM_BLOCK_SAMPLES) + 1);
        std::vector<int16_t> pcm(samples), back(samples);
        for (size_t i = 0; i < samples; ++i)
            pcm[i] = (int16_t)(9000.0 * std::sin((i + cycle) * 0.035));
        uint8_t encoded[MEL_IMA_ADPCM_MAX_ENCODED_BYTES] = {};
        size_t bytes = 0, got = 0;
        assert(mel_ima_adpcm_encode_block(pcm.data(), samples,
            encoded, sizeof(encoded), &bytes));
        assert(bytes == mel_ima_adpcm_encoded_size(samples));
        assert(mel_ima_adpcm_decode_block(encoded, bytes, back.data(), back.size(), &got));
        assert(got == samples);
        assert(pcm[0] == back[0]);
        // Encoded blocks must be independently reconstructible.
        std::vector<int16_t> replay(samples);
        size_t got2 = 0;
        assert(mel_ima_adpcm_decode_block(encoded, bytes, replay.data(), replay.size(), &got2));
        assert(back == replay);
        if (bytes > 4)
            assert(!mel_ima_adpcm_decode_block(encoded, bytes-1, back.data(), back.size(), &got));
        ++audio;
    }
    std::cout << "MINI_PROTOCOL_STRESS_PASS frames=" << checked
              << " integrity_rejects=" << rejected
              << " adpcm_blocks=" << audio << "\n";
    return 0;
}
