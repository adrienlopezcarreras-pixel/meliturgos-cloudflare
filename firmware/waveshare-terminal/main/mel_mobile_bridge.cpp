#include "mel_mobile_bridge.h"

#include <atomic>
#include <cstring>
#include <string>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

#include "host/ble_att.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "os/os_mbuf.h"

static const char *TAG = "mel_mobile_peripheral";

static const ble_uuid16_t UUID_SERVICE = BLE_UUID16_INIT(0xABF0);
static const ble_uuid16_t UUID_RX = BLE_UUID16_INIT(0xABF1);
static const ble_uuid16_t UUID_TX = BLE_UUID16_INIT(0xABF2);

static std::atomic<bool> g_started{false};
static std::atomic<bool> g_ready{false};
static std::atomic<bool> g_candidate_seen{false};
static uint16_t g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t g_rx_val_handle = 0;
static uint16_t g_tx_val_handle = 0;
static uint16_t g_mtu = 23;

static SemaphoreHandle_t g_response_done = nullptr;
static SemaphoreHandle_t g_request_mutex = nullptr;
static std::string g_response;
static int g_response_status = 0;
static bool g_response_failed = false;
static uint32_t g_active_id = 0;
static std::atomic<uint32_t> g_request_id{1};

static const uint8_t OP_BEGIN = 0x01;
static const uint8_t OP_BODY = 0x02;
static const uint8_t OP_END = 0x03;
static const uint8_t OP_PING = 0x04;
static const uint8_t OP_RESPONSE_BEGIN = 0x11;
static const uint8_t OP_RESPONSE_BODY = 0x12;
static const uint8_t OP_RESPONSE_END = 0x13;
static const uint8_t OP_ERROR = 0x1f;

static int gap_event(struct ble_gap_event *event, void *arg);
static void start_advertising();

static uint32_t frame_id(const uint8_t *data) {
    return (uint32_t)data[1] |
           ((uint32_t)data[2] << 8) |
           ((uint32_t)data[3] << 16) |
           ((uint32_t)data[4] << 24);
}

static void consume_response_frame(const uint8_t *data, size_t len) {
    if (!data || len < 5) return;
    const uint8_t op = data[0];
    const uint32_t id = frame_id(data);
    if (id != g_active_id) return;
    const uint8_t *payload = data + 5;
    const size_t payload_len = len - 5;

    if (op == OP_RESPONSE_BEGIN) {
        g_response_status = 200;
        if (payload_len) {
            std::string meta(reinterpret_cast<const char *>(payload), payload_len);
            const std::string key = "\"status\":";
            const auto pos = meta.find(key);
            if (pos != std::string::npos) {
                g_response_status = atoi(meta.c_str() + pos + key.size());
            }
        }
        return;
    }
    if (op == OP_RESPONSE_BODY) {
        if (g_response.size() + payload_len <= 1024 * 1024) {
            g_response.append(reinterpret_cast<const char *>(payload), payload_len);
        } else {
            g_response_failed = true;
        }
        return;
    }
    if (op == OP_ERROR) {
        g_response_failed = true;
        if (g_response_done) xSemaphoreGive(g_response_done);
        return;
    }
    if (op == OP_RESPONSE_END) {
        if (g_response_done) xSemaphoreGive(g_response_done);
    }
}

static int gatt_access(uint16_t conn_handle, uint16_t attr_handle,
                       struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)arg;
    if (attr_handle == g_rx_val_handle && ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        const int len = OS_MBUF_PKTLEN(ctxt->om);
        if (len <= 0 || len > 520) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        uint8_t frame[520] = {};
        if (os_mbuf_copydata(ctxt->om, 0, len, frame) != 0) {
            return BLE_ATT_ERR_UNLIKELY;
        }
        consume_response_frame(frame, (size_t)len);
        return 0;
    }
    if (attr_handle == g_tx_val_handle && ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        return 0;
    }
    return BLE_ATT_ERR_UNLIKELY;
}

static const struct ble_gatt_svc_def gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &UUID_SERVICE.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid = &UUID_RX.u,
                .access_cb = gatt_access,
                .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
                .val_handle = &g_rx_val_handle,
            },
            {
                .uuid = &UUID_TX.u,
                .access_cb = gatt_access,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
                .val_handle = &g_tx_val_handle,
            },
            {0}
        }
    },
    {0}
};

