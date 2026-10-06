#include "mel_link_v2_protocol.h"
#include <string.h>

uint16_t mel_link_v2_crc16(const uint8_t *data, size_t len) {
    uint16_t crc = 0xffff;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data ? data[i] : 0;
        for (int bit = 0; bit < 8; ++bit) {
            crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
        }
    }
    return crc;
}

size_t mel_link_v2_encode(
    uint8_t type,
    uint8_t flags,
    uint16_t stream_id,
    uint16_t seq,
    const uint8_t *payload,
    uint16_t payload_len,
    uint8_t *out,
    size_t out_capacity
) {
    const size_t total = MEL_LINK_V2_HEADER_SIZE + payload_len;
    if (!out || out_capacity < total || (payload_len && !payload)) return 0;
    MelLinkV2Header header = {};
    header.magic0 = MEL_LINK_V2_MAGIC0;
    header.magic1 = MEL_LINK_V2_MAGIC1;
    header.protocol_version = MEL_LINK_V2_PROTOCOL_VERSION;
    header.type = type;
    header.flags = flags;
    header.stream_id = stream_id;
    header.seq = seq;
    header.payload_len = payload_len;
    header.crc16 = mel_link_v2_crc16(payload, payload_len);
    memcpy(out, &header, sizeof(header));
    if (payload_len) memcpy(out + sizeof(header), payload, payload_len);
    return total;
}

bool mel_link_v2_decode(
    const uint8_t *frame,
    size_t frame_len,
    MelLinkV2Header *header_out,
    const uint8_t **payload_out
) {
    if (!frame || frame_len < MEL_LINK_V2_HEADER_SIZE) return false;
    MelLinkV2Header header = {};
    memcpy(&header, frame, sizeof(header));
    if (header.magic0 != MEL_LINK_V2_MAGIC0 || header.magic1 != MEL_LINK_V2_MAGIC1) return false;
    if (header.protocol_version != MEL_LINK_V2_PROTOCOL_VERSION) return false;
    if ((size_t)header.payload_len + MEL_LINK_V2_HEADER_SIZE != frame_len) return false;
    const uint8_t *payload = frame + MEL_LINK_V2_HEADER_SIZE;
    if (mel_link_v2_crc16(payload, header.payload_len) != header.crc16) return false;
    if (header_out) *header_out = header;
    if (payload_out) *payload_out = payload;
    return true;
}
