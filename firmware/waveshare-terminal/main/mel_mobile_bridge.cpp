#include "mel_mobile_bridge.h"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <cstdlib>
#include <ctime>
#include <string>
#include <sys/time.h>

#include "cJSON.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/queue.h"
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
// Android exposes UUID.fromString("0000abfX-0000-1000-8000-00805f9b34fb")
// as a real 128-bit GATT UUID. NimBLE ble_uuid_cmp() is type-strict, so a
// UUID16 and the equivalent Bluetooth-base UUID128 do NOT compare equal.
// Accept both encodings end-to-end (advertisement + GATT discovery).
static const ble_uuid128_t UUID_SERVICE_128 = BLE_UUID128_INIT(
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80,
    0x00, 0x10, 0x00, 0x00, 0xf0, 0xab, 0x00, 0x00
);
static const ble_uuid128_t UUID_RX_128 = BLE_UUID128_INIT(
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80,
    0x00, 0x10, 0x00, 0x00, 0xf1, 0xab, 0x00, 0x00
);
static const ble_uuid128_t UUID_TX_128 = BLE_UUID128_INIT(
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80,
    0x00, 0x10, 0x00, 0x00, 0xf2, 0xab, 0x00, 0x00
);
static const ble_uuid16_t UUID_CCCD = BLE_UUID16_INIT(BLE_GATT_DSC_CLT_CFG_UUID16);

static const uint8_t OP_BEGIN = 0x01;
static const uint8_t OP_BODY = 0x02;
static const uint8_t OP_END = 0x03;
static const uint8_t OP_PING = 0x04;
static const uint8_t OP_META_CHUNK = 0x05;
static const uint8_t OP_RESPONSE_BEGIN = 0x11;
static const uint8_t OP_RESPONSE_BODY = 0x12;
static const uint8_t OP_RESPONSE_END = 0x13;
static const uint8_t OP_CLOCK = 0x14;
static const uint8_t OP_ERROR = 0x1f;

static std::atomic<bool> g_started{false};
static std::atomic<bool> g_ready{false};
static std::atomic<bool> g_candidate_seen{false};
static uint16_t g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t g_rx_handle = 0;
static uint16_t g_tx_handle = 0;
static uint16_t g_mtu = 23;
static SemaphoreHandle_t g_request_mutex = nullptr;
static SemaphoreHandle_t g_write_done = nullptr;
static bool g_write_failed = false;
static SemaphoreHandle_t g_read_done = nullptr;
static SemaphoreHandle_t g_response_done = nullptr;
static uint8_t g_read_frame[520] = {};
static size_t g_read_len = 0;
static bool g_read_failed = false;
static std::atomic<uint32_t> g_request_id{1};
static std::atomic<int64_t> g_phone_epoch_ms{0};
static std::atomic<int32_t> g_phone_offset_seconds{0};
static std::atomic<int64_t> g_phone_clock_received_us{0};

struct NotifyFrame {
    uint16_t len = 0;
    uint8_t data[520] = {};
};
static QueueHandle_t g_notify_queue = nullptr;

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
static void handle_rx_frame(const uint8_t *data, size_t len);

static std::string json_string(cJSON *root) {
    char *raw = cJSON_PrintUnformatted(root);
    std::string out = raw ? raw : "{}";
    if (raw) cJSON_free(raw);
    return out;
}