static bool notify_frame(uint8_t op, uint32_t id, const uint8_t *payload, size_t payload_len) {
    if (!g_ready.load() || g_conn_handle == BLE_HS_CONN_HANDLE_NONE || !g_tx_val_handle) return false;
    const size_t max_payload = (g_mtu > 8) ? std::min<size_t>(500, g_mtu - 8) : 15;
    if (payload_len > max_payload) return false;

    uint8_t frame[520] = {};
    frame[0] = op;
    frame[1] = (uint8_t)(id & 0xff);
    frame[2] = (uint8_t)((id >> 8) & 0xff);
    frame[3] = (uint8_t)((id >> 16) & 0xff);
    frame[4] = (uint8_t)((id >> 24) & 0xff);
    if (payload_len) memcpy(frame + 5, payload, payload_len);

    struct os_mbuf *om = ble_hs_mbuf_from_flat(frame, (uint16_t)(5 + payload_len));
    if (!om) return false;
    const int rc = ble_gatts_notify_custom(g_conn_handle, g_tx_val_handle, om);
    if (rc != 0) {
        ESP_LOGW(TAG, "notify failed rc=%d", rc);
        return false;
    }
    return true;
}

static void start_advertising() {
    uint8_t own_addr_type = 0;
    if (ble_hs_id_infer_auto(0, &own_addr_type) != 0) return;

    struct ble_hs_adv_fields fields = {};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    const char *name = "MEL MINI";
    fields.name = (uint8_t *)name;
    fields.name_len = strlen(name);
    fields.name_is_complete = 1;
    fields.uuids16 = (ble_uuid16_t *)&UUID_SERVICE;
    fields.num_uuids16 = 1;
    fields.uuids16_is_complete = 1;
    ble_gap_adv_set_fields(&fields);

    struct ble_gap_adv_params params = {};
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    const int rc = ble_gap_adv_start(own_addr_type, nullptr, BLE_HS_FOREVER, &params, gap_event, nullptr);
    if (rc == 0 || rc == BLE_HS_EALREADY) {
        g_candidate_seen.store(true);
        ESP_LOGI(TAG, "Advertising MEL MINI service ABF0");
    } else {
        ESP_LOGW(TAG, "Advertising failed rc=%d", rc);
    }
}

static int gap_event(struct ble_gap_event *event, void *arg) {
    (void)arg;
    switch (event->type) {
        case BLE_GAP_EVENT_CONNECT:
            if (event->connect.status != 0) {
                ESP_LOGW(TAG, "BLE connect failed status=%d", event->connect.status);
                start_advertising();
                return 0;
            }
            g_conn_handle = event->connect.conn_handle;
            g_ready.store(false);
            g_mtu = ble_att_mtu(g_conn_handle);
            ESP_LOGI(TAG, "Android connected conn=%u mtu=%u", g_conn_handle, g_mtu);
            return 0;
        case BLE_GAP_EVENT_SUBSCRIBE:
            if (event->subscribe.attr_handle == g_tx_val_handle &&
                (event->subscribe.cur_notify || event->subscribe.cur_indicate)) {
                g_ready.store(true);
                g_mtu = ble_att_mtu(event->subscribe.conn_handle);
                ESP_LOGI(TAG, "LINK V2 READY conn=%u mtu=%u", event->subscribe.conn_handle, g_mtu);
            } else if (event->subscribe.attr_handle == g_tx_val_handle) {
                g_ready.store(false);
            }
            return 0;
        case BLE_GAP_EVENT_MTU:
            g_mtu = event->mtu.value;
            ESP_LOGI(TAG, "MTU updated=%u", g_mtu);
            return 0;
        case BLE_GAP_EVENT_DISCONNECT:
            ESP_LOGW(TAG, "Android disconnected reason=%d", event->disconnect.reason);
            g_ready.store(false);
            g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            if (g_response_done) xSemaphoreGive(g_response_done);
            start_advertising();
            return 0;
        case BLE_GAP_EVENT_ADV_COMPLETE:
            if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE) start_advertising();
            return 0;
        default:
            return 0;
    }
}

static void on_reset(int reason) {
    g_ready.store(false);
    g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
    ESP_LOGW(TAG, "NimBLE reset reason=%d", reason);
}

