#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <algorithm>

#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_io_expander_tca9554.h"
#include "esp_lvgl_port.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include "esp_event.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "nvs.h"
#include <time.h>
#include "lvgl.h"

#include "esp_3inch5_lcd_port.h"
#include "esp_axp2101_port.h"
#include "esp_es8311_port.h"
#include "esp_camera_port.h"
#include "esp_camera.h"
#include "esp_codec_dev.h"
#include "mel_terminal.h"
#include "mel_mobile_bridge.h"
#include "mel_avatar_mode_complet.h"
#include "mini_visual.h"

extern esp_codec_dev_handle_t input_dev;
extern esp_codec_dev_handle_t output_dev;

void mini_media_wifi_release(void);


#define MINI_LCD_H_RES 320
#define MINI_LCD_V_RES 480
#define LCD_BUFFER_SIZE (MINI_LCD_H_RES * MINI_LCD_V_RES / 16)
#define PIN_I2C_SDA GPIO_NUM_8
#define PIN_I2C_SCL GPIO_NUM_7
#define DISPLAY_ROTATION 0
#define I2C_PORT_NUM 0

static const char *TAG = "mini_hw_smoke";
static i2c_master_bus_handle_t i2c_bus_handle = nullptr;
static esp_lcd_panel_io_handle_t io_handle = nullptr;
static esp_lcd_panel_handle_t panel_handle = nullptr;
static esp_io_expander_handle_t expander_handle = nullptr;
static esp_lcd_touch_handle_t touch_handle = nullptr;
static lv_display_t *lvgl_disp = nullptr;
static lv_obj_t *status_label = nullptr;
static lv_obj_t *runtime_status_label = nullptr;
static lv_obj_t *time_label = nullptr;
static lv_obj_t *answer_label = nullptr;
static lv_obj_t *response_panel = nullptr;
static lv_obj_t *response_text_box = nullptr;
static lv_obj_t *response_media_frame = nullptr;
static lv_obj_t *response_image_obj = nullptr;
static lv_obj_t *response_media_hint = nullptr;
static lv_obj_t *face_obj = nullptr;
static lv_obj_t *avatar_obj = nullptr;
static uint8_t *visual_pixels = nullptr;
static lv_img_dsc_t visual_image = {};
static bool visual_active = false;
static lv_obj_t *left_eye = nullptr;
static lv_obj_t *right_eye = nullptr;
static lv_obj_t *talk_button = nullptr;
static lv_obj_t *talk_touch_zone = nullptr;
static lv_obj_t *mouth_obj = nullptr;
static lv_timer_t *anim_timer = nullptr;
static bool listening = false;
static bool audio_ok = false;
static bool camera_ok = false;
static bool mel_runtime_started = false;
static bool clock_sync_started = false;

#define MINI_WIFI_MAX_AP 12
static lv_obj_t *wifi_panel = nullptr;
static lv_obj_t *wifi_list = nullptr;
static lv_obj_t *wifi_status = nullptr;
static lv_obj_t *wifi_ssid_input = nullptr;
static lv_obj_t *wifi_pwd = nullptr;
static lv_obj_t *wifi_keyboard = nullptr;
static lv_obj_t *wifi_connect_btn = nullptr;
static lv_obj_t *main_panel = nullptr;
static lv_obj_t *transport_indicator = nullptr;
static lv_obj_t *settings_panel = nullptr;
static volatile bool camera_probe_done = false;
static lv_obj_t *settings_status = nullptr;
static lv_obj_t *settings_voice_btn_label = nullptr;
static lv_obj_t *pair_panel = nullptr;
static lv_obj_t *pair_button = nullptr;
static volatile bool stress_pair_click_requested = false;
static lv_obj_t *pair_input = nullptr;
static lv_obj_t *pair_keyboard = nullptr;
static lv_obj_t *pair_status = nullptr;
static char wifi_ssids[MINI_WIFI_MAX_AP][33] = {};
static char selected_ssid[33] = {};
static bool wifi_manual_mode = false;
static TaskHandle_t wifi_scan_task_handle = nullptr;
static TaskHandle_t wifi_connect_task_handle = nullptr;
static volatile bool wifi_got_ip = false;
static volatile int wifi_disconnect_reason = -1;
static volatile bool wifi_auto_reconnect_enabled = false;
static volatile bool media_wifi_active = false;
static wifi_config_t media_wifi_previous_cfg = {};
static bool media_wifi_previous_cfg_valid = false;
static bool media_wifi_previous_connected = false;
static bool media_wifi_previous_auto_reconnect = false;
static volatile int wifi_reconnect_attempt = 0;
static TaskHandle_t wifi_reconnect_task_handle = nullptr;
static TaskHandle_t wifi_fallback_task_handle = nullptr;
static TaskHandle_t settings_audio_test_task_handle = nullptr;
static TaskHandle_t settings_camera_test_task_handle = nullptr;
static SemaphoreHandle_t camera_test_mutex = nullptr;
static lv_obj_t *settings_camera_preview = nullptr;
static uint8_t *settings_camera_preview_buf = nullptr;
static lv_img_dsc_t settings_camera_preview_img = {};

enum MiniView {
    MINI_VIEW_MAIN = 0,
    MINI_VIEW_WIFI_LIST = 1,
    MINI_VIEW_WIFI_PASSWORD = 2,
    MINI_VIEW_WIFI_MANUAL = 3,
    MINI_VIEW_PAIR = 4,
    MINI_VIEW_SETTINGS = 5,
    MINI_VIEW_RESPONSE = 6,
};

static volatile int requested_view = MINI_VIEW_MAIN;
static volatile int active_view = MINI_VIEW_MAIN;
static volatile bool wifi_scan_requested = false;
static int last_face_state = -1;
static bool last_blink = false;
static bool last_online = false;
#define MINI_UI_STRESS_TEST 0

static void request_view(MiniView view);
static void mini_apply_requested_view(void);
static void wifi_start_scan(void);
static void web_card_touch_cb(lv_event_t *e);
static void wifi_fallback_after_ble_task(void *);
static void ui_stress_task(void *);

static void microphone_boot_probe_task(void *) {
    // Capture a short raw sample after boot to prove the microphone path
    // returns real PCM data, not merely that the ES8311 codec initialized.
    vTaskDelay(pdMS_TO_TICKS(6500));
    if (!audio_ok || !input_dev) {
        ESP_LOGE(TAG, "SELFTEST MICRO FAIL: input codec unavailable");
        vTaskDelete(nullptr);
        return;
    }

    constexpr size_t sample_count = 24000; // 0.5 s at 48 kHz, mono, 16-bit
    constexpr size_t byte_count = sample_count * sizeof(int16_t);
    auto *pcm = static_cast<int16_t *>(malloc(byte_count));
    if (!pcm) {
        ESP_LOGE(TAG, "SELFTEST MICRO FAIL: allocation");
        vTaskDelete(nullptr);
        return;
    }

    esp_codec_dev_set_in_gain(input_dev, 38.0);
    int rc = esp_codec_dev_read(input_dev, pcm, byte_count);
    esp_codec_dev_set_in_gain(input_dev, 0.0);
    if (rc != ESP_CODEC_DEV_OK) {
        ESP_LOGE(TAG, "SELFTEST MICRO FAIL: read rc=%d", rc);
        free(pcm);
        vTaskDelete(nullptr);
        return;
    }

    int16_t min_sample = 32767;
    int16_t max_sample = -32768;
    uint64_t abs_sum = 0;
    size_t transitions = 0;
    int16_t previous = pcm[0];
    for (size_t i = 0; i < sample_count; ++i) {
        const int16_t sample = pcm[i];
        if (sample < min_sample) min_sample = sample;
        if (sample > max_sample) max_sample = sample;
        int32_t magnitude = sample < 0 ? -(int32_t)sample : (int32_t)sample;
        abs_sum += (uint32_t)magnitude;
        if (i > 0 && sample != previous) ++transitions;
        previous = sample;
    }

    const int32_t span = (int32_t)max_sample - (int32_t)min_sample;
    const uint32_t mean_abs = (uint32_t)(abs_sum / sample_count);
    const bool varying_signal = span > 8 && transitions > (sample_count / 100);
    ESP_LOGI(TAG,
             "SELFTEST MICRO CAPTURE PASS: samples=%u min=%d max=%d span=%ld mean_abs=%u transitions=%u signal=%s",
             (unsigned)sample_count, (int)min_sample, (int)max_sample, (long)span,
             (unsigned)mean_abs, (unsigned)transitions, varying_signal ? "YES" : "FLAT");
    free(pcm);
    vTaskDelete(nullptr);
}

static bool camera_probe_once(const char *phase) {
    sensor_t *existing = esp_camera_sensor_get();
    if (existing && (existing->id.PID == OV5640_PID || existing->id.PID == OV2640_PID)) {
        camera_ok = true;
        ESP_LOGI(TAG, "SELFTEST CAMERA %s: already initialized PID=0x%04x", phase, existing->id.PID);
        return true;
    }

    ESP_LOGI(TAG, "SELFTEST CAMERA %s: Waveshare DVP init on shared I2C%d", phase, I2C_PORT_NUM);
    esp_camera_port_init((i2c_port_num_t)I2C_PORT_NUM);
    sensor_t *sensor = esp_camera_sensor_get();
    camera_ok = sensor && (sensor->id.PID == OV5640_PID || sensor->id.PID == OV2640_PID);

    if (camera_ok) {
        const char *model = sensor->id.PID == OV5640_PID ? "OV5640" : "OV2640";

        // SAFE BOOT: do not touch optional image-processing registers here.
        // The 0.4.29 low-light tuning ran synchronously before LVGL and could
        // strand boot on real hardware. Camera quality tuning must happen only
        // after the UI/runtime is alive, never in the boot-critical path.
        ESP_LOGI(TAG, "SELFTEST CAMERA SENSOR PASS: %s PID=0x%04x (safe defaults)",
                 model, sensor->id.PID);
        return true;
    }

    if (sensor) {
        ESP_LOGW(TAG, "SELFTEST CAMERA: unsupported DVP sensor PID=0x%04x", sensor->id.PID);
    } else {
        // OV5640 normally answers SCCB at 0x3c; OV2640 commonly uses 0x30.
        // Probe both addresses after the driver attempt so serial diagnostics
        // distinguish a software-driver failure from an absent/unpowered module.
        esp_err_t p3c = i2c_master_probe(i2c_bus_handle, 0x3c, 100);
        esp_err_t p30 = i2c_master_probe(i2c_bus_handle, 0x30, 100);
        ESP_LOGW(TAG, "SELFTEST CAMERA: no OV sensor; SCCB probe 0x3c=%s 0x30=%s",
                 esp_err_to_name(p3c), esp_err_to_name(p30));
    }
    return false;
}

static const char *wifi_reason_text(int reason) {
    switch (reason) {
        case WIFI_REASON_NO_AP_FOUND: return "reseau introuvable";
        case WIFI_REASON_AUTH_FAIL: return "authentification refusee";
        case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT: return "mot de passe / WPA";
        case WIFI_REASON_HANDSHAKE_TIMEOUT: return "mot de passe / WPA";
        case WIFI_REASON_BEACON_TIMEOUT: return "signal perdu";
        case WIFI_REASON_ASSOC_FAIL: return "association refusee";
        default: return "echec Wi-Fi";
    }
}

static void wifi_reconnect_task(void *) {
    int attempt = wifi_reconnect_attempt + 1;
    wifi_reconnect_attempt = attempt;
    int delay_ms = 1000 << (attempt > 4 ? 4 : attempt - 1);
    if (delay_ms > 15000) delay_ms = 15000;
    ESP_LOGW(TAG, "MINI WIFI RECONNECT attempt=%d in %d ms", attempt, delay_ms);
    vTaskDelay(pdMS_TO_TICKS(delay_ms));
    if (wifi_auto_reconnect_enabled && !wifi_got_ip) {
        esp_err_t err = esp_wifi_connect();
        ESP_LOGI(TAG, "MINI WIFI RECONNECT requested: %s", esp_err_to_name(err));
    }
    wifi_reconnect_task_handle = nullptr;
    vTaskDelete(nullptr);
}

static void clock_start_sync(void) {
    if (clock_sync_started) return;
    clock_sync_started = true;
    setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
    tzset();
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_setservername(1, "time.google.com");
    esp_sntp_init();
    ESP_LOGI(TAG, "Clock SNTP sync started");
}

static void clock_timer_cb(lv_timer_t *) {
    if (!time_label) return;
    time_t now = 0;
    time(&now);
    struct tm local_tm = {};
    localtime_r(&now, &local_tm);
    if (local_tm.tm_year + 1900 < 2024) {
        lv_label_set_text(time_label, "--:--");
        return;
    }
    char buf[8] = {};
    strftime(buf, sizeof(buf), "%H:%M", &local_tm);
    lv_label_set_text(time_label, buf);
}

