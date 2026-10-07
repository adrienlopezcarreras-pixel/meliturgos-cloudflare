#include "mel_link_v2_transport.h"
#include "mel_link_v2_protocol.h"
#include "mel_link_v2_server.h"
#include "mel_ima_adpcm.h"

#include <atomic>
#include <cstring>
#include <algorithm>
#include <sys/time.h>
#include <time.h>
#include <cstdlib>

#include "cJSON.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

static const char *TAG = "MEL_LINK_V2_TX";
static const size_t MAX_RESPONSE_BYTES = 1024 * 1024;

struct ActiveExchange {
    uint16_t stream_id = 0;
    uint16_t expected_response_seq = 0;
    int status = 0;
    bool failed = false;
    bool pong = false;
    bool audio_response = false;
    uint16_t expected_audio_seq = 0;
    size_t expected_audio_samples = 0;
    size_t received_audio_samples = 0;
    std::string body;
    mel_link_v2_chunk_cb cb = nullptr;
    void *cb_ctx = nullptr;
};

static std::atomic<bool> g_started{false};
static std::atomic<bool> g_session_ready{false};
static std::atomic<bool> g_server_ready{false};
static std::atomic<uint16_t> g_next_stream{1};
static std::atomic<uint16_t> g_active_stream_id{0};
static std::atomic<bool> g_cancel_active{false};
static SemaphoreHandle_t g_exchange_mutex = nullptr;
static SemaphoreHandle_t g_response_done = nullptr;
static SemaphoreHandle_t g_credit_sem = nullptr;
static SemaphoreHandle_t g_media_config_sem = nullptr;
static SemaphoreHandle_t g_media_config_mutex = nullptr;
static MelLinkV2MediaConfig g_media_config = {};
static ActiveExchange g_active;

static std::string json_string(cJSON *root) {
    char *raw = cJSON_PrintUnformatted(root);
    std::string out = raw ? raw : "{}";
    if (raw) cJSON_free(raw);
    return out;
}

static bool send_v2(uint8_t type, uint16_t stream_id, uint16_t seq,
                    const uint8_t *payload, uint16_t payload_len, bool confirmed) {
    uint8_t frame[192];
    const size_t frame_len = mel_link_v2_encode(
        type, 0, stream_id, seq, payload, payload_len, frame, sizeof(frame)
    );
    if (!frame_len) return false;
    const esp_err_t err = confirmed
        ? mel_link_v2_server_indicate(frame, frame_len)
        : mel_link_v2_server_notify(frame, frame_len);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "send type=0x%02x stream=%u seq=%u failed: %s",
                 type, stream_id, seq, esp_err_to_name(err));
        return false;
    }
    return true;
}

static void drain_semaphore(SemaphoreHandle_t sem) {
    if (!sem) return;
    while (xSemaphoreTake(sem, 0) == pdTRUE) {}
}

static bool deliver_audio_48k_native(
    const int16_t *samples,
    size_t sample_count
) {
    if (!samples || sample_count == 0) return true;
    uint8_t out[480];
    size_t used = 0;

    auto flush = [&]() -> bool {
        if (used == 0) return true;
        bool ok = true;
        if (g_active.cb) {
            ok = g_active.cb(out, used, g_active.cb_ctx);
        } else if (g_active.body.size() + used <= MAX_RESPONSE_BYTES) {
            g_active.body.append(reinterpret_cast<const char *>(out), used);
        } else {
            ok = false;
        }
        used = 0;
        return ok;
    };

    for (size_t i = 0; i < sample_count; ++i) {
        const uint16_t raw = static_cast<uint16_t>(samples[i]);
        if (used + 2 > sizeof(out) && !flush()) return false;
        out[used++] = static_cast<uint8_t>(raw & 0xff);
        out[used++] = static_cast<uint8_t>((raw >> 8) & 0xff);
    }
    return flush();
}

