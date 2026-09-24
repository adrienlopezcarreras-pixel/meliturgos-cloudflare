#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string>
#include "esp_err.h"
#include "esp_http_client.h"

typedef bool (*mel_mobile_bridge_chunk_cb)(const uint8_t *data, size_t len, void *ctx);

void mel_mobile_bridge_start(void);
bool mel_mobile_bridge_ready(void);
uint16_t mel_mobile_bridge_mtu(void);

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
);

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
);
