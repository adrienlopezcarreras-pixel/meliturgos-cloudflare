#include "mel_ble_bridge.h"
#include "mel_terminal.h"

#include <cstring>
#include <cstdio>

#include "esp_log.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "os/os_mbuf.h"

static const char *TAG = "mel_ble";
static uint8_t g_addr_type = 0;
static uint16_t g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t g_status_handle = 0;

static const ble_uuid128_t SERVICE_UUID =
    BLE_UUID128_INIT(0x47,0x44,0x49,0x52,0x42,0x2d,0x49,0x4e,0x49,0x4c,0x65,0x6d,0x01,0x00,0x4b,0x7d);
static const ble_uuid128_t STATUS_UUID =
    BLE_UUID128_INIT(0x47,0x44,0x49,0x52,0x42,0x2d,0x49,0x4e,0x49,0x4c,0x65,0x6d,0x02,0x00,0x4b,0x7d);
static const ble_uuid128_t COMMAND_UUID =
    BLE_UUID128_INIT(0x47,0x44,0x49,0x52,0x42,0x2d,0x49,0x4e,0x49,0x4c,0x65,0x6d,0x03,0x00,0x4b,0x7d);

static void status_json(char *out, size_t out_size) {
    snprintf(
        out,
        out_size,
        "{\"v\":1,\"online\":%s,\"state\":%d}",
        mel_terminal_online() ? "true" : "false",
        mel_terminal_state()
    );
}

static int gatt_access(
    uint16_t,
    uint16_t attr_handle,
    struct ble_gatt_access_ctxt *ctxt,
    void *
) {
    if (attr_handle == g_status_handle && ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        char status[96] = {};
        status_json(status, sizeof(status));
        return os_mbuf_append(ctxt->om, status, strlen(status)) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

    if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        char command[48] = {};
        const int len = OS_MBUF_PKTLEN(ctxt->om);
        const int copy_len = len < (int)sizeof(command) - 1 ? len : (int)sizeof(command) - 1;
        if (ble_hs_mbuf_to_flat(ctxt->om, command, copy_len, nullptr) != 0) {
            return BLE_ATT_ERR_UNLIKELY;
        }
        command[copy_len] = '\0';

        if (!strcmp(command, "voice")) {
            mel_terminal_request_voice();
        } else if (!strcmp(command, "ping") || !strcmp(command, "status")) {
            mel_ble_bridge_notify_status();
        } else {
            ESP_LOGW(TAG, "Unknown BLE command: %s", command);
            return BLE_ATT_ERR_REQ_NOT_SUPPORTED;
        }
        return 0;
    }

    return BLE_ATT_ERR_UNLIKELY;
}

static const struct ble_gatt_chr_def GATT_CHARACTERISTICS[] = {
    {
        .uuid = &STATUS_UUID.u,
        .access_cb = gatt_access,
        .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
        .val_handle = &g_status_handle,
    },
    {
        .uuid = &COMMAND_UUID.u,
        .access_cb = gatt_access,
        .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
    },
    {0}
};

static const struct ble_gatt_svc_def GATT_SERVICES[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &SERVICE_UUID.u,
        .characteristics = GATT_CHARACTERISTICS,
    },
    {0}
};

static void advertise();

static int gap_event(struct ble_gap_event *event, void *) {
    switch (event->type) {
        case BLE_GAP_EVENT_CONNECT:
            if (event->connect.status == 0) {
                g_conn_handle = event->connect.conn_handle;
                ESP_LOGI(TAG, "Android connected handle=%u", g_conn_handle);
            } else {
                advertise();
            }
            return 0;
        case BLE_GAP_EVENT_DISCONNECT:
            ESP_LOGI(TAG, "Android disconnected reason=%d", event->disconnect.reason);
            g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            advertise();
            return 0;
        case BLE_GAP_EVENT_SUBSCRIBE:
            if (event->subscribe.attr_handle == g_status_handle) {
                mel_ble_bridge_notify_status();
            }
            return 0;
        case BLE_GAP_EVENT_MTU:
            ESP_LOGI(TAG, "MTU updated=%u", event->mtu.value);
            return 0;
        default:
            return 0;
    }
}

static void advertise() {
    struct ble_hs_adv_fields fields = {};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.name = (uint8_t *)"MEL-MINI";
    fields.name_len = strlen("MEL-MINI");
    fields.name_is_complete = 1;
    fields.uuids128 = const_cast<ble_uuid128_t *>(&SERVICE_UUID);
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;
    int rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "adv fields rc=%d", rc);
        return;
    }

    struct ble_gap_adv_params params = {};
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    rc = ble_gap_adv_start(g_addr_type, nullptr, BLE_HS_FOREVER, &params, gap_event, nullptr);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGE(TAG, "adv start rc=%d", rc);
    }
}

static void on_sync() {
    if (ble_hs_util_ensure_addr(0) != 0 || ble_hs_id_infer_auto(0, &g_addr_type) != 0) {
        ESP_LOGE(TAG, "BLE address unavailable");
        return;
    }
    advertise();
}

static void on_reset(int reason) {
    ESP_LOGW(TAG, "BLE reset reason=%d", reason);
}

static void host_task(void *) {
    ESP_LOGI(TAG, "BLE host started");
    nimble_port_run();
    nimble_port_freertos_deinit();
}

bool mel_ble_bridge_start(void) {
    esp_err_t err = nimble_port_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nimble_port_init: %s", esp_err_to_name(err));
        return false;
    }

    ble_hs_cfg.reset_cb = on_reset;
    ble_hs_cfg.sync_cb = on_sync;
    ble_hs_cfg.sm_io_cap = BLE_HS_IO_NO_INPUT_OUTPUT;
    ble_hs_cfg.sm_bonding = 1;
    ble_hs_cfg.sm_mitm = 0;
    ble_hs_cfg.sm_sc = 1;

    ble_svc_gap_init();
    ble_svc_gatt_init();
    if (ble_svc_gap_device_name_set("MEL-MINI") != 0) return false;
    if (ble_gatts_count_cfg(GATT_SERVICES) != 0) return false;
    if (ble_gatts_add_svcs(GATT_SERVICES) != 0) return false;

    nimble_port_freertos_init(host_task);
    ESP_LOGI(TAG, "MEL MINI BLE bridge ready");
    return true;
}

bool mel_ble_bridge_connected(void) {
    return g_conn_handle != BLE_HS_CONN_HANDLE_NONE;
}

void mel_ble_bridge_notify_status(void) {
    if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE || g_status_handle == 0) return;
    char status[96] = {};
    status_json(status, sizeof(status));
    struct os_mbuf *om = ble_hs_mbuf_from_flat(status, strlen(status));
    if (om) {
        ble_gatts_notify_custom(g_conn_handle, g_status_handle, om);
    }
}