static bool apply_android_session_clock(const uint8_t *payload, size_t len) {
    if (!payload || len == 0 || len > 512) return false;
    std::string raw(reinterpret_cast<const char *>(payload), len);
    cJSON *root = cJSON_Parse(raw.c_str());
    if (!root) return false;
    cJSON *epoch = cJSON_GetObjectItemCaseSensitive(root, "epoch_ms");
    cJSON *offset = cJSON_GetObjectItemCaseSensitive(root, "utc_offset_seconds");
    bool ok = cJSON_IsNumber(epoch) && cJSON_IsNumber(offset);
    if (ok) {
        const int64_t epoch_ms = (int64_t)epoch->valuedouble;
        const int offset_seconds = offset->valueint;
        if (epoch_ms >= 1700000000000LL && offset_seconds >= -50400 && offset_seconds <= 50400) {
            struct timeval tv = {};
            tv.tv_sec = (time_t)(epoch_ms / 1000LL);
            tv.tv_usec = (suseconds_t)((epoch_ms % 1000LL) * 1000LL);
            if (settimeofday(&tv, nullptr) == 0) {
                const int abs_offset = offset_seconds < 0 ? -offset_seconds : offset_seconds;
                const int hours = abs_offset / 3600;
                const int minutes = (abs_offset % 3600) / 60;
                const char sign = offset_seconds >= 0 ? '-' : '+';
                char tz[32] = {};
                if (minutes) snprintf(tz, sizeof(tz), "MEL%c%d:%02d", sign, hours, minutes);
                else snprintf(tz, sizeof(tz), "MEL%c%d", sign, hours);
                setenv("TZ", tz, 1);
                tzset();
                ESP_LOGI(TAG, "Android SESSION clock synced epoch=%lld offset=%d",
                         (long long)(epoch_ms / 1000LL), offset_seconds);
            } else {
                ok = false;
            }
        } else {
            ok = false;
        }
    }
    cJSON_Delete(root);
    return ok;
}

