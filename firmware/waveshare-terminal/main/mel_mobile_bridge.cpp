#include "mel_mobile_bridge.h"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <string>

#include "cJSON.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "host/ble_att.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "esp_central.h"

static const char *TAG = "mel_mobile_bridge";
static const uint16_t MEL_BRIDGE_SERVICE = 0xABF0;
static const uint16_t MEL_BRIDGE_RX = 0xABF1;
static const uint16_t MEL_BRIDGE_TX = 0xABF2;
static const ble_uuid16_t UUID_SERVICE = BLE_UUID16_INIT(MEL_BRIDGE_SERVICE);
static const ble_uuid16_t UUID_RX = BLE_UUID16_INIT(MEL_BRIDGE_RX);
static const ble_uuid16_t UUID_TX = BLE_UUID16_INIT(MEL_BRIDGE_TX);
static const ble_uuid16_t UUID_CCCD = BLE_UUID16_INIT(BLE_GATT_DSC_CLT_CFG_UUID16);

static const uint8_t OP_BEGIN = 0x01;
static const uint8_t OP_BODY = 0x02;
static const uint8_t OP_END = 0x03;
static const uint8_t OP_PING = 0x04;
static const uint8_t OP_RESPONSE_BEGIN = 0x11;
static const uint8_t OP_RESPONSE_BODY = 0x12;
static const uint8_t OP_RESPONSE_END = 0x13;
static const uint8_t OP_ERROR = 0x1f;

static std::atomic<bool> g_started{false};
static std::atomic<bool> g_ready{false};
static uint16_t g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t g_rx_handle = 0;
static uint16_t g_tx_handle = 0;
static uint16_t g_mtu = 23;
static SemaphoreHandle_t g_request_mutex = nullptr;
static SemaphoreHandle_t g_write_done = nullptr;
static SemaphoreHandle_t g_response_done = nullptr;
static std::atomic<uint32_t> g_request_id{1};

struct ActiveResponse {
    uint32_t id = 0;
    int status = 0;
    bool failed = false;
    std::string body;
    mel_mobile_bridge_chunk_cb cb = nullptr;
    void *cb_ctx = nullptr;
};
static ActiveResponse g_active;

static int gap_event(struct ble_gap_event *event, void *arg);
static void start_scan();

static std::string json_string(cJSON *root) {
    char *raw = cJSON_PrintUnformatted(root);
    std::string out = raw ? raw : "{}";
    if (raw) cJSON_free(raw);
    return out;
}

static bool adv_has_service(const struct ble_gap_disc_desc *disc) {
    struct ble_hs_adv_fields fields = {};
    if (ble_hs_adv_parse_fields(&fields, disc->data, disc->length_data) != 0) return false;
    const ble_uuid_t *wanted = &UUID_SERVICE.u;
    for (int i = 0; i < fields.num_uuids16; ++i) {
        if (ble_uuid_cmp(&fields.uuids16[i].u, wanted) == 0) return true;
    }
    for (int i = 0; i < fields.num_uuids32; ++i) {
        if (ble_uuid_cmp(&fields.uuids32[i].u, wanted) == 0) return true;
    }
    for (int i = 0; i < fields.num_uuids128; ++i) {
        if (ble_uuid_cmp(&fields.uuids128[i].u, wanted) == 0) return true;
    }
    return false;
}

static int write_complete(uint16_t conn_handle, const struct ble_gatt_error *error,
                          struct ble_gatt_attr *attr, void *arg) {
    (void)conn_handle; (void)attr; (void)arg;
    if (error && error->status != 0) {
        ESP_LOGW(TAG, "BLE write completion status=%d", error->status);
    }
    if (g_write_done) xSemaphoreGive(g_write_done);
    return 0;
}

