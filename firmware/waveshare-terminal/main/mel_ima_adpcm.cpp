#include "mel_ima_adpcm.h"
#include <algorithm>

static const int kIndexTable[16] = {
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8
};

static const int kStepTable[89] = {
    7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,
    34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,
    157,173,190,209,230,253,279,307,337,371,408,449,494,544,
    598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,
    3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,
    15289,16818,18500,20350,22385,24623,27086,29794,32767
};

static inline int clamp16(int value) {
    return std::max(-32768, std::min(32767, value));
}

static inline int clamp_index(int value) {
    return std::max(0, std::min(88, value));
}

static uint8_t encode_nibble(int16_t sample, int &predictor, int &index) {
    const int step = kStepTable[index];
    int diff = (int)sample - predictor;
    uint8_t code = 0;
    if (diff < 0) {
        code = 8;
        diff = -diff;
    }

    int delta = step >> 3;
    int remaining_step = step;
    if (diff >= remaining_step) {
        code |= 4;
        diff -= remaining_step;
        delta += remaining_step;
    }
    remaining_step >>= 1;
    if (diff >= remaining_step) {
        code |= 2;
        diff -= remaining_step;
        delta += remaining_step;
    }
    remaining_step >>= 1;
    if (diff >= remaining_step) {
        code |= 1;
        delta += remaining_step;
    }

    predictor = (code & 8) ? predictor - delta : predictor + delta;
    predictor = clamp16(predictor);
    index = clamp_index(index + kIndexTable[code & 0x0f]);
    return code & 0x0f;
}

static int16_t decode_nibble(uint8_t code, int &predictor, int &index) {
    const int step = kStepTable[index];
    int delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;

    predictor = (code & 8) ? predictor - delta : predictor + delta;
    predictor = clamp16(predictor);
    index = clamp_index(index + kIndexTable[code & 0x0f]);
    return (int16_t)predictor;
}

size_t mel_ima_adpcm_encoded_size(size_t sample_count) {
    if (sample_count == 0) return 0;
    const size_t coded_samples = sample_count - 1;
    return 4 + ((coded_samples + 1) / 2);
}

bool mel_ima_adpcm_encode_block(
    const int16_t *samples,
    size_t sample_count,
    uint8_t *out,
    size_t out_capacity,
    size_t *out_size
) {
    if (!samples || !out || !out_size || sample_count == 0 || sample_count > MEL_IMA_ADPCM_BLOCK_SAMPLES) return false;
    const size_t needed = mel_ima_adpcm_encoded_size(sample_count);
    if (out_capacity < needed) return false;

    int predictor = samples[0];
    int index = 0;
    out[0] = (uint8_t)(predictor & 0xff);
    out[1] = (uint8_t)((predictor >> 8) & 0xff);
    out[2] = (uint8_t)index;
    out[3] = (uint8_t)sample_count;

    size_t dst = 4;
    bool low = true;
    uint8_t packed = 0;
    for (size_t i = 1; i < sample_count; ++i) {
        const uint8_t code = encode_nibble(samples[i], predictor, index);
        if (low) {
            packed = code;
            low = false;
        } else {
            packed |= (uint8_t)(code << 4);
            out[dst++] = packed;
            low = true;
            packed = 0;
        }
    }
    if (!low) out[dst++] = packed;
    *out_size = dst;
    return dst == needed;
}

bool mel_ima_adpcm_decode_block(
    const uint8_t *encoded,
    size_t encoded_size,
    int16_t *out,
    size_t out_capacity_samples,
    size_t *out_samples
) {
    if (!encoded || !out || !out_samples || encoded_size < 4) return false;
    const size_t sample_count = encoded[3] == 0 ? MEL_IMA_ADPCM_BLOCK_SAMPLES : encoded[3];
    if (sample_count == 0 || sample_count > MEL_IMA_ADPCM_BLOCK_SAMPLES || out_capacity_samples < sample_count) return false;
    if (encoded_size != mel_ima_adpcm_encoded_size(sample_count)) return false;

    int predictor = (int16_t)((uint16_t)encoded[0] | ((uint16_t)encoded[1] << 8));
    int index = clamp_index(encoded[2]);
    out[0] = (int16_t)predictor;

    size_t src = 4;
    for (size_t i = 1; i < sample_count; ++i) {
        const uint8_t packed = encoded[src + ((i - 1) / 2)];
        const uint8_t code = ((i - 1) & 1) ? (packed >> 4) : (packed & 0x0f);
        out[i] = decode_nibble(code, predictor, index);
    }
    *out_samples = sample_count;
    return true;
}
