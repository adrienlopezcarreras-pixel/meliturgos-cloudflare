#include "mel_link_v2_server.h"
#include "mel_link_v2_protocol.h"

#include <atomic>
#include <cstring>

#include "esp_log.h"
#include "host/ble_att.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "os/os_mbuf.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "MEL_LINK_V2";

static const ble_uuid16_t UUID_SERVICE = BLE_UUID16_INIT(0xabf0);
static const ble_uuid16_t UUID_CONTROL_RX = BLE_UUID16_INIT(0xabf1);
static const ble_uuid16_t UUID_EVENT_TX = BLE_UUID16_INIT(0xabf2);
static const ble_uuid16_t UUID_BULK_RX = BLE_UUID16_INIT(0xabf3);

static std::atomic<bool> g_started{false};
static std::atomic<bool> g_ready{false};
static std::atomic<bool> g_link_encrypted{false};
static uint16_t g_conn = BLE_HS_CONN_HANDLE_NONE;
static uint16_t g_control_handle = 0;
static uint16_t g_event_handle = 0;
static uint16_t g_bulk_handle = 0;
static uint16_t g_mtu = 23;
static uint8_t g_own_addr_type = 0;
static bool g_event_subscribed = false;
static mel_link_v2_rx_cb g_rx_cb = nullptr;
static void *g_rx_ctx = nullptr;
static mel_link_v2_state_cb g_state_cb = nullptr;
static void *g_state_ctx = nullptr;
static SemaphoreHandle_t g_tx_mutex = nullptr;
static SemaphoreHandle_t g_tx_done = nullptr;
static std::atomic<bool> g_tx_failed{false};

static int gap_event(struct ble_gap_event *event, void *arg);
static void start_advertising();

static bool frame_header_valid(const uint8_t *data, size_t len) {
    if (!data || len < MEL_LINK_V2_HEADER_SIZE) return false;
    const MelLinkV2Header *h = reinterpret_cast<const MelLinkV2Header *>(data);
    if (h->magic0 != MEL_LINK_V2_MAGIC0 || h->magic1 != MEL_LINK_V2_MAGIC1) return false;
    if (h->protocol_version != MEL_LINK_V2_PROTOCOL_VERSION) return false;
    if ((size_t)h->payload_len + MEL_LINK_V2_HEADER_SIZE != len) return false;
    return true;
}

static int access_cb(
    uint16_t conn_handle,
    uint16_t attr_handle,
    struct ble_gatt_access_ctxt *ctxt,
    void *arg
) {
    (void)arg;
    if (!ctxt || ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) {
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (attr_handle != g_control_handle && attr_handle != g_bulk_handle) {
        return BLE_ATT_ERR_UNLIKELY;
    }

    const uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
    if (len < MEL_LINK_V2_HEADER_SIZE || len > 512) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }

    uint8_t frame[512];
    if (os_mbuf_copydata(ctxt->om, 0, len, frame) != 0) {
        return BLE_ATT_ERR_UNLIKELY;
    }
    if (!frame_header_valid(frame, len)) {
        ESP_LOGW(TAG, "Rejected malformed V2 frame len=%u", (unsigned)len);
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (g_rx_cb) g_rx_cb(frame, len, g_rx_ctx);
    return 0;
}

static const struct ble_gatt_svc_def g_services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &UUID_SERVICE.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid = &UUID_CONTROL_RX.u,
                .access_cb = access_cb,
                .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_ENC,
                .val_handle = &g_control_handle,
            },
            {
                .uuid = &UUID_EVENT_TX.u,
                .access_cb = access_cb,
                .flags = BLE_GATT_CHR_F_NOTIFY | BLE_GATT_CHR_F_INDICATE,
                .val_handle = &g_event_handle,
            },
            {
                .uuid = &UUID_BULK_RX.u,
                .access_cb = access_cb,
                .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP | BLE_GATT_CHR_F_WRITE_ENC,
                .val_handle = &g_bulk_handle,
            },
            {0}
        }
    },
    {0}
};

static void start_advertising() {
    if (!g_started.load() || g_conn != BLE_HS_CONN_HANDLE_NONE) return;

    struct ble_hs_adv_fields fields = {};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids16 = const_cast<ble_uuid16_t *>(&UUID_SERVICE);
    fields.num_uuids16 = 1;
    fields.uuids16_is_complete = 1;

    int rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "adv fields failed rc=%d", rc);
        return;
    }

    struct ble_gap_adv_params params = {};
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    params.itvl_min = BLE_GAP_ADV_ITVL_MS(100);
    params.itvl_max = BLE_GAP_ADV_ITVL_MS(150);

    rc = ble_gap_adv_start(g_own_addr_type, nullptr, BLE_HS_FOREVER, &params, gap_event, nullptr);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGE(TAG, "advertising failed rc=%d", rc);
        return;
    }
    ESP_LOGI(TAG, "MEL Link V2 advertising");
}

