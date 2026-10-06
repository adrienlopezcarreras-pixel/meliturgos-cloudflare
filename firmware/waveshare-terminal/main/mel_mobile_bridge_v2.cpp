#include "mel_mobile_bridge.h"
#include "mel_link_v2_transport.h"

void mel_mobile_bridge_start(void) {
    mel_link_v2_transport_start();
}

void mel_mobile_bridge_rescan(void) {
    // V2 MINI is the peripheral. Advertising is owned by the server and
    // restarts automatically after disconnect; there is nothing to scan.
    mel_link_v2_transport_start();
}

bool mel_mobile_bridge_keepalive(void) {
    return mel_link_v2_transport_keepalive();
}

bool mel_mobile_bridge_ready(void) {
    return mel_link_v2_transport_ready();
}

bool mel_mobile_bridge_candidate_seen(void) {
    return mel_link_v2_transport_candidate_seen();
}

uint16_t mel_mobile_bridge_mtu(void) {
    return mel_link_v2_transport_mtu();
}

esp_err_t mel_mobile_bridge_request(
    esp_http_client_method_t method,
    const char *path,
    const char *content_type,
    const char *token,
    const char *device_id,
    const uint8_t *body,
    size_t body_len,
    std::string &response,
    int &status
) {
    (void)token; // V2 never forwards the MINI bearer to Android.
    return mel_link_v2_transport_request(
        method, path, content_type, device_id, body, body_len, response, status
    );
}

esp_err_t mel_mobile_bridge_request_stream(
    esp_http_client_method_t method,
    const char *path,
    const char *content_type,
    const char *token,
    const char *device_id,
    const uint8_t *body,
    size_t body_len,
    int &status,
    mel_mobile_bridge_chunk_cb cb,
    void *ctx
) {
    (void)token; // V2 delegated auth is anchored by the Android session.
    return mel_link_v2_transport_request_stream(
        method, path, content_type, device_id, body, body_len, status,
        reinterpret_cast<mel_link_v2_chunk_cb>(cb), ctx
    );
}