static void mini_wifi_event_diag(void *, esp_event_base_t base, int32_t id, void *data) {
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_CONNECTED) {
        auto *ev = static_cast<wifi_event_sta_connected_t *>(data);
        if (ev) {
            ESP_LOGI(TAG, "MINI WIFI ASSOCIATED ssid=%.*s channel=%u authmode=%d",
                     ev->ssid_len, (char *)ev->ssid, ev->channel, ev->authmode);
        }
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        auto *ev = static_cast<wifi_event_sta_disconnected_t *>(data);
        wifi_got_ip = false;
        wifi_disconnect_reason = ev ? (int)ev->reason : -1;
        mel_terminal_set_wifi_connected(false);
        ESP_LOGW(TAG, "MINI WIFI DISCONNECTED reason=%d (%s)",
                 wifi_disconnect_reason, wifi_reason_text(wifi_disconnect_reason));
        if (!media_wifi_active && wifi_auto_reconnect_enabled && !wifi_reconnect_task_handle) {
            xTaskCreatePinnedToCore(wifi_reconnect_task, "mini_wifi_reconnect", 4096, nullptr, 3, &wifi_reconnect_task_handle, 0);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        wifi_got_ip = true;
        wifi_auto_reconnect_enabled = !media_wifi_active;
        wifi_reconnect_attempt = 0;
        wifi_disconnect_reason = -1;
        auto *ev = static_cast<ip_event_got_ip_t *>(data);
        if (ev) {
            char ip[32] = {};
            snprintf(ip, sizeof(ip), IPSTR, IP2STR(&ev->ip_info.ip));
            mel_terminal_set_network_info(ip);
            mel_terminal_set_wifi_connected(true);
            ESP_LOGI(TAG, "MINI WIFI GOT IP %s", ip);
            if (!media_wifi_active) {
                clock_start_sync();
                mel_terminal_start_online();
            } else {
                ESP_LOGI(TAG, "MINI MEDIA WIFI ready; Internet/session remain on MEL Mobile");
            }
        }
    }
}

bool mini_media_wifi_connect(
    const char *ssid,
    const char *password,
    char *gateway,
    size_t gateway_len
) {
    if (!ssid || !ssid[0] || !gateway || gateway_len < 8) return false;
    gateway[0] = '\0';
    media_wifi_previous_cfg = {};
    media_wifi_previous_cfg_valid =
        esp_wifi_get_config(WIFI_IF_STA, &media_wifi_previous_cfg) == ESP_OK &&
        media_wifi_previous_cfg.sta.ssid[0] != 0;
    media_wifi_previous_connected = wifi_got_ip;
    media_wifi_previous_auto_reconnect = wifi_auto_reconnect_enabled;
    media_wifi_active = true;
    wifi_auto_reconnect_enabled = false;
    wifi_reconnect_attempt = 0;

    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(120));

    wifi_config_t cfg = {};
    snprintf((char *)cfg.sta.ssid, sizeof(cfg.sta.ssid), "%s", ssid);
    snprintf((char *)cfg.sta.password, sizeof(cfg.sta.password), "%s", password ? password : "");
    cfg.sta.scan_method = WIFI_ALL_CHANNEL_SCAN;
    cfg.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;
    cfg.sta.threshold.rssi = -127;
    cfg.sta.threshold.authmode = WIFI_AUTH_OPEN;
    cfg.sta.pmf_cfg.capable = true;
    cfg.sta.pmf_cfg.required = false;

    if (esp_wifi_set_config(WIFI_IF_STA, &cfg) != ESP_OK ||
        esp_wifi_connect() != ESP_OK) {
        media_wifi_active = false;
        if (media_wifi_previous_cfg_valid) {
            esp_wifi_set_config(WIFI_IF_STA, &media_wifi_previous_cfg);
            wifi_auto_reconnect_enabled =
                media_wifi_previous_auto_reconnect || media_wifi_previous_connected;
            if (media_wifi_previous_connected) esp_wifi_connect();
        }
        return false;
    }

    esp_netif_t *sta = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    for (int i = 0; i < 120; ++i) {
        esp_netif_ip_info_t info = {};
        if (sta && esp_netif_get_ip_info(sta, &info) == ESP_OK &&
            info.ip.addr != 0 && info.gw.addr != 0) {
            snprintf(gateway, gateway_len, IPSTR, IP2STR(&info.gw));
            ESP_LOGI(TAG, "MINI MEDIA WIFI connected ssid=%s gateway=%s", ssid, gateway);
            return true;
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    ESP_LOGW(TAG, "MINI MEDIA WIFI timeout ssid=%s", ssid);
    mini_media_wifi_release();
    return false;
}

void mini_media_wifi_release(void) {
    if (!media_wifi_active) return;
    media_wifi_active = false;
    wifi_reconnect_attempt = 0;
    esp_wifi_disconnect();
    wifi_got_ip = false;
    mel_terminal_set_wifi_connected(false);

    const bool should_reconnect =
        media_wifi_previous_cfg_valid &&
        (media_wifi_previous_connected || media_wifi_previous_auto_reconnect);
    wifi_auto_reconnect_enabled = should_reconnect;
    if (media_wifi_previous_cfg_valid) {
        const esp_err_t cfg_err = esp_wifi_set_config(WIFI_IF_STA, &media_wifi_previous_cfg);
        const esp_err_t connect_err =
            (cfg_err == ESP_OK && should_reconnect) ? esp_wifi_connect() : ESP_OK;
        ESP_LOGI(TAG,
                 "MINI MEDIA WIFI restore cfg=%s reconnect=%s connect=%s",
                 esp_err_to_name(cfg_err),
                 should_reconnect ? "YES" : "NO",
                 esp_err_to_name(connect_err));
    } else {
        ESP_LOGI(TAG, "MINI MEDIA WIFI released; no previous STA config to restore");
    }

    media_wifi_previous_cfg = {};
    media_wifi_previous_cfg_valid = false;
    media_wifi_previous_connected = false;
    media_wifi_previous_auto_reconnect = false;
}

bool mini_ui_visual_active() {
    return visual_active;
}

bool mini_ui_response_page_active() {
    return active_view == MINI_VIEW_RESPONSE || requested_view == MINI_VIEW_RESPONSE;
}


static std::string mini_display_ascii(const char *text) {
    const std::string in = text ? text : "";
    std::string out;
    out.reserve(in.size());
    for (size_t i = 0; i < in.size();) {
        const unsigned char a = static_cast<unsigned char>(in[i]);
        if (a < 0x80) {
            if (a == '\n' || a == '\r' || a == '\t' || a >= 0x20) out.push_back(static_cast<char>(a));
            ++i;
            continue;
        }

        auto push = [&](char ch, size_t n) {
            out.push_back(ch);
            i += n;
        };

        if (i + 1 < in.size() && a == 0xC3) {
            const unsigned char b = static_cast<unsigned char>(in[i + 1]);
            switch (b) {
                case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85:
                case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: push((b < 0xA0) ? 'A' : 'a', 2); continue;
                case 0x87: case 0xA7: push((b == 0x87) ? 'C' : 'c', 2); continue;
                case 0x88: case 0x89: case 0x8A: case 0x8B:
                case 0xA8: case 0xA9: case 0xAA: case 0xAB: push((b < 0xA0) ? 'E' : 'e', 2); continue;
                case 0x8C: case 0x8D: case 0x8E: case 0x8F:
                case 0xAC: case 0xAD: case 0xAE: case 0xAF: push((b < 0xA0) ? 'I' : 'i', 2); continue;
                case 0x91: case 0xB1: push((b == 0x91) ? 'N' : 'n', 2); continue;
                case 0x92: case 0x93: case 0x94: case 0x95: case 0x96:
                case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: push((b < 0xA0) ? 'O' : 'o', 2); continue;
                case 0x99: case 0x9A: case 0x9B: case 0x9C:
                case 0xB9: case 0xBA: case 0xBB: case 0xBC: push((b < 0xA0) ? 'U' : 'u', 2); continue;
                case 0x9D: case 0xBD: case 0xBF: push((b == 0x9D) ? 'Y' : 'y', 2); continue;
                default: break;
            }
        }

        if (i + 2 < in.size() && a == 0xE2 && static_cast<unsigned char>(in[i + 1]) == 0x80) {
            const unsigned char b = static_cast<unsigned char>(in[i + 2]);
            if (b == 0x98 || b == 0x99) { push('\'', 3); continue; }
            if (b == 0x9C || b == 0x9D) { push('"', 3); continue; }
            if (b == 0x93 || b == 0x94) { push('-', 3); continue; }
            if (b == 0xA6) { out += "..."; i += 3; continue; }
        }

        if (i + 2 < in.size() && a == 0xE2 &&
            static_cast<unsigned char>(in[i + 1]) == 0x80 &&
            static_cast<unsigned char>(in[i + 2]) == 0xA2) {
            out += " - ";
            i += 3;
            continue;
        }

        if ((a & 0xE0) == 0xC0) i += std::min<size_t>(2, in.size() - i);
        else if ((a & 0xF0) == 0xE0) i += std::min<size_t>(3, in.size() - i);
        else if ((a & 0xF8) == 0xF0) i += std::min<size_t>(4, in.size() - i);
        else ++i;
    }
    return out;
}

void mini_ui_open_response_page(const char *text) {
    const std::string safe = mini_display_ascii(text);
    if (answer_label && lvgl_port_lock(1000)) {
        lv_label_set_text(answer_label, safe.c_str());
        if (!safe.empty()) lv_obj_clear_flag(answer_label, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(answer_label, LV_OBJ_FLAG_HIDDEN);
        lvgl_port_unlock();
    }
    request_view(MINI_VIEW_RESPONSE);
}

void mini_ui_close_response_page() {
    mini_ui_hide_visual();
    request_view(MINI_VIEW_MAIN);
}

void mini_ui_hide_visual() {
    uint8_t *old_pixels = nullptr;
    if (lvgl_port_lock(1000)) {
        if (visual_active) {
            if (response_image_obj) {
                lv_obj_add_flag(response_image_obj, LV_OBJ_FLAG_HIDDEN);
                lv_img_set_src(response_image_obj, nullptr);
            }
            if (response_media_hint) {
                lv_label_set_text(response_media_hint, "TEXTE / PHOTO / VIDEO");
                lv_obj_clear_flag(response_media_hint, LV_OBJ_FLAG_HIDDEN);
            }
            visual_active = false;
            old_pixels = visual_pixels;
            visual_pixels = nullptr;
            memset(&visual_image, 0, sizeof(visual_image));
        }
        lvgl_port_unlock();
    }
    if (old_pixels) heap_caps_free(old_pixels);
}

bool mini_ui_show_rgb565(const uint8_t *pixels, size_t bytes, uint16_t width, uint16_t height) {
    if (!pixels || !bytes || !response_image_obj || width == 0 || height == 0 || width > 320 || height > 320) return false;
    const size_t expected = (size_t)width * (size_t)height * 2u;
    if (bytes != expected) return false;

    auto *copy = static_cast<uint8_t *>(heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!copy) return false;
    memcpy(copy, pixels, bytes);

    uint8_t *old_pixels = nullptr;
    bool applied = false;
    if (lvgl_port_lock(1000)) {
        old_pixels = visual_pixels;
        visual_pixels = copy;
        memset(&visual_image, 0, sizeof(visual_image));
        visual_image.header.always_zero = 0;
        visual_image.header.w = width;
        visual_image.header.h = height;
        visual_image.header.cf = LV_IMG_CF_TRUE_COLOR;
        visual_image.data_size = bytes;
        visual_image.data = visual_pixels;
        lv_img_set_src(response_image_obj, &visual_image);
        const int zoom_w = (260 * 256) / std::max<int>(1, width);
        const int zoom_h = (190 * 256) / std::max<int>(1, height);
        lv_img_set_zoom(response_image_obj, std::min(256, std::min(zoom_w, zoom_h)));
        lv_obj_center(response_image_obj);
        lv_obj_clear_flag(response_image_obj, LV_OBJ_FLAG_HIDDEN);
        if (response_media_hint) lv_obj_add_flag(response_media_hint, LV_OBJ_FLAG_HIDDEN);
        visual_active = true;
        lv_obj_invalidate(response_image_obj);
        lvgl_port_unlock();
        applied = true;
    }
    if (!applied) {
        heap_caps_free(copy);
        return false;
    }
    if (old_pixels) heap_caps_free(old_pixels);
    request_view(MINI_VIEW_RESPONSE);
    return true;
}

static void visual_touch_cb(lv_event_t *event) {
    if (!visual_active) return;
    const lv_event_code_t code = lv_event_get_code(event);
    if (code == LV_EVENT_GESTURE) {
        lv_indev_t *indev = lv_indev_get_act();
        if (!indev) return;
        const lv_dir_t dir = lv_indev_get_gesture_dir(indev);
        if (dir == LV_DIR_LEFT) {
            mel_terminal_display_next();
            return;
        }
        if (dir == LV_DIR_RIGHT) {
            mel_terminal_display_previous();
            return;
        }
    }
    if (code == LV_EVENT_CLICKED) mini_ui_hide_visual();
}

static void mini_anim_cb(lv_timer_t *) {
    mini_apply_requested_view();

    if (stress_pair_click_requested && pair_button && active_view == MINI_VIEW_MAIN) {
        stress_pair_click_requested = false;
        ESP_LOGI(TAG, "UI STRESS: dispatch real MEL click event");
        lv_event_send(pair_button, LV_EVENT_CLICKED, nullptr);
    }

    if (active_view != MINI_VIEW_MAIN) return;
    if (!face_obj || !avatar_obj) return;

    const uint32_t now = lv_tick_get();
    const int state = mel_terminal_state();
    const bool online = mel_terminal_online();
    listening = state == MEL_TERMINAL_LISTENING;

    // Keep the portrait completely static. Moving the whole photo looked
    // artificial; future animation should use dedicated facial frames instead.
    if (avatar_obj && !visual_active) {
        lv_obj_set_x(avatar_obj, 0);
        lv_obj_set_y(avatar_obj, 0);
        lv_img_set_zoom(avatar_obj, 256);
    }

    if (talk_button) {
        const int level = mel_terminal_voice_level();
        const int ring = state == MEL_TERMINAL_LISTENING ? (3 + (level * 5) / 100) : 3;
        lv_obj_set_style_border_width(talk_button, ring, 0);
    }

    if (state != last_face_state && talk_button) {
        lv_color_t accent = lv_color_hex(0x22D3EE);
        if (state == MEL_TERMINAL_LISTENING) accent = lv_color_hex(0x34D399);
        else if (state == MEL_TERMINAL_TRANSCRIBING) accent = lv_color_hex(0xF59E0B);
        else if (state == MEL_TERMINAL_THINKING) accent = lv_color_hex(0xA78BFA);
        else if (state == MEL_TERMINAL_SPEAKING) accent = lv_color_hex(0x60A5FA);
        else if (state == MEL_TERMINAL_ERROR) accent = lv_color_hex(0xFB7185);
        lv_obj_set_style_border_color(talk_button, accent, 0);
    }

    if (transport_indicator) {
        if (mel_terminal_mobile_connected()) {
            lv_label_set_text(transport_indicator, "BT");
            lv_obj_set_style_text_color(transport_indicator, lv_color_hex(0x22D3EE), 0);
        } else if (wifi_got_ip) {
            lv_label_set_text(transport_indicator, LV_SYMBOL_WIFI);
            lv_obj_set_style_text_color(transport_indicator, lv_color_hex(0x34D399), 0);
        } else {
            lv_label_set_text(transport_indicator, "--");
            lv_obj_set_style_text_color(transport_indicator, lv_color_hex(0x64748B), 0);
        }
    }

    if (talk_button) {
        // Never disable the physical talk target. Busy/offline states are
        // reported explicitly by the callback instead of making the UI dead.
        lv_obj_clear_state(talk_button, LV_STATE_DISABLED);
    }

    if (state == MEL_TERMINAL_LISTENING) {
        if (state != last_face_state && status_label) lv_label_set_text(status_label, "STOP");
    } else if (state == MEL_TERMINAL_TRANSCRIBING) {
        if (state != last_face_state && status_label) lv_label_set_text(status_label, "TRANSCRIPTION");
    } else if (state == MEL_TERMINAL_THINKING) {
        if (state != last_face_state && status_label) lv_label_set_text(status_label, "REFLEXION");
    } else if (state == MEL_TERMINAL_SPEAKING) {
        if (state != last_face_state && status_label) lv_label_set_text(status_label, "MEL PARLE");
    } else if (state == MEL_TERMINAL_ERROR) {
        if (state != last_face_state && status_label) {
            const char *voice_error = mel_terminal_last_voice_error();
            lv_label_set_text(
                status_label,
                (voice_error && voice_error[0]) ? voice_error : "ERREUR"
            );
        }
    } else {
        // Connectivity is asynchronous: BLE can become ready and MEL can later
        // return a concrete HTTP/session result without changing the face state.
        // Refresh this label every UI tick so diagnostics never remain stuck on
        // the initial "HORS LIGNE" text.
        if (status_label) {
            if (online) {
                lv_label_set_text(status_label, "PARLER");
            } else if (mel_terminal_mobile_connected()) {
                const int s = mel_terminal_last_session_status();
                if (s == 401 || s == 403) lv_label_set_text(status_label, "APP MEL A REAPPAIRER");
                else if (s == -1) lv_label_set_text(status_label, "BT OK | RELAIS MEL KO");
                else if (s == -2) lv_label_set_text(status_label, "BT OK | TOKEN INVALIDE");
                else if (s > 0) lv_label_set_text_fmt(status_label, "BT OK | MEL HTTP %d", s);
                else lv_label_set_text(status_label, "BT OK | VALIDATION MEL...");
            } else {
                lv_label_set_text(status_label, "HORS LIGNE");
            }
        }
    }

    last_face_state = state;
    last_online = online;
}

static void mini_wifi_get_ip(char *ip, size_t ip_len) {
    if (!ip || ip_len == 0) return;
    ip[0] = '\0';
    esp_netif_t *sta = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (!sta) return;
    esp_netif_ip_info_t info = {};
    if (esp_netif_get_ip_info(sta, &info) != ESP_OK) return;
    snprintf(ip, ip_len, IPSTR, IP2STR(&info.ip));
}

static esp_err_t mini_wifi_stack_init() {
    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) return err;

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) return err;

    esp_netif_t *sta = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (!sta) sta = esp_netif_create_default_wifi_sta();
    if (!sta) return ESP_FAIL;

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&init);
    if (err != ESP_OK) return err;

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_CONNECTED, &mini_wifi_event_diag, nullptr));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, &mini_wifi_event_diag, nullptr));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &mini_wifi_event_diag, nullptr));

    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_set_country_code("FR", false));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    esp_err_t ps = esp_wifi_set_ps(WIFI_PS_NONE);
    if (ps != ESP_OK) ESP_LOGW(TAG, "Wi-Fi power-save disable warning: %s", esp_err_to_name(ps));
    return esp_wifi_start();
}

