#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_io_expander_tca9554.h"
#include "esp_lvgl_port.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_wifi.h"
#include "esp_sntp.h"
#include "nvs.h"
#include <time.h>
#include "lvgl.h"

#include "esp_3inch5_lcd_port.h"
#include "esp_wifi_port.h"
#include "esp_axp2101_port.h"
#include "esp_es8311_port.h"
#include "esp_camera_port.h"
#include "esp_camera.h"
#include "esp_codec_dev.h"
#include "mel_terminal.h"
#include "mel_mobile_bridge.h"
#include "mel_avatar_mode_complet.h"

extern esp_codec_dev_handle_t input_dev;
extern esp_codec_dev_handle_t output_dev;


#define MINI_LCD_H_RES 320
#define MINI_LCD_V_RES 480
#define LCD_BUFFER_SIZE (MINI_LCD_H_RES * MINI_LCD_V_RES / 8)
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
static lv_obj_t *face_obj = nullptr;
static lv_obj_t *avatar_obj = nullptr;
static lv_obj_t *left_eye = nullptr;
static lv_obj_t *right_eye = nullptr;
static lv_obj_t *talk_button = nullptr;
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
static lv_obj_t *settings_panel = nullptr;
static volatile bool camera_probe_done = false;
static lv_obj_t *settings_status = nullptr;
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
static volatile int wifi_reconnect_attempt = 0;
static TaskHandle_t wifi_reconnect_task_handle = nullptr;
static TaskHandle_t settings_audio_test_task_handle = nullptr;
static TaskHandle_t settings_camera_test_task_handle = nullptr;

enum MiniView {
    MINI_VIEW_MAIN = 0,
    MINI_VIEW_WIFI_LIST = 1,
    MINI_VIEW_WIFI_PASSWORD = 2,
    MINI_VIEW_WIFI_MANUAL = 3,
    MINI_VIEW_PAIR = 4,
    MINI_VIEW_SETTINGS = 5,
};

static volatile int requested_view = MINI_VIEW_MAIN;
static volatile int active_view = MINI_VIEW_MAIN;
static volatile bool wifi_scan_requested = false;
static int last_face_state = -1;
static bool last_blink = false;
static bool last_online = false;
static int last_talk_ring = -1;
static int last_talk_enabled = -1;
static char last_clock_text[8] = "";
#define MINI_UI_STRESS_TEST 0

static void request_view(MiniView view);
static void mini_apply_requested_view(void);
static void wifi_start_scan(void);
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

static void camera_boot_probe_task(void *) {
    // UI is already alive before this runs. Camera probing can therefore be slow
    // without starving taskLVGL on CPU0.
    vTaskDelay(pdMS_TO_TICKS(2500));
    ESP_LOGI(TAG, "SELFTEST CAMERA: init OV5640 off the LVGL core (CPU%d)", xPortGetCoreID());
    esp_camera_port_init((i2c_port_num_t)I2C_PORT_NUM);
    camera_ok = esp_camera_sensor_get() != nullptr;

    if (camera_ok) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) {
            ESP_LOGI(TAG, "SELFTEST CAMERA PASS: %ux%u, %u bytes", fb->width, fb->height, (unsigned)fb->len);
            esp_camera_fb_return(fb);
        } else {
            ESP_LOGW(TAG, "SELFTEST CAMERA: sensor initialized but no frame returned");
            camera_ok = false;
        }
    } else {
        ESP_LOGW(TAG, "SELFTEST CAMERA: OV5640 unavailable");
    }

    mel_terminal_set_hardware(camera_ok, audio_ok, false);
    ESP_LOGI(TAG, "SELFTEST SUMMARY: display=OK touch=OK audio=%s camera=%s wifi=READY",
             audio_ok ? "OK" : "FAIL", camera_ok ? "OK" : "FAIL");
    camera_probe_done = true;
    vTaskDelete(nullptr);
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
    char buf[8] = {};
    if (local_tm.tm_year + 1900 < 2024) {
        snprintf(buf, sizeof(buf), "--:--");
    } else {
        strftime(buf, sizeof(buf), "%H:%M", &local_tm);
    }
    if (strcmp(buf, last_clock_text) != 0) {
        snprintf(last_clock_text, sizeof(last_clock_text), "%s", buf);
        lv_label_set_text(time_label, buf);
    }
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
        if (wifi_auto_reconnect_enabled && !wifi_reconnect_task_handle) {
            xTaskCreatePinnedToCore(wifi_reconnect_task, "mini_wifi_reconnect", 4096, nullptr, 3, &wifi_reconnect_task_handle, 0);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        wifi_got_ip = true;
        wifi_auto_reconnect_enabled = true;
        wifi_reconnect_attempt = 0;
        wifi_disconnect_reason = -1;
        auto *ev = static_cast<ip_event_got_ip_t *>(data);
        if (ev) {
            char ip[32] = {};
            snprintf(ip, sizeof(ip), IPSTR, IP2STR(&ev->ip_info.ip));
            mel_terminal_set_network_info(ip);
            mel_terminal_set_wifi_connected(true);
            ESP_LOGI(TAG, "MINI WIFI GOT IP %s", ip);
            clock_start_sync();
            if (mel_terminal_has_token()) mel_terminal_start_online();
        }
    }
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

    // Portrait is static. Do not reapply position/zoom on every 250 ms tick:
    // LVGL treats those setters as invalidations and can redraw the full avatar.

    if (talk_button) {
        const int level = mel_terminal_voice_level();
        const int ring = state == MEL_TERMINAL_LISTENING ? (3 + (level * 5) / 100) : 3;
        if (ring != last_talk_ring) {
            last_talk_ring = ring;
            lv_obj_set_style_border_width(talk_button, ring, 0);
        }
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

    if (talk_button) {
        const int enabled = (online && (state == MEL_TERMINAL_IDLE || state == MEL_TERMINAL_LISTENING)) ? 1 : 0;
        if (enabled != last_talk_enabled) {
            last_talk_enabled = enabled;
            if (enabled) lv_obj_clear_state(talk_button, LV_STATE_DISABLED);
            else lv_obj_add_state(talk_button, LV_STATE_DISABLED);
        }
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
        if (state != last_face_state && status_label) lv_label_set_text(status_label, "ERREUR");
    } else if (state != last_face_state || online != last_online) {
        if (status_label) lv_label_set_text(status_label, online ? "PARLER" : "HORS LIGNE");
    }

    last_face_state = state;
    last_online = online;
}