static int gap_event(struct ble_gap_event *event, void *arg) {
    (void)arg;
    switch (event->type) {
        case BLE_GAP_EVENT_CONNECT:
            if (event->connect.status == 0) {
                g_conn = event->connect.conn_handle;
                g_ready.store(false);
                g_link_encrypted.store(false);
                g_event_subscribed = false;
                g_mtu = ble_att_mtu(g_conn);
                ESP_LOGI(TAG, "Android connected conn=%u mtu=%u", g_conn, g_mtu);
            } else {
                g_conn = BLE_HS_CONN_HANDLE_NONE;
                start_advertising();
            }
            return 0;

        case BLE_GAP_EVENT_DISCONNECT: {
            ESP_LOGW(TAG, "Android disconnected reason=%d", event->disconnect.reason);
            g_conn = BLE_HS_CONN_HANDLE_NONE;
            g_mtu = 23;
            g_link_encrypted.store(false);
            g_event_subscribed = false;
            const bool was_ready = g_ready.exchange(false);
            if (g_state_cb && was_ready) g_state_cb(false, g_state_ctx);
            start_advertising();
            return 0;
        }

        case BLE_GAP_EVENT_SUBSCRIBE:
            if (event->subscribe.attr_handle == g_event_handle) {
                g_event_subscribed = event->subscribe.cur_notify || event->subscribe.cur_indicate;
                const bool now_ready = g_event_subscribed && g_link_encrypted.load();
                const bool was_ready = g_ready.exchange(now_ready);
                ESP_LOGI(TAG, "event subscription notify=%d indicate=%d ready=%d",
                         event->subscribe.cur_notify, event->subscribe.cur_indicate,
                         now_ready ? 1 : 0);
                if (g_state_cb && was_ready != now_ready) g_state_cb(now_ready, g_state_ctx);
            }
            return 0;

        case BLE_GAP_EVENT_ENC_CHANGE: {
            if (event->enc_change.conn_handle != g_conn) return 0;
            struct ble_gap_conn_desc desc = {};
            const bool encrypted = event->enc_change.status == 0 &&
                ble_gap_conn_find(g_conn, &desc) == 0 && desc.sec_state.encrypted;
            g_link_encrypted.store(encrypted);
            const bool now_ready = encrypted && g_event_subscribed;
            const bool was_ready = g_ready.exchange(now_ready);
            ESP_LOGI(TAG, "Link V2 BLE encrypted=%d", encrypted ? 1 : 0);
            if (g_state_cb && was_ready != now_ready) g_state_cb(now_ready, g_state_ctx);
            return 0;
        }

        case BLE_GAP_EVENT_MTU:
            if (event->mtu.conn_handle == g_conn) {
                g_mtu = event->mtu.value;
                ESP_LOGI(TAG, "MTU=%u", g_mtu);
            }
            return 0;

        case BLE_GAP_EVENT_NOTIFY_TX:
            if (event->notify_tx.conn_handle == g_conn && event->notify_tx.attr_handle == g_event_handle) {
                if (event->notify_tx.indication) {
                    const bool indication_ack = event->notify_tx.status == BLE_HS_EDONE;
                    g_tx_failed.store(event->notify_tx.status != 0 && !indication_ack);
                    if (g_tx_done) xSemaphoreGive(g_tx_done);
                } else if (event->notify_tx.status != 0) {
                    ESP_LOGW(TAG, "notification tx status=%d", event->notify_tx.status);
                }
            }
            return 0;

        case BLE_GAP_EVENT_ADV_COMPLETE:
            if (g_conn == BLE_HS_CONN_HANDLE_NONE) start_advertising();
            return 0;

        default:
            return 0;
    }
}

static void on_reset(int reason) {
    ESP_LOGW(TAG, "NimBLE reset reason=%d", reason);
    g_conn = BLE_HS_CONN_HANDLE_NONE;
    g_mtu = 23;
    g_event_subscribed = false;
    g_link_encrypted.store(false);
    g_ready.store(false);
    if (g_state_cb) g_state_cb(false, g_state_ctx);
}

static void on_sync() {
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "No BLE identity rc=%d", rc);
        return;
    }
    rc = ble_hs_id_infer_auto(0, &g_own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "Address type failed rc=%d", rc);
        return;
    }
    start_advertising();
}

