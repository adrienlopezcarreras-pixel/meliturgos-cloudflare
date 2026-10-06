#include "mel_link_v2_transport.h"
#include "mel_link_v2_protocol.h"
#include "mel_link_v2_server.h"

#include <atomic>
#include <cstring>
#include <algorithm>

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
    std::string body;
    mel_link_v2_chunk_cb cb = nullptr;
    void *cb_ctx = nullptr;
};

static std::atomic<bool> g_started{false};
static std::atomic<bool> g_session_ready{false};
static std::atomic<bool> g_server_ready{false};
static std::atomic<uint16_t> g_next_stream{1};
static SemaphoreHandle_t g_exchange_mutex = nullptr;
static SemaphoreHandle_t g_response_done = nullptr;
static SemaphoreHandle_t g_credit_sem = nullptr;
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

static void rx_frame(const uint8_t *frame, size_t len, void *ctx) {
    (void)ctx;
    MelLinkV2Header header = {};
    const uint8_t *payload = nullptr;
    if (!mel_link_v2_decode(frame, len, &header, &payload)) {
        ESP_LOGW(TAG, "RX rejected corrupt frame len=%u", (unsigned)len);
        return;
    }

    if (header.type == MEL_LINK_V2_SESSION && header.stream_id == 0) {
        g_session_ready.store(true);
        ESP_LOGI(TAG, "Android V2 session ready");
        return;
    }

    if (header.stream_id != g_active.stream_id || !g_active.stream_id) return;

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
        if (g_active.cb) {
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
    if (!g_exchange_mutex || !g_response_done || !g_credit_sem) {
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

bool mel_link_v2_transport_keepalive(void) {
    if (!mel_link_v2_transport_ready() || !g_exchange_mutex) return false;
    if (xSemaphoreTake(g_exchange_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) return false;

    g_active = {};
    g_active.stream_id = g_next_stream.fetch_add(1);
    if (g_active.stream_id == 0) g_active.stream_id = g_next_stream.fetch_add(1);
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

    bool ok = meta.size() <= 160 &&
        send_v2(
            MEL_LINK_V2_REQUEST_BEGIN, g_active.stream_id, 0,
            reinterpret_cast<const uint8_t *>(meta.data()),
            (uint16_t)meta.size(), true
        );

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
                ok = false;
                break;
            }
            const size_t n = std::min(chunk, body_len - offset);
            ok = send_v2(
                MEL_LINK_V2_REQUEST_DATA, g_active.stream_id, seq++,
                body + offset, (uint16_t)n, false
            );
            offset += n;
        }
    }

    if (ok) ok = send_v2(MEL_LINK_V2_REQUEST_END, g_active.stream_id, seq, nullptr, 0, true);
    if (!ok) {
        g_active.failed = true;
        g_active = {};
        xSemaphoreGive(g_exchange_mutex);
        return ESP_FAIL;
    }

    const bool voice = strstr(path, "/voice/") != nullptr;
    const TickType_t wait = pdMS_TO_TICKS(voice ? 90000 : 60000);
    const bool done = xSemaphoreTake(g_response_done, wait) == pdTRUE;
    status = g_active.status;
    if (response) *response = g_active.body;
    const bool failed = !done || g_active.failed;

    if (!done) ESP_LOGE(TAG, "response timeout path=%s stream=%u", path, g_active.stream_id);
    g_active = {};
    xSemaphoreGive(g_exchange_mutex);
    return failed ? ESP_ERR_TIMEOUT : ESP_OK;
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