static esp_err_t mini_wifi_sta_connect(const char *ssid, const char *password) {
    if (!ssid || !ssid[0]) return ESP_ERR_INVALID_ARG;

    // Own the station state machine end-to-end. Do not let the Waveshare sample
    // helper race MEL Mobile with an implicit connect attempt.
    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(80));

    wifi_config_t cfg = {};
    snprintf((char *)cfg.sta.ssid, sizeof(cfg.sta.ssid), "%s", ssid);
    snprintf((char *)cfg.sta.password, sizeof(cfg.sta.password), "%s", password ? password : "");
    cfg.sta.scan_method = WIFI_ALL_CHANNEL_SCAN;
    cfg.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;
    cfg.sta.threshold.rssi = -127;
    cfg.sta.threshold.authmode = WIFI_AUTH_OPEN;
    cfg.sta.pmf_cfg.capable = true;
    cfg.sta.pmf_cfg.required = false;

    esp_err_t err = esp_wifi_set_config(WIFI_IF_STA, &cfg);
    if (err != ESP_OK) return err;
    return esp_wifi_connect();
}

static bool wifi_load_credentials(char *ssid, size_t ssid_len, char *pwd, size_t pwd_len) {
    nvs_handle_t h;
    if (nvs_open("mini_wifi", NVS_READONLY, &h) == ESP_OK) {
        size_t sl = ssid_len;
        size_t pl = pwd_len;
        esp_err_t a = nvs_get_str(h, "ssid", ssid, &sl);
        esp_err_t b = nvs_get_str(h, "pwd", pwd, &pl);
        nvs_close(h);
        if (a == ESP_OK && b == ESP_OK && ssid[0] != '\0') return true;
    }

    // Compatibility with older MINI builds which persisted the same credentials
    // in the "mel" namespace only. This lets safe-boot upgrades keep the user's
    // network without forcing a fresh Wi-Fi setup.
    ssid[0] = '\0';
    pwd[0] = '\0';
    if (nvs_open("mel", NVS_READONLY, &h) != ESP_OK) return false;
    size_t sl = ssid_len;
    size_t pl = pwd_len;
    esp_err_t a = nvs_get_str(h, "ssid", ssid, &sl);
    esp_err_t b = nvs_get_str(h, "wifi_pass", pwd, &pl);
    nvs_close(h);
    if (a == ESP_OK && b == ESP_OK && ssid[0] != '\0') {
        ESP_LOGI(TAG, "Recovered saved Wi-Fi credentials from legacy MEL NVS");
        return true;
    }
    return false;
}

static void wifi_save_credentials(const char *ssid, const char *pwd) {
    nvs_handle_t h;
    if (nvs_open("mini_wifi", NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_str(h, "ssid", ssid ? ssid : "");
    nvs_set_str(h, "pwd", pwd ? pwd : "");
    nvs_commit(h);
    nvs_close(h);
}


static void save_mel_wifi_credentials(const char *ssid, const char *pwd) {
    nvs_handle_t h;
    if (nvs_open("mel", NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_str(h, "ssid", ssid ? ssid : "");
    nvs_set_str(h, "wifi_pass", pwd ? pwd : "");
    nvs_commit(h);
    nvs_close(h);
}

static void request_view(MiniView view) {
    requested_view = (int)view;
}

static void mini_apply_requested_view(void) {
    const int next = requested_view;
    if (next == active_view) {
        if (wifi_scan_requested && active_view == MINI_VIEW_WIFI_LIST) {
            wifi_scan_requested = false;
            wifi_start_scan();
        }
        return;
    }

    active_view = next;
    ESP_LOGI(TAG, "UI VIEW -> %d", active_view);

    if (main_panel) lv_obj_add_flag(main_panel, LV_OBJ_FLAG_HIDDEN);
    if (wifi_panel) lv_obj_add_flag(wifi_panel, LV_OBJ_FLAG_HIDDEN);
    if (pair_panel) lv_obj_add_flag(pair_panel, LV_OBJ_FLAG_HIDDEN);
    if (settings_panel) lv_obj_add_flag(settings_panel, LV_OBJ_FLAG_HIDDEN);
    if (response_panel) lv_obj_add_flag(response_panel, LV_OBJ_FLAG_HIDDEN);
    if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
    if (pair_keyboard) lv_obj_add_flag(pair_keyboard, LV_OBJ_FLAG_HIDDEN);

    if (active_view == MINI_VIEW_MAIN) {
        if (main_panel) lv_obj_clear_flag(main_panel, LV_OBJ_FLAG_HIDDEN);
        return;
    }

    if (active_view == MINI_VIEW_RESPONSE) {
        if (response_panel) lv_obj_clear_flag(response_panel, LV_OBJ_FLAG_HIDDEN);
        return;
    }

    if (active_view == MINI_VIEW_SETTINGS) {
        if (settings_panel) lv_obj_clear_flag(settings_panel, LV_OBJ_FLAG_HIDDEN);
        if (settings_status) {
            char ip[32] = {};
            mini_wifi_get_ip(ip, sizeof(ip));
            lv_label_set_text_fmt(settings_status, "Wi-Fi: %s\nMobile: %s\nMEL: %s",
                                  wifi_got_ip ? (ip[0] ? ip : "OK") : "OFF",
                                  mel_terminal_mobile_connected() ? "CONNECTE" : "OFF",
                                  mel_terminal_online() ? "EN LIGNE" : "HORS LIGNE");
        }
        return;
    }

    if (active_view == MINI_VIEW_PAIR) {
        if (pair_panel) lv_obj_clear_flag(pair_panel, LV_OBJ_FLAG_HIDDEN);
        if (pair_keyboard) lv_obj_clear_flag(pair_keyboard, LV_OBJ_FLAG_HIDDEN);
        if (pair_input && pair_keyboard) lv_keyboard_set_textarea(pair_keyboard, pair_input);
        if (pair_status) lv_label_set_text(pair_status, "Entre le code genere dans MEL > MINI");
        return;
    }

    if (wifi_panel) lv_obj_clear_flag(wifi_panel, LV_OBJ_FLAG_HIDDEN);

    if (active_view == MINI_VIEW_WIFI_LIST) {
        wifi_manual_mode = false;
        selected_ssid[0] = '\0';
        if (wifi_list) lv_obj_clear_flag(wifi_list, LV_OBJ_FLAG_HIDDEN);
        if (wifi_ssid_input) lv_obj_add_flag(wifi_ssid_input, LV_OBJ_FLAG_HIDDEN);
        if (wifi_pwd) lv_obj_add_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);
        if (wifi_connect_btn) lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
        if (wifi_status) lv_label_set_text(wifi_status, "Choisis un reseau");
        wifi_scan_requested = true;
        return;
    }

    if (wifi_list) lv_obj_add_flag(wifi_list, LV_OBJ_FLAG_HIDDEN);
    if (wifi_connect_btn) lv_obj_clear_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
    if (wifi_pwd) {
        lv_obj_clear_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);
        lv_textarea_set_text(wifi_pwd, "");
    }
    if (wifi_keyboard) lv_obj_clear_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);

    if (active_view == MINI_VIEW_WIFI_MANUAL) {
        wifi_manual_mode = true;
        selected_ssid[0] = '\0';
        if (wifi_status) lv_label_set_text(wifi_status, "SSID manuel");
        if (wifi_ssid_input) {
            lv_obj_clear_flag(wifi_ssid_input, LV_OBJ_FLAG_HIDDEN);
            lv_textarea_set_text(wifi_ssid_input, "");
        }
        if (wifi_keyboard && wifi_ssid_input) lv_keyboard_set_textarea(wifi_keyboard, wifi_ssid_input);
    } else if (active_view == MINI_VIEW_WIFI_PASSWORD) {
        wifi_manual_mode = false;
        if (wifi_status) lv_label_set_text_fmt(wifi_status, "Reseau : %s", selected_ssid);
        if (wifi_ssid_input) lv_obj_add_flag(wifi_ssid_input, LV_OBJ_FLAG_HIDDEN);
        if (wifi_keyboard && wifi_pwd) lv_keyboard_set_textarea(wifi_keyboard, wifi_pwd);
    }
}

static void start_mel_runtime_after_wifi(const char *ssid, const char *pwd) {
    char ip[32] = {};
    mini_wifi_get_ip(ip, sizeof(ip));
    save_mel_wifi_credentials(ssid, pwd);
    mel_terminal_set_network_info(ip);
    mel_terminal_set_hardware(camera_ok, audio_ok, false);

    if (mel_terminal_has_token()) {
        if (!mel_runtime_started) {
            mel_runtime_started = true;
            mel_terminal_start_online();
            ESP_LOGI(TAG, "MEL runtime starting with stored device token");
        }
    } else {
        request_view(MINI_VIEW_PAIR);
        ESP_LOGI(TAG, "MEL pair code required");
    }
}

static void settings_refresh_status(void) {
    if (!settings_status) return;
    char ip[32] = {};
    mini_wifi_get_ip(ip, sizeof(ip));
    const int session_status = mel_terminal_last_session_status();
    char mel_state[56] = {};
    if (mel_terminal_online()) {
        snprintf(mel_state, sizeof(mel_state), "EN LIGNE");
    } else if (session_status > 0) {
        snprintf(mel_state, sizeof(mel_state), "HORS LIGNE HTTP %d", session_status);
    } else if (session_status < 0) {
        snprintf(mel_state, sizeof(mel_state), "HORS LIGNE TRANSPORT");
    } else {
        snprintf(mel_state, sizeof(mel_state), "HORS LIGNE");
    }
    lv_label_set_text_fmt(settings_status,
                          "Wi-Fi: %s\nMobile: %s\nMEL: %s\nAudio: %s  Camera: %s\nVoix: %s",
                          wifi_got_ip ? (ip[0] ? ip : "OK") : "OFF",
                          mel_terminal_mobile_connected() ? "CONNECTE" : "OFF",
                          mel_state,
                          audio_ok ? "OK" : "NON",
                          camera_ok ? "OK" : "NON",
                          mel_terminal_voice_output_enabled() ? "ON" : "OFF");
}

static void settings_open_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: SETTINGS");
    request_view(MINI_VIEW_SETTINGS);
}