static void on_sync() {
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "NimBLE address init failed rc=%d", rc);
        return;
    }
    ble_svc_gap_device_name_set("MEL MINI");
    start_advertising();
}

static void host_task(void *param) {
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void mel_mobile_bridge_start(void) {
    bool expected = false;
    if (!g_started.compare_exchange_strong(expected, true)) return;

    g_response_done = xSemaphoreCreateBinary();
    g_request_mutex = xSemaphoreCreateMutex();
    if (!g_response_done || !g_request_mutex) {
        ESP_LOGE(TAG, "sync allocation failed");
        g_started.store(false);
        return;
    }

    esp_err_t err = nimble_port_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NimBLE init failed: %s", esp_err_to_name(err));
        g_started.store(false);
        return;
    }

    ble_hs_cfg.reset_cb = on_reset;
    ble_hs_cfg.sync_cb = on_sync;
    ble_att_set_preferred_mtu(517);

    int rc = ble_gatts_count_cfg(gatt_svcs);
    if (rc == 0) rc = ble_gatts_add_svcs(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "GATT service init failed rc=%d", rc);
        g_started.store(false);
        return;
    }

    nimble_port_freertos_init(host_task);
    ESP_LOGI(TAG, "MEL MINI BLE peripheral started");
}

void mel_mobile_bridge_rescan(void) {
    if (!g_started.load()) mel_mobile_bridge_start();
    else if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE) start_advertising();
}

bool mel_mobile_bridge_keepalive(void) {
    if (!g_ready.load()) return false;
    const uint32_t id = g_request_id.fetch_add(1);
    return notify_frame(OP_PING, id, nullptr, 0);
}

bool mel_mobile_bridge_ready(void) {
    return g_ready.load();
}

bool mel_mobile_bridge_candidate_seen(void) {
    return g_candidate_seen.load();
}

uint16_t mel_mobile_bridge_mtu(void) {
    return g_mtu;
}

static esp_err_t request_common(
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
    if (!g_ready.load() || !g_request_mutex) return ESP_ERR_INVALID_STATE;
    if (xSemaphoreTake(g_request_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) return ESP_ERR_TIMEOUT;

    while (xSemaphoreTake(g_response_done, 0) == pdTRUE) {}
    g_response.clear();
    g_response_status = 0;
    g_response_failed = false;
    g_active_id = g_request_id.fetch_add(1);

    char meta[1024] = {};
    snprintf(meta, sizeof(meta),
             "{\"method\":%d,\"path\":\"%s\",\"content_type\":\"%s\",\"token\":\"%s\",\"device_id\":\"%s\",\"content_length\":%u}",
             (int)method,
             path ? path : "",
             content_type ? content_type : "",
             token ? token : "",
             device_id ? device_id : "",
             (unsigned)body_len);

    bool ok = notify_frame(OP_BEGIN, g_active_id, (const uint8_t *)meta, strlen(meta));
    const size_t chunk = g_mtu > 16 ? std::min<size_t>(480, g_mtu - 12) : 11;
    for (size_t off = 0; ok && off < body_len; off += chunk) {
        const size_t n = std::min(chunk, body_len - off);
        ok = notify_frame(OP_BODY, g_active_id, body + off, n);
    }
    if (ok) ok = notify_frame(OP_END, g_active_id, nullptr, 0);

    if (!ok) {
        xSemaphoreGive(g_request_mutex);
        return ESP_FAIL;
    }

    const bool completed = xSemaphoreTake(g_response_done, pdMS_TO_TICKS(30000)) == pdTRUE;
    response = g_response;
    status = g_response_status;
    const bool failed = g_response_failed;
    g_active_id = 0;
    xSemaphoreGive(g_request_mutex);
    if (!completed) return ESP_ERR_TIMEOUT;
    if (failed) return ESP_FAIL;
    return ESP_OK;
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
    return request_common(method, path, content_type, token, device_id, body, body_len, response, status);
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
    std::string response;
    const esp_err_t err = request_common(method, path, content_type, token, device_id, body, body_len, response, status);
    if (err == ESP_OK && cb && !response.empty()) {
        if (!cb((const uint8_t *)response.data(), response.size(), ctx)) return ESP_FAIL;
    }
    return err;
}
