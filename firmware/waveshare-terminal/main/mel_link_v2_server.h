#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

typedef void (*mel_link_v2_rx_cb)(const uint8_t *frame, size_t len, void *ctx);
typedef void (*mel_link_v2_state_cb)(bool ready, void *ctx);

esp_err_t mel_link_v2_server_start(void);
bool mel_link_v2_server_ready(void);
uint16_t mel_link_v2_server_mtu(void);
void mel_link_v2_server_set_rx_callback(mel_link_v2_rx_cb cb, void *ctx);
void mel_link_v2_server_set_state_callback(mel_link_v2_state_cb cb, void *ctx);
esp_err_t mel_link_v2_server_notify(const uint8_t *frame, size_t len);
esp_err_t mel_link_v2_server_indicate(const uint8_t *frame, size_t len);