static bool apply_phone_clock(const std::string &body) {
    if (body.empty()) return false;
    cJSON *root = cJSON_Parse(body.c_str());
    if (!root) return false;
    cJSON *epoch_item = cJSON_GetObjectItemCaseSensitive(root, "epoch_ms");
    cJSON *offset_item = cJSON_GetObjectItemCaseSensitive(root, "utc_offset_seconds");
    if (!cJSON_IsNumber(epoch_item) || !cJSON_IsNumber(offset_item)) {
        cJSON_Delete(root);
        return false;
    }

    const int64_t epoch_ms = (int64_t)epoch_item->valuedouble;
    const int offset_seconds = offset_item->valueint;
    if (epoch_ms < 1700000000000LL) {
        cJSON_Delete(root);
        return false;
    }

    g_phone_epoch_ms.store(epoch_ms);
    g_phone_offset_seconds.store(offset_seconds);
    g_phone_clock_received_us.store(esp_timer_get_time());

    struct timeval tv = {};
    tv.tv_sec = (time_t)(epoch_ms / 1000LL);
    tv.tv_usec = (suseconds_t)((epoch_ms % 1000LL) * 1000LL);
    if (settimeofday(&tv, nullptr) != 0) {
        ESP_LOGW(TAG, "BLE PHONE CLOCK settimeofday failed; direct display clock remains valid");
    }

    const int abs_offset = offset_seconds < 0 ? -offset_seconds : offset_seconds;
    const int hours = abs_offset / 3600;
    const int minutes = (abs_offset % 3600) / 60;
    const char sign = offset_seconds >= 0 ? '-' : '+';
    char tz[32] = {};
    if (minutes) snprintf(tz, sizeof(tz), "MEL%c%d:%02d", sign, hours, minutes);
    else snprintf(tz, sizeof(tz), "MEL%c%d", sign, hours);
    setenv("TZ", tz, 1);
    tzset();

    ESP_LOGI(TAG, "BLE PHONE CLOCK synced epoch=%lld offset=%d tz=%s",
             (long long)(epoch_ms / 1000LL), offset_seconds, tz);
    cJSON_Delete(root);
    return true;
}

static bool uuid_matches_mel(const ble_uuid_t *uuid,
                             const ble_uuid16_t *short_uuid,
                             const ble_uuid128_t *full_uuid) {
    if (!uuid || !short_uuid || !full_uuid) return false;
    if (uuid->type == BLE_UUID_TYPE_16) {
        return ble_uuid_cmp(uuid, &short_uuid->u) == 0;
    }
    if (uuid->type == BLE_UUID_TYPE_128) {
        return ble_uuid_cmp(uuid, &full_uuid->u) == 0;
    }
    return false;
}

static bool adv_has_service(const struct ble_gap_disc_desc *disc) {
    struct ble_hs_adv_fields fields = {};
    if (ble_hs_adv_parse_fields(&fields, disc->data, disc->length_data) != 0) return false;
    for (int i = 0; i < fields.num_uuids16; ++i) {
        if (uuid_matches_mel(&fields.uuids16[i].u, &UUID_SERVICE, &UUID_SERVICE_128)) return true;
    }
    for (int i = 0; i < fields.num_uuids128; ++i) {
        if (uuid_matches_mel(&fields.uuids128[i].u, &UUID_SERVICE, &UUID_SERVICE_128)) return true;
    }
    return false;
}

static int write_complete(uint16_t conn_handle, const struct ble_gatt_error *error,
                          struct ble_gatt_attr *attr, void *arg) {
    (void)conn_handle; (void)attr; (void)arg;
    g_write_failed = error && error->status != 0;
    if (g_write_failed) {
        ESP_LOGW(TAG, "BLE write completion status=%d", error->status);
    }
    if (g_write_done) xSemaphoreGive(g_write_done);
    return 0;
}

static int read_complete(uint16_t conn_handle, const struct ble_gatt_error *error,
                         struct ble_gatt_attr *attr, void *arg) {
    (void)conn_handle; (void)arg;
    g_read_len = 0;
    g_read_failed = true;
    if (!error || error->status == 0) {
        if (attr && attr->om) {
            const int len = OS_MBUF_PKTLEN(attr->om);
            if (len > 0 && len <= (int)sizeof(g_read_frame) &&
                os_mbuf_copydata(attr->om, 0, len, g_read_frame) == 0) {
                g_read_len = (size_t)len;
                g_read_failed = false;
            }
        }
    } else {
        ESP_LOGW(TAG, "BLE TX read status=%d", error->status);
    }
    if (g_read_done) xSemaphoreGive(g_read_done);
    return 0;
}

static bool pull_response_frame() {
    if (!g_ready.load() || g_conn_handle == BLE_HS_CONN_HANDLE_NONE || !g_tx_handle) return false;
    while (xSemaphoreTake(g_read_done, 0) == pdTRUE) {}
    g_read_len = 0;
    g_read_failed = true;
    const int rc = ble_gattc_read(g_conn_handle, g_tx_handle, read_complete, nullptr);
    if (rc != 0) {
        ESP_LOGW(TAG, "BLE TX read start failed rc=%d", rc);
        return false;
    }
    if (xSemaphoreTake(g_read_done, pdMS_TO_TICKS(2500)) != pdTRUE) {
        ESP_LOGW(TAG, "BLE TX read timeout");
        return false;
    }
    if (g_read_failed) return false;
    if (g_read_len >= 5 && g_read_frame[0] != 0) {
        handle_rx_frame(g_read_frame, g_read_len);
    }
    return true;
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
    // GATT characteristic values are capped at 512 bytes even with MTU 517.
    // Keep the full MEL frame (5-byte header + payload) comfortably below it.
    const size_t limit = std::min<size_t>(500, mtu > 8 ? (size_t)mtu - 8 : 15);
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
    g_write_failed = false;
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
    return !g_write_failed;
}