static void rx_frame(const uint8_t *frame, size_t len, void *ctx) {
    (void)ctx;
    MelLinkV2Header header = {};
    const uint8_t *payload = nullptr;
    if (!mel_link_v2_decode(frame, len, &header, &payload)) {
        ESP_LOGW(TAG, "RX rejected corrupt frame len=%u", (unsigned)len);
        return;
    }

    if (header.type == MEL_LINK_V2_SESSION && header.stream_id == 0) {
        const bool clock_ok = apply_android_session_clock(payload, header.payload_len);
        g_session_ready.store(true);
        ESP_LOGI(TAG, "Android V2 session ready clock=%s", clock_ok ? "OK" : "UNAVAILABLE");
        return;
    }

    if (header.type == MEL_LINK_V2_MEDIA_CONFIG) {
        std::string raw(reinterpret_cast<const char *>(payload), header.payload_len);
        cJSON *root = cJSON_Parse(raw.c_str());
        cJSON *ssid = root ? cJSON_GetObjectItemCaseSensitive(root, "ssid") : nullptr;
        cJSON *pass = root ? cJSON_GetObjectItemCaseSensitive(root, "pass") : nullptr;
        cJSON *port = root ? cJSON_GetObjectItemCaseSensitive(root, "port") : nullptr;
        cJSON *token = root ? cJSON_GetObjectItemCaseSensitive(root, "token") : nullptr;
        const bool valid =
            cJSON_IsString(ssid) && ssid->valuestring && strlen(ssid->valuestring) <= 32 &&
            cJSON_IsString(pass) && pass->valuestring && strlen(pass->valuestring) <= 64 &&
            cJSON_IsNumber(port) && port->valueint > 0 && port->valueint <= 65535 &&
            cJSON_IsString(token) && token->valuestring &&
            strlen(token->valuestring) >= 16 && strlen(token->valuestring) <= 96;
        if (valid) {
            memset(&g_media_config, 0, sizeof(g_media_config));
            strlcpy(g_media_config.ssid, ssid->valuestring, sizeof(g_media_config.ssid));
            strlcpy(g_media_config.password, pass->valuestring, sizeof(g_media_config.password));
            strlcpy(g_media_config.token, token->valuestring, sizeof(g_media_config.token));
            g_media_config.port = (uint16_t)port->valueint;
            if (g_media_config_sem) xSemaphoreGive(g_media_config_sem);
            ESP_LOGI(TAG, "Android media channel config received ssid=%s port=%u",
                     g_media_config.ssid, (unsigned)g_media_config.port);
        } else {
            ESP_LOGW(TAG, "Android media channel config rejected");
        }
        if (root) cJSON_Delete(root);
        return;
    }

    const uint16_t active_stream = g_active_stream_id.load();
    if (header.stream_id != active_stream || !active_stream) return;
    if (g_cancel_active.load()) {
        if (g_response_done) xSemaphoreGive(g_response_done);
        return;
    }

    if (header.type == MEL_LINK_V2_CREDIT) {
        if (header.payload_len < 2 || !g_credit_sem) return;
        const uint16_t credits = (uint16_t)payload[0] | ((uint16_t)payload[1] << 8);
        for (uint16_t i = 0; i < credits; ++i) xSemaphoreGive(g_credit_sem);
        return;
    }

    if (header.type == MEL_LINK_V2_PONG) {
        g_active.pong = true;
        if (g_response_done) xSemaphoreGive(g_response_done);
        return;
    }

    if (header.type == MEL_LINK_V2_ERROR) {
        g_active.failed = true;
        g_active.status = 0;
        g_active.body.assign(reinterpret_cast<const char *>(payload), header.payload_len);
        if (g_response_done) xSemaphoreGive(g_response_done);
        return;
    }

    if (header.type == MEL_LINK_V2_AUDIO_BEGIN) {
        std::string meta(reinterpret_cast<const char *>(payload), header.payload_len);
        cJSON *root = cJSON_Parse(meta.c_str());
        cJSON *codec = root ? cJSON_GetObjectItemCaseSensitive(root, "codec") : nullptr;
        cJSON *rate = root ? cJSON_GetObjectItemCaseSensitive(root, "rate") : nullptr;
        cJSON *channels = root ? cJSON_GetObjectItemCaseSensitive(root, "ch") : nullptr;
        cJSON *samples = root ? cJSON_GetObjectItemCaseSensitive(root, "samples") : nullptr;
        cJSON *block = root ? cJSON_GetObjectItemCaseSensitive(root, "block") : nullptr;
        cJSON *output_rate = root ? cJSON_GetObjectItemCaseSensitive(root, "output_rate") : nullptr;

        const bool valid =
            cJSON_IsString(codec) && codec->valuestring &&
            strcmp(codec->valuestring, "ima-adpcm") == 0 &&
            cJSON_IsNumber(rate) && rate->valueint == 48000 &&
            cJSON_IsNumber(channels) && channels->valueint == 1 &&
            cJSON_IsNumber(block) && block->valueint >= 32 &&
            block->valueint <= MEL_IMA_ADPCM_BLOCK_SAMPLES &&
            cJSON_IsNumber(output_rate) && output_rate->valueint == 48000 &&
            cJSON_IsNumber(samples) && samples->valuedouble > 0 &&
            samples->valuedouble <= 48000.0 * 120.0;

        if (!valid) {
            g_active.failed = true;
            if (root) cJSON_Delete(root);
            if (g_response_done) xSemaphoreGive(g_response_done);
            return;
        }

        g_active.audio_response = true;
        g_active.status = 200;
        g_active.expected_audio_seq = 0;
        g_active.expected_audio_samples = static_cast<size_t>(samples->valuedouble);
        g_active.received_audio_samples = 0;
        if (root) cJSON_Delete(root);

        // Android sends TTS audio with explicit backpressure. Grant an initial
        // window now; each successfully decoded block replenishes one credit.
        uint8_t credit_payload[2] = {
            (uint8_t)(6 & 0xff),
            (uint8_t)((6 >> 8) & 0xff)
        };
        send_v2(MEL_LINK_V2_CREDIT, header.stream_id, 0, credit_payload, sizeof(credit_payload), false);
        return;
    }

    if (header.type == MEL_LINK_V2_AUDIO_DATA) {
        if (!g_active.audio_response || header.seq != g_active.expected_audio_seq) {
            ESP_LOGE(TAG, "Audio response sequence gap expected=%u got=%u",
                     g_active.expected_audio_seq, header.seq);
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
            return;
        }

        int16_t decoded[MEL_IMA_ADPCM_BLOCK_SAMPLES] = {};
        size_t decoded_samples = 0;
        if (!mel_ima_adpcm_decode_block(
                payload, header.payload_len,
                decoded, MEL_IMA_ADPCM_BLOCK_SAMPLES,
                &decoded_samples)) {
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
            return;
        }

        if (g_active.received_audio_samples + decoded_samples > g_active.expected_audio_samples ||
            !deliver_audio_48k_native(decoded, decoded_samples)) {
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
            return;
        }

        g_active.received_audio_samples += decoded_samples;
        g_active.expected_audio_seq++;

        uint8_t credit_payload[2] = {1, 0};
        send_v2(MEL_LINK_V2_CREDIT, header.stream_id, 0, credit_payload, sizeof(credit_payload), false);
        return;
    }

    if (header.type == MEL_LINK_V2_AUDIO_END) {
        if (!g_active.audio_response ||
            header.seq != g_active.expected_audio_seq ||
            g_active.received_audio_samples != g_active.expected_audio_samples) {
            ESP_LOGE(TAG,
                     "Audio response END mismatch seq=%u/%u samples=%u/%u",
                     header.seq, g_active.expected_audio_seq,
                     (unsigned)g_active.received_audio_samples,
                     (unsigned)g_active.expected_audio_samples);
            g_active.failed = true;
        }
        if (g_response_done) xSemaphoreGive(g_response_done);
        return;
    }

    if (header.type == MEL_LINK_V2_RESPONSE_BEGIN) {
        if (header.seq != 0) {
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
            return;
        }
        std::string meta(reinterpret_cast<const char *>(payload), header.payload_len);
        cJSON *root = cJSON_Parse(meta.c_str());
        cJSON *status = root ? cJSON_GetObjectItemCaseSensitive(root, "status") : nullptr;
        g_active.status = cJSON_IsNumber(status) ? status->valueint : 0;
        g_active.expected_response_seq = 0;
        if (root) cJSON_Delete(root);
        return;
    }

    if (header.type == MEL_LINK_V2_RESPONSE_DATA) {
        if (header.seq != g_active.expected_response_seq) {
            ESP_LOGE(TAG, "Response sequence gap expected=%u got=%u",
                     g_active.expected_response_seq, header.seq);
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
            return;
        }
        g_active.expected_response_seq++;
        if (g_active.cb && g_active.status >= 200 && g_active.status < 300) {
            if (!g_active.cb(payload, header.payload_len, g_active.cb_ctx)) {
                g_active.failed = true;
                if (g_response_done) xSemaphoreGive(g_response_done);
            }
        } else if (g_active.body.size() + header.payload_len <= MAX_RESPONSE_BYTES) {
            g_active.body.append(reinterpret_cast<const char *>(payload), header.payload_len);
        } else {
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
        }
        return;
    }

    if (header.type == MEL_LINK_V2_RESPONSE_END) {
        if (header.seq != g_active.expected_response_seq) {
            ESP_LOGE(TAG, "Response END sequence mismatch expected=%u got=%u",
                     g_active.expected_response_seq, header.seq);
            g_active.failed = true;
        }
        if (g_response_done) xSemaphoreGive(g_response_done);
    }
}