static esp_err_t mini_wifi_sta_connect(const char *ssid, const char *password) {
    if (!ssid || !ssid[0]) return ESP_ERR_INVALID_ARG;

    wifi_config_t cfg = {};
    snprintf((char *)cfg.sta.ssid, sizeof(cfg.sta.ssid), "%s", ssid);
    snprintf((char *)cfg.sta.password, sizeof(cfg.sta.password), "%s", password ? password : "");

    // Phone hotspots vary between OPEN/WPA2/WPA3 transition modes.
    // Accept all authentication modes supported by the ESP32-S3 station.
    cfg.sta.threshold.authmode = WIFI_AUTH_OPEN;
    cfg.sta.pmf_cfg.capable = true;
    cfg.sta.pmf_cfg.required = false;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &cfg));
    return esp_wifi_connect();
}

static bool wifi_load_credentials(char *ssid, size_t ssid_len, char *pwd, size_t pwd_len) {
    nvs_handle_t h;
    if (nvs_open("mini_wifi", NVS_READONLY, &h) != ESP_OK) return false;
    size_t sl = ssid_len;
    size_t pl = pwd_len;
    esp_err_t a = nvs_get_str(h, "ssid", ssid, &sl);
    esp_err_t b = nvs_get_str(h, "pwd", pwd, &pl);
    nvs_close(h);
    return a == ESP_OK && b == ESP_OK && ssid[0] != '\0';
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

static void ui_set_hidden(lv_obj_t *obj, bool hidden) {
    if (!obj) return;
    const bool currently_hidden = lv_obj_has_flag(obj, LV_OBJ_FLAG_HIDDEN);
    if (currently_hidden == hidden) return;
    if (hidden) lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_clear_flag(obj, LV_OBJ_FLAG_HIDDEN);
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

    const bool wifi_view = active_view == MINI_VIEW_WIFI_LIST ||
                           active_view == MINI_VIEW_WIFI_MANUAL ||
                           active_view == MINI_VIEW_WIFI_PASSWORD;
    const bool wifi_keyboard_visible = active_view == MINI_VIEW_WIFI_MANUAL ||
                                       active_view == MINI_VIEW_WIFI_PASSWORD;

    ui_set_hidden(main_panel, active_view != MINI_VIEW_MAIN);
    ui_set_hidden(settings_panel, active_view != MINI_VIEW_SETTINGS);
    ui_set_hidden(pair_panel, active_view != MINI_VIEW_PAIR);
    ui_set_hidden(wifi_panel, !wifi_view);
    ui_set_hidden(pair_keyboard, active_view != MINI_VIEW_PAIR);
    ui_set_hidden(wifi_keyboard, !wifi_keyboard_visible);

    if (active_view == MINI_VIEW_MAIN) {
        return;
    }

    if (active_view == MINI_VIEW_SETTINGS) {
        if (settings_status) {
            char ip[32] = {};
            esp_wifi_port_get_ip(ip);
            lv_label_set_text_fmt(settings_status, "Wi-Fi: %s  |  MEL: %s",
                                  wifi_got_ip ? (ip[0] ? ip : "OK") : "OFF",
                                  mel_terminal_online() ? "EN LIGNE" : "HORS LIGNE");
        }
        return;
    }

    if (active_view == MINI_VIEW_PAIR) {
        if (pair_input && pair_keyboard) lv_keyboard_set_textarea(pair_keyboard, pair_input);
        if (pair_status) lv_label_set_text(pair_status, "Entre le code genere dans MEL > MINI");
        return;
    }

    if (active_view == MINI_VIEW_WIFI_LIST) {
        wifi_manual_mode = false;
        selected_ssid[0] = '\0';
        ui_set_hidden(wifi_list, false);
        ui_set_hidden(wifi_ssid_input, true);
        ui_set_hidden(wifi_pwd, true);
        ui_set_hidden(wifi_connect_btn, true);
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
    esp_wifi_port_get_ip(ip);
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
    esp_wifi_port_get_ip(ip);
    lv_label_set_text_fmt(settings_status,
                          "Wi-Fi: %s\nMEL: %s\nAudio: %s  Camera: %s",
                          wifi_got_ip ? (ip[0] ? ip : "OK") : "OFF",
                          mel_terminal_online() ? "EN LIGNE" : "HORS LIGNE",
                          audio_ok ? "OK" : "NON",
                          camera_ok ? "OK" : "NON");
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
    if (mel_terminal_has_token()) {
        if (settings_status) lv_label_set_text(settings_status, "Appairage MEL conserve. Aucun nouveau code requis.");
        return;
    }
    request_view(MINI_VIEW_PAIR);
}

static void settings_set_status(const char *text) {
    if (!text) return;
    if (lvgl_port_lock(0)) {
        if (settings_status) lv_label_set_text(settings_status, text);
        lvgl_port_unlock();
    }
}

static void settings_audio_test_task(void *) {
    if (!audio_ok || !input_dev || !output_dev) {
        settings_set_status("AUDIO FAIL : codec micro/HP indisponible.");
        settings_audio_test_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    constexpr size_t sample_count = 48000; // 1 s @ 48 kHz mono
    constexpr size_t byte_count = sample_count * sizeof(int16_t);
    auto *pcm = static_cast<int16_t *>(heap_caps_malloc(byte_count, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!pcm) pcm = static_cast<int16_t *>(malloc(byte_count));
    if (!pcm) {
        settings_set_status("MIC FAIL : memoire insuffisante.");
        settings_audio_test_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    settings_set_status("MIC : mesure du bruit de fond pendant 1 seconde...");
    esp_codec_dev_set_in_gain(input_dev, 38.0);
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

    char msg[260];
    snprintf(msg, sizeof(msg),
             "MIC %s | bruit: RMS %u | moyen %u | min %d max %d | span %ld | clipping %u",
             signal_ok ? "PASS" : "FAIL/PLAT",
             (unsigned)rms, (unsigned)mean_abs, (int)min_s, (int)max_s,
             (long)span, (unsigned)clips);
    ESP_LOGI(TAG, "%s transitions=%u", msg, (unsigned)transitions);
    settings_set_status(msg);

    // Short 880 Hz speaker tone after microphone measurement.
    constexpr int tone_samples = 12000; // 250 ms at 48 kHz
    auto *tone = static_cast<int16_t *>(heap_caps_malloc(tone_samples * sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!tone) tone = static_cast<int16_t *>(malloc(tone_samples * sizeof(int16_t)));
    if (tone) {
        for (int i = 0; i < tone_samples; ++i) {
            const int phase = (i * 880) % 48000;
            tone[i] = phase < 24000 ? 4500 : -4500;
        }
        esp_codec_dev_set_out_vol(output_dev, 55.0);
        const int wrc = esp_codec_dev_write(output_dev, tone, tone_samples * sizeof(int16_t));
        esp_codec_dev_set_out_vol(output_dev, 0.0);
        ESP_LOGI(TAG, "SPEAKER TEST rc=%d", wrc);
        heap_caps_free(tone);
    }

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

static void settings_camera_test_task(void *) {
    if (!camera_ok) {
        esp_camera_port_init((i2c_port_num_t)I2C_PORT_NUM);
        camera_ok = esp_camera_sensor_get() != nullptr;
    }
    if (!camera_ok) {
        settings_set_status("CAMERA FAIL : OV5640 indisponible.");
    } else {
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            settings_set_status("CAMERA FAIL : aucune image recue.");
        } else {
            char msg[180];
            snprintf(msg, sizeof(msg), "CAMERA PASS : %ux%u | %u octets", fb->width, fb->height, (unsigned)fb->len);
            settings_set_status(msg);
            esp_camera_fb_return(fb);
        }
    }
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
    settings_set_status("CAMERA : capture en cours...");
    xTaskCreatePinnedToCore(settings_camera_test_task, "settings_camera_test", 8192, nullptr, 3, &settings_camera_test_task_handle, 0);
}

static void settings_stt_status_cb(const char *text) {
    settings_set_status(text);
}

static void settings_stt_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    ESP_LOGI(TAG, "UI BUTTON: TEST VOIX/STT");
    mel_terminal_test_stt(settings_stt_status_cb);
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
    settings_add_button(settings_panel, "BLUETOOTH / MEL MOBILE", 356, settings_network_clicked);

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
    if (mel_terminal_has_token()) {
        if (runtime_status_label) {
            lv_label_set_text(runtime_status_label,
                              mel_terminal_online() ? "MEL APPARIEE  EN LIGNE" : "MEL APPARIEE  RECONNEXION");
        }
        ESP_LOGI(TAG, "MEL pairing already stored in NVS; pair screen suppressed");
        return;
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

    // A pending STA connection can temporarily reject a scan. Cancel that
    // attempt and retry once instead of incorrectly showing "no network".
    if (scan_err == ESP_ERR_WIFI_STATE) {
        ESP_LOGW(TAG, "WIFI SCAN busy with STA state; cancelling connect and retrying");
        wifi_auto_reconnect_enabled = false;
        esp_wifi_disconnect();
        vTaskDelay(pdMS_TO_TICKS(200));
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
    mini_wifi_sta_connect(ssid, pwd);

    bool connected = false;
    for (int i = 0; i < 30; ++i) {
        if (wifi_got_ip) {
            connected = true;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }

    if (connected) wifi_save_credentials(ssid, pwd);

    if (connected) {
        char ip[32] = {};
        esp_wifi_port_get_ip(ip);

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
    display_cfg.double_buffer = true;
    display_cfg.trans_size = 0;
    display_cfg.hres = MINI_LCD_H_RES;
    display_cfg.vres = MINI_LCD_V_RES;
    display_cfg.monochrome = false;
    display_cfg.rotation.swap_xy = 0;
    display_cfg.rotation.mirror_x = 1;
    display_cfg.rotation.mirror_y = 0;
    display_cfg.flags.buff_dma = 0;
    display_cfg.flags.buff_spiram = 1;
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
    if (lv_event_get_code(e) != LV_EVENT_CLICKED || !status_label) return;
    ESP_LOGI(TAG, "UI BUTTON: PARLER");
    if (!mel_terminal_online()) {
        lv_label_set_text(status_label, "MEL HORS LIGNE");
        ESP_LOGW(TAG, "Talk requested while MEL runtime is offline");
        return;
    }
    mel_terminal_request_voice();
    ESP_LOGI(TAG, "PARLER requested");
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

    lv_obj_t *wifi_indicator = lv_label_create(main_panel);
    lv_label_set_text(wifi_indicator, LV_SYMBOL_WIFI);
    lv_obj_set_style_text_color(wifi_indicator, lv_color_hex(0x22D3EE), 0);
    lv_obj_align(wifi_indicator, LV_ALIGN_TOP_LEFT, 18, 20);

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
    lv_obj_clear_flag(settings_icon, LV_OBJ_FLAG_CLICKABLE);
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
    lv_obj_clear_flag(face_obj, LV_OBJ_FLAG_CLICKABLE);

    avatar_obj = lv_img_create(face_obj);
    lv_img_set_src(avatar_obj, &mel_avatar_mode_complet);
    lv_obj_set_pos(avatar_obj, 0, 0);
    lv_obj_clear_flag(avatar_obj, LV_OBJ_FLAG_CLICKABLE);

    answer_label = lv_label_create(main_panel);
    lv_label_set_long_mode(answer_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(answer_label, 286);
    lv_obj_set_height(answer_label, 72);
    lv_obj_set_style_text_align(answer_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_color(answer_label, lv_color_hex(0xCBD5E1), 0);
    lv_label_set_text(answer_label, "");
    lv_obj_align(answer_label, LV_ALIGN_BOTTOM_MID, 0, -104);
    lv_obj_add_flag(answer_label, LV_OBJ_FLAG_HIDDEN);

    talk_button = lv_btn_create(main_panel);
    lv_obj_set_size(talk_button, 96, 96);
    lv_obj_align(talk_button, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_obj_set_style_radius(talk_button, 48, 0);
    lv_obj_set_style_bg_color(talk_button, lv_color_hex(0x08233C), 0);
    lv_obj_set_style_border_width(talk_button, 3, 0);
    lv_obj_set_style_border_color(talk_button, lv_color_hex(0x22D3EE), 0);
    lv_obj_add_event_cb(talk_button, touch_cb, LV_EVENT_CLICKED, nullptr);

    status_label = lv_label_create(talk_button);
    lv_label_set_text(status_label, "PARLER");
    lv_obj_set_style_text_align(status_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(status_label);

    wifi_ui_create(screen);
    pair_ui_create(screen);
    settings_ui_create(screen);
    mel_terminal_bind_external_ui(runtime_status_label, answer_label);
    anim_timer = lv_timer_create(mini_anim_cb, 250, nullptr);
    lv_timer_create(clock_timer_cb, 1000, nullptr);
    clock_timer_cb(nullptr);
    ESP_LOGI(TAG, "STEP 6 OK: MINI ANIMATED UI + WIFI READY");
}

static void mobile_bridge_watch_task(void *) {
    while (!camera_probe_done) vTaskDelay(pdMS_TO_TICKS(20));
    ESP_LOGI(TAG, "MEL MOBILE BLE START");
    mel_mobile_bridge_start();
    bool previous = false;
    while (true) {
        const bool ready = mel_mobile_bridge_ready();
        if (ready != previous) {
            previous = ready;
            mel_terminal_set_mobile_connected(ready);
            ESP_LOGI(TAG, "MEL MOBILE %s", ready ? "READY" : "OFFLINE");
            if (ready && mel_terminal_has_token()) mel_terminal_start_online();
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
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
    audio_ok = input_dev != nullptr && output_dev != nullptr;
    ESP_LOGI(TAG, "STEP 4 %s", audio_ok ? "OK" : "FAILED");

    ESP_LOGI(TAG, "STEP 5: BACKLIGHT + LVGL");
    esp_3inch5_brightness_port_init();
    esp_3inch5_brightness_port_set(80);
    lv_port_init();
    ESP_LOGI(TAG, "STEP 5 OK");

    // OV5640 is initialized lazily on first camera request, on core 1.
    // Keeping it out of the critical boot path prevents long SCCB sensor
    // probing from starving LVGL and triggering the task watchdog.
    camera_ok = false;
    mel_terminal_set_hardware(false, audio_ok, false);

    ESP_LOGI(TAG, "STEP 6: WIFI STACK");
    esp_wifi_port_init(nullptr, nullptr);
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, &mini_wifi_event_diag, nullptr));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &mini_wifi_event_diag, nullptr));
    ESP_ERROR_CHECK(esp_wifi_set_country_code("FR", false));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "STEP 6 OK: WIFI STACK STARTED (FR channels 1-13)");

    xTaskCreatePinnedToCore(mobile_bridge_watch_task, "mel_mobile_watch", 4096, nullptr, 2, nullptr, 0);

    if (lvgl_port_lock(0)) {
        mini_smoke_ui();
        lvgl_port_unlock();
    }

    char saved_ssid[33] = {};
    char saved_pwd[65] = {};
    if (wifi_load_credentials(saved_ssid, sizeof(saved_ssid), saved_pwd, sizeof(saved_pwd))) {
        char *payload = (char *)calloc(1, 33 + 65);
        if (payload) {
            snprintf(payload, 33, "%s", saved_ssid);
            snprintf(payload + 33, 65, "%s", saved_pwd);
            xTaskCreatePinnedToCore(wifi_connect_task, "mini_wifi_boot", 6144, payload, 3, &wifi_connect_task_handle, 0);
        }
        ESP_LOGI(TAG, "Saved WiFi requested: %s", saved_ssid);
    } else {
        request_view(MINI_VIEW_WIFI_LIST);
    }

    ESP_LOGI(TAG, "MINI INTEGRATED RUNTIME READY");
    xTaskCreatePinnedToCore(camera_boot_probe_task, "mini_camera_probe", 8192, nullptr, 2, nullptr, 0);
    xTaskCreatePinnedToCore(microphone_boot_probe_task, "mini_micro_probe", 4096, nullptr, 2, nullptr, 0);
#if MINI_UI_STRESS_TEST
    xTaskCreatePinnedToCore(ui_stress_task, "mini_ui_stress", 4096, nullptr, 2, nullptr, 0);
#endif
}