static void settings_back_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    request_view(MINI_VIEW_MAIN);
}

static void settings_wifi_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    request_view(MINI_VIEW_WIFI_LIST);
}

static void settings_pair_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    if (mel_terminal_has_token() && mel_terminal_online()) {
        if (settings_status) lv_label_set_text(settings_status, "MEL deja appariee et en ligne.");
        return;
    }
    if (pair_status) {
        lv_label_set_text(pair_status,
            mel_terminal_has_token()
                ? "Liaison MEL stockee mais hors ligne. Entre un nouveau code pour reappairer."
                : "Entre le code genere dans MEL > MINI");
    }
    request_view(MINI_VIEW_PAIR);
}

static void settings_set_status(const char *text) {
    if (!text) return;
    // A zero-timeout lock could drop the worker's final result and leave
    // "CAMERA : capture en cours..." displayed forever even after the test ended.
    if (lvgl_port_lock(1200)) {
        if (settings_status) lv_label_set_text(settings_status, text);
        lvgl_port_unlock();
    } else {
        ESP_LOGW(TAG, "SETTINGS STATUS update missed after LVGL timeout: %s", text);
    }
}

static void settings_audio_test_task(void *) {
    if (!audio_ok || !input_dev || !output_dev) {
        settings_set_status("AUDIO FAIL : codec micro/HP indisponible.");
        settings_audio_test_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    // Match the Waveshare reference audio test: capture two seconds from the
    // onboard microphone, then replay exactly that PCM through the speaker.
    constexpr size_t sample_count = 2 * 48000; // Waveshare esp_codec_dev contract: 2 s @ 48 kHz mono
    constexpr size_t byte_count = sample_count * sizeof(int16_t);
    auto *pcm = static_cast<int16_t *>(heap_caps_malloc(byte_count, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!pcm) pcm = static_cast<int16_t *>(malloc(byte_count));
    if (!pcm) {
        settings_set_status("MIC FAIL : memoire insuffisante.");
        settings_audio_test_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    settings_set_status("MIC : parle pendant 2 secondes...");
    esp_codec_dev_set_in_gain(input_dev, 40.0);
    const int rc = esp_codec_dev_read(input_dev, pcm, byte_count);
    esp_codec_dev_set_in_gain(input_dev, 0.0);

    if (rc != ESP_CODEC_DEV_OK) {
        heap_caps_free(pcm);
        settings_set_status("MIC FAIL : aucune capture PCM.");
        settings_audio_test_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    int16_t min_s = 32767, max_s = -32768;
    uint64_t abs_sum = 0;
    uint64_t sq_sum = 0;
    uint32_t clips = 0;
    uint32_t transitions = 0;
    int16_t prev = pcm[0];
    for (size_t i = 0; i < sample_count; ++i) {
        const int16_t v = pcm[i];
        if (v < min_s) min_s = v;
        if (v > max_s) max_s = v;
        const int32_t a = v < 0 ? -(int32_t)v : (int32_t)v;
        abs_sum += (uint32_t)a;
        sq_sum += (uint64_t)((int32_t)v * (int32_t)v);
        if (a >= 32000) clips++;
        if (i && v != prev) transitions++;
        prev = v;
    }

    const uint32_t mean_abs = (uint32_t)(abs_sum / sample_count);
    uint32_t rem_sq = (uint32_t)(sq_sum / sample_count);
    uint32_t rms = 0;
    uint32_t bit = 1U << 30;
    while (bit > rem_sq) bit >>= 2;
    while (bit != 0) {
        if (rem_sq >= rms + bit) {
            rem_sq -= rms + bit;
            rms = (rms >> 1) + bit;
        } else {
            rms >>= 1;
        }
        bit >>= 2;
    }
    const int32_t span = (int32_t)max_s - (int32_t)min_s;
    const bool signal_ok = span > 20 && transitions > (sample_count / 200);

    settings_set_status("HP : lecture de ta voix pendant 2 secondes...");
    esp_codec_dev_set_out_mute(output_dev, false);
    esp_codec_dev_set_out_vol(output_dev, 75.0);
    const int wrc = esp_codec_dev_write(output_dev, pcm, byte_count);
    esp_codec_dev_set_out_vol(output_dev, 0.0);
    esp_codec_dev_set_out_mute(output_dev, true);

    char msg[280];
    snprintf(msg, sizeof(msg),
             "MIC %s | HP %s | RMS %u | min %d max %d | span %ld | clipping %u",
             signal_ok ? "PASS" : "FAIBLE/PLAT",
             wrc == ESP_CODEC_DEV_OK ? "LECTURE OK" : "FAIL",
             (unsigned)rms, (int)min_s, (int)max_s, (long)span, (unsigned)clips);
    ESP_LOGI(TAG, "%s transitions=%u speaker_rc=%d", msg, (unsigned)transitions, wrc);
    settings_set_status(msg);

    heap_caps_free(pcm);
    settings_audio_test_task_handle = nullptr;
    vTaskDelete(nullptr);
}

static void settings_audio_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: TEST MICRO + HP");
    if (settings_audio_test_task_handle) {
        settings_set_status("Test audio deja en cours...");
        return;
    }
    xTaskCreatePinnedToCore(settings_audio_test_task, "settings_audio_test", 8192, nullptr, 4, &settings_audio_test_task_handle, 0);
}

static void settings_camera_preview_close(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    if (settings_camera_preview) {
        lv_obj_del(settings_camera_preview);
        settings_camera_preview = nullptr;
    }
    if (settings_camera_preview_buf) {
        heap_caps_free(settings_camera_preview_buf);
        settings_camera_preview_buf = nullptr;
    }
}

static bool settings_camera_show_preview(const camera_fb_t *fb) {
    if (!fb || !fb->buf || fb->len == 0) return false;
    const size_t expected = (size_t)fb->width * (size_t)fb->height * 2U;
    if (fb->format != PIXFORMAT_RGB565 || fb->len < expected) {
        ESP_LOGW(TAG, "CAMERA PREVIEW rejected format=%d len=%u expected=%u",
                 (int)fb->format, (unsigned)fb->len, (unsigned)expected);
        return false;
    }

    uint8_t *copy = static_cast<uint8_t *>(heap_caps_malloc(expected, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!copy) copy = static_cast<uint8_t *>(heap_caps_malloc(expected, MALLOC_CAP_8BIT));
    if (!copy) {
        ESP_LOGE(TAG, "CAMERA PREVIEW allocation failed (%u bytes)", (unsigned)expected);
        return false;
    }
    memcpy(copy, fb->buf, expected);

    if (!lvgl_port_lock(1500)) {
        heap_caps_free(copy);
        return false;
    }
    if (settings_camera_preview) {
        lv_obj_del(settings_camera_preview);
        settings_camera_preview = nullptr;
    }
    if (settings_camera_preview_buf) {
        heap_caps_free(settings_camera_preview_buf);
        settings_camera_preview_buf = nullptr;
    }

    settings_camera_preview_buf = copy;
    memset(&settings_camera_preview_img, 0, sizeof(settings_camera_preview_img));
    settings_camera_preview_img.header.always_zero = 0;
    settings_camera_preview_img.header.w = fb->width;
    settings_camera_preview_img.header.h = fb->height;
    settings_camera_preview_img.header.cf = LV_IMG_CF_TRUE_COLOR;
    settings_camera_preview_img.data_size = expected;
    settings_camera_preview_img.data = settings_camera_preview_buf;

    settings_camera_preview = lv_img_create(settings_panel ? settings_panel : lv_scr_act());
    lv_img_set_src(settings_camera_preview, &settings_camera_preview_img);
    lv_img_set_zoom(settings_camera_preview, 235);
    lv_obj_center(settings_camera_preview);
    lv_obj_add_flag(settings_camera_preview, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(settings_camera_preview, settings_camera_preview_close, LV_EVENT_CLICKED, nullptr);
    lv_obj_move_foreground(settings_camera_preview);
    lvgl_port_unlock();
    return true;
}

static void settings_camera_test_task(void *) {
    if (!camera_test_mutex) camera_test_mutex = xSemaphoreCreateMutex();
    if (!camera_test_mutex || xSemaphoreTake(camera_test_mutex, pdMS_TO_TICKS(1500)) != pdTRUE) {
        settings_set_status("CAMERA : test deja actif.");
        settings_camera_test_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    // The camera is initialized once at boot in the same order as Waveshare's
    // reference firmware. Do NOT disconnect Wi-Fi and do NOT deinit/reinit the
    // DVP driver here: doing so can strand both the network and camera DMA path.
    sensor_t *sensor = esp_camera_sensor_get();
    camera_ok = sensor && (sensor->id.PID == OV5640_PID || sensor->id.PID == OV2640_PID);

    if (!camera_ok) {
        i2c_master_bus_handle_t bus = nullptr;
        esp_err_t bus_err = i2c_master_get_bus_handle(I2C_PORT_NUM, &bus);
        esp_err_t p3c = bus_err == ESP_OK ? i2c_master_probe(bus, 0x3c, 100) : bus_err;
        esp_err_t p30 = bus_err == ESP_OK ? i2c_master_probe(bus, 0x30, 100) : bus_err;
        char msg[240];
        if (sensor) {
            snprintf(msg, sizeof(msg),
                     "CAMERA FAIL : PID 0x%04x non supporte.\nSCCB 0x3C=%s  0x30=%s",
                     sensor->id.PID, esp_err_to_name(p3c), esp_err_to_name(p30));
        } else {
            snprintf(msg, sizeof(msg),
                     "CAMERA FAIL : capteur non initialise.\nSCCB 0x3C=%s  0x30=%s",
                     esp_err_to_name(p3c), esp_err_to_name(p30));
        }
        settings_set_status(msg);
        ESP_LOGW(TAG, "%s", msg);
    } else {
        const char *model = sensor->id.PID == OV5640_PID ? "OV5640" : "OV2640";
        char stage[128];
        snprintf(stage, sizeof(stage), "CAMERA : %s detecte, attente trame (max 4 s)...", model);
        settings_set_status(stage);

        // Never force-return all camera buffers before taking a queued frame.
        // With fb_count=1 that re-enabled the same buffer while a stale queue pointer
        // still referenced it, so the driver could zero fb->len for the next DMA frame
        // and the UI would report the exact symptom seen on hardware: PASS / 0 octet.
        camera_fb_t *fb = nullptr;
        long elapsed_ms = 0;
        const size_t expected = (size_t)320 * 480 * 2U;

        // fb_count=1 + GRAB_WHEN_EMPTY means the very first frame can have been
        // sitting in the queue since boot, before auto-exposure/white-balance and
        // DVP timing have settled. Drain several complete frames so the preview
        // is a fresh sensor frame, like Waveshare's continuous camera example.
        for (int warm = 1; warm <= 3; ++warm) {
            const int64_t started = esp_timer_get_time();
            camera_fb_t *stale = esp_camera_fb_get();
            elapsed_ms += (long)((esp_timer_get_time() - started) / 1000);
            if (!stale) {
                ESP_LOGW(TAG, "CAMERA TEST: warm-up frame %d unavailable", warm);
                vTaskDelay(pdMS_TO_TICKS(80));
                continue;
            }
            ESP_LOGI(TAG, "CAMERA TEST: warm-up frame %d len=%u", warm, (unsigned)stale->len);
            esp_camera_fb_return(stale);
            vTaskDelay(pdMS_TO_TICKS(80));
        }

        for (int attempt = 1; attempt <= 3; ++attempt) {
            const int64_t started = esp_timer_get_time();
            fb = esp_camera_fb_get();
            elapsed_ms += (long)((esp_timer_get_time() - started) / 1000);
            if (fb && fb->buf && fb->len == expected) break;
            if (fb) {
                ESP_LOGW(TAG, "CAMERA TEST: rejected frame attempt=%d len=%u expected=%u",
                         attempt, (unsigned)fb->len, (unsigned)expected);
                esp_camera_fb_return(fb);
                fb = nullptr;
            }
            vTaskDelay(pdMS_TO_TICKS(80));
        }

        if (!fb || !fb->buf || fb->len != expected) {
            char msg[240];
            snprintf(msg, sizeof(msg),
                     "CAMERA FAIL : %s detecte, trame invalide (%u/%u octets, %ld ms).",
                     model, fb ? (unsigned)fb->len : 0U, (unsigned)expected, elapsed_ms);
            settings_set_status(msg);
            ESP_LOGW(TAG, "%s", msg);
            if (fb) esp_camera_fb_return(fb);
            camera_ok = false;
        } else {
            const bool preview_ok = settings_camera_show_preview(fb);
            char msg[240];
            snprintf(msg, sizeof(msg),
                     "CAMERA PASS : %s | %ux%u | %u octets | %ld ms%s",
                     model, fb->width, fb->height, (unsigned)fb->len, elapsed_ms,
                     preview_ok ? " | visuel OK (touche pour fermer)" : " | visuel indisponible");
            settings_set_status(msg);
            ESP_LOGI(TAG, "%s", msg);
            esp_camera_fb_return(fb);
            camera_ok = preview_ok;
        }
    }

    mel_terminal_set_hardware(camera_ok, audio_ok, false);
    xSemaphoreGive(camera_test_mutex);
    settings_camera_test_task_handle = nullptr;
    vTaskDelete(nullptr);
}
static void settings_camera_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: TEST CAMERA");
    if (settings_camera_test_task_handle) {
        settings_set_status("Test camera deja en cours...");
        return;
    }

    // Release the previous 320x480 RGB565 preview before allocating a new task.
    // Otherwise ~300 KiB of PSRAM plus a 7 KiB task stack stayed resident and
    // repeated tests could fail at task creation despite the camera itself working.
    if (settings_camera_preview) {
        lv_obj_del(settings_camera_preview);
        settings_camera_preview = nullptr;
    }
    if (settings_camera_preview_buf) {
        heap_caps_free(settings_camera_preview_buf);
        settings_camera_preview_buf = nullptr;
    }

    settings_set_status("CAMERA : capture en cours...");
    const BaseType_t camera_task_ok = xTaskCreatePinnedToCore(
        settings_camera_test_task, "settings_camera_test", 4096, nullptr, 3,
        &settings_camera_test_task_handle, 1
    );
    if (camera_task_ok != pdPASS) {
        settings_camera_test_task_handle = nullptr;
        char msg[180];
        const unsigned free_heap = (unsigned)esp_get_free_heap_size();
        const unsigned largest = (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
        snprintf(msg, sizeof(msg), "CAMERA FAIL : memoire interne %u, bloc max %u.", free_heap, largest);
        settings_set_status(msg);
        ESP_LOGE(TAG, "CAMERA TEST task creation failed; free=%u largest_internal=%u", free_heap, largest);
    }
}

static void settings_chat_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: CHAT MEL");
    mini_ui_hide_visual();
    request_view(MINI_VIEW_RESPONSE);
}

static void settings_voice_output_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    const bool enabled = !mel_terminal_voice_output_enabled();
    mel_terminal_set_voice_output_enabled(enabled);
    if (settings_voice_btn_label) {
        lv_label_set_text(settings_voice_btn_label, enabled ? "VOIX : ON" : "VOIX : OFF");
    }
    settings_set_status(enabled ? "REPONSE VOCALE : ON - test HP local..." : "REPONSE VOCALE : OFF");
    if (enabled) {
        mel_terminal_test_speaker_local();
        mel_terminal_test_voice_output();
    }
}

static void settings_network_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: BLUETOOTH / MEL MOBILE");
    mel_mobile_bridge_rescan();
    if (settings_status) {
        lv_label_set_text(settings_status,
                          mel_mobile_bridge_ready() ? "Bluetooth : MEL Mobile connecte"
                                                    : "Bluetooth : recherche du Redmi...");
    }
}

static lv_obj_t *settings_add_button(lv_obj_t *parent, const char *text, int y, lv_event_cb_t cb) {
    lv_obj_t *btn = lv_btn_create(parent);
    lv_obj_set_size(btn, 258, 46);
    lv_obj_align(btn, LV_ALIGN_TOP_MID, 0, y);
    lv_obj_set_style_radius(btn, 12, 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x0B2238), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_border_color(btn, lv_color_hex(0x22D3EE), 0);
    lv_obj_t *label = lv_label_create(btn);
    lv_label_set_text(label, text);
    lv_obj_center(label);
    lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, nullptr);
    return btn;
}

static void settings_ui_create(lv_obj_t *screen) {
    settings_panel = lv_obj_create(screen);
    lv_obj_set_size(settings_panel, 300, 460);
    lv_obj_align(settings_panel, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_radius(settings_panel, 18, 0);
    lv_obj_set_style_bg_color(settings_panel, lv_color_hex(0x07111F), 0);
    lv_obj_set_style_bg_opa(settings_panel, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(settings_panel, 2, 0);
    lv_obj_set_style_border_color(settings_panel, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_pad_all(settings_panel, 8, 0);
    lv_obj_clear_flag(settings_panel, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *title = lv_label_create(settings_panel);
    lv_label_set_text(title, "PARAMETRES");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 12, 6);

    lv_obj_t *close_btn = lv_btn_create(settings_panel);
    lv_obj_set_size(close_btn, 42, 36);
    lv_obj_align(close_btn, LV_ALIGN_TOP_RIGHT, -4, 0);
    lv_obj_t *close_label = lv_label_create(close_btn);
    lv_label_set_text(close_label, LV_SYMBOL_CLOSE);
    lv_obj_center(close_label);
    lv_obj_add_event_cb(close_btn, settings_back_clicked, LV_EVENT_CLICKED, nullptr);

    settings_status = lv_label_create(settings_panel);
    lv_label_set_long_mode(settings_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(settings_status, 260);
    lv_obj_set_style_text_color(settings_status, lv_color_hex(0x94A3B8), 0);
    lv_obj_align(settings_status, LV_ALIGN_TOP_MID, 0, 50);

    settings_add_button(settings_panel, "CONNEXION WI-FI", 106, settings_wifi_clicked);
    settings_add_button(settings_panel, "APPAIRAGE MEL", 156, settings_pair_clicked);
    settings_add_button(settings_panel, "TEST MICRO + HP", 206, settings_audio_clicked);
    settings_add_button(settings_panel, "TEST CAMERA", 256, settings_camera_clicked);
    settings_add_button(settings_panel, "CHAT MEL", 306, settings_chat_clicked);
    settings_add_button(settings_panel, "BLUETOOTH / MEL MOBILE", 356, settings_network_clicked);
    lv_obj_t *voice_btn = settings_add_button(
        settings_panel,
        mel_terminal_voice_output_enabled() ? "VOIX : ON" : "VOIX : OFF",
        406,
        settings_voice_output_clicked
    );
    settings_voice_btn_label = lv_obj_get_child(voice_btn, 0);

    lv_obj_add_flag(settings_panel, LV_OBJ_FLAG_HIDDEN);
    settings_refresh_status();
}

static void pair_field_focus(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED || !pair_keyboard) return;
    lv_keyboard_set_textarea(pair_keyboard, lv_event_get_target(e));
}

static void pair_submit_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED || !pair_input) return;
    ESP_LOGI(TAG, "UI BUTTON: APPAIRER");
    const char *code = lv_textarea_get_text(pair_input);
    if (!code || !code[0]) {
        if (pair_status) lv_label_set_text(pair_status, "Code requis");
        return;
    }
    mel_terminal_set_pair_code(code);
    if (pair_status) lv_label_set_text(pair_status, "Appairage en cours...");
    request_view(MINI_VIEW_MAIN);
    mel_runtime_started = true;
    mel_terminal_start_online();
}

static void pair_open_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI EVENT: MEL clicked");
    if (mel_terminal_has_token() && mel_terminal_online()) {
        if (runtime_status_label) lv_label_set_text(runtime_status_label, "MEL APPARIEE  EN LIGNE");
        ESP_LOGI(TAG, "MEL pairing valid and online; pair screen suppressed");
        return;
    }
    if (pair_status && mel_terminal_has_token()) {
        lv_label_set_text(pair_status, "Liaison stockee hors ligne. Entre un nouveau code MEL.");
    }
    request_view(MINI_VIEW_PAIR);
}

static void pair_back_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: PAIR BACK");
    request_view(MINI_VIEW_MAIN);
}

static void pair_ui_create(lv_obj_t *screen) {
    pair_panel = lv_obj_create(screen);
    lv_obj_set_size(pair_panel, 320, 480);
    lv_obj_center(pair_panel);
    lv_obj_set_style_bg_color(pair_panel, lv_color_hex(0x07111F), 0);
    lv_obj_set_style_border_width(pair_panel, 0, 0);
    lv_obj_set_style_pad_all(pair_panel, 10, 0);
    lv_obj_clear_flag(pair_panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(pair_panel, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *title = lv_label_create(pair_panel);
    lv_label_set_text(title, "LIER MINI A MEL");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 18);

    pair_status = lv_label_create(pair_panel);
    lv_label_set_long_mode(pair_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(pair_status, 270);
    lv_obj_set_style_text_align(pair_status, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(pair_status, "Entre le code genere dans MEL > MINI");
    lv_obj_align(pair_status, LV_ALIGN_TOP_MID, 0, 58);

    pair_input = lv_textarea_create(pair_panel);
    lv_obj_set_size(pair_input, 250, 52);
    lv_obj_align(pair_input, LV_ALIGN_TOP_MID, 0, 108);
    lv_textarea_set_placeholder_text(pair_input, "CODE MEL");
    lv_textarea_set_one_line(pair_input, true);
    lv_obj_add_event_cb(pair_input, pair_field_focus, LV_EVENT_CLICKED, nullptr);

    lv_obj_t *submit = lv_btn_create(pair_panel);
    lv_obj_set_size(submit, 170, 46);
    lv_obj_align(submit, LV_ALIGN_TOP_MID, 0, 170);
    lv_obj_t *submit_label = lv_label_create(submit);
    lv_label_set_text(submit_label, "APPAIRER");
    lv_obj_center(submit_label);
    lv_obj_add_event_cb(submit, pair_submit_clicked, LV_EVENT_CLICKED, nullptr);

    lv_obj_t *back = lv_btn_create(pair_panel);
    lv_obj_set_size(back, 46, 36);
    lv_obj_align(back, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_t *back_label = lv_label_create(back);
    lv_label_set_text(back_label, LV_SYMBOL_LEFT);
    lv_obj_center(back_label);
    lv_obj_add_event_cb(back, pair_back_clicked, LV_EVENT_CLICKED, nullptr);

    pair_keyboard = lv_keyboard_create(pair_panel);
    lv_obj_set_size(pair_keyboard, 304, 235);
    lv_obj_align(pair_keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_keyboard_set_mode(pair_keyboard, LV_KEYBOARD_MODE_TEXT_UPPER);
    lv_keyboard_set_textarea(pair_keyboard, pair_input);
}

static void wifi_show_password(const char *ssid) {
    snprintf(selected_ssid, sizeof(selected_ssid), "%s", ssid ? ssid : "");
    request_view(MINI_VIEW_WIFI_PASSWORD);
}

static void wifi_field_focus(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED || !wifi_keyboard) return;
    lv_obj_t *ta = lv_event_get_target(e);
    lv_keyboard_set_textarea(wifi_keyboard, ta);
}

static void wifi_manual_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: WIFI MANUAL");
    request_view(MINI_VIEW_WIFI_MANUAL);
}

static void wifi_ap_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    const char *ssid = (const char *)lv_event_get_user_data(e);
    ESP_LOGI(TAG, "UI BUTTON: WIFI AP ssid=%s", ssid ? ssid : "");
    wifi_show_password(ssid);
}

static void wifi_scan_task(void *) {
    wifi_ap_record_t aps[MINI_WIFI_MAX_AP] = {};
    uint16_t count = MINI_WIFI_MAX_AP;
    wifi_scan_config_t scan_cfg = {};
    scan_cfg.show_hidden = true;
    scan_cfg.scan_type = WIFI_SCAN_TYPE_ACTIVE;

    ESP_LOGI(TAG, "UI ACTION: WIFI SCAN start");
    esp_err_t scan_err = esp_wifi_scan_start(&scan_cfg, true);

    // A pending STA operation can temporarily reject a scan. Never tear down
    // a healthy connection just to refresh the settings list: that made opening
    // the Wi-Fi screen look like the MINI had gone offline.
    if (scan_err == ESP_ERR_WIFI_STATE) {
        ESP_LOGW(TAG, "WIFI SCAN busy with STA state; preserving current connection and retrying");
        vTaskDelay(pdMS_TO_TICKS(350));
        scan_err = esp_wifi_scan_start(&scan_cfg, true);
    }

    bool ok = scan_err == ESP_OK;
    if (ok) {
        uint16_t total = 0;
        esp_err_t nerr = esp_wifi_scan_get_ap_num(&total);
        count = total > MINI_WIFI_MAX_AP ? MINI_WIFI_MAX_AP : total;
        if (nerr != ESP_OK) {
            ESP_LOGE(TAG, "WIFI SCAN ap_num failed: %s", esp_err_to_name(nerr));
            ok = false;
            count = 0;
        } else if (count > 0) {
            uint16_t wanted = count;
            esp_err_t rerr = esp_wifi_scan_get_ap_records(&wanted, aps);
            if (rerr != ESP_OK) {
                ESP_LOGE(TAG, "WIFI SCAN records failed: %s", esp_err_to_name(rerr));
                ok = false;
                count = 0;
            } else {
                count = wanted;
            }
        }
    } else {
        ESP_LOGE(TAG, "WIFI SCAN start failed: %s", esp_err_to_name(scan_err));
        count = 0;
    }

    ESP_LOGI(TAG, "WIFI SCAN result ok=%d count=%u", ok ? 1 : 0, count);
    for (uint16_t i = 0; i < count; ++i) {
        ESP_LOGI(TAG, "WIFI AP %u ssid=%s rssi=%d ch=%u auth=%d",
                 (unsigned)i, (char *)aps[i].ssid, (int)aps[i].rssi,
                 (unsigned)aps[i].primary, (int)aps[i].authmode);
    }

    if (lvgl_port_lock(0)) {
        if (wifi_list) lv_obj_clean(wifi_list);
        if (!ok) {
            if (wifi_status) lv_label_set_text_fmt(wifi_status, "Erreur scan Wi-Fi\n%s", esp_err_to_name(scan_err));
        } else if (count == 0) {
            if (wifi_status) lv_label_set_text(wifi_status, "Aucun reseau detecte\nAppuie sur Actualiser");
        } else {
            if (wifi_status) lv_label_set_text_fmt(wifi_status, "%u reseaux detectes", count);
            for (uint16_t i = 0; i < count; ++i) {
                snprintf(wifi_ssids[i], sizeof(wifi_ssids[i]), "%s", (char *)aps[i].ssid);
                char row[52];
                snprintf(row, sizeof(row), "%.32s   %d dBm", wifi_ssids[i], (int)aps[i].rssi);
                lv_obj_t *btn = lv_list_add_btn(wifi_list, LV_SYMBOL_WIFI, row);
                lv_obj_add_event_cb(btn, wifi_ap_clicked, LV_EVENT_CLICKED, wifi_ssids[i]);
            }
        }
        lv_obj_t *manual_btn = lv_list_add_btn(wifi_list, LV_SYMBOL_EDIT, "AUTRE RESEAU / SSID MANUEL");
        lv_obj_add_event_cb(manual_btn, wifi_manual_clicked, LV_EVENT_CLICKED, nullptr);
        lvgl_port_unlock();
    }
    wifi_scan_task_handle = nullptr;
    vTaskDelete(nullptr);
}

static void wifi_start_scan() {
    if (wifi_list) {
        lv_obj_clear_flag(wifi_list, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clean(wifi_list);
    }
    wifi_manual_mode = false;
    selected_ssid[0] = '\0';
    if (wifi_ssid_input) lv_obj_add_flag(wifi_ssid_input, LV_OBJ_FLAG_HIDDEN);
    if (wifi_pwd) lv_obj_add_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);
    if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
    if (wifi_connect_btn) lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
    if (wifi_status) lv_label_set_text(wifi_status, "Recherche des reseaux...");
    if (!wifi_scan_task_handle) {
        xTaskCreatePinnedToCore(wifi_scan_task, "mini_wifi_scan", 6144, nullptr, 3, &wifi_scan_task_handle, 0);
    }
}

static void wifi_scan_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: WIFI REFRESH");
    wifi_scan_requested = true;
}

static void wifi_open_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: WIFI OPEN");
    request_view(MINI_VIEW_WIFI_LIST);
}

static void wifi_back_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: WIFI BACK active_view=%d", active_view);
    if (active_view == MINI_VIEW_WIFI_PASSWORD || active_view == MINI_VIEW_WIFI_MANUAL) {
        request_view(MINI_VIEW_WIFI_LIST);
    } else {
        request_view(MINI_VIEW_MAIN);
    }
}