static void state_changed(bool ready, void *ctx) {
    (void)ctx;
    g_server_ready.store(ready);
    if (!ready) g_session_ready.store(false);
}

static void handshake_task(void *arg) {
    (void)arg;
    while (true) {
        if (g_server_ready.load() && !g_session_ready.load()) {
            cJSON *hello = cJSON_CreateObject();
            cJSON_AddNumberToObject(hello, "protocol", MEL_LINK_V2_PROTOCOL_VERSION);
            cJSON_AddStringToObject(hello, "role", "mini");
            std::string payload = json_string(hello);
            cJSON_Delete(hello);
            send_v2(
                MEL_LINK_V2_HELLO, 0, 0,
                reinterpret_cast<const uint8_t *>(payload.data()),
                (uint16_t)payload.size(),
                true
            );
        }
        vTaskDelay(pdMS_TO_TICKS(g_session_ready.load() ? 1000 : 400));
    }
}

void mel_link_v2_transport_start(void) {
    bool expected = false;
    if (!g_started.compare_exchange_strong(expected, true)) return;

    g_exchange_mutex = xSemaphoreCreateMutex();
    g_response_done = xSemaphoreCreateBinary();
    g_credit_sem = xSemaphoreCreateCounting(32, 0);
    g_media_config_sem = xSemaphoreCreateBinary();
    g_media_config_mutex = xSemaphoreCreateMutex();
    if (!g_exchange_mutex || !g_response_done || !g_credit_sem ||
        !g_media_config_sem || !g_media_config_mutex) {
        ESP_LOGE(TAG, "V2 synchronization allocation failed");
        g_started.store(false);
        return;
    }

    mel_link_v2_server_set_rx_callback(rx_frame, nullptr);
    mel_link_v2_server_set_state_callback(state_changed, nullptr);
    if (mel_link_v2_server_start() != ESP_OK) {
        ESP_LOGE(TAG, "V2 GATT server start failed");
        g_started.store(false);
        return;
    }
    xTaskCreatePinnedToCore(handshake_task, "mel_v2_hello", 4096, nullptr, 3, nullptr, 0);
}