static int cccd_subscribe_complete(uint16_t conn_handle, const struct ble_gatt_error *error,
                                   struct ble_gatt_attr *attr, void *arg) {
    (void)attr; (void)arg;
    if (!error || error->status == 0) {
        g_mtu = ble_att_mtu(conn_handle);
        g_ready.store(true);
        ESP_LOGI(TAG, "MEL MOBILE READY after CCCD confirm conn=%u mtu=%u rx=%u tx=%u",
                 conn_handle, g_mtu, g_rx_handle, g_tx_handle);
        return 0;
    }
    ESP_LOGW(TAG, "MEL Mobile CCCD subscribe failed status=%d", error->status);
    g_ready.store(false);
    ble_gap_terminate(conn_handle, BLE_ERR_REM_USER_CONN_TERM);
    return 0;
}

static bool write_frame(uint8_t op, uint32_t id, const uint8_t *payload, size_t payload_len) {
    if (!g_ready.load() || g_conn_handle == BLE_HS_CONN_HANDLE_NONE || !g_rx_handle) return false;
    const uint16_t mtu = ble_att_mtu(g_conn_handle);
    const size_t limit = mtu > 8 ? (size_t)mtu - 8 : 15;
    if (payload_len > limit) {
        ESP_LOGE(TAG, "BLE frame too large: %u > %u (MTU %u)",
                 (unsigned)payload_len, (unsigned)limit, (unsigned)mtu);
        return false;
    }
    std::string frame;
    frame.resize(5 + payload_len);
    frame[0] = (char)op;
    frame[1] = (char)(id & 0xff);
    frame[2] = (char)((id >> 8) & 0xff);
    frame[3] = (char)((id >> 16) & 0xff);
    frame[4] = (char)((id >> 24) & 0xff);
    if (payload_len) memcpy(frame.data() + 5, payload, payload_len);
    while (xSemaphoreTake(g_write_done, 0) == pdTRUE) {}
    int rc = ble_gattc_write_flat(
        g_conn_handle, g_rx_handle, frame.data(), (uint16_t)frame.size(), write_complete, nullptr
    );
    if (rc != 0) {
        ESP_LOGW(TAG, "BLE write start failed rc=%d", rc);
        return false;
    }
    if (xSemaphoreTake(g_write_done, pdMS_TO_TICKS(5000)) != pdTRUE) {
        ESP_LOGW(TAG, "BLE write timeout");
        return false;
    }
    return true;
}

static void handle_rx_frame(const uint8_t *data, size_t len) {
    if (!data || len < 5) return;
    const uint8_t op = data[0];
    const uint32_t id = (uint32_t)data[1] |
                        ((uint32_t)data[2] << 8) |
                        ((uint32_t)data[3] << 16) |
                        ((uint32_t)data[4] << 24);
    if (id != g_active.id) return;
    const uint8_t *payload = data + 5;
    const size_t payload_len = len - 5;

    if (op == OP_RESPONSE_BEGIN) {
        std::string meta(reinterpret_cast<const char *>(payload), payload_len);
        cJSON *root = cJSON_Parse(meta.c_str());
        cJSON *status = root ? cJSON_GetObjectItemCaseSensitive(root, "status") : nullptr;
        g_active.status = cJSON_IsNumber(status) ? status->valueint : 0;
        if (root) cJSON_Delete(root);
        return;
    }
    if (op == OP_RESPONSE_BODY) {
        if (g_active.cb) {
            if (!g_active.cb(payload, payload_len, g_active.cb_ctx)) g_active.failed = true;
        } else if (g_active.body.size() + payload_len <= 1024 * 1024) {
            g_active.body.append(reinterpret_cast<const char *>(payload), payload_len);
        } else {
            g_active.failed = true;
        }
        return;
    }
    if (op == OP_ERROR) {
        g_active.failed = true;
        if (payload_len) {
            ESP_LOGW(TAG, "MEL Mobile bridge error: %.*s", (int)payload_len, (const char *)payload);
        }
        if (g_response_done) xSemaphoreGive(g_response_done);
        return;
    }
    if (op == OP_RESPONSE_END) {
        if (g_response_done) xSemaphoreGive(g_response_done);
    }
}