static void wifi_connect_task(void *arg) {
    char *payload = (char *)arg;
    char ssid[33] = {};
    char pwd[65] = {};
    snprintf(ssid, sizeof(ssid), "%s", payload);
    snprintf(pwd, sizeof(pwd), "%s", payload + 33);
    free(payload);

    ESP_LOGI(TAG, "WiFi connect to %s", ssid);
    wifi_auto_reconnect_enabled = false;
    wifi_reconnect_attempt = 0;
    wifi_got_ip = false;
    wifi_disconnect_reason = -1;
    const esp_err_t connect_err = mini_wifi_sta_connect(ssid, pwd);
    if (connect_err != ESP_OK) {
        ESP_LOGE(TAG, "MINI WIFI CONNECT START FAILED: %s", esp_err_to_name(connect_err));
        if (lvgl_port_lock(0)) {
            if (wifi_status) lv_label_set_text_fmt(wifi_status, "Echec demarrage Wi-Fi\n%s", esp_err_to_name(connect_err));
            if (wifi_keyboard) lv_obj_clear_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
            if (wifi_connect_btn) lv_obj_clear_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
            lvgl_port_unlock();
        }
        wifi_connect_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    bool connected = false;
    for (int i = 0; i < 40; ++i) {
        if (wifi_got_ip) {
            connected = true;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }

    if (connected) wifi_save_credentials(ssid, pwd);

    if (connected) {
        char ip[32] = {};
        mini_wifi_get_ip(ip, sizeof(ip));

        if (lvgl_port_lock(0)) {
            if (wifi_status) lv_label_set_text_fmt(wifi_status, "Connecte a %s\nIP %s", ssid, ip);
            if (status_label) lv_label_set_text(status_label, "MEL...");
            lvgl_port_unlock();
        }

        start_mel_runtime_after_wifi(ssid, pwd);

        // Never sleep while holding the LVGL mutex: doing so starves taskLVGL
        // and triggers the task watchdog on this board.
        vTaskDelay(pdMS_TO_TICKS(700));

        request_view(MINI_VIEW_MAIN);
    } else if (lvgl_port_lock(0)) {
        if (wifi_status) {
            if (wifi_disconnect_reason >= 0) {
                lv_label_set_text_fmt(
                    wifi_status,
                    "Echec : %s\n(code %d)",
                    wifi_reason_text(wifi_disconnect_reason),
                    wifi_disconnect_reason
                );
            } else {
                lv_label_set_text(wifi_status, "Connexion impossible");
            }
        }
        if (wifi_keyboard) lv_obj_clear_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
        if (wifi_connect_btn) lv_obj_clear_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
        lvgl_port_unlock();
    }
    wifi_connect_task_handle = nullptr;
    vTaskDelete(nullptr);
}

static void wifi_connect_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED || !wifi_pwd) return;
    ESP_LOGI(TAG, "UI BUTTON: WIFI CONNECT");
    const char *ssid = selected_ssid;
    if (wifi_manual_mode && wifi_ssid_input) ssid = lv_textarea_get_text(wifi_ssid_input);
    if (!ssid || !ssid[0]) {
        if (wifi_status) lv_label_set_text(wifi_status, "Entre le nom du reseau");
        return;
    }
    const char *pwd = lv_textarea_get_text(wifi_pwd);
    char *payload = (char *)calloc(1, 33 + 65);
    if (!payload) return;
    snprintf(payload, 33, "%s", ssid);
    snprintf(payload + 33, 65, "%s", pwd ? pwd : "");
    if (wifi_status) lv_label_set_text(wifi_status, "Connexion...");
    if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
    if (wifi_connect_btn) lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
    if (!wifi_connect_task_handle) {
        xTaskCreatePinnedToCore(wifi_connect_task, "mini_wifi_connect", 6144, payload, 3, &wifi_connect_task_handle, 0);
    } else {
        free(payload);
    }
}