bool mel_link_v2_transport_ready(void) {
    return g_started.load() && g_server_ready.load() && g_session_ready.load();
}

bool mel_link_v2_transport_candidate_seen(void) {
    return g_server_ready.load();
}

uint16_t mel_link_v2_transport_mtu(void) {
    return mel_link_v2_server_mtu();
}

bool mel_link_v2_transport_request_media_config(
    MelLinkV2MediaConfig *out,
    uint32_t timeout_ms
) {
    if (!out || !mel_link_v2_transport_ready() ||
        !g_media_config_sem || !g_media_config_mutex) {
        return false;
    }
    if (xSemaphoreTake(g_media_config_mutex, pdMS_TO_TICKS(1500)) != pdTRUE) {
        return false;
    }

    drain_semaphore(g_media_config_sem);
    memset(&g_media_config, 0, sizeof(g_media_config));
    uint16_t stream_id = g_next_stream.fetch_add(1);
    if (stream_id == 0) stream_id = g_next_stream.fetch_add(1);

    const bool sent = send_v2(
        MEL_LINK_V2_MEDIA_CONFIG_REQUEST,
        stream_id,
        0,
        nullptr,
        0,
        true
    );
    const bool ready =
        sent &&
        xSemaphoreTake(
            g_media_config_sem,
            pdMS_TO_TICKS(timeout_ms ? timeout_ms : 15000)
        ) == pdTRUE &&
        g_media_config.ssid[0] &&
        g_media_config.password[0] &&
        g_media_config.token[0] &&
        g_media_config.port > 0;

    if (ready) *out = g_media_config;
    xSemaphoreGive(g_media_config_mutex);
    return ready;
}

