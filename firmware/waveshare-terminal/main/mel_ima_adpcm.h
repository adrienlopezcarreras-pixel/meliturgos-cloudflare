#pragma once
#include <stddef.h>
#include <stdint.h>

#define MEL_IMA_ADPCM_BLOCK_SAMPLES 256
#define MEL_IMA_ADPCM_MAX_ENCODED_BYTES 132

size_t mel_ima_adpcm_encoded_size(size_t sample_count);

bool mel_ima_adpcm_encode_block(
    const int16_t *samples,
    size_t sample_count,
    uint8_t *out,
    size_t out_capacity,
    size_t *out_size
);

bool mel_ima_adpcm_decode_block(
    const uint8_t *encoded,
    size_t encoded_size,
    int16_t *out,
    size_t out_capacity_samples,
    size_t *out_samples
);