static void wifi_ui_create(lv_obj_t *screen) {
    wifi_panel = lv_obj_create(screen);
    lv_obj_set_size(wifi_panel, 320, 480);
    lv_obj_align(wifi_panel, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(wifi_panel, lv_color_hex(0x07111F), 0);
    lv_obj_set_style_border_width(wifi_panel, 0, 0);
    lv_obj_set_style_pad_all(wifi_panel, 8, 0);
    lv_obj_add_flag(wifi_panel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(wifi_panel, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *title = lv_label_create(wifi_panel);
    lv_label_set_text(title, "MINI  Wi-Fi");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 2);

    wifi_status = lv_label_create(wifi_panel);
    lv_label_set_long_mode(wifi_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(wifi_status, 250);
    lv_obj_set_style_text_align(wifi_status, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(wifi_status, "Choisis un reseau");
    lv_obj_align(wifi_status, LV_ALIGN_TOP_MID, 0, 30);

    lv_obj_t *back = lv_btn_create(wifi_panel);
    lv_obj_set_size(back, 48, 36);
    lv_obj_align(back, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_t *bl = lv_label_create(back);
    lv_label_set_text(bl, LV_SYMBOL_LEFT);
    lv_obj_center(bl);
    lv_obj_add_event_cb(back, wifi_back_clicked, LV_EVENT_CLICKED, nullptr);

    lv_obj_t *scan = lv_btn_create(wifi_panel);
    lv_obj_set_size(scan, 54, 36);
    lv_obj_align(scan, LV_ALIGN_TOP_RIGHT, 0, 0);
    lv_obj_t *sl = lv_label_create(scan);
    lv_label_set_text(sl, LV_SYMBOL_REFRESH);
    lv_obj_center(sl);
    lv_obj_add_event_cb(scan, wifi_scan_clicked, LV_EVENT_CLICKED, nullptr);

    wifi_list = lv_list_create(wifi_panel);
    lv_obj_set_size(wifi_list, 292, 380);
    lv_obj_align(wifi_list, LV_ALIGN_BOTTOM_MID, 0, 0);

    wifi_ssid_input = lv_textarea_create(wifi_panel);
    lv_obj_set_size(wifi_ssid_input, 282, 46);
    lv_obj_align(wifi_ssid_input, LV_ALIGN_TOP_MID, 0, 66);
    lv_textarea_set_placeholder_text(wifi_ssid_input, "Nom du reseau (SSID)");
    lv_textarea_set_one_line(wifi_ssid_input, true);
    lv_obj_add_event_cb(wifi_ssid_input, wifi_field_focus, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_flag(wifi_ssid_input, LV_OBJ_FLAG_HIDDEN);

    wifi_pwd = lv_textarea_create(wifi_panel);
    lv_obj_set_size(wifi_pwd, 282, 46);
    lv_obj_align(wifi_pwd, LV_ALIGN_TOP_MID, 0, 116);
    lv_textarea_set_placeholder_text(wifi_pwd, "Mot de passe Wi-Fi");
    lv_textarea_set_password_mode(wifi_pwd, true);
    lv_textarea_set_one_line(wifi_pwd, true);
    lv_obj_add_event_cb(wifi_pwd, wifi_field_focus, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);

    wifi_connect_btn = lv_btn_create(wifi_panel);
    lv_obj_set_size(wifi_connect_btn, 170, 44);
    lv_obj_align(wifi_connect_btn, LV_ALIGN_TOP_MID, 0, 168);
    lv_obj_t *cl = lv_label_create(wifi_connect_btn);
    lv_label_set_text(cl, "SE CONNECTER");
    lv_obj_center(cl);
    lv_obj_add_event_cb(wifi_connect_btn, wifi_connect_clicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);

    wifi_keyboard = lv_keyboard_create(wifi_panel);
    lv_obj_set_size(wifi_keyboard, 304, 245);
    lv_obj_align(wifi_keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_keyboard_set_mode(wifi_keyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
    lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
}

static bool wait_for_view(int expected, int timeout_ms) {
    const int step_ms = 50;
    for (int elapsed = 0; elapsed < timeout_ms; elapsed += step_ms) {
        if (active_view == expected) return true;
        vTaskDelay(pdMS_TO_TICKS(step_ms));
    }
    return active_view == expected;
}

static void ui_stress_task(void *) {
#if MINI_UI_STRESS_TEST
    vTaskDelay(pdMS_TO_TICKS(7000));
    ESP_LOGI(TAG, "UI STRESS START: real MEL click/main x24");
    bool ok = true;

    request_view(MINI_VIEW_MAIN);
    if (!wait_for_view(MINI_VIEW_MAIN, 1500)) {
        ESP_LOGE(TAG, "UI STRESS FAIL: could not enter main view (active=%d)", active_view);
        ok = false;
    }

    for (int i = 0; ok && i < 24; ++i) {
        stress_pair_click_requested = true;
        if (!wait_for_view(MINI_VIEW_PAIR, 1500)) {
            ESP_LOGE(TAG, "UI STRESS FAIL: real MEL click did not open pair view at cycle %d (active=%d)", i, active_view);
            ok = false;
            break;
        }

        request_view(MINI_VIEW_MAIN);
        if (!wait_for_view(MINI_VIEW_MAIN, 1500)) {
            ESP_LOGE(TAG, "UI STRESS FAIL: main view not restored at cycle %d (active=%d)", i, active_view);
            ok = false;
            break;
        }
    }

    request_view(MINI_VIEW_MAIN);
    ESP_LOGI(TAG, "UI STRESS %s: real MEL click/main transitions, free_heap=%u",
             ok ? "PASS" : "FAIL", (unsigned)esp_get_free_heap_size());
#endif
    vTaskDelete(nullptr);
}

static void i2c_bus_init() {
    ESP_LOGI(TAG, "STEP 1: I2C");
    i2c_master_bus_config_t cfg = {};
    cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    cfg.i2c_port = (i2c_port_num_t)I2C_PORT_NUM;
    cfg.scl_io_num = PIN_I2C_SCL;
    cfg.sda_io_num = PIN_I2C_SDA;
    cfg.glitch_ignore_cnt = 7;
    cfg.flags.enable_internal_pullup = 1;
    ESP_ERROR_CHECK(i2c_new_master_bus(&cfg, &i2c_bus_handle));
    ESP_LOGI(TAG, "STEP 1 OK");
}

static void io_expander_init() {
    ESP_LOGI(TAG, "STEP 2: TCA9554");
    ESP_ERROR_CHECK(esp_io_expander_new_i2c_tca9554(
        i2c_bus_handle,
        ESP_IO_EXPANDER_I2C_TCA9554_ADDRESS_000,
        &expander_handle
    ));
    ESP_ERROR_CHECK(esp_io_expander_set_dir(expander_handle, IO_EXPANDER_PIN_NUM_1, IO_EXPANDER_OUTPUT));
    ESP_ERROR_CHECK(esp_io_expander_set_level(expander_handle, IO_EXPANDER_PIN_NUM_1, 0));
    vTaskDelay(pdMS_TO_TICKS(100));
    ESP_ERROR_CHECK(esp_io_expander_set_level(expander_handle, IO_EXPANDER_PIN_NUM_1, 1));
    vTaskDelay(pdMS_TO_TICKS(100));
    ESP_LOGI(TAG, "STEP 2 OK");
}

static void lv_port_init() {
    ESP_LOGI(TAG, "STEP 5: LVGL");
    lvgl_port_cfg_t port_cfg = ESP_LVGL_PORT_INIT_CONFIG();
    port_cfg.task_affinity = 1;
    port_cfg.task_stack = 10240;
    port_cfg.task_priority = 4;
    ESP_ERROR_CHECK(lvgl_port_init(&port_cfg));

    lvgl_port_display_cfg_t display_cfg = {};
    display_cfg.io_handle = io_handle;
    display_cfg.panel_handle = panel_handle;
    display_cfg.control_handle = nullptr;
    display_cfg.buffer_size = LCD_BUFFER_SIZE;
    display_cfg.double_buffer = false;
    display_cfg.trans_size = 0;
    display_cfg.hres = MINI_LCD_H_RES;
    display_cfg.vres = MINI_LCD_V_RES;
    display_cfg.monochrome = false;
    display_cfg.rotation.swap_xy = 0;
    display_cfg.rotation.mirror_x = 1;
    display_cfg.rotation.mirror_y = 0;
    display_cfg.flags.buff_dma = 1;
    display_cfg.flags.buff_spiram = 0;
    display_cfg.flags.sw_rotate = 1;
    display_cfg.flags.full_refresh = 0;
    display_cfg.flags.direct_mode = 0;

    lvgl_disp = lvgl_port_add_disp(&display_cfg);

    lvgl_port_touch_cfg_t touch_cfg = {};
    touch_cfg.disp = lvgl_disp;
    touch_cfg.handle = touch_handle;
    lvgl_port_add_touch(&touch_cfg);
    ESP_LOGI(TAG, "STEP 5 OK");
}

static void touch_cb(lv_event_t *e) {
    if (!status_label) return;
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;

    if (runtime_status_label) {
        lv_label_set_text(runtime_status_label, "TOUCH OK");
    }
    lv_label_set_text(status_label, "TOUCH OK");

    const int state = mel_terminal_state();
    ESP_LOGI(TAG, "UI BUTTON: PARLER clicked state=%d", state);

    if (state == MEL_TERMINAL_LISTENING) {
        mel_terminal_request_voice();
        ESP_LOGI(TAG, "PARLER second click -> stop and transcribe");
        return;
    }

    if (state != MEL_TERMINAL_IDLE) {
        ESP_LOGI(TAG, "PARLER ignored while runtime busy state=%d", state);
        return;
    }

    if (!mel_terminal_online() && !mel_terminal_mobile_connected()) {
        lv_label_set_text(status_label, "MEL HORS LIGNE");
        ESP_LOGW(TAG, "Talk requested without MEL transport");
        return;
    }

    if (!mel_terminal_online()) {
        lv_label_set_text(status_label, "VALIDATION MEL...");
        ESP_LOGI(TAG, "PARLER requested during Link V2 identity/session recovery");
    }

    mel_terminal_request_voice();
    ESP_LOGI(TAG, "PARLER first click -> start listening");
}

static void response_back_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    mini_ui_close_response_page();
}

static void response_next_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    mel_terminal_display_next();
}

static void response_previous_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    mel_terminal_display_previous();
}

static void response_stop_voice_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    mel_terminal_stop_voice_output();
    ESP_LOGI(TAG, "UI BUTTON: STOP VOIX");
}

static void response_ui_create(lv_obj_t *screen) {
    response_panel = lv_obj_create(screen);
    lv_obj_set_size(response_panel, 300, 460);
    lv_obj_align(response_panel, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_radius(response_panel, 18, 0);
    lv_obj_set_style_bg_color(response_panel, lv_color_hex(0x07111F), 0);
    lv_obj_set_style_bg_opa(response_panel, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(response_panel, 2, 0);
    lv_obj_set_style_border_color(response_panel, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_pad_all(response_panel, 8, 0);
    lv_obj_clear_flag(response_panel, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *title = lv_label_create(response_panel);
    lv_label_set_text(title, "CHAT MEL");
    lv_obj_set_style_text_color(title, lv_color_hex(0xF8FAFC), 0);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 10, 8);

    lv_obj_t *back = lv_btn_create(response_panel);
    lv_obj_set_size(back, 72, 36);
    lv_obj_align(back, LV_ALIGN_TOP_RIGHT, -4, 2);
    lv_obj_t *back_label = lv_label_create(back);
    lv_label_set_text(back_label, "RETOUR");
    lv_obj_center(back_label);
    lv_obj_add_event_cb(back, response_back_clicked, LV_EVENT_CLICKED, nullptr);

    response_media_frame = lv_obj_create(response_panel);
    lv_obj_set_size(response_media_frame, 268, 202);
    lv_obj_align(response_media_frame, LV_ALIGN_TOP_MID, 0, 50);
    lv_obj_set_style_bg_color(response_media_frame, lv_color_hex(0x020617), 0);
    lv_obj_set_style_border_width(response_media_frame, 1, 0);
    lv_obj_set_style_border_color(response_media_frame, lv_color_hex(0x334155), 0);
    lv_obj_set_style_pad_all(response_media_frame, 4, 0);
    lv_obj_clear_flag(response_media_frame, LV_OBJ_FLAG_SCROLLABLE);

    response_media_hint = lv_label_create(response_media_frame);
    lv_label_set_text(response_media_hint, "TEXTE / PHOTO / VIDEO");
    lv_obj_set_style_text_color(response_media_hint, lv_color_hex(0x64748B), 0);
    lv_obj_center(response_media_hint);

    response_image_obj = lv_img_create(response_media_frame);
    lv_obj_center(response_image_obj);
    lv_obj_add_flag(response_image_obj, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(response_image_obj, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(response_image_obj, web_card_touch_cb, LV_EVENT_ALL, nullptr);

    response_text_box = lv_obj_create(response_panel);
    lv_obj_set_size(response_text_box, 268, 142);
    lv_obj_align(response_text_box, LV_ALIGN_BOTTOM_MID, 0, -42);
    lv_obj_set_style_bg_color(response_text_box, lv_color_hex(0x0B172A), 0);
    lv_obj_set_style_border_width(response_text_box, 1, 0);
    lv_obj_set_style_border_color(response_text_box, lv_color_hex(0x334155), 0);
    lv_obj_set_style_pad_all(response_text_box, 8, 0);
    lv_obj_set_scroll_dir(response_text_box, LV_DIR_VER);

    answer_label = lv_label_create(response_text_box);
    lv_label_set_long_mode(answer_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(answer_label, 244);
    lv_obj_set_style_text_align(answer_label, LV_TEXT_ALIGN_LEFT, 0);
    lv_obj_set_style_text_color(answer_label, lv_color_hex(0xE2E8F0), 0);
    lv_obj_set_style_text_font(answer_label, &lv_font_montserrat_16, 0);
    lv_label_set_text(answer_label, "");
    lv_obj_align(answer_label, LV_ALIGN_TOP_LEFT, 0, 0);

    lv_obj_t *prev = lv_btn_create(response_panel);
    lv_obj_set_size(prev, 72, 34);
    lv_obj_align(prev, LV_ALIGN_BOTTOM_LEFT, 6, -2);
    lv_obj_t *prev_label = lv_label_create(prev);
    lv_label_set_text(prev_label, "PRECEDENT");
    lv_obj_center(prev_label);
    lv_obj_add_event_cb(prev, response_previous_clicked, LV_EVENT_CLICKED, nullptr);

    lv_obj_t *next = lv_btn_create(response_panel);
    lv_obj_set_size(next, 72, 34);
    lv_obj_align(next, LV_ALIGN_BOTTOM_RIGHT, -6, -2);
    lv_obj_t *next_label = lv_label_create(next);
    lv_label_set_text(next_label, "SUIVANT");
    lv_obj_center(next_label);
    lv_obj_add_event_cb(next, response_next_clicked, LV_EVENT_CLICKED, nullptr);

    lv_obj_t *stop_voice = lv_btn_create(response_panel);
    lv_obj_set_size(stop_voice, 92, 34);
    lv_obj_align(stop_voice, LV_ALIGN_BOTTOM_MID, 0, -2);
    lv_obj_t *stop_voice_label = lv_label_create(stop_voice);
    lv_label_set_text(stop_voice_label, "STOP VOIX");
    lv_obj_center(stop_voice_label);
    lv_obj_add_event_cb(stop_voice, response_stop_voice_clicked, LV_EVENT_CLICKED, nullptr);

    lv_obj_add_flag(response_panel, LV_OBJ_FLAG_HIDDEN);
}

static void web_card_touch_cb(lv_event_t *e) {
    if (!mel_terminal_has_display()) return;
    const lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_SHORT_CLICKED) {
        mel_terminal_display_next();
        ESP_LOGI(TAG, "WEB CARD: next source");
    } else if (code == LV_EVENT_LONG_PRESSED) {
        mel_terminal_display_previous();
        ESP_LOGI(TAG, "WEB CARD: previous source");
    }
}

static void mini_smoke_ui() {
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x07111F), 0);
    lv_obj_set_style_text_color(screen, lv_color_hex(0xF8FAFC), 0);

    main_panel = lv_obj_create(screen);
    lv_obj_set_size(main_panel, 320, 480);
    lv_obj_center(main_panel);
    lv_obj_set_style_bg_opa(main_panel, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(main_panel, 0, 0);
    lv_obj_set_style_pad_all(main_panel, 0, 0);
    lv_obj_clear_flag(main_panel, LV_OBJ_FLAG_SCROLLABLE);

    transport_indicator = lv_label_create(main_panel);
    lv_label_set_text(transport_indicator, "--");
    lv_obj_set_style_text_font(transport_indicator, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(transport_indicator, lv_color_hex(0x64748B), 0);
    lv_obj_align(transport_indicator, LV_ALIGN_TOP_LEFT, 18, 20);

    time_label = lv_label_create(main_panel);
    lv_label_set_text(time_label, "--:--");
    lv_obj_set_style_text_font(time_label, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(time_label, lv_color_hex(0xF8FAFC), 0);
    lv_obj_align(time_label, LV_ALIGN_TOP_RIGHT, -66, 16);

    lv_obj_t *settings_btn = lv_btn_create(main_panel);
    lv_obj_set_size(settings_btn, 46, 40);
    lv_obj_align(settings_btn, LV_ALIGN_TOP_RIGHT, -10, 10);
    lv_obj_set_style_radius(settings_btn, 12, 0);
    lv_obj_set_style_bg_color(settings_btn, lv_color_hex(0x0B2238), 0);
    lv_obj_set_style_border_width(settings_btn, 1, 0);
    lv_obj_set_style_border_color(settings_btn, lv_color_hex(0x22D3EE), 0);
    lv_obj_t *settings_icon = lv_label_create(settings_btn);
    lv_label_set_text(settings_icon, LV_SYMBOL_SETTINGS);
    lv_obj_center(settings_icon);
    lv_obj_add_event_cb(settings_btn, settings_open_clicked, LV_EVENT_CLICKED, nullptr);

    runtime_status_label = lv_label_create(main_panel);
    lv_label_set_text(runtime_status_label, "");
    lv_obj_set_style_text_color(runtime_status_label, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_text_align(runtime_status_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(runtime_status_label, 280);
    lv_obj_align(runtime_status_label, LV_ALIGN_BOTTOM_MID, 0, -112);

    // Canonical Mode Complet avatar, edge-to-edge and unframed.
    face_obj = lv_obj_create(main_panel);
    lv_obj_set_size(face_obj, 320, 320);
    lv_obj_set_pos(face_obj, 0, 50);
    lv_obj_set_style_bg_opa(face_obj, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(face_obj, 0, 0);
    lv_obj_set_style_pad_all(face_obj, 0, 0);
    lv_obj_clear_flag(face_obj, LV_OBJ_FLAG_SCROLLABLE);

    avatar_obj = lv_img_create(face_obj);
    lv_img_set_src(avatar_obj, &mel_avatar_mode_complet);
    lv_obj_set_pos(avatar_obj, 0, 0);
    lv_obj_add_flag(avatar_obj, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(avatar_obj, visual_touch_cb, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(avatar_obj, visual_touch_cb, LV_EVENT_GESTURE, nullptr);

    talk_button = lv_btn_create(main_panel);
    lv_obj_set_size(talk_button, 96, 96);
    lv_obj_align(talk_button, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_obj_set_style_radius(talk_button, 48, 0);
    lv_obj_set_style_bg_color(talk_button, lv_color_hex(0x08233C), 0);
    lv_obj_set_style_border_width(talk_button, 3, 0);
    lv_obj_set_style_border_color(talk_button, lv_color_hex(0x22D3EE), 0);
    lv_obj_add_event_cb(talk_button, touch_cb, LV_EVENT_ALL, nullptr);

    status_label = lv_label_create(talk_button);
    lv_label_set_text(status_label, "PARLER");
    lv_obj_set_style_text_align(status_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(status_label);

    // Hardware fallback hit target: some FT6336/LVGL combinations can miss a
    // small circular child even though the bottom screen area is reporting
    // touch. Keep an invisible full-width strip above the main UI and route it
    // to the exact same PARLER handler.
    talk_touch_zone = lv_obj_create(main_panel);
    lv_obj_set_size(talk_touch_zone, 320, 116);
    lv_obj_align(talk_touch_zone, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_opa(talk_touch_zone, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(talk_touch_zone, 0, 0);
    lv_obj_set_style_pad_all(talk_touch_zone, 0, 0);
    lv_obj_clear_flag(talk_touch_zone, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(talk_touch_zone, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(talk_touch_zone, touch_cb, LV_EVENT_CLICKED, nullptr);
    lv_obj_move_foreground(talk_touch_zone);

    wifi_ui_create(screen);
    pair_ui_create(screen);
    settings_ui_create(screen);
    response_ui_create(screen);
    mel_terminal_bind_external_ui(runtime_status_label, answer_label);
    anim_timer = lv_timer_create(mini_anim_cb, 250, nullptr);
    lv_timer_create(clock_timer_cb, 1000, nullptr);
    clock_timer_cb(nullptr);
    ESP_LOGI(TAG, "STEP 6 OK: MINI ANIMATED UI + WIFI READY");
}

static void mobile_bridge_watch_task(void *) {
    // MEL Mobile is MINI's primary transport. Never gate BLE startup on camera,
    // Wi-Fi, pairing or any other optional peripheral.
    ESP_LOGI(TAG, "MEL MOBILE BLE START (PRIMARY)");
    mel_mobile_bridge_start();
    bool reported_ready = false;
    bool physical_ready = false;
    int offline_seconds = 0;
    int keepalive_seconds = 0;
    int revalidate_seconds = 0;
    while (true) {
        const bool ready = mel_mobile_bridge_ready();
        if (ready) {
            offline_seconds = 0;
            keepalive_seconds++;
            revalidate_seconds++;
            if (keepalive_seconds >= 8) {
                mel_mobile_bridge_keepalive();
                keepalive_seconds = 0;
            }
            if (!physical_ready) {
                physical_ready = true;
                revalidate_seconds = 0;
                // Every physical BLE reconnection must restart authentication,
                // even when the reconnect happened inside the UI grace period.
                mel_terminal_set_mobile_connected(true);
                if (!mel_terminal_online()) {
                    mel_terminal_refresh_mobile_identity();
                } else {
                    mel_terminal_start_online();
                }
                ESP_LOGI(TAG, "MEL MOBILE PHYSICAL READY; identity/session recovery started");
            } else if (!mel_terminal_online() && revalidate_seconds >= 5) {
                // A transient heartbeat/GATT failure must not leave MINI offline
                // forever while the physical Android bridge is still healthy.
                revalidate_seconds = 0;
                ESP_LOGI(TAG, "MEL MOBILE READY but session offline; retrying validation");
                mel_terminal_start_online();
            }
            if (!reported_ready) {
                reported_ready = true;
                ESP_LOGI(TAG, "MEL MOBILE READY");
            }

            // Keep retrying MEL authentication while the physical BLE bridge is
            // healthy. A transient first heartbeat/pair failure must never leave
            // MINI permanently offline until the next disconnect/reboot.
            if (!mel_terminal_online() && (keepalive_seconds % 5) == 0) {
                ESP_LOGI(TAG, "MEL MOBILE link healthy but session offline; retrying online validation");
                mel_terminal_start_online();
            }
        } else if (reported_ready) {
            physical_ready = false;
            keepalive_seconds = 0;
            revalidate_seconds = 0;
            offline_seconds++;
            // Android reconnects in ~1-2 s on transient GATT drops. Keep the
            // companion logically online during a short transport handover so
            // the UI does not flash HORS LIGNE and voice can recover cleanly.
            if (offline_seconds >= 8) {
                reported_ready = false;
                offline_seconds = 0;
                mel_terminal_set_mobile_connected(false);
                ESP_LOGW(TAG, "MEL MOBILE OFFLINE after reconnect grace");

                // BLE can disappear long after the one-shot boot selector has exited.
                // Start the saved-Wi-Fi recovery path again so MINI never remains
                // stranded offline merely because the phone link dropped later.
                if (!wifi_got_ip && !wifi_connect_task_handle && !wifi_fallback_task_handle) {
                    ESP_LOGW(TAG, "MEL MOBILE lost; scheduling persistent Wi-Fi fallback");
                    xTaskCreatePinnedToCore(
                        wifi_fallback_after_ble_task,
                        "mini_wifi_recovery",
                        4096,
                        nullptr,
                        3,
                        &wifi_fallback_task_handle,
                        0
                    );
                }
            }
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

static void wifi_fallback_after_ble_task(void *) {
    // Give MEL Mobile first refusal. If we see an Android advertisement, extend
    // the window to let GATT/MTU/service discovery complete before using Wi-Fi.
    constexpr int first_window_ms = 8000;
    constexpr int candidate_window_ms = 20000;
    int elapsed_ms = 0;

    ESP_LOGI(TAG, "TRANSPORT PRIORITY: MEL Mobile first, Wi-Fi fallback after %d ms", first_window_ms);
    while (elapsed_ms < candidate_window_ms) {
        if (mel_terminal_online()) {
            ESP_LOGI(TAG, "TRANSPORT SELECTED: MEL Mobile + authenticated MEL session");
            wifi_fallback_task_handle = nullptr;
            vTaskDelete(nullptr);
            return;
        }
        if (mel_mobile_bridge_ready()) {
            // BLE/GATT alone is not Internet. Give the authenticated MEL session
            // a short chance to validate before deciding whether Wi-Fi is needed.
            mel_terminal_start_online();
        }

        if (elapsed_ms >= first_window_ms && !mel_mobile_bridge_candidate_seen()) break;
        vTaskDelay(pdMS_TO_TICKS(250));
        elapsed_ms += 250;
    }

    if (mel_terminal_online()) {
        ESP_LOGI(TAG, "TRANSPORT SELECTED: MEL Mobile after authenticated validation");
        wifi_fallback_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    if (mel_mobile_bridge_ready()) {
        ESP_LOGW(TAG, "MEL Mobile BLE connected but MEL session is still offline; enabling Wi-Fi recovery");
    }

    if (wifi_got_ip || wifi_connect_task_handle) {
        ESP_LOGI(TAG, "Wi-Fi fallback skipped: Wi-Fi already active/connecting");
        wifi_fallback_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    char saved_ssid[33] = {};
    char saved_pwd[65] = {};
    if (!wifi_load_credentials(saved_ssid, sizeof(saved_ssid), saved_pwd, sizeof(saved_pwd))) {
        if (mel_mobile_bridge_ready() || mel_mobile_bridge_candidate_seen()) {
            // The phone is physically present. Do not throw the user into the Wi-Fi
            // setup screen just because MEL authentication needs another retry.
            // Keep BLE primary and retry online validation in place.
            ESP_LOGW(TAG, "MEL Mobile present but session offline; keeping UI and retrying BLE auth (no saved Wi-Fi)");
            for (int retry = 0; retry < 12 && !mel_terminal_online(); ++retry) {
                if (mel_mobile_bridge_ready()) mel_terminal_start_online();
                vTaskDelay(pdMS_TO_TICKS(2500));
            }
            wifi_fallback_task_handle = nullptr;
            vTaskDelete(nullptr);
            return;
        }
        ESP_LOGW(TAG, "No MEL Mobile candidate and no saved Wi-Fi; opening Wi-Fi setup");
        wifi_scan_requested = true;
        request_view(MINI_VIEW_WIFI_LIST);
        wifi_fallback_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    char *payload = (char *)calloc(1, 33 + 65);
    if (!payload) {
        ESP_LOGE(TAG, "Wi-Fi fallback allocation failed");
        wifi_fallback_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }
    snprintf(payload, 33, "%s", saved_ssid);
    snprintf(payload + 33, 65, "%s", saved_pwd);

    ESP_LOGW(TAG, "MEL Mobile unavailable; starting saved Wi-Fi fallback: %s", saved_ssid);
    xTaskCreatePinnedToCore(
        wifi_connect_task,
        "mini_wifi_fallback",
        6144,
        payload,
        3,
        &wifi_connect_task_handle,
        0
    );

    wifi_fallback_task_handle = nullptr;
    vTaskDelete(nullptr);
}

extern "C" void app_main(void) {
    ESP_LOGI(TAG, "MINI ULTRA SAFE BOOT");

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    } else {
        ESP_ERROR_CHECK(ret);
    }
    ESP_LOGI(TAG, "STEP 0 OK: NVS");

    i2c_bus_init();
    io_expander_init();

    ESP_LOGI(TAG, "STEP 3: LCD + TOUCH");
    esp_3inch5_display_port_init(&io_handle, &panel_handle, LCD_BUFFER_SIZE);
    esp_3inch5_touch_port_init(
        &touch_handle, i2c_bus_handle, MINI_LCD_H_RES, MINI_LCD_V_RES, DISPLAY_ROTATION
    );
    ESP_LOGI(TAG, "STEP 3 OK");

    ESP_LOGI(TAG, "STEP 3.5: POWER");
    esp_err_t pmu_err = esp_axp2101_port_init(i2c_bus_handle);
    if (pmu_err == ESP_OK) ESP_LOGI(TAG, "STEP 3.5 OK: AXP2101");
    else ESP_LOGW(TAG, "AXP2101 init warning: %s", esp_err_to_name(pmu_err));
    vTaskDelay(pdMS_TO_TICKS(100));

    // Initialise slow peripherals before LVGL starts so taskLVGL can never
    // be starved during codec/camera bring-up.
    ESP_LOGI(TAG, "STEP 4: AUDIO ES8311");
    esp_es8311_port_init(i2c_bus_handle);
    audio_ok = esp_es8311_port_ready();
    ESP_LOGI(TAG, "STEP 4 %s err=%s",
             audio_ok ? "OK" : "FAILED",
             esp_err_to_name(esp_es8311_port_last_error()));

    // Waveshare keeps the codec open and records directly through
    // esp_codec_dev_read(). Reserve MEL's permanent worker now, while internal
    // heap is still contiguous, before camera/LVGL/BLE allocations.
    bool voice_worker_ok = false;
    if (audio_ok) voice_worker_ok = mel_terminal_prepare_voice_worker();
    ESP_LOGI(TAG, "STEP 4.1 VOICE WORKER %s", voice_worker_ok ? "READY" : "FAILED");

    // Match Waveshare's factory order: PMU -> audio -> camera -> backlight/LVGL.
    // Initializing the DVP sensor only after LVGL/BLE/Wi-Fi was needlessly
    // different from the constructor path and can hide power/bus timing issues.
    ESP_LOGI(TAG, "STEP 4.5: CAMERA DVP EARLY");
    camera_ok = camera_probe_once("EARLY");
    ESP_LOGI(TAG, "STEP 4.5 %s", camera_ok ? "OK" : "FAILED/RETRY LATER");

    ESP_LOGI(TAG, "STEP 5: BACKLIGHT + LVGL");
    esp_3inch5_brightness_port_init();
    esp_3inch5_brightness_port_set(80);
    lv_port_init();
    ESP_LOGI(TAG, "STEP 5 OK");

    ESP_LOGI(TAG, "STEP 5.2: INTERNAL STORAGE");
    const bool storage_ok = mel_terminal_init_storage();
    ESP_LOGI(TAG, "STEP 5.2 %s", storage_ok ? "OK" : "FAILED");

    mel_terminal_set_hardware(camera_ok, audio_ok, false);

    // Start NimBLE synchronously before the Wi-Fi stack so Android discovery
    // cannot lose the boot race. The watcher below only maintains/reports link state.
    ESP_LOGI(TAG, "STEP 5.5: MEL MOBILE BLE PRIMARY");
    mel_mobile_bridge_start();
    xTaskCreatePinnedToCore(mobile_bridge_watch_task, "mel_mobile_watch", 4096, nullptr, 3, nullptr, 0);
    ESP_LOGI(TAG, "STEP 5.5 OK: MEL MOBILE SCANNING");

    ESP_LOGI(TAG, "STEP 6: WIFI STACK (FALLBACK READY, NOT CONNECTED)");
    ESP_ERROR_CHECK(mini_wifi_stack_init());
    ESP_LOGI(TAG, "STEP 6 OK: STA-ONLY WIFI STACK READY (FR channels 1-13)");

    if (lvgl_port_lock(0)) {
        mini_smoke_ui();
        lvgl_port_unlock();
    }

    // Do not auto-connect Wi-Fi at boot. MEL Mobile gets priority; only if the
    // phone is absent/unusable do we fall back to saved Wi-Fi credentials.
    xTaskCreatePinnedToCore(
        wifi_fallback_after_ble_task,
        "mini_transport_select",
        4096,
        nullptr,
        3,
        &wifi_fallback_task_handle,
        0
    );

    ESP_LOGI(TAG, "MINI INTEGRATED RUNTIME READY");
    xTaskCreatePinnedToCore(microphone_boot_probe_task, "mini_micro_probe", 4096, nullptr, 2, nullptr, 0);
#if MINI_UI_STRESS_TEST
    xTaskCreatePinnedToCore(ui_stress_task, "mini_ui_stress", 4096, nullptr, 2, nullptr, 0);
#endif
}