bool mel_link_v2_transport_keepalive(void) {
    if (!mel_link_v2_transport_ready() || !g_exchange_mutex) return false;
    if (xSemaphoreTake(g_exchange_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) return false;

    g_active = {};
    g_active.stream_id = g_next_stream.fetch_add(1);
    if (g_active.stream_id == 0) g_active.stream_id = g_next_stream.fetch_add(1);
    g_active_stream_id.store(g_active.stream_id);
    g_cancel_active.store(false);
    drain_semaphore(g_response_done);

    const bool sent = send_v2(MEL_LINK_V2_PING, g_active.stream_id, 0, nullptr, 0, true);
    const bool done = sent && xSemaphoreTake(g_response_done, pdMS_TO_TICKS(5000)) == pdTRUE;
    const bool ok = done && g_active.pong && !g_active.failed;
    g_active = {};
    xSemaphoreGive(g_exchange_mutex);
    return ok;
}

static esp_err_t request_common(
    esp_http_client_method_t method,
    const char *path,
    const char *content_type,
    const char *mini_device_id,
    const uint8_t *body,
    size_t body_len,
    std::string *response,
    int &status,
    mel_link_v2_chunk_cb cb,
    void *cb_ctx
) {
    if (!mel_link_v2_transport_ready() || !path || !mini_device_id || !g_exchange_mutex) {
        return ESP_ERR_INVALID_STATE;
    }
    if (body_len && !body) return ESP_ERR_INVALID_ARG;
    if (body_len > 512 * 1024) return ESP_ERR_INVALID_SIZE;
    if (xSemaphoreTake(g_exchange_mutex, pdMS_TO_TICKS(3000)) != pdTRUE) return ESP_ERR_TIMEOUT;

    g_active = {};
    g_active.stream_id = g_next_stream.fetch_add(1);
    if (g_active.stream_id == 0) g_active.stream_id = g_next_stream.fetch_add(1);
    g_active_stream_id.store(g_active.stream_id);
    g_cancel_active.store(false);
    g_active.cb = cb;
    g_active.cb_ctx = cb_ctx;
    drain_semaphore(g_response_done);
    drain_semaphore(g_credit_sem);

    cJSON *meta_json = cJSON_CreateObject();
    cJSON_AddStringToObject(meta_json, "method", method == HTTP_METHOD_GET ? "GET" : "POST");
    cJSON_AddStringToObject(meta_json, "path", path);
    cJSON_AddStringToObject(meta_json, "content_type", content_type ? content_type : "application/json");
    cJSON_AddStringToObject(meta_json, "mini_device_id", mini_device_id);
    cJSON_AddNumberToObject(meta_json, "body_len", (double)body_len);
    std::string meta = json_string(meta_json);
    cJSON_Delete(meta_json);

    bool ok = meta.size() <= 160;
    if (!ok) {
        if (response) *response = "REQUEST_META_TOO_LARGE";
    } else if (!send_v2(
            MEL_LINK_V2_REQUEST_BEGIN, g_active.stream_id, 0,
            reinterpret_cast<const uint8_t *>(meta.data()),
            (uint16_t)meta.size(), false
        )) {
        if (response) {
            *response = mel_link_v2_transport_ready()
                ? "BT_REQUEST_BEGIN_SEND"
                : "BT_SESSION_DROPPED_REQUEST_BEGIN";
        }
        ok = false;
    }

    const uint16_t mtu = mel_link_v2_server_mtu();
    const size_t max_payload = mtu > (MEL_LINK_V2_HEADER_SIZE + 3)
        ? (size_t)mtu - 3 - MEL_LINK_V2_HEADER_SIZE
        : 20 - MEL_LINK_V2_HEADER_SIZE;
    const size_t chunk = std::max<size_t>(1, std::min<size_t>(160, max_payload));
    uint16_t seq = 0;

    if (ok && body_len) {
        size_t offset = 0;
        while (offset < body_len && ok) {
            if (xSemaphoreTake(g_credit_sem, pdMS_TO_TICKS(5000)) != pdTRUE) {
                ESP_LOGE(TAG, "credit timeout stream=%u seq=%u", g_active.stream_id, seq);
                if (response) *response = "BT_REQUEST_CREDIT_TIMEOUT";
                ok = false;
                break;
            }
            const size_t n = std::min(chunk, body_len - offset);
            const uint16_t current_seq = seq;
            ok = send_v2(
                MEL_LINK_V2_REQUEST_DATA, g_active.stream_id, seq++,
                body + offset, (uint16_t)n, false
            );
            if (!ok) {
                if (response) {
                    char diag[48] = {};
                    snprintf(
                        diag, sizeof(diag),
                        mel_link_v2_transport_ready()
                            ? "BT_REQUEST_DATA_SEND_%u"
                            : "BT_SESSION_DROPPED_REQUEST_DATA_%u",
                        (unsigned)current_seq
                    );
                    *response = diag;
                }
                break;
            }
            offset += n;
        }
    }

    if (ok) {
        ok = send_v2(MEL_LINK_V2_REQUEST_END, g_active.stream_id, seq, nullptr, 0, false);
        if (!ok && response) {
            *response = mel_link_v2_transport_ready()
                ? "BT_REQUEST_END_SEND"
                : "BT_SESSION_DROPPED_REQUEST_END";
        }
    }
    if (!ok) {
        g_active.failed = true;
        g_active = {};
        g_active_stream_id.store(0);
        g_cancel_active.store(false);
        xSemaphoreGive(g_exchange_mutex);
        return ESP_FAIL;
    }

    const bool voice = strstr(path, "/voice/") != nullptr;
    const bool chat = strcmp(path, "/api/device/v1/chat") == 0;
    const TickType_t wait = pdMS_TO_TICKS(chat ? 20000 : (voice ? 90000 : 60000));
    const bool done = xSemaphoreTake(g_response_done, wait) == pdTRUE;
    status = g_active.status;
    if (response) *response = g_active.body;
    const bool cancelled = g_cancel_active.load();
    const bool failed = !done || g_active.failed || cancelled;

    if (cancelled) {
        ESP_LOGI(TAG, "request cancelled path=%s stream=%u", path, g_active.stream_id);
    } else if (!done) {
        ESP_LOGE(TAG, "response timeout path=%s stream=%u", path, g_active.stream_id);
        if (response && response->empty()) {
            *response = chat ? "CHAT_RESPONSE_TIMEOUT" : "LINK_RESPONSE_TIMEOUT";
        }
    }
    g_active = {};
    g_active_stream_id.store(0);
    g_cancel_active.store(false);
    xSemaphoreGive(g_exchange_mutex);
    return failed ? (cancelled ? ESP_ERR_INVALID_STATE : ESP_ERR_TIMEOUT) : ESP_OK;
}

esp_err_t mel_link_v2_transport_request(
    esp_http_client_method_t method,
    const char *path,
    const char *content_type,
    const char *mini_device_id,
    const uint8_t *body,
    size_t body_len,
    std::string &response,
    int &status
) {
    return request_common(method,path,content_type,mini_device_id,body,body_len,&response,status,nullptr,nullptr);
}

bool mel_link_v2_transport_cancel_active(void) {
    const uint16_t stream = g_active_stream_id.load();
    if (!stream) return false;

    // Propagate STOP VOIX to Android so a local TTS / BLE sender aborts too.
    static const char kCancel[] = "CANCEL";
    const bool remote_cancel = send_v2(
        MEL_LINK_V2_ERROR,
        stream,
        0,
        reinterpret_cast<const uint8_t *>(kCancel),
        sizeof(kCancel) - 1,
        false
    );

    g_cancel_active.store(true);
    if (g_response_done) xSemaphoreGive(g_response_done);
    if (g_credit_sem) xSemaphoreGive(g_credit_sem);
    ESP_LOGI(TAG, "cancel active stream=%u remote=%d", stream, remote_cancel ? 1 : 0);
    return true;
}

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
) {
    return request_common(method,path,content_type,mini_device_id,body,body_len,nullptr,status,cb,ctx);
}