static void handle_rx_frame(const uint8_t *data, size_t len) {
    if (!data || len < 5) return;
    const uint8_t op = data[0];
    const uint32_t id = (uint32_t)data[1] |
                        ((uint32_t)data[2] << 8) |
                        ((uint32_t)data[3] << 16) |
                        ((uint32_t)data[4] << 24);
    ESP_LOGI(TAG, "MEL Mobile RX op=0x%02x id=%u len=%u active=%u",
             op, (unsigned)id, (unsigned)len, (unsigned)g_active.id);
    const uint8_t *payload = data + 5;
    const size_t payload_len = len - 5;

    if (op == OP_CLOCK && payload_len >= 12) {
        int64_t epoch_ms = 0;
        int32_t offset_seconds = 0;
        memcpy(&epoch_ms, payload, sizeof(epoch_ms));
        memcpy(&offset_seconds, payload + 8, sizeof(offset_seconds));
        if (epoch_ms >= 1700000000000LL) {
            g_phone_epoch_ms.store(epoch_ms);
            g_phone_offset_seconds.store(offset_seconds);
            g_phone_clock_received_us.store(esp_timer_get_time());
            ESP_LOGI(TAG, "BLE CLOCK FRAME epoch=%lld offset=%d",
                     (long long)epoch_ms, (int)offset_seconds);
        }
        return;
    }

    if (id != g_active.id) return;

    if (op == OP_RESPONSE_BEGIN) {
        std::string meta(reinterpret_cast<const char *>(payload), payload_len);
        cJSON *root = cJSON_Parse(meta.c_str());
        cJSON *status = root ? cJSON_GetObjectItemCaseSensitive(root, "status") : nullptr;
        g_active.status = cJSON_IsNumber(status) ? status->valueint : 0;
        ESP_LOGI(TAG, "MEL Mobile response begin status=%d", g_active.status);
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
        ESP_LOGI(TAG, "MEL Mobile response end id=%u status=%d", (unsigned)id, g_active.status);
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
        if (!uuid_matches_mel(&svc->svc.uuid.u, &UUID_SERVICE, &UUID_SERVICE_128)) continue;
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
            if (uuid_matches_mel(&chr->chr.uuid.u, &UUID_RX, &UUID_RX_128)) rx = chr;
            if (uuid_matches_mel(&chr->chr.uuid.u, &UUID_TX, &UUID_TX_128)) tx = chr;
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
    uint8_t value[2] = {1, 0}; // notifications
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
    // Discover all services because Android may expose the Bluetooth-base
    // UUID as a 128-bit ATT UUID. peer_disc_svc_by_uuid(UUID16) would miss it.
    int rc = peer_disc_all(conn_handle, on_discovery_complete, nullptr);
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
    struct ble_gap_conn_params params = {};
    params.scan_itvl = 0x0010;
    params.scan_window = 0x0010;
    // Conservative link parameters: the Redmi/Xiaomi bridge proved unstable
    // with the generic defaults during idle periods and large STT transfers.
    // 30-40 ms, no slave latency, 8 s supervision gives the phone and ESP32
    // enough margin without sacrificing interactive latency.
    params.itvl_min = 24;          // 30 ms (1.25 ms units)
    params.itvl_max = 32;          // 40 ms
    params.latency = 0;
    params.supervision_timeout = 800; // 8 s (10 ms units)
    params.min_ce_len = BLE_GAP_INITIAL_CONN_MIN_CE_LEN;
    params.max_ce_len = BLE_GAP_INITIAL_CONN_MAX_CE_LEN;
    int rc = ble_gap_connect(own_addr_type, &disc->addr, 15000, &params, gap_event, nullptr);
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
            if (adv_has_service(&event->disc)) {
                g_candidate_seen.store(true);
                ESP_LOGI(TAG, "MEL Mobile advertisement detected rssi=%d", event->disc.rssi);
                connect_to(&event->disc);
            }
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
            ble_att_set_preferred_mtu(185); // conservative Android/Redmi-safe MTU
            if (ble_gattc_exchange_mtu(g_conn_handle, mtu_complete, nullptr) != 0) {
                mtu_complete(g_conn_handle, nullptr, ble_att_mtu(g_conn_handle), nullptr);
            }
            return 0;
        case BLE_GAP_EVENT_NOTIFY_RX: {
            if (event->notify_rx.attr_handle != g_tx_handle || !event->notify_rx.om) return 0;
            const int len = OS_MBUF_PKTLEN(event->notify_rx.om);
            if (len <= 0 || len > 520 || !g_notify_queue) return 0;
            NotifyFrame frame;
            frame.len = (uint16_t)len;
            if (os_mbuf_copydata(event->notify_rx.om, 0, len, frame.data) == 0) {
                if (xQueueSend(g_notify_queue, &frame, 0) != pdTRUE) {
                    ESP_LOGW(TAG, "BLE notify queue full; dropping frame");
                }
            }
            return 0;
        }
        case BLE_GAP_EVENT_CONN_UPDATE_REQ:
        case BLE_GAP_EVENT_L2CAP_UPDATE_REQ:
            ESP_LOGI(TAG,
                     "MEL Mobile conn update req itvl=%u-%u latency=%u timeout=%u",
                     event->conn_update_req.peer_params->itvl_min,
                     event->conn_update_req.peer_params->itvl_max,
                     event->conn_update_req.peer_params->latency,
                     event->conn_update_req.peer_params->supervision_timeout);
            // NimBLE pre-fills self_params with the peer request. Return 0 to accept it.
            return 0;
        case BLE_GAP_EVENT_CONN_UPDATE: {
            struct ble_gap_conn_desc desc = {};
            if (ble_gap_conn_find(event->conn_update.conn_handle, &desc) == 0) {
                ESP_LOGI(TAG,
                         "MEL Mobile conn updated status=%d itvl=%u latency=%u timeout=%u",
                         event->conn_update.status,
                         desc.conn_itvl,
                         desc.conn_latency,
                         desc.supervision_timeout);
            } else {
                ESP_LOGI(TAG, "MEL Mobile conn update status=%d", event->conn_update.status);
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
    // Active scanning is intentional: some Android stacks move service data
    // to the scan response. MINI must discover MEL Mobile before Wi-Fi fallback.
    params.passive = 0;
    params.filter_duplicates = 0;
    params.filter_policy = 0;
    params.limited = 0;
    int rc = ble_gap_disc(own_addr_type, BLE_HS_FOREVER, &params, gap_event, nullptr);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGW(TAG, "MEL Mobile scan failed rc=%d", rc);
    }
}

static void on_reset(int reason) {
    ESP_LOGW(TAG, "NimBLE reset reason=%d; waiting for host resync", reason);
    // Clear only transport state here. NimBLE will call on_sync() once the host
    // is usable again; on_sync owns restarting the scan. This avoids racing a
    // scan against controller reset while still discarding stale handles.
    g_ready.store(false);
    g_rx_handle = 0;
    g_tx_handle = 0;
    g_mtu = 23;
    g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
    g_active.failed = true;
    if (g_response_done) xSemaphoreGive(g_response_done);
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
    g_read_done = xSemaphoreCreateBinary();
    g_response_done = xSemaphoreCreateBinary();
    g_notify_queue = xQueueCreate(32, sizeof(NotifyFrame));
    if (!g_request_mutex || !g_write_done || !g_read_done || !g_response_done || !g_notify_queue) {
        ESP_LOGE(TAG, "MEL Mobile synchronization allocation failed");
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
    ble_att_set_preferred_mtu(185); // conservative Android/Redmi-safe MTU
    nimble_port_freertos_init(host_task);
    ESP_LOGI(TAG, "MEL Mobile BLE client started");
}

void mel_mobile_bridge_rescan(void) {
    if (!g_started.load()) {
        mel_mobile_bridge_start();
        return;
    }
    if (g_conn_handle != BLE_HS_CONN_HANDLE_NONE) {
        if (g_ready.load()) {
            // The settings button is a discovery/recovery action, not a
            // disconnect button. Keep a proven GATT bridge intact.
            ESP_LOGI(TAG, "MEL Mobile rescan ignored: healthy BLE link already active");
            return;
        }
        ESP_LOGW(TAG, "MEL Mobile rescan: recycling incomplete BLE connection");
        ble_gap_terminate(g_conn_handle, BLE_ERR_REM_USER_CONN_TERM);
        return;
    }
    start_scan();
}

bool mel_mobile_bridge_keepalive(void) {
    if (!g_ready.load() || g_conn_handle == BLE_HS_CONN_HANDLE_NONE || !g_request_mutex) return false;
    if (xSemaphoreTake(g_request_mutex, 0) != pdTRUE) return false;

    const uint32_t id = g_request_id.fetch_add(1);
    g_active = {};
    g_active.id = id;
    while (xSemaphoreTake(g_response_done, 0) == pdTRUE) {}
    if (g_notify_queue) xQueueReset(g_notify_queue);

    if (!write_frame(OP_PING, id, nullptr, 0)) {
        xSemaphoreGive(g_request_mutex);
        return false;
    }

    const TickType_t started = xTaskGetTickCount();
    const TickType_t wait = pdMS_TO_TICKS(5000);
    bool completed = false;
    NotifyFrame notify_frame;
    TickType_t last_pull = 0;

    while ((xTaskGetTickCount() - started) < wait) {
        if (xSemaphoreTake(g_response_done, 0) == pdTRUE) {
            completed = true;
            break;
        }
        if (!g_ready.load() || g_conn_handle == BLE_HS_CONN_HANDLE_NONE) break;

        while (g_notify_queue && xQueueReceive(g_notify_queue, &notify_frame, 0) == pdTRUE) {
            handle_rx_frame(notify_frame.data, notify_frame.len);
            if (xSemaphoreTake(g_response_done, 0) == pdTRUE) {
                completed = true;
                break;
            }
        }
        if (completed) break;

        const TickType_t now = xTaskGetTickCount();
        if ((now - last_pull) >= pdMS_TO_TICKS(60)) {
            pull_response_frame();
            last_pull = now;
            if (xSemaphoreTake(g_response_done, 0) == pdTRUE) {
                completed = true;
                break;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }

    const bool ok = completed && !g_active.failed && g_active.status == 200;
    if (ok && !g_active.body.empty()) {
        apply_phone_clock(g_active.body);
    }
    xSemaphoreGive(g_request_mutex);
    if (ok) ESP_LOGD(TAG, "MEL Mobile keepalive/clock OK");
    else ESP_LOGW(TAG, "MEL Mobile keepalive/clock failed id=%u status=%d", (unsigned)id, g_active.status);
    return ok;
}

bool mel_mobile_bridge_ready(void) {
    return g_ready.load();
}

bool mel_mobile_bridge_format_phone_time(char *out, size_t out_len) {
    if (!out || out_len < 6) return false;
    const int64_t base_ms = g_phone_epoch_ms.load();
    const int64_t received_us = g_phone_clock_received_us.load();
    if (base_ms < 1700000000000LL || received_us <= 0) return false;

    int64_t elapsed_ms = (esp_timer_get_time() - received_us) / 1000LL;
    if (elapsed_ms < 0) elapsed_ms = 0;
    const int64_t utc_seconds = (base_ms + elapsed_ms) / 1000LL;
    const int64_t local_seconds = utc_seconds + (int64_t)g_phone_offset_seconds.load();
    int64_t day_seconds = local_seconds % 86400LL;
    if (day_seconds < 0) day_seconds += 86400LL;
    const int hour = (int)(day_seconds / 3600LL);
    const int minute = (int)((day_seconds % 3600LL) / 60LL);
    snprintf(out, out_len, "%02d:%02d", hour, minute);
    return true;
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
    if (g_notify_queue) xQueueReset(g_notify_queue);

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "m", method == HTTP_METHOD_GET ? "GET" : "POST");
    cJSON_AddStringToObject(root, "p", path);
    cJSON_AddStringToObject(root, "c", content_type ? content_type : "application/json");
    cJSON_AddStringToObject(root, "t", token ? token : "");
    cJSON_AddStringToObject(root, "d", device_id);
    cJSON_AddNumberToObject(root, "l", (double)body_len);
    std::string meta = json_string(root);
    cJSON_Delete(root);

    const uint16_t mtu = ble_att_mtu(g_conn_handle);
    const size_t negotiated_chunk =
        std::max<size_t>(12, std::min<size_t>(500, mtu > 8 ? (size_t)mtu - 8 : 15));
    // Some Redmi/Xiaomi GATT server stacks advertise a large MTU but become
    // unstable under hundreds of near-maximum write-with-response packets.
    // Voice/STT is by far the largest MINI->phone transfer, so keep only that
    // path on a conservative payload size while leaving control/chat traffic
    // at the negotiated MTU.
    const bool voice_upload = strstr(path, "/voice/transcribe") != nullptr;
    const size_t chunk = voice_upload
        ? std::min<size_t>(160, negotiated_chunk)
        : negotiated_chunk;
    if (voice_upload) {
        ESP_LOGI(TAG, "BLE STT compatibility mode mtu=%u payload=%u body=%u",
                 (unsigned)mtu, (unsigned)chunk, (unsigned)body_len);
    }

    bool ok = true;
    if (meta.size() <= chunk) {
        ok = write_frame(OP_BEGIN, id, reinterpret_cast<const uint8_t *>(meta.data()), meta.size());
    } else {
        // The Redmi/Android GATT server can legitimately negotiate the BLE minimum
        // MTU (23). Fragment request metadata instead of treating a healthy BLE link
        // as unusable merely because the JSON header is larger than one ATT packet.
        for (size_t off = 0; ok && off < meta.size(); off += chunk) {
            const size_t n = std::min(chunk, meta.size() - off);
            ok = write_frame(OP_META_CHUNK, id,
                             reinterpret_cast<const uint8_t *>(meta.data() + off), n);
        }
        if (ok) ok = write_frame(OP_BEGIN, id, nullptr, 0);
    }

    if (ok && body_len) {
        size_t frame_index = 0;
        for (size_t off = 0; ok && off < body_len; off += chunk, ++frame_index) {
            const size_t n = std::min(chunk, body_len - off);
            ok = write_frame(OP_BODY, id, body + off, n);
            // Each write already waits for its ATT response. This tiny periodic
            // yield additionally avoids monopolising the application task during
            // long STT uploads and gives the NimBLE host room to service link
            // maintenance on vendor-sensitive phones.
            if (ok && voice_upload && (frame_index % 8U) == 7U) {
                vTaskDelay(pdMS_TO_TICKS(2));
            }
        }
    }
    if (ok) ok = write_frame(OP_END, id, nullptr, 0);
    if (!ok) {
        g_active.failed = true;
        xSemaphoreGive(g_request_mutex);
        return ESP_FAIL;
    }

    const TickType_t wait = pdMS_TO_TICKS(voice_upload ? 45000 : 120000);
    const TickType_t started = xTaskGetTickCount();
    bool completed = false;
    NotifyFrame notify_frame;
    TickType_t last_pull = 0;
    while ((xTaskGetTickCount() - started) < wait) {
        if (xSemaphoreTake(g_response_done, 0) == pdTRUE) {
            completed = true;
            break;
        }
        if (!g_ready.load() || g_conn_handle == BLE_HS_CONN_HANDLE_NONE) break;

        // Consume all push notifications first.
        while (g_notify_queue && xQueueReceive(g_notify_queue, &notify_frame, 0) == pdTRUE) {
            handle_rx_frame(notify_frame.data, notify_frame.len);
            if (xSemaphoreTake(g_response_done, 0) == pdTRUE) {
                completed = true;
                break;
            }
        }
        if (completed) break;

        // IMPORTANT: Android can fall back from notify to characteristic-read
        // for any individual response frame. The old code stopped polling forever
        // after the first successful notification, so a later frame placed in the
        // pull queue could never be consumed. That left MINI stuck at "MEL à valider".
        const TickType_t now = xTaskGetTickCount();
        if ((now - last_pull) >= pdMS_TO_TICKS(60)) {
            pull_response_frame();
            last_pull = now;
            if (xSemaphoreTake(g_response_done, 0) == pdTRUE) {
                completed = true;
                break;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    if (!completed) {
        g_active.failed = true;
        ESP_LOGW(TAG,
                 "MEL Mobile request id=%u timed out; preserving BLE link ready=%d conn=%u",
                 (unsigned)id, g_ready.load() ? 1 : 0, (unsigned)g_conn_handle);
        // A server/STT timeout is not proof that the radio link is dead.
        // Never tear down a healthy GATT connection here; the reconnect watchdog
        // below handles genuine physical disconnects independently.
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