static void on_discovery_complete(const struct peer *peer, int status, void *arg) {
    (void)arg;
    if (status != 0 || !peer) {
        ESP_LOGW(TAG, "GATT discovery failed status=%d", status);
        if (peer) ble_gap_terminate(peer->conn_handle, BLE_ERR_REM_USER_CONN_TERM);
        return;
    }

    // Android may temporarily expose several copies of the same custom GATT
    // service after app updates/restarts. The peer helper returns the first
    // match, which can be a stale registration. Select the newest matching
    // service (highest start handle) and resolve RX/TX/CCCD inside that service.
    const struct peer_svc *selected_svc = nullptr;
    int matching_services = 0;
    const struct peer_svc *svc = nullptr;
    SLIST_FOREACH(svc, &peer->svcs, next) {
        if (ble_uuid_cmp(&svc->svc.uuid.u, &UUID_SERVICE.u) != 0) continue;
        matching_services++;
        if (!selected_svc || svc->svc.start_handle > selected_svc->svc.start_handle) {
            selected_svc = svc;
        }
    }

    const struct peer_chr *rx = nullptr;
    const struct peer_chr *tx = nullptr;
    const struct peer_dsc *cccd = nullptr;
    if (selected_svc) {
        const struct peer_chr *chr = nullptr;
        SLIST_FOREACH(chr, &selected_svc->chrs, next) {
            if (ble_uuid_cmp(&chr->chr.uuid.u, &UUID_RX.u) == 0) rx = chr;
            if (ble_uuid_cmp(&chr->chr.uuid.u, &UUID_TX.u) == 0) tx = chr;
        }
        if (tx) {
            const struct peer_dsc *dsc = nullptr;
            SLIST_FOREACH(dsc, &tx->dscs, next) {
                if (ble_uuid_cmp(&dsc->dsc.uuid.u, &UUID_CCCD.u) == 0) {
                    cccd = dsc;
                    break;
                }
            }
        }
    }

    if (!rx || !tx || !cccd) {
        ESP_LOGW(TAG, "MEL Mobile GATT layout incomplete services=%d", matching_services);
        ble_gap_terminate(peer->conn_handle, BLE_ERR_REM_USER_CONN_TERM);
        return;
    }
    ESP_LOGI(TAG, "MEL Mobile GATT services=%d selected=%u-%u rx=%u tx=%u cccd=%u",
             matching_services,
             selected_svc ? selected_svc->svc.start_handle : 0,
             selected_svc ? selected_svc->svc.end_handle : 0,
             rx->chr.val_handle, tx->chr.val_handle, cccd->dsc.handle);
    g_rx_handle = rx->chr.val_handle;
    g_tx_handle = tx->chr.val_handle;
    uint8_t value[2] = {2, 0}; // indications
    g_ready.store(false);
    int rc = ble_gattc_write_flat(
        peer->conn_handle,
        cccd->dsc.handle,
        value,
        sizeof(value),
        cccd_subscribe_complete,
        nullptr
    );
    if (rc != 0) {
        ESP_LOGW(TAG, "MEL Mobile subscribe start failed rc=%d", rc);
        ble_gap_terminate(peer->conn_handle, BLE_ERR_REM_USER_CONN_TERM);
        return;
    }
    ESP_LOGI(TAG, "MEL Mobile CCCD subscribe queued; waiting for confirmation");
}

static int mtu_complete(uint16_t conn_handle, const struct ble_gatt_error *error,
                        uint16_t mtu, void *arg) {
    (void)arg;
    if (!error || error->status == 0) {
        g_mtu = mtu;
        ESP_LOGI(TAG, "MEL Mobile MTU=%u", mtu);
    }
    int rc = peer_disc_svc_by_uuid(
        conn_handle, &UUID_SERVICE.u, on_discovery_complete, nullptr
    );
    if (rc != 0) {
        ESP_LOGW(TAG, "MEL Mobile service discovery start failed rc=%d", rc);
        ble_gap_terminate(conn_handle, BLE_ERR_REM_USER_CONN_TERM);
    }
    return 0;
}

