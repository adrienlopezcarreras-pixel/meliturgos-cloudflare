#pragma once
#include <stdint.h>
#include <stddef.h>

#define MEL_LINK_V2_PROTOCOL_VERSION 2
#define MEL_LINK_V2_MAGIC0 0x4d
#define MEL_LINK_V2_MAGIC1 0x32
#define MEL_LINK_V2_HEADER_SIZE 13
#define MEL_LINK_V2_DEFAULT_MTU 185
#define MEL_LINK_V2_CREDIT_WINDOW 6

enum MelLinkV2FrameType : uint8_t {
    MEL_LINK_V2_HELLO = 0x01,
    MEL_LINK_V2_SESSION = 0x02,
    MEL_LINK_V2_CLOCK = 0x03,
    MEL_LINK_V2_REQUEST_BEGIN = 0x10,
    MEL_LINK_V2_REQUEST_DATA = 0x11,
    MEL_LINK_V2_REQUEST_END = 0x12,
    MEL_LINK_V2_MEDIA_CONFIG_REQUEST = 0x13,
    MEL_LINK_V2_MEDIA_CONFIG = 0x14,
    MEL_LINK_V2_RESPONSE_BEGIN = 0x20,
    MEL_LINK_V2_RESPONSE_DATA = 0x21,
    MEL_LINK_V2_RESPONSE_END = 0x22,
    MEL_LINK_V2_AUDIO_BEGIN = 0x30,
    MEL_LINK_V2_AUDIO_DATA = 0x31,
    MEL_LINK_V2_AUDIO_END = 0x32,
    MEL_LINK_V2_CREDIT = 0x40,
    MEL_LINK_V2_ACK = 0x41,
    MEL_LINK_V2_ERROR = 0x7e,
    MEL_LINK_V2_PING = 0x7f,
    MEL_LINK_V2_PONG = 0x80,
};

struct __attribute__((packed)) MelLinkV2Header {
    uint8_t magic0;
    uint8_t magic1;
    uint8_t protocol_version;
    uint8_t type;
    uint8_t flags;
    uint16_t stream_id;
    uint16_t seq;
    uint16_t payload_len;
    uint16_t crc16;
};

static_assert(sizeof(MelLinkV2Header) == MEL_LINK_V2_HEADER_SIZE, "MEL Link V2 header layout drift");


uint16_t mel_link_v2_crc16(const uint8_t *data, size_t len);

size_t mel_link_v2_encode(
    uint8_t type,
    uint8_t flags,
    uint16_t stream_id,
    uint16_t seq,
    const uint8_t *payload,
    uint16_t payload_len,
    uint8_t *out,
    size_t out_capacity
);

bool mel_link_v2_decode(
    const uint8_t *frame,
    size_t frame_len,
    MelLinkV2Header *header_out,
    const uint8_t **payload_out
);