esp_err_t mel_link_v2_transport_transcribe_adpcm(
    const int16_t *samples,
    size_t sample_count,
    const char *mini_device_id,
    std::string &response,
    int &status,
    mel_link_v2_progress_cb progress_cb,
    void *progress_ctx
) {
    if (!mel_link_v2_transport_ready() || !samples || sample_count == 0 ||
        !mini_device_id || !*mini_device_id || !g_exchange_mutex) {
        response = "BT_SESSION_NOT_READY";
        return ESP_ERR_INVALID_STATE;
    }

    const uint16_t negotiated_mtu = mel_link_v2_server_mtu();
    // A full 256-sample ADPCM block is 132 bytes. With the 13-byte MEL frame
    // header and 3-byte ATT overhead the link needs an MTU of at least 148.
    if (negotiated_mtu < 148) {
        char diag[32] = {};
        snprintf(diag, sizeof(diag), "BT_MTU_%u", (unsigned)negotiated_mtu);
        response = diag;
        ESP_LOGE(TAG, "STT cannot start: negotiated MTU=%u (<148)", negotiated_mtu);
        return ESP_ERR_INVALID_SIZE;
    }
    if (xSemaphoreTake(g_exchange_mutex, pdMS_TO_TICKS(3000)) != pdTRUE) {
        response = "BT_EXCHANGE_BUSY";
        return ESP_ERR_TIMEOUT;
    }

    g_active = {};
    g_active.stream_id = g_next_stream.fetch_add(1);
    if (g_active.stream_id == 0) g_active.stream_id = g_next_stream.fetch_add(1);
    g_active_stream_id.store(g_active.stream_id);
    g_cancel_active.store(false);
    drain_semaphore(g_response_done);
    drain_semaphore(g_credit_sem);

    cJSON *meta_json = cJSON_CreateObject();
    cJSON_AddStringToObject(meta_json, "codec", "ima-adpcm");
    cJSON_AddNumberToObject(meta_json, "rate", 16000);
    cJSON_AddNumberToObject(meta_json, "ch", 1);
    cJSON_AddNumberToObject(meta_json, "samples", (double)sample_count);
    cJSON_AddNumberToObject(meta_json, "block", MEL_IMA_ADPCM_BLOCK_SAMPLES);
    cJSON_AddStringToObject(meta_json, "mini", mini_device_id);
    std::string meta = json_string(meta_json);
    cJSON_Delete(meta_json);

    bool ok = meta.size() <= 160;
    if (!ok) {
        response = "AUDIO_META_TOO_LARGE";
    } else if (!send_v2(
            MEL_LINK_V2_AUDIO_BEGIN, g_active.stream_id, 0,
            reinterpret_cast<const uint8_t *>(meta.data()),
            (uint16_t)meta.size(), false
        )) {
        response = mel_link_v2_transport_ready()
            ? "BT_AUDIO_BEGIN_SEND"
            : "BT_SESSION_DROPPED_BEGIN";
        ok = false;
    }

    uint16_t seq = 0;
    size_t offset = 0;
    if (progress_cb) progress_cb(0, sample_count, progress_ctx);
    uint8_t encoded[MEL_IMA_ADPCM_MAX_ENCODED_BYTES] = {};
    while (ok && offset < sample_count) {
        if (xSemaphoreTake(g_credit_sem, pdMS_TO_TICKS(5000)) != pdTRUE) {
            ESP_LOGE(TAG, "audio credit timeout stream=%u seq=%u", g_active.stream_id, seq);
            response = "BT_AUDIO_CREDIT_TIMEOUT";
            ok = false;
            break;
        }

        const size_t count = std::min<size_t>(
            MEL_IMA_ADPCM_BLOCK_SAMPLES, sample_count - offset
        );
        size_t encoded_size = 0;
        if (!mel_ima_adpcm_encode_block(
                samples + offset, count,
                encoded, sizeof(encoded), &encoded_size)) {
            ESP_LOGE(TAG, "ADPCM encode failed stream=%u seq=%u count=%u",
                     g_active.stream_id, seq, (unsigned)count);
            response = "ADPCM_ENCODE";
            ok = false;
            break;
        }

        const uint16_t current_seq = seq;
        ok = send_v2(
            MEL_LINK_V2_AUDIO_DATA, g_active.stream_id, seq++,
            encoded, (uint16_t)encoded_size, false
        );
        if (!ok) {
            char diag[48] = {};
            snprintf(
                diag, sizeof(diag),
                mel_link_v2_transport_ready()
                    ? "BT_AUDIO_DATA_SEND_%u"
                    : "BT_SESSION_DROPPED_DATA_%u",
                (unsigned)current_seq
            );
            response = diag;
            break;
        }
        offset += count;
        if (progress_cb) progress_cb(offset, sample_count, progress_ctx);
    }

    if (ok) {
        ok = send_v2(
            MEL_LINK_V2_AUDIO_END, g_active.stream_id, seq,
            nullptr, 0, false
        );
        if (!ok) {
            response = mel_link_v2_transport_ready()
                ? "BT_AUDIO_END_SEND"
                : "BT_SESSION_DROPPED_END";
        }
    }

    if (!ok) {
        g_active = {};
        g_active_stream_id.store(0);
        g_cancel_active.store(false);
        xSemaphoreGive(g_exchange_mutex);
        return ESP_FAIL;
    }

    const bool done = xSemaphoreTake(g_response_done, pdMS_TO_TICKS(45000)) == pdTRUE;
    status = g_active.status;
    if (!g_active.body.empty()) response = g_active.body;
    const bool cancelled = g_cancel_active.load();
    const bool failed = !done || g_active.failed || cancelled;
    if (cancelled) {
        response = "BT_CANCELLED";
    } else if (!done) {
        response = "STT_RESPONSE_TIMEOUT";
        ESP_LOGE(TAG, "ADPCM STT response timeout stream=%u blocks=%u",
                 g_active.stream_id, seq);
    } else if (g_active.failed && response.empty()) {
        response = "BT_RESPONSE_FAILED";
    }

    g_active = {};
    g_active_stream_id.store(0);
    g_cancel_active.store(false);
    xSemaphoreGive(g_exchange_mutex);
    return failed ? (cancelled ? ESP_ERR_INVALID_STATE : ESP_ERR_TIMEOUT) : ESP_OK;
}