static void connect_to(const struct ble_gap_disc_desc *disc) {
    uint8_t own_addr_type = 0;
    if (ble_gap_disc_cancel() != 0) return;
    if (ble_hs_id_infer_auto(0, &own_addr_type) != 0) {
        start_scan();
        return;
    }
    int rc = ble_gap_connect(own_addr_type, &disc->addr, 15000, nullptr, gap_event, nullptr);
    if (rc != 0) {
        ESP_LOGW(TAG, "MEL Mobile connect start failed rc=%d", rc);
        start_scan();
    } else {
        ESP_LOGI(TAG, "MEL Mobile candidate found; connecting");
    }
}

static int gap_event(struct ble_gap_event *event, void *arg) {
    (void)arg;
    switch (event->type) {
        case BLE_GAP_EVENT_DISC:
            if (adv_has_service(&event->disc)) connect_to(&event->disc);
            return 0;
        case BLE_GAP_EVENT_CONNECT:
            if (event->connect.status != 0) {
                ESP_LOGW(TAG, "MEL Mobile BLE connect failed status=%d", event->connect.status);
                start_scan();
                return 0;
            }
            g_conn_handle = event->connect.conn_handle;
            g_ready.store(false);
            if (peer_add(g_conn_handle) != 0) {
                ble_gap_terminate(g_conn_handle, BLE_ERR_REM_USER_CONN_TERM);
                return 0;
            }
            ble_att_set_preferred_mtu(517);
            if (ble_gattc_exchange_mtu(g_conn_handle, mtu_complete, nullptr) != 0) {
                mtu_complete(g_conn_handle, nullptr, ble_att_mtu(g_conn_handle), nullptr);
            }
            return 0;
        case BLE_GAP_EVENT_NOTIFY_RX: {
            if (event->notify_rx.attr_handle != g_tx_handle || !event->notify_rx.om) return 0;
            const int len = OS_MBUF_PKTLEN(event->notify_rx.om);
            if (len <= 0 || len > 520) return 0;
            uint8_t buf[520];
            if (os_mbuf_copydata(event->notify_rx.om, 0, len, buf) == 0) {
                handle_rx_frame(buf, (size_t)len);
            }
            return 0;
        }
        case BLE_GAP_EVENT_MTU:
            g_mtu = event->mtu.value;
            return 0;
        case BLE_GAP_EVENT_DISCONNECT:
            ESP_LOGW(TAG, "MEL Mobile disconnected reason=%d", event->disconnect.reason);
            g_ready.store(false);
            g_rx_handle = 0;
            g_tx_handle = 0;
            if (g_conn_handle != BLE_HS_CONN_HANDLE_NONE) peer_delete(g_conn_handle);
            g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            g_active.failed = true;
            if (g_response_done) xSemaphoreGive(g_response_done);
            start_scan();
            return 0;
        case BLE_GAP_EVENT_DISC_COMPLETE:
            if (!g_ready.load() && g_conn_handle == BLE_HS_CONN_HANDLE_NONE) start_scan();
            return 0;
        default:
            return 0;
    }
}

static void start_scan() {
    if (!g_started.load() || g_conn_handle != BLE_HS_CONN_HANDLE_NONE) return;
    uint8_t own_addr_type = 0;
    if (ble_hs_id_infer_auto(0, &own_addr_type) != 0) return;
    struct ble_gap_disc_params params = {};
    params.passive = 1;
    params.filter_duplicates = 1;
    params.filter_policy = 0;
    params.limited = 0;
    int rc = ble_gap_disc(own_addr_type, BLE_HS_FOREVER, &params, gap_event, nullptr);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGW(TAG, "MEL Mobile scan failed rc=%d", rc);
    }
}

static void on_reset(int reason) {
    ESP_LOGW(TAG, "NimBLE reset reason=%d", reason);
    g_ready.store(false);
}

static void on_sync() {
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "NimBLE address init failed rc=%d", rc);
        return;
    }
    start_scan();
}