static void host_task(void *arg) {
    (void)arg;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

esp_err_t mel_link_v2_server_start(void) {
    bool expected = false;
    if (!g_started.compare_exchange_strong(expected, true)) return ESP_OK;

    g_tx_mutex = xSemaphoreCreateMutex();
    g_tx_done = xSemaphoreCreateBinary();
    if (!g_tx_mutex || !g_tx_done) {
        g_started.store(false);
        return ESP_ERR_NO_MEM;
    }

    esp_err_t err = nimble_port_init();
    if (err != ESP_OK) {
        g_started.store(false);
        return err;
    }

    ble_svc_gap_init();
    ble_svc_gatt_init();
#if CONFIG_BT_NIMBLE_GAP_SERVICE
    ble_svc_gap_device_name_set("MEL MINI");
#endif

    int rc = ble_gatts_count_cfg(g_services);
    if (rc == 0) rc = ble_gatts_add_svcs(g_services);
    if (rc != 0) {
        ESP_LOGE(TAG, "GATT service init failed rc=%d", rc);
        g_started.store(false);
        return ESP_FAIL;
    }

    // Require bonded BLE encryption for all Android -> MINI writes. Just Works
    // pairing protects confidentiality but is not an authenticated MITM proof.
    ble_hs_cfg.sm_bonding = 1;
    ble_hs_cfg.sm_sc = 1;
    ble_hs_cfg.sm_our_key_dist |= BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
    ble_hs_cfg.sm_their_key_dist |= BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
    ble_hs_cfg.reset_cb = on_reset;
    ble_hs_cfg.sync_cb = on_sync;
    ble_att_set_preferred_mtu(MEL_LINK_V2_DEFAULT_MTU);
    nimble_port_freertos_init(host_task);
    return ESP_OK;
}

bool mel_link_v2_server_ready(void) {
    return g_ready.load() && g_link_encrypted.load() &&
        g_conn != BLE_HS_CONN_HANDLE_NONE && g_event_subscribed;
}

uint16_t mel_link_v2_server_mtu(void) {
    return g_mtu;
}

void mel_link_v2_server_set_rx_callback(mel_link_v2_rx_cb cb, void *ctx) {
    g_rx_cb = cb;
    g_rx_ctx = ctx;
}

void mel_link_v2_server_set_state_callback(mel_link_v2_state_cb cb, void *ctx) {
    g_state_cb = cb;
    g_state_ctx = ctx;
}

static esp_err_t send_frame(const uint8_t *frame, size_t len, bool indicate) {
    if (!mel_link_v2_server_ready() || !frame || !frame_header_valid(frame, len)) {
        return ESP_ERR_INVALID_STATE;
    }
    const size_t max_value = g_mtu > 3 ? g_mtu - 3 : 20;
    if (len > max_value) return ESP_ERR_INVALID_SIZE;

    if (!g_tx_mutex || !g_tx_done) return ESP_ERR_INVALID_STATE;
    if (xSemaphoreTake(g_tx_mutex, pdMS_TO_TICKS(5000)) != pdTRUE) return ESP_ERR_TIMEOUT;

    while (xSemaphoreTake(g_tx_done, 0) == pdTRUE) {}
    g_tx_failed.store(false);

    struct os_mbuf *om = ble_hs_mbuf_from_flat(frame, len);
    if (!om) {
        xSemaphoreGive(g_tx_mutex);
        return ESP_ERR_NO_MEM;
    }

    const int rc = indicate
        ? ble_gatts_indicate_custom(g_conn, g_event_handle, om)
        : ble_gatts_notify_custom(g_conn, g_event_handle, om);
    if (rc != 0) {
        xSemaphoreGive(g_tx_mutex);
        return ESP_FAIL;
    }

    if (!indicate) {
        // Notifications are already flow-controlled by Link V2 CREDIT frames.
        // Do not serialize every packet on BLE_GAP_EVENT_NOTIFY_TX: that made
        // multi-second STT uploads stall for seconds per ADPCM block.
        xSemaphoreGive(g_tx_mutex);
        return ESP_OK;
    }

    const bool completed = xSemaphoreTake(g_tx_done, pdMS_TO_TICKS(5000)) == pdTRUE;
    const bool failed = g_tx_failed.load();
    xSemaphoreGive(g_tx_mutex);
    if (!completed) return ESP_ERR_TIMEOUT;
    return failed ? ESP_FAIL : ESP_OK;
}

esp_err_t mel_link_v2_server_notify(const uint8_t *frame, size_t len) {
    return send_frame(frame, len, false);
}

esp_err_t mel_link_v2_server_indicate(const uint8_t *frame, size_t len) {
    return send_frame(frame, len, true);
}
