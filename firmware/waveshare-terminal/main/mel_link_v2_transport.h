#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string>
#include "esp_err.h"
#include "esp_http_client.h"

typedef bool (*mel_link_v2_chunk_cb)(const uint8_t *data, size_t len, void *ctx);
typedef void (*mel_link_v2_progress_cb)(size_t sent_samples, size_t total_samples, void *ctx);

typedef struct {
    char ssid[33];
    char password[65];
    char token[97];
    uint16_t port;
} MelLinkV2MediaConfig;

void mel_link_v2_transport_start(void);
bool mel_link_v2_transport_ready(void);
bool mel_link_v2_transport_keepalive(void);
bool mel_link_v2_transport_candidate_seen(void);
uint16_t mel_link_v2_transport_mtu(void);
bool mel_link_v2_transport_request_media_config(
    MelLinkV2MediaConfig *out,
    uint32_t timeout_ms
);

esp_err_t mel_link_v2_transport_request(
    esp_http_client_method_t method,
    const char *path,
    const char *content_type,
    const char *mini_device_id,
    const uint8_t *body,
    size_t body_len,
    std::string &response,
    int &status
);

esp_err_t mel_link_v2_transport_request_stream(
    esp_http_client_method_t method,
    const char *path,
    const char *content_type,
    const char *mini_device_id,
    const uint8_t *body,
    size_t body_len,
    int &status,
    mel_link_v2_chunk_cb cb,
    void *ctx
);


esp_err_t mel_link_v2_transport_transcribe_adpcm(
    const int16_t *samples,
    size_t sample_count,
    const char *mini_device_id,
    std::string &response,
    int &status,
    mel_link_v2_progress_cb progress_cb = nullptr,
    void *progress_ctx = nullptr
);