static void host_task(void *param) {
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void mel_mobile_bridge_start(void) {
    bool expected = false;
    if (!g_started.compare_exchange_strong(expected, true)) return;
    g_request_mutex = xSemaphoreCreateMutex();
    g_write_done = xSemaphoreCreateBinary();
    g_response_done = xSemaphoreCreateBinary();
    if (!g_request_mutex || !g_write_done || !g_response_done) {
        ESP_LOGE(TAG, "MEL Mobile semaphore allocation failed");
        g_started.store(false);
        return;
    }
    int rc = peer_init(1, 8, 16, 16);
    if (rc != 0) {
        ESP_LOGE(TAG, "NimBLE peer init failed rc=%d", rc);
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
    nimble_port_freertos_init(host_task);
    ESP_LOGI(TAG, "MEL Mobile BLE client started");
}

void mel_mobile_bridge_rescan(void) {
    if (!g_started.load()) {
        mel_mobile_bridge_start();
        return;
    }
    if (g_conn_handle != BLE_HS_CONN_HANDLE_NONE) {
        ble_gap_terminate(g_conn_handle, BLE_ERR_REM_USER_CONN_TERM);
        return;
    }
    start_scan();
}

bool mel_mobile_bridge_ready(void) {
    return g_ready.load();
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
    std::string *response,
    int &status,
    mel_mobile_bridge_chunk_cb cb,
    void *cb_ctx
) {
    if (!mel_mobile_bridge_ready() || !path || !device_id) return ESP_ERR_INVALID_STATE;
    if (body_len > 512 * 1024) return ESP_ERR_INVALID_SIZE;
    if (xSemaphoreTake(g_request_mutex, pdMS_TO_TICKS(3000)) != pdTRUE) return ESP_ERR_TIMEOUT;

    const uint32_t id = g_request_id.fetch_add(1);
    g_active = {};
    g_active.id = id;
    g_active.cb = cb;
    g_active.cb_ctx = cb_ctx;
    while (xSemaphoreTake(g_response_done, 0) == pdTRUE) {}

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "m", method == HTTP_METHOD_GET ? "GET" : "POST");
    cJSON_AddStringToObject(root, "p", path);
    cJSON_AddStringToObject(root, "c", content_type ? content_type : "application/json");
    cJSON_AddStringToObject(root, "t", token ? token : "");
    cJSON_AddStringToObject(root, "d", device_id);
    cJSON_AddNumberToObject(root, "l", (double)body_len);
    std::string meta = json_string(root);
    cJSON_Delete(root);

    bool ok = write_frame(OP_BEGIN, id, reinterpret_cast<const uint8_t *>(meta.data()), meta.size());
    if (ok && body_len) {
        const uint16_t mtu = ble_att_mtu(g_conn_handle);
        const size_t chunk = std::max<size_t>(12, mtu > 8 ? (size_t)mtu - 8 : 15);
        for (size_t off = 0; ok && off < body_len; off += chunk) {
            const size_t n = std::min(chunk, body_len - off);
            ok = write_frame(OP_BODY, id, body + off, n);
        }
    }
    if (ok) ok = write_frame(OP_END, id, nullptr, 0);
    if (!ok) {
        g_active.failed = true;
        xSemaphoreGive(g_request_mutex);
        return ESP_FAIL;
    }

    const TickType_t wait = pdMS_TO_TICKS(120000);
    if (xSemaphoreTake(g_response_done, wait) != pdTRUE) {
        g_active.failed = true;
        xSemaphoreGive(g_request_mutex);
        return ESP_ERR_TIMEOUT;
    }
    status = g_active.status;
    if (response) *response = g_active.body;
    const bool failed = g_active.failed;
    xSemaphoreGive(g_request_mutex);
    return failed ? ESP_FAIL : ESP_OK;
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
    return request_common(method, path, content_type, token, device_id,
                          body, body_len, &response, status, nullptr, nullptr);
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
    return request_common(method, path, content_type, token, device_id,
                          body, body_len, nullptr, status, cb, ctx);
}
