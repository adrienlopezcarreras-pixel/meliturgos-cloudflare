#include "mel_terminal.h"
#include "mel_mobile_bridge.h"
#include "mel_link_v2_transport.h"
#include "mini_visual.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <string>
#include <vector>
#include <cstdio>
#include <cctype>
#include <sys/stat.h>
#include <sys/time.h>
#include <ctime>
#include <cstdlib>

#include "nvs.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "driver/i2c_master.h"
#include "esp_http_server.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_heap_caps.h"
#include "esp_ota_ops.h"
#include "esp_vfs_fat.h"
#include "wear_levelling.h"
#include "esp_camera.h"
#include "esp_camera_port.h"
#include "img_converters.h"
#include "esp_codec_dev.h"
#include "esp_lvgl_port.h"
#include "cJSON.h"
#include "lwip/sockets.h"
#include "lwip/inet.h"
#include "mbedtls/sha256.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/idf_additions.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"

#include "esp_es8311_port.h"

static const char *TAG = "mel_terminal";

bool mini_media_wifi_connect(
    const char *ssid,
    const char *password,
    char *gateway,
    size_t gateway_len
);
void mini_media_wifi_release();
static const char *SERVER = "https://meliturgos.adrien-lopezcarreras.workers.dev";
static const char *MODEL = "waveshare-esp32-s3-touch-lcd-3.5-c";
static const int WIFI_CONNECTED_BIT = BIT0;
static const int WIFI_FAIL_BIT = BIT1;
static const size_t MAX_HTTP_RESPONSE = 64 * 1024;
static const int VOICE_SECONDS = 10;
static const int VOICE_CAPTURE_RATE = 48000;
static const int VOICE_STT_RATE = 16000;
static const int VOICE_CAPTURE_SAMPLES = VOICE_SECONDS * VOICE_CAPTURE_RATE;
static const int VOICE_CAPTURE_BYTES = VOICE_CAPTURE_SAMPLES * 2;
static const int VOICE_STT_SAMPLES = VOICE_SECONDS * VOICE_STT_RATE;
static const int VOICE_STT_BYTES = VOICE_STT_SAMPLES * 2;

static const int WAKE_RATE = 16000;
static const int WAKE_WINDOW_MS = 1900;
static const int WAKE_WINDOW_SAMPLES = WAKE_RATE * WAKE_WINDOW_MS / 1000;
static const int WAKE_HOP_MS = 500;
static const int WAKE_HOP_SAMPLES = WAKE_RATE * WAKE_HOP_MS / 1000;
static const int WAKE_FEATURE_SEGMENTS = 6;
static const int WAKE_FEATURE_BANDS = 8;
static const int WAKE_FEATURE_COUNT = WAKE_FEATURE_SEGMENTS * WAKE_FEATURE_BANDS;

// 31-tap low-pass FIR shared with Android. The physical ES8311 stream is
// 48 kHz; STT and wake features are intentionally downsampled to 16 kHz.
static const int16_t VOICE_DECIMATOR_Q15[31] = {
    51,17,-58,-146,-134,84,426,555,114,-838,
    -1592,-1105,1213,4834,8186,9551,8186,4834,1213,
    -1105,-1592,-838,114,555,426,84,-134,-146,-58,17,51
};

extern esp_codec_dev_handle_t input_dev;
extern esp_codec_dev_handle_t output_dev;

struct MelConfig {
    char ssid[33];
    char password[65];
    char pair_code[17];
    char token[96];
};

struct HttpBuffer {
    std::string body;
};

struct MelDisplayItem {
    std::string title;
    std::string url;
    std::string snippet;
    std::string image_url;
};

struct MelChatReply {
    std::string text;
    std::vector<MelDisplayItem> display_items;
    std::string display_title;
};

static MelConfig g_cfg = {};
static char g_device_id[40] = {};
static char g_ip[20] = {};
static bool g_camera_ok = false;
static bool g_audio_ok = false;
static bool g_sd_ok = false;
static bool g_storage_ok = false;
static uint64_t g_storage_total = 0;
static uint64_t g_storage_free = 0;
static wl_handle_t g_storage_wl = WL_INVALID_HANDLE;
static bool g_online = false;
static volatile int g_last_session_status = 0;
static volatile bool g_fresh_pair_proved_online = false;
static bool g_wifi_connected = false;
static bool g_mobile_connected = false;
static volatile int g_runtime_state = MEL_TERMINAL_IDLE;
static std::vector<MelDisplayItem> g_display_items;
static size_t g_display_index = 0;
static std::string g_display_title;
static TaskHandle_t g_voice_worker_handle = nullptr;
static volatile bool g_voice_job_active = false;
static volatile bool g_voice_stop_requested = false;
static volatile bool g_tts_stop_requested = false;

static bool speaker_output_enable(float volume) {
    if (!output_dev) return false;
    const int mute_rc = esp_codec_dev_set_out_mute(output_dev, false);
    const int vol_rc = esp_codec_dev_set_out_vol(output_dev, volume);
    ESP_LOGI(TAG, "SPEAKER enable mute_rc=%d vol_rc=%d volume=%.1f", mute_rc, vol_rc, volume);
    return mute_rc == ESP_CODEC_DEV_OK && vol_rc == ESP_CODEC_DEV_OK;
}

static void speaker_output_disable(void) {
    if (!output_dev) return;
    const int vol_rc = esp_codec_dev_set_out_vol(output_dev, 0.0);
    const int mute_rc = esp_codec_dev_set_out_mute(output_dev, true);
    ESP_LOGI(TAG, "SPEAKER disable vol_rc=%d mute_rc=%d", vol_rc, mute_rc);
}

static bool g_voice_output_enabled = true;
static volatile int g_voice_level = 0;
static char g_last_voice_error_buf[96] = {};
static const char *g_last_voice_error = nullptr;
static volatile bool g_voice_capture_requested = false;
static SemaphoreHandle_t g_mic_mutex = nullptr;
static TaskHandle_t g_wake_task_handle = nullptr;
static TaskHandle_t g_wake_sync_task_handle = nullptr;
static bool g_wake_profile_ready = false;
static float g_wake_template[WAKE_FEATURE_COUNT] = {};
static float g_wake_threshold = 0.84f;
static int64_t g_last_wake_trigger_us = 0;

static void sync_wake_phrase_profile();
static void mobile_companion_sync_task(void *);
static bool render_display_item_card(size_t index);
static bool handle_local_media_command(const std::string &spoken);

static void voice_error(const char *reason) {
    if (reason && *reason) {
        strlcpy(g_last_voice_error_buf, reason, sizeof(g_last_voice_error_buf));
        g_last_voice_error = g_last_voice_error_buf;
        ESP_LOGW(TAG, "VOICE ERROR: %s", g_last_voice_error);
    } else {
        g_last_voice_error_buf[0] = '\0';
        g_last_voice_error = nullptr;
    }
}
static TaskHandle_t g_online_task_handle = nullptr;
static TaskHandle_t g_heartbeat_task_handle = nullptr;
static EventGroupHandle_t g_wifi_bits = nullptr;
static int g_wifi_retry = 0;
static lv_obj_t *g_status = nullptr;
static lv_obj_t *g_answer = nullptr;
static lv_obj_t *g_subtitle = nullptr;
static lv_obj_t *g_actions = nullptr;
static httpd_handle_t g_setup_server = nullptr;

enum MiniFaceState { MINI_IDLE = 0, MINI_LISTENING = 1, MINI_THINKING = 2, MINI_SPEAKING = 3, MINI_ERROR = 4 };
static MiniFaceState g_face_state = MINI_IDLE;
static lv_obj_t *g_face = nullptr;
static lv_obj_t *g_eye_left = nullptr;
static lv_obj_t *g_eye_right = nullptr;
static lv_obj_t *g_mouth = nullptr;
static lv_obj_t *g_temple_left = nullptr;
static lv_obj_t *g_temple_right = nullptr;
static lv_timer_t *g_face_timer = nullptr;

static void mini_face_state(MiniFaceState state) {
    g_face_state = state;
    if (!g_face) return;
    lv_color_t accent = lv_color_hex(0x22D3EE);
    if (state == MINI_LISTENING) accent = lv_color_hex(0x34D399);
    else if (state == MINI_THINKING) accent = lv_color_hex(0xA78BFA);
    else if (state == MINI_SPEAKING) accent = lv_color_hex(0x60A5FA);
    else if (state == MINI_ERROR) accent = lv_color_hex(0xFB7185);
    lv_obj_set_style_border_color(g_face, accent, 0);
    if (g_temple_left) lv_obj_set_style_bg_color(g_temple_left, accent, 0);
    if (g_temple_right) lv_obj_set_style_bg_color(g_temple_right, accent, 0);
}

static void mini_face_timer_cb(lv_timer_t *) {
    if (!g_eye_left || !g_eye_right || !g_mouth) return;
    const uint32_t phase = (lv_tick_get() / 120) % 32;
    const bool blink = g_face_state == MINI_IDLE && (phase == 0 || phase == 1);
    lv_obj_set_height(g_eye_left, blink ? 2 : 10);
    lv_obj_set_height(g_eye_right, blink ? 2 : 10);

    if (g_face_state == MINI_LISTENING) {
        lv_obj_set_width(g_mouth, (phase % 4 < 2) ? 34 : 44);
        lv_obj_set_height(g_mouth, 5);
    } else if (g_face_state == MINI_THINKING) {
        lv_obj_set_width(g_mouth, 28 + (phase % 5) * 4);
        lv_obj_set_height(g_mouth, 4);
    } else if (g_face_state == MINI_SPEAKING) {
        lv_obj_set_width(g_mouth, 40);
        lv_obj_set_height(g_mouth, (phase % 3 == 0) ? 14 : 6);
    } else {
        lv_obj_set_width(g_mouth, 42);
        lv_obj_set_height(g_mouth, 5);
    }
}

static void ui_text(lv_obj_t *label, const char *value) {
    if (!label) return;
    if (lvgl_port_lock(1000)) {
        lv_label_set_text(label, value ? value : "");
        lvgl_port_unlock();
    }
}

static void ui_status(const char *value) {
    ui_text(g_status, value);
}

static void ui_answer(const char *value) {
    if (!g_answer) return;
    if (lvgl_port_lock(1000)) {
        const char *text = value ? value : "";
        lv_label_set_text(g_answer, text);
        if (text[0]) lv_obj_clear_flag(g_answer, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(g_answer, LV_OBJ_FLAG_HIDDEN);
        lvgl_port_unlock();
    }
}

static void set_display_results(const MelChatReply &reply) {
    g_display_items = reply.display_items;
    g_display_title = reply.display_title;
    g_display_index = 0;
}

static void ui_show_display_source(size_t index) {
    if (g_display_items.empty()) return;
    if (index >= g_display_items.size()) index = 0;
    g_display_index = index;
    const MelDisplayItem &item = g_display_items[index];
    char status[48] = {};
    snprintf(status, sizeof(status), "WEB %u/%u",
             (unsigned)(index + 1), (unsigned)g_display_items.size());
    std::string card;
    if (!item.title.empty()) card += item.title;
    if (!item.snippet.empty()) {
        if (!card.empty()) card += "\n";
        card += item.snippet;
    }
    if (card.empty()) card = item.url;
    if (card.size() > 500) card.resize(500);
    ui_status(status);
    ui_answer(card.c_str());
    ESP_LOGI(TAG, "DISPLAY source %u/%u url=%s",
             (unsigned)(index + 1), (unsigned)g_display_items.size(), item.url.c_str());
}

static void make_device_id() {
    uint8_t mac[6] = {};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(g_device_id, sizeof(g_device_id), "mel-%02X%02X%02X", mac[3], mac[4], mac[5]);
}

static bool nvs_read_string(nvs_handle_t nvs, const char *key, char *out, size_t out_size) {
    size_t required = out_size;
    if (nvs_get_str(nvs, key, out, &required) != ESP_OK) {
        if (out_size) out[0] = '\0';
        return false;
    }
    out[out_size - 1] = '\0';
    return true;
}

static void load_config() {
    nvs_handle_t nvs;
    if (nvs_open("mel", NVS_READONLY, &nvs) != ESP_OK) return;
    nvs_read_string(nvs, "ssid", g_cfg.ssid, sizeof(g_cfg.ssid));
    nvs_read_string(nvs, "wifi_pass", g_cfg.password, sizeof(g_cfg.password));
    nvs_read_string(nvs, "pair_code", g_cfg.pair_code, sizeof(g_cfg.pair_code));
    nvs_read_string(nvs, "token", g_cfg.token, sizeof(g_cfg.token));
    uint8_t voice_output = 1;
    if (nvs_get_u8(nvs, "voice_out", &voice_output) == ESP_OK) {
        g_voice_output_enabled = voice_output != 0;
    }
    nvs_close(nvs);
}

static void save_string(const char *key, const char *value) {
    nvs_handle_t nvs;
    if (nvs_open("mel", NVS_READWRITE, &nvs) != ESP_OK) return;
    nvs_set_str(nvs, key, value ? value : "");
    nvs_commit(nvs);
    nvs_close(nvs);
}

static std::string load_string_dynamic(const char *key) {
    if (!key) return "";
    nvs_handle_t nvs;
    if (nvs_open("mel", NVS_READONLY, &nvs) != ESP_OK) return "";
    size_t required = 0;
    if (nvs_get_str(nvs, key, nullptr, &required) != ESP_OK || required <= 1) {
        nvs_close(nvs);
        return "";
    }
    std::string value(required, '\0');
    if (nvs_get_str(nvs, key, value.data(), &required) != ESP_OK) {
        nvs_close(nvs);
        return "";
    }
    nvs_close(nvs);
    if (!value.empty() && value.back() == '\0') value.pop_back();
    return value;
}

static double wake_rms(const int16_t *samples, int start, int end) {
    if (!samples || end <= start) return 0.0;
    double sum = 0.0;
    for (int i = start; i < end; ++i) {
        const double v = (double)samples[i];
        sum += v * v;
    }
    return sqrt(sum / (double)(end - start));
}

static double wake_goertzel(const int16_t *samples, int start, int end, double frequency) {
    if (!samples || end <= start) return 0.0;
    constexpr double PI = 3.14159265358979323846;
    const double omega = 2.0 * PI * frequency / (double)WAKE_RATE;
    const double coeff = 2.0 * cos(omega);
    double s1 = 0.0;
    double s2 = 0.0;
    for (int i = start; i < end; ++i) {
        const double x = (double)samples[i] / 32768.0;
        const double s0 = x + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    const double power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return std::max(0.0, power / (double)(end - start));
}

static bool wake_extract_features(const int16_t *samples, int count, float out[WAKE_FEATURE_COUNT]) {
    if (!samples || !out || count < WAKE_RATE / 2) return false;
    constexpr int FRAME = WAKE_RATE / 50; // 20 ms
    double peak = 0.0;
    for (int i = 0; i + FRAME <= count; i += FRAME) {
        peak = std::max(peak, wake_rms(samples, i, i + FRAME));
    }
    const double silence_threshold = std::max(160.0, peak * 0.16);
    int first = 0;
    while (first + FRAME <= count && wake_rms(samples, first, first + FRAME) < silence_threshold) first += FRAME;
    int last = count;
    while (last - FRAME >= first && wake_rms(samples, last - FRAME, last) < silence_threshold) last -= FRAME;
    const int pad = WAKE_RATE / 20; // 50 ms
    first = std::max(0, first - pad);
    last = std::min(count, last + pad);
    if (last - first < WAKE_RATE / 3) return false;
    if (wake_rms(samples, first, last) < 180.0) return false;

    static const double FREQS[WAKE_FEATURE_BANDS] = {300.0, 500.0, 750.0, 1000.0, 1400.0, 2000.0, 2800.0, 3800.0};
    double norm = 0.0;
    for (int segment = 0; segment < WAKE_FEATURE_SEGMENTS; ++segment) {
        const int start = first + segment * (last - first) / WAKE_FEATURE_SEGMENTS;
        const int end = first + (segment + 1) * (last - first) / WAKE_FEATURE_SEGMENTS;
        for (int band = 0; band < WAKE_FEATURE_BANDS; ++band) {
            const float value = (float)log(1.0 + wake_goertzel(samples, start, end, FREQS[band]));
            const int index = segment * WAKE_FEATURE_BANDS + band;
            out[index] = value;
            norm += (double)value * value;
        }
    }
    norm = sqrt(norm);
    if (norm <= 1e-9) return false;
    for (int i = 0; i < WAKE_FEATURE_COUNT; ++i) out[i] = (float)(out[i] / norm);
    return true;
}

static float wake_cosine(const float *a, const float *b) {
    double dot = 0.0, aa = 0.0, bb = 0.0;
    for (int i = 0; i < WAKE_FEATURE_COUNT; ++i) {
        dot += (double)a[i] * b[i];
        aa += (double)a[i] * a[i];
        bb += (double)b[i] * b[i];
    }
    if (aa <= 1e-12 || bb <= 1e-12) return 0.0f;
    return (float)(dot / sqrt(aa * bb));
}

static void ensure_mic_mutex() {
    if (!g_mic_mutex) g_mic_mutex = xSemaphoreCreateMutex();
}

static int decimate_48k_to_16k(
    const int16_t *input,
    int input_samples,
    int16_t *output,
    int output_capacity,
    int32_t dc
) {
    if (!input || !output || input_samples < 3 || output_capacity <= 0) return 0;
    const int count = std::min(input_samples / 3, output_capacity);
    constexpr int taps = sizeof(VOICE_DECIMATOR_Q15) / sizeof(VOICE_DECIMATOR_Q15[0]);
    constexpr int half = taps / 2;
    for (int i = 0; i < count; ++i) {
        const int center = i * 3;
        int64_t acc = 0;
        for (int tap = 0; tap < taps; ++tap) {
            const int src = std::max(0, std::min(input_samples - 1, center + tap - half));
            const int32_t v = (int32_t)input[src] - dc;
            acc += (int64_t)v * VOICE_DECIMATOR_Q15[tap];
        }
        int32_t v = (int32_t)(acc >> 15);
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        output[i] = (int16_t)v;
    }
    return count;
}

static void wake_detector_task(void *) {
    constexpr int WAKE_RAW_SAMPLES = WAKE_HOP_SAMPLES * 3;
    auto *ring = static_cast<int16_t *>(heap_caps_calloc(WAKE_WINDOW_SAMPLES, sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    auto *raw = static_cast<int16_t *>(heap_caps_malloc(WAKE_RAW_SAMPLES * sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    auto *hop = static_cast<int16_t *>(heap_caps_malloc(WAKE_HOP_SAMPLES * sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!ring || !raw || !hop) {
        if (ring) heap_caps_free(ring);
        if (raw) heap_caps_free(raw);
        if (hop) heap_caps_free(hop);
        ESP_LOGE(TAG, "WAKE detector allocation failed");
        g_wake_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    ensure_mic_mutex();
    int filled = 0;
    while (true) {
        if (!g_wake_profile_ready || (!g_online && !mel_mobile_bridge_ready()) ||
            !g_audio_ok || !input_dev || g_voice_capture_requested ||
            g_runtime_state != MEL_TERMINAL_IDLE) {
            filled = 0;
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
        }
        if (!g_mic_mutex || xSemaphoreTake(g_mic_mutex, pdMS_TO_TICKS(800)) != pdTRUE) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        esp_codec_dev_set_in_gain(input_dev, 35.0);
        const int rc = esp_codec_dev_read(input_dev, raw, WAKE_RAW_SAMPLES * (int)sizeof(int16_t));
        esp_codec_dev_set_in_gain(input_dev, 0.0);
        xSemaphoreGive(g_mic_mutex);
        if (rc != ESP_CODEC_DEV_OK) {
            ESP_LOGW(TAG, "WAKE mic read failed rc=%d", rc);
            filled = 0;
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
        }
        if (g_runtime_state != MEL_TERMINAL_IDLE) {
            filled = 0;
            continue;
        }

        const int hop_samples = decimate_48k_to_16k(
            raw, WAKE_RAW_SAMPLES, hop, WAKE_HOP_SAMPLES, 0
        );
        if (hop_samples != WAKE_HOP_SAMPLES) {
            ESP_LOGW(TAG, "WAKE decimator produced %d/%d samples", hop_samples, WAKE_HOP_SAMPLES);
            filled = 0;
            continue;
        }
        if (filled < WAKE_WINDOW_SAMPLES) {
            const int copy = std::min(WAKE_HOP_SAMPLES, WAKE_WINDOW_SAMPLES - filled);
            memcpy(ring + filled, hop, copy * sizeof(int16_t));
            filled += copy;
            if (filled < WAKE_WINDOW_SAMPLES) continue;
        } else {
            memmove(ring, ring + WAKE_HOP_SAMPLES, (WAKE_WINDOW_SAMPLES - WAKE_HOP_SAMPLES) * sizeof(int16_t));
            memcpy(ring + WAKE_WINDOW_SAMPLES - WAKE_HOP_SAMPLES, hop, WAKE_HOP_SAMPLES * sizeof(int16_t));
        }

        float features[WAKE_FEATURE_COUNT] = {};
        if (!wake_extract_features(ring, WAKE_WINDOW_SAMPLES, features)) continue;
        const float score = wake_cosine(features, g_wake_template);
        if (score > 0.65f) ESP_LOGI(TAG, "WAKE score=%.3f threshold=%.3f", score, g_wake_threshold);
        const int64_t now = esp_timer_get_time();
        if (score >= g_wake_threshold && now - g_last_wake_trigger_us > 5000000LL) {
            g_last_wake_trigger_us = now;
            filled = 0;
            ESP_LOGI(TAG, "WAKE OK MEL detected score=%.3f", score);
            ui_status("OUI ?");
            mel_terminal_request_voice();
            vTaskDelay(pdMS_TO_TICKS(900));
        }
    }
}

static void ensure_wake_detector() {
    if (!g_wake_profile_ready || g_wake_task_handle) return;
    xTaskCreatePinnedToCore(wake_detector_task, "mel_wake", 8192, nullptr, 3, &g_wake_task_handle, 0);
}

static bool sync_phone_clock_from_json(cJSON *root) {
    if (!root) return false;
    cJSON *epoch_ms_item = cJSON_GetObjectItemCaseSensitive(root, "epoch_ms");
    cJSON *offset_item = cJSON_GetObjectItemCaseSensitive(root, "utc_offset_seconds");
    if (!cJSON_IsNumber(epoch_ms_item) || !cJSON_IsNumber(offset_item)) return false;

    const int64_t epoch_ms = (int64_t)epoch_ms_item->valuedouble;
    if (epoch_ms < 1700000000000LL) return false;
    const int utc_offset_seconds = offset_item->valueint;

    struct timeval tv = {};
    tv.tv_sec = (time_t)(epoch_ms / 1000LL);
    tv.tv_usec = (suseconds_t)((epoch_ms % 1000LL) * 1000LL);
    if (settimeofday(&tv, nullptr) != 0) {
        ESP_LOGW(TAG, "PHONE CLOCK settimeofday failed");
        return false;
    }

    // POSIX TZ offsets use the inverse sign: UTC+2 local time => "MEL-2".
    const int abs_offset = utc_offset_seconds < 0 ? -utc_offset_seconds : utc_offset_seconds;
    const int hours = abs_offset / 3600;
    const int minutes = (abs_offset % 3600) / 60;
    const char sign = utc_offset_seconds >= 0 ? '-' : '+';
    char tz[32] = {};
    if (minutes) snprintf(tz, sizeof(tz), "MEL%c%d:%02d", sign, hours, minutes);
    else snprintf(tz, sizeof(tz), "MEL%c%d", sign, hours);
    setenv("TZ", tz, 1);
    tzset();

    cJSON *zone = cJSON_GetObjectItemCaseSensitive(root, "timezone");
    ESP_LOGI(TAG, "PHONE CLOCK synced epoch=%lld offset=%d tz=%s source=%s",
             (long long)(epoch_ms / 1000LL), utc_offset_seconds, tz,
             cJSON_IsString(zone) && zone->valuestring ? zone->valuestring : "phone");
    return true;
}

static void clear_config() {
    nvs_handle_t nvs;
    if (nvs_open("mel", NVS_READWRITE, &nvs) == ESP_OK) {
        nvs_erase_all(nvs);
        nvs_commit(nvs);
        nvs_close(nvs);
    }
    memset(&g_cfg, 0, sizeof(g_cfg));
}

static esp_err_t http_event(esp_http_client_event_t *evt) {
    if (evt->event_id == HTTP_EVENT_ON_DATA && evt->user_data && evt->data && evt->data_len > 0) {
        auto *buffer = static_cast<HttpBuffer *>(evt->user_data);
        if (buffer->body.size() + (size_t)evt->data_len <= MAX_HTTP_RESPONSE) {
            buffer->body.append(static_cast<const char *>(evt->data), evt->data_len);
        }
    }
    return ESP_OK;
}

static bool wait_for_mobile_bridge_ready(uint32_t timeout_ms) {
    const int64_t deadline = esp_timer_get_time() + (int64_t)timeout_ms * 1000;
    while (esp_timer_get_time() < deadline) {
        if (mel_mobile_bridge_ready()) return true;
        vTaskDelay(pdMS_TO_TICKS(100));
    }
    return mel_mobile_bridge_ready();
}

static esp_err_t http_request(
    esp_http_client_method_t method,
    const std::string &url,
    const char *content_type,
    const char *body,
    int body_len,
    std::string &response,
    int &status
) {
    auto mobile_request = [&]() -> esp_err_t {
        const std::string prefix = SERVER;
        if (url.rfind(prefix, 0) != 0) return ESP_ERR_INVALID_STATE;
        const std::string path = url.substr(prefix.size());

        if (mel_link_v2_transport_ready()) {
            ESP_LOGI(TAG, "HTTP via MEL LINK V2: %s", path.c_str());
            return mel_link_v2_transport_request(
                method,
                path.c_str(),
                content_type,
                g_device_id,
                reinterpret_cast<const uint8_t *>(body),
                body_len > 0 ? (size_t)body_len : 0,
                response,
                status
            );
        }

        if (!mel_mobile_bridge_ready()) return ESP_ERR_INVALID_STATE;
        ESP_LOGW(TAG, "HTTP falling back to legacy MEL MOBILE bridge: %s", path.c_str());
        return mel_mobile_bridge_request(
            method,
            path.c_str(),
            content_type,
            g_cfg.token,
            g_device_id,
            reinterpret_cast<const uint8_t *>(body),
            body_len > 0 ? (size_t)body_len : 0,
            response,
            status
        );
    };

    // MEL Mobile is the preferred transport whenever its GATT channel is ready.
    // Wi-Fi is a fallback, not the primary path. If BLE itself fails and Wi-Fi
    // is already connected, retry the same request directly over Wi-Fi.
    if (mel_link_v2_transport_ready() || mel_mobile_bridge_ready()) {
        esp_err_t mobile_err = mobile_request();
        if (mobile_err == ESP_OK || !g_wifi_connected) return mobile_err;
        ESP_LOGW(TAG, "MEL MOBILE transport failed (%s); falling back to Wi-Fi",
                 esp_err_to_name(mobile_err));
        response.clear();
        status = 0;
    } else if (g_mobile_connected) {
        // Preserve short Android reconnects before abandoning the phone link.
        ESP_LOGI(TAG, "MEL MOBILE reconnect grace before Wi-Fi fallback");
        if (wait_for_mobile_bridge_ready(8000)) {
            esp_err_t mobile_err = mobile_request();
            if (mobile_err == ESP_OK || !g_wifi_connected) return mobile_err;
            response.clear();
            status = 0;
        } else if (!g_wifi_connected) {
            return ESP_ERR_TIMEOUT;
        }
    }

    if (!g_wifi_connected) return ESP_ERR_INVALID_STATE;

    HttpBuffer buffer;
    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.event_handler = http_event;
    cfg.user_data = &buffer;
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.timeout_ms = 45000;
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return (mel_link_v2_transport_ready() || mel_mobile_bridge_ready()) ? mobile_request() : ESP_FAIL;

    esp_http_client_set_method(client, method);
    if (content_type) esp_http_client_set_header(client, "Content-Type", content_type);
    if (g_cfg.token[0]) {
        std::string auth = std::string("Bearer ") + g_cfg.token;
        esp_http_client_set_header(client, "Authorization", auth.c_str());
        esp_http_client_set_header(client, "X-MEL-Device-ID", g_device_id);
    }
    if (body && body_len > 0) esp_http_client_set_post_field(client, body, body_len);

    esp_err_t err = esp_http_client_perform(client);
    status = esp_http_client_get_status_code(client);
    response = buffer.body;
    esp_http_client_cleanup(client);

    if (err != ESP_OK && (mel_link_v2_transport_ready() || mel_mobile_bridge_ready())) {
        ESP_LOGW(TAG, "Wi-Fi HTTP failed (%s), falling back to MEL MOBILE", esp_err_to_name(err));
        response.clear();
        status = 0;
        return mobile_request();
    }
    return err;
}

static esp_err_t http_request_wifi_direct(
    esp_http_client_method_t method,
    const std::string &url,
    const char *content_type,
    const char *body,
    int body_len,
    std::string &response,
    int &status
) {
    if (!g_wifi_connected) return ESP_ERR_INVALID_STATE;

    HttpBuffer buffer;
    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.event_handler = http_event;
    cfg.user_data = &buffer;
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.timeout_ms = 45000;
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    esp_http_client_set_method(client, method);
    if (content_type) esp_http_client_set_header(client, "Content-Type", content_type);
    if (g_cfg.token[0]) {
        std::string auth = std::string("Bearer ") + g_cfg.token;
        esp_http_client_set_header(client, "Authorization", auth.c_str());
        esp_http_client_set_header(client, "X-MEL-Device-ID", g_device_id);
    }
    if (body && body_len > 0) esp_http_client_set_post_field(client, body, body_len);

    const esp_err_t err = esp_http_client_perform(client);
    status = esp_http_client_get_status_code(client);
    response = buffer.body;
    esp_http_client_cleanup(client);
    return err;
}


static std::string json_string(cJSON *obj);

static uint16_t read_le16(const uint8_t *p) {
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static uint32_t read_le32(const uint8_t *p) {
    return (uint32_t)p[0] |
           ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

static bool http_read_exact(esp_http_client_handle_t client, uint8_t *dst, size_t count) {
    size_t offset = 0;
    while (offset < count) {
        int n = esp_http_client_read(
            client,
            reinterpret_cast<char *>(dst + offset),
            (int)(count - offset)
        );
        if (n <= 0) return false;
        offset += (size_t)n;
    }
    return true;
}

static bool http_discard_exact(esp_http_client_handle_t client, uint32_t count) {
    uint8_t scratch[64];
    while (count > 0) {
        const size_t take = std::min<size_t>(sizeof(scratch), (size_t)count);
        if (!http_read_exact(client, scratch, take)) return false;
        count -= (uint32_t)take;
    }
    return true;
}

static bool read_tts_wav_header(esp_http_client_handle_t client, uint32_t &pcm_bytes) {
    static const uint32_t TTS_MAX_PCM_BYTES = 48000U * 2U * 180U;
    uint8_t riff[12] = {};
    if (!http_read_exact(client, riff, sizeof(riff))) return false;
    if (memcmp(riff, "RIFF", 4) != 0 || memcmp(riff + 8, "WAVE", 4) != 0) return false;

    bool have_fmt = false;
    for (int chunk_index = 0; chunk_index < 12; ++chunk_index) {
        uint8_t chunk_header[8] = {};
        if (!http_read_exact(client, chunk_header, sizeof(chunk_header))) return false;
        const uint32_t chunk_size = read_le32(chunk_header + 4);
        const bool padded = (chunk_size & 1U) != 0;

        if (memcmp(chunk_header, "fmt ", 4) == 0) {
            if (chunk_size < 16 || chunk_size > 64) return false;
            uint8_t fmt[64] = {};
            if (!http_read_exact(client, fmt, chunk_size)) return false;
            if (padded && !http_discard_exact(client, 1)) return false;

            const uint16_t audio_format = read_le16(fmt);
            const uint16_t channels = read_le16(fmt + 2);
            const uint32_t sample_rate = read_le32(fmt + 4);
            const uint16_t bits_per_sample = read_le16(fmt + 14);
            if (audio_format != 1 || channels != 1 || sample_rate != 48000 || bits_per_sample != 16) {
                ESP_LOGE(
                    TAG,
                    "TTS WAV format mismatch format=%u channels=%u rate=%lu bits=%u",
                    (unsigned)audio_format,
                    (unsigned)channels,
                    (unsigned long)sample_rate,
                    (unsigned)bits_per_sample
                );
                return false;
            }
            have_fmt = true;
            continue;
        }

        if (memcmp(chunk_header, "data", 4) == 0) {
            if (!have_fmt || chunk_size == 0 || padded || chunk_size > TTS_MAX_PCM_BYTES) return false;
            pcm_bytes = chunk_size;
            return true;
        }

        if (chunk_size > 4096U) return false;
        if (!http_discard_exact(client, chunk_size + (padded ? 1U : 0U))) return false;
    }
    return false;
}

struct MobileTtsContext {
    bool ok = true;
    bool have_carry = false;
    uint8_t carry = 0;
    bool first_audio = true;
    int64_t started_us = 0;
};

static bool mobile_tts_chunk(const uint8_t *data, size_t len, void *ctx_ptr) {
    auto *ctx = static_cast<MobileTtsContext *>(ctx_ptr);
    if (g_tts_stop_requested) return false;
    if (!ctx || !data || len == 0 || !ctx->ok) return ctx && ctx->ok;
    uint8_t buffer[520];
    size_t offset = 0;
    if (ctx->have_carry) {
        buffer[0] = ctx->carry;
        offset = 1;
        ctx->have_carry = false;
    }
    if (offset + len > sizeof(buffer)) {
        ctx->ok = false;
        return false;
    }
    memcpy(buffer + offset, data, len);
    size_t total = offset + len;
    if (total & 1U) {
        ctx->carry = buffer[total - 1];
        ctx->have_carry = true;
        total--;
    }
    if (total > 0) {
        if (ctx->first_audio) {
            ctx->first_audio = false;
            ESP_LOGI(TAG, "VOICE PERF: TTS first-audio=%lld ms (MOBILE)",
                     (long long)((esp_timer_get_time() - ctx->started_us) / 1000));
        }
        if (esp_codec_dev_write(output_dev, buffer, total) != ESP_CODEC_DEV_OK) {
            ctx->ok = false;
            return false;
        }
    }
    return true;
}


static std::string voice_tts_text(const std::string &text) {
    if (text.size() <= 600) return text;
    size_t end = 600;
    while (end > 0 && (static_cast<unsigned char>(text[end]) & 0xC0) == 0x80) --end;
    std::string out = text.substr(0, end);
    const size_t sentence = out.find_last_of(".!?");
    if (sentence > 240) out.resize(sentence + 1);
    return out;
}

static bool speak_text(const std::string &text) {
    if (!g_voice_output_enabled) {
        ESP_LOGI(TAG, "TTS skipped: voice output disabled");
        return true;
    }
    if (!g_audio_ok || !output_dev || text.empty()) return false;
    g_tts_stop_requested = false;

    const std::string spoken_text = voice_tts_text(text);
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "text", spoken_text.c_str());
    cJSON_AddStringToObject(root, "speaker", "luna");
    std::string body = json_string(root);
    cJSON_Delete(root);

    if (mel_link_v2_transport_ready()) {
        MobileTtsContext ctx;
        ctx.started_us = esp_timer_get_time();
        int status = 0;
        speaker_output_enable(100.0);
        esp_err_t err = mel_link_v2_transport_request_stream(
            HTTP_METHOD_POST,
            "/api/device/v1/voice/tts",
            "application/json",
            g_device_id,
            reinterpret_cast<const uint8_t *>(body.data()),
            body.size(),
            status,
            mobile_tts_chunk,
            &ctx
        );
        speaker_output_disable();
        const bool stopped = g_tts_stop_requested;
        const bool ok = !stopped && err == ESP_OK && status == 200 && ctx.ok && !ctx.have_carry && !ctx.first_audio;
        if (stopped) {
            ESP_LOGI(TAG, "LINK V2 TTS stopped by user");
            ui_status("VOIX STOP");
            return true;
        }
        if (!ok) {
            ESP_LOGW(TAG, "LINK V2 TTS failed err=%s status=%d first_audio=%d; trying fallback",
                     esp_err_to_name(err), status, ctx.first_audio ? 1 : 0);
            if (status > 0) {
                char diag[32] = {};
                snprintf(diag, sizeof(diag), "TTS HTTP %d", status);
                ui_status(diag);
            } else if (ctx.first_audio) {
                ui_status("TTS BLE -> SECOURS");
            }
        } else {
            return true;
        }
        // Do not strand voice output on a failed BLE audio stream. Continue
        // into the legacy mobile or direct Wi-Fi path when available.
    }

    if (!g_cfg.token[0]) {
        ESP_LOGW(TAG, "TTS unavailable: no local token and Link V2 unavailable");
        return false;
    }

    if (!mel_mobile_bridge_ready() && g_mobile_connected && !g_wifi_connected) {
        ESP_LOGI(TAG, "MEL MOBILE reconnect grace before TTS");
        ui_status("RECONNEXION...");
        wait_for_mobile_bridge_ready(3000);
    }

    if (mel_mobile_bridge_ready()) {
        MobileTtsContext ctx;
        ctx.started_us = esp_timer_get_time();
        int status = 0;
        speaker_output_enable(100.0);
        esp_err_t err = mel_mobile_bridge_request_stream(
            HTTP_METHOD_POST,
            "/api/device/v1/voice/tts",
            "application/json",
            g_cfg.token,
            g_device_id,
            reinterpret_cast<const uint8_t *>(body.data()),
            body.size(),
            status,
            mobile_tts_chunk,
            &ctx
        );
        speaker_output_disable();
        const bool ok = err == ESP_OK && status == 200 && ctx.ok && !ctx.have_carry;
        if (!ok) ESP_LOGW(TAG, "MOBILE TTS failed err=%s status=%d", esp_err_to_name(err), status);
        return ok;
    }

    if (!g_wifi_connected) {
        ESP_LOGW(TAG, "TTS unavailable: MEL MOBILE offline and Wi-Fi unavailable");
        return false;
    }

    std::string url = std::string(SERVER) + "/api/device/v1/voice/tts";
    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.timeout_ms = 60000;

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return false;

    esp_http_client_set_method(client, HTTP_METHOD_POST);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    std::string auth = std::string("Bearer ") + g_cfg.token;
    esp_http_client_set_header(client, "Authorization", auth.c_str());
    esp_http_client_set_header(client, "X-MEL-Device-ID", g_device_id);

    bool ok = false;
    const int64_t tts_request_us = esp_timer_get_time();
    if (esp_http_client_open(client, (int)body.size()) == ESP_OK) {
        int written = esp_http_client_write(client, body.data(), (int)body.size());
        if (written == (int)body.size()) {
            esp_http_client_fetch_headers(client);
            int status = esp_http_client_get_status_code(client);
            if (status == 200) {
                uint32_t remaining = 0;
                if (!read_tts_wav_header(client, remaining)) {
                    ESP_LOGE(TAG, "TTS WAV header invalid; refusing audio playback");
                } else {
                    uint8_t *buffer = static_cast<uint8_t *>(heap_caps_malloc(4097, MALLOC_CAP_8BIT));
                    if (buffer) {
                        speaker_output_enable(100.0);
                        ok = true;
                        bool have_carry = false;
                        uint8_t carry = 0;
                        bool first_audio = true;
                        while (remaining > 0 && ok) {
                            if (g_tts_stop_requested) {
                                ESP_LOGI(TAG, "Wi-Fi TTS stopped by user");
                                break;
                            }
                            const size_t offset = have_carry ? 1 : 0;
                            if (have_carry) buffer[0] = carry;
                            const int want = (int)std::min<uint32_t>(4096U, remaining);
                            int n = esp_http_client_read(
                                client,
                                reinterpret_cast<char *>(buffer + offset),
                                want
                            );
                            if (n <= 0) {
                                ESP_LOGE(TAG, "TTS WAV truncated with %lu bytes remaining", (unsigned long)remaining);
                                ok = false;
                                break;
                            }
                            remaining -= (uint32_t)n;

                            size_t total = offset + (size_t)n;
                            have_carry = (total & 1U) != 0;
                            if (have_carry) {
                                carry = buffer[total - 1];
                                total -= 1;
                            }
                            if (total > 0) {
                                if (first_audio) {
                                    first_audio = false;
                                    ESP_LOGI(TAG, "VOICE PERF: TTS first-audio=%lld ms",
                                             (long long)((esp_timer_get_time() - tts_request_us) / 1000));
                                }
                                if (esp_codec_dev_write(output_dev, buffer, total) != ESP_CODEC_DEV_OK) {
                                    ESP_LOGE(TAG, "TTS codec write failed");
                                    ok = false;
                                    break;
                                }
                            }
                        }
                        if (g_tts_stop_requested) {
                            ok = true;
                            ui_status("VOIX STOP");
                        } else if (have_carry || remaining != 0) ok = false;
                        speaker_output_disable();
                        heap_caps_free(buffer);
                    }
                }
            } else {
                ESP_LOGW(TAG, "TTS failed status=%d", status);
            }
        }
        esp_http_client_close(client);
    }
    esp_http_client_cleanup(client);
    return ok;
}

static std::string json_string(cJSON *obj) {
    char *raw = cJSON_PrintUnformatted(obj);
    std::string out = raw ? raw : "{}";
    if (raw) cJSON_free(raw);
    return out;
}

static bool pair_terminal(bool force_android_refresh = false) {
    g_fresh_pair_proved_online = false;
    if (g_cfg.token[0] && !force_android_refresh) return true;
    const bool android_sponsored_pair = mel_mobile_bridge_ready();
    if (!g_cfg.pair_code[0] && !android_sponsored_pair) return false;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id", g_device_id);
    cJSON_AddStringToObject(root, "name", "MINI");
    cJSON_AddStringToObject(root, "model", MODEL);
    cJSON_AddStringToObject(root, "firmware", MEL_FW_VERSION);
    cJSON_AddStringToObject(root, "protocol_version", MEL_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "pair_code", g_cfg.pair_code);
    std::string body = json_string(root);
    cJSON_Delete(root);

    std::string response;
    int status = 0;
    esp_err_t err = http_request(
        HTTP_METHOD_POST,
        std::string(SERVER) + "/api/device/v1/pair",
        "application/json",
        body.data(),
        (int)body.size(),
        response,
        status
    );
    if (err != ESP_OK || status != 200) {
        g_last_session_status = err == ESP_OK ? status : -1;
        ESP_LOGE(TAG, "Pairing failed status=%d err=%s body=%s", status, esp_err_to_name(err), response.c_str());
        return false;
    }

    cJSON *json = cJSON_Parse(response.c_str());
    cJSON *token = json ? cJSON_GetObjectItemCaseSensitive(json, "token") : nullptr;
    cJSON *protocol = json ? cJSON_GetObjectItemCaseSensitive(json, "protocol_version") : nullptr;
    bool protocol_ok = cJSON_IsString(protocol) && protocol->valuestring && !strcmp(protocol->valuestring, MEL_PROTOCOL_VERSION);
    bool ok = protocol_ok && cJSON_IsString(token) && token->valuestring && strlen(token->valuestring) < sizeof(g_cfg.token);
    if (ok) {
        strlcpy(g_cfg.token, token->valuestring, sizeof(g_cfg.token));
        save_string("token", g_cfg.token);
        save_string("pair_code", "");
        g_cfg.pair_code[0] = '\0';
        // HTTP 200 from /pair is itself a real backend round-trip that issued
        // this token. Do not immediately require a second BLE transaction before
        // declaring a freshly paired MINI online.
        g_fresh_pair_proved_online = true;
        g_last_session_status = 200;
    }
    if (!ok && status == 200) {
        g_last_session_status = -2; // pair response reached MINI but token/protocol could not be parsed
        ESP_LOGE(TAG, "Pairing response invalid despite HTTP 200");
    }
    if (json) cJSON_Delete(json);
    return ok;
}

static void wifi_event(void *, esp_event_base_t base, int32_t id, void *data) {
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (g_wifi_retry++ < 10) esp_wifi_connect();
        else if (g_wifi_bits) xEventGroupSetBits(g_wifi_bits, WIFI_FAIL_BIT);
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        auto *event = static_cast<ip_event_got_ip_t *>(data);
        snprintf(g_ip, sizeof(g_ip), IPSTR, IP2STR(&event->ip_info.ip));
        g_wifi_retry = 0;
        if (g_wifi_bits) xEventGroupSetBits(g_wifi_bits, WIFI_CONNECTED_BIT);
    }
}

static bool connect_wifi() {
    g_wifi_bits = xEventGroupCreate();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event, nullptr));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event, nullptr));

    wifi_config_t wifi = {};
    strlcpy(reinterpret_cast<char *>(wifi.sta.ssid), g_cfg.ssid, sizeof(wifi.sta.ssid));
    strlcpy(reinterpret_cast<char *>(wifi.sta.password), g_cfg.password, sizeof(wifi.sta.password));
    wifi.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    wifi.sta.pmf_cfg.capable = true;
    wifi.sta.pmf_cfg.required = false;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi));
    ESP_ERROR_CHECK(esp_wifi_start());

    EventBits_t bits = xEventGroupWaitBits(
        g_wifi_bits,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
        pdFALSE,
        pdFALSE,
        pdMS_TO_TICKS(20000)
    );
    return (bits & WIFI_CONNECTED_BIT) != 0;
}

static std::string url_decode(const char *value) {
    std::string out;
    for (size_t i = 0; value && value[i]; ++i) {
        if (value[i] == '+') out.push_back(' ');
        else if (value[i] == '%' && value[i + 1] && value[i + 2]) {
            char hex[3] = { value[i + 1], value[i + 2], 0 };
            out.push_back((char)strtol(hex, nullptr, 16));
            i += 2;
        } else out.push_back(value[i]);
    }
    return out;
}

static std::string form_value(const std::string &body, const char *key) {
    std::string marker = std::string(key) + "=";
    size_t pos = body.find(marker);
    if (pos == std::string::npos) return "";
    pos += marker.size();
    size_t end = body.find('&', pos);
    return url_decode(body.substr(pos, end == std::string::npos ? std::string::npos : end - pos).c_str());
}

static esp_err_t setup_get(httpd_req_t *req) {
    static const char html[] =
        "<!doctype html><html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
        "<title>MINI Setup</title><style>body{font-family:system-ui;background:#07111f;color:#fff;padding:22px;max-width:520px;margin:auto}"
        "input,button{width:100%;padding:14px;margin:8px 0;border-radius:10px;border:1px solid #334155;box-sizing:border-box}"
        "button{background:#2563eb;color:white;font-weight:700}</style><h1>MINI  premier demarrage</h1>"
        "<p>Saisis ton Wi-Fi et le code cree dans MEL &gt; MINI.</p>"
        "<form method=post action=/save><input name=ssid maxlength=32 placeholder='Nom Wi-Fi' required>"
        "<input name=password type=password maxlength=64 placeholder='Mot de passe Wi-Fi'>"
        "<input name=pair_code maxlength=16 placeholder='Code MEL' required autocomplete=off>"
        "<button>Connecter MINI</button></form></html>";
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    return httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
}

static void restart_task(void *) {
    vTaskDelay(pdMS_TO_TICKS(1800));
    esp_restart();
}

static esp_err_t setup_save(httpd_req_t *req) {
    const int total = (int)std::min<size_t>((size_t)req->content_len, (size_t)1024);
    std::string body((size_t)total, '\0');
    int read = 0;
    while (read < total) {
        int n = httpd_req_recv(req, body.data() + read, total - read);
        if (n <= 0) break;
        read += n;
    }
    body.resize((size_t)std::max(read, 0));

    std::string ssid = form_value(body, "ssid");
    std::string password = form_value(body, "password");
    std::string code = form_value(body, "pair_code");
    if (ssid.empty() || code.empty() || ssid.size() > 32 || password.size() > 64 || code.size() > 16) {
        httpd_resp_set_status(req, "400 Bad Request");
        return httpd_resp_sendstr(req, "Parametres invalides.");
    }

    save_string("ssid", ssid.c_str());
    save_string("wifi_pass", password.c_str());
    save_string("pair_code", code.c_str());
    save_string("token", "");

    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_sendstr(req, "<html><meta charset=utf-8><body><h2>Configuration enregistree.</h2><p>MEL redemarre et se connecte...</p></body></html>");
    xTaskCreate(restart_task, "mel_restart", 2048, nullptr, 3, nullptr);
    return ESP_OK;
}

static void show_setup_ui(const char *ssid, const char *pass) {
    char message[420];
    snprintf(
        message, sizeof(message),
        "Premier demarrage\n\n1. Wi-Fi : %s\n2. Mot de passe : %s\n3. Ouvre http://192.168.4.1\n4. Dans MEL > MINI, cree un code puis saisis-le.\n\nBOOT au demarrage = reinitialiser.",
        ssid, pass
    );
    ui_status("CONFIGURATION");
    ui_answer(message);
}

static void start_setup_ap() {
    uint8_t mac[6] = {};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char ssid[32] = {};
    char pass[32] = {};
    snprintf(ssid, sizeof(ssid), "MINI-SETUP-%02X%02X", mac[4], mac[5]);
    snprintf(pass, sizeof(pass), "MINI%02X%02X%02X!", mac[3], mac[4], mac[5]);

    esp_netif_create_default_wifi_ap();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    if (esp_wifi_init(&init) != ESP_OK) {
        esp_wifi_deinit();
        ESP_ERROR_CHECK(esp_wifi_init(&init));
    }
    wifi_config_t wifi = {};
    strlcpy(reinterpret_cast<char *>(wifi.ap.ssid), ssid, sizeof(wifi.ap.ssid));
    strlcpy(reinterpret_cast<char *>(wifi.ap.password), pass, sizeof(wifi.ap.password));
    wifi.ap.ssid_len = strlen(ssid);
    wifi.ap.channel = 1;
    wifi.ap.max_connection = 4;
    wifi.ap.authmode = WIFI_AUTH_WPA2_PSK;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi));
    ESP_ERROR_CHECK(esp_wifi_start());

    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.max_uri_handlers = 4;
    if (httpd_start(&g_setup_server, &cfg) == ESP_OK) {
        httpd_uri_t root = {};
        root.uri = "/";
        root.method = HTTP_GET;
        root.handler = setup_get;
        httpd_register_uri_handler(g_setup_server, &root);

        httpd_uri_t save = {};
        save.uri = "/save";
        save.method = HTTP_POST;
        save.handler = setup_save;
        httpd_register_uri_handler(g_setup_server, &save);
    }
    show_setup_ui(ssid, pass);
}

static std::string parse_json_text(const std::string &body, const char *field) {
    cJSON *json = cJSON_Parse(body.c_str());
    cJSON *node = json ? cJSON_GetObjectItemCaseSensitive(json, field) : nullptr;
    std::string value = cJSON_IsString(node) && node->valuestring ? node->valuestring : "";
    if (json) cJSON_Delete(json);
    return value;
}

static MelChatReply chat_with_mel(const std::string &text) {
    MelChatReply reply;
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "text", text.c_str());
    cJSON_AddStringToObject(root, "conversation_id", g_device_id);
    cJSON_AddStringToObject(root, "input_source", "voice-server-transcription");
    cJSON_AddBoolToObject(root, "voice_mode", true);
    cJSON_AddBoolToObject(root, "voice_reply", true);
    cJSON_AddBoolToObject(root, "parallel", false);
    std::string body = json_string(root);
    cJSON_Delete(root);

    std::string response;
    int status = 0;
    const esp_err_t err = http_request(
        HTTP_METHOD_POST,
        std::string(SERVER) + "/api/device/v1/chat",
        "application/json",
        body.data(),
        (int)body.size(),
        response,
        status
    );
    if (err != ESP_OK || status != 200) {
        char diag[96] = {};
        if (!response.empty()) {
            snprintf(diag, sizeof(diag), "CHAT %d · %s", status, response.c_str());
        } else {
            snprintf(diag, sizeof(diag), "CHAT %d · %s", status, esp_err_to_name(err));
        }
        reply.text = diag;
        return reply;
    }

    cJSON *json = cJSON_Parse(response.c_str());
    cJSON *text_node = json ? cJSON_GetObjectItemCaseSensitive(json, "text") : nullptr;
    if (cJSON_IsString(text_node) && text_node->valuestring) reply.text = text_node->valuestring;
    if (reply.text.empty()) reply.text = "MEL n'a pas renvoye de texte.";

    cJSON *display = json ? cJSON_GetObjectItemCaseSensitive(json, "display") : nullptr;
    if (cJSON_IsObject(display)) {
        cJSON *title = cJSON_GetObjectItemCaseSensitive(display, "title");
        if (cJSON_IsString(title) && title->valuestring) reply.display_title = title->valuestring;
        cJSON *items = cJSON_GetObjectItemCaseSensitive(display, "items");
        if (cJSON_IsArray(items)) {
            cJSON *item = nullptr;
            cJSON_ArrayForEach(item, items) {
                if (reply.display_items.size() >= 5) break;
                cJSON *url = cJSON_GetObjectItemCaseSensitive(item, "url");
                if (!cJSON_IsString(url) || !url->valuestring || strncmp(url->valuestring, "http", 4) != 0) continue;
                MelDisplayItem row;
                cJSON *item_title = cJSON_GetObjectItemCaseSensitive(item, "title");
                cJSON *snippet = cJSON_GetObjectItemCaseSensitive(item, "snippet");
                cJSON *image_url = cJSON_GetObjectItemCaseSensitive(item, "image_url");
                row.url = url->valuestring;
                if (cJSON_IsString(item_title) && item_title->valuestring) row.title = item_title->valuestring;
                if (cJSON_IsString(snippet) && snippet->valuestring) row.snippet = snippet->valuestring;
                if (cJSON_IsString(image_url) && image_url->valuestring && strncmp(image_url->valuestring, "https://", 8) == 0) {
                    row.image_url = image_url->valuestring;
                }
                reply.display_items.push_back(std::move(row));
            }
        }
    }
    if (json) cJSON_Delete(json);
    return reply;
}

static void wav_header(uint8_t *h, uint32_t data_size, uint32_t sample_rate) {
    const uint32_t byte_rate = sample_rate * 2;
    const uint32_t riff_size = 36 + data_size;
    memcpy(h, "RIFF", 4); memcpy(h + 8, "WAVEfmt ", 8);
    h[4]=(uint8_t)riff_size; h[5]=(uint8_t)(riff_size>>8); h[6]=(uint8_t)(riff_size>>16); h[7]=(uint8_t)(riff_size>>24);
    h[16]=16; h[17]=h[18]=h[19]=0;
    h[20]=1; h[21]=0; h[22]=1; h[23]=0;
    h[24]=(uint8_t)sample_rate; h[25]=(uint8_t)(sample_rate>>8); h[26]=(uint8_t)(sample_rate>>16); h[27]=(uint8_t)(sample_rate>>24);
    h[28]=(uint8_t)byte_rate; h[29]=(uint8_t)(byte_rate>>8); h[30]=(uint8_t)(byte_rate>>16); h[31]=(uint8_t)(byte_rate>>24);
    h[32]=2; h[33]=0; h[34]=16; h[35]=0; memcpy(h+36,"data",4);
    h[40]=(uint8_t)data_size; h[41]=(uint8_t)(data_size>>8); h[42]=(uint8_t)(data_size>>16); h[43]=(uint8_t)(data_size>>24);
}


static void stt_link_progress(size_t sent_samples, size_t total_samples, void *) {
    if (total_samples == 0) return;
    if (sent_samples >= total_samples) {
        ui_status("STT SERVEUR...");
        return;
    }
    const unsigned pct = (unsigned)((sent_samples * 100U) / total_samples);
    if (pct >= 75U) ui_status("STT 75%...");
    else if (pct >= 50U) ui_status("STT 50%...");
    else if (pct >= 25U) ui_status("STT 25%...");
    else ui_status("STT BLE...");
}

static std::string record_and_transcribe() {
    voice_error(nullptr);
    if (!g_audio_ok || !input_dev) {
        ESP_LOGE(TAG, "VOICE: input codec unavailable");
        voice_error("MICRO INDISPONIBLE");
        return "";
    }

    auto *capture = static_cast<int16_t *>(heap_caps_malloc(VOICE_CAPTURE_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!capture) capture = static_cast<int16_t *>(heap_caps_malloc(VOICE_CAPTURE_BYTES, MALLOC_CAP_8BIT));
    if (!capture) {
        ESP_LOGE(TAG, "VOICE: capture allocation failed");
        voice_error("MEMOIRE AUDIO");
        return "";
    }

    // Read in short chunks so a second press on PARLER can stop recording
    // immediately instead of waiting for the maximum recording duration.
    constexpr int CAPTURE_CHUNK_MS = 100;
    constexpr int CAPTURE_CHUNK_SAMPLES = (VOICE_CAPTURE_RATE * CAPTURE_CHUNK_MS) / 1000;
    int captured_samples = 0;
    int rc = ESP_CODEC_DEV_OK;

    ensure_mic_mutex();
    if (!g_mic_mutex || xSemaphoreTake(g_mic_mutex, pdMS_TO_TICKS(2500)) != pdTRUE) {
        heap_caps_free(capture);
        ESP_LOGE(TAG, "VOICE: microphone mutex unavailable after priority wait");
        voice_error("MICRO OCCUPE");
        return "";
    }
    esp_codec_dev_set_in_gain(input_dev, 40.0);
    while (captured_samples < VOICE_CAPTURE_SAMPLES) {
        const int remaining = VOICE_CAPTURE_SAMPLES - captured_samples;
        const int chunk_samples = remaining < CAPTURE_CHUNK_SAMPLES ? remaining : CAPTURE_CHUNK_SAMPLES;
        rc = esp_codec_dev_read(
            input_dev,
            capture + captured_samples,
            (int)(chunk_samples * sizeof(int16_t))
        );
        if (rc != ESP_CODEC_DEV_OK) break;
        captured_samples += chunk_samples;

        uint64_t chunk_abs_sum = 0;
        for (int i = 0; i < chunk_samples; i += 4) {
            const int32_t v = capture[captured_samples - chunk_samples + i];
            chunk_abs_sum += (uint32_t)(v < 0 ? -v : v);
        }
        const int sampled = (chunk_samples + 3) / 4;
        const uint32_t chunk_mean_abs = sampled > 0 ? (uint32_t)(chunk_abs_sum / sampled) : 0;
        int visual_level = (int)(chunk_mean_abs / 24U);
        if (visual_level > 100) visual_level = 100;
        g_voice_level = visual_level;

        if (g_voice_stop_requested) {
            ESP_LOGI(TAG, "VOICE STOP: manual stop after %d ms (%d samples)",
                     (captured_samples * 1000) / VOICE_CAPTURE_RATE, captured_samples);
            break;
        }
    }
    esp_codec_dev_set_in_gain(input_dev, 0.0);
    xSemaphoreGive(g_mic_mutex);
    g_voice_level = 0;

    if (rc != ESP_CODEC_DEV_OK) {
        ESP_LOGE(TAG, "VOICE: esp_codec_dev_read failed rc=%d after %d samples", rc, captured_samples);
        heap_caps_free(capture);
        voice_error("LECTURE MICRO");
        return "";
    }
    if (captured_samples < (VOICE_CAPTURE_RATE / 4)) {
        ESP_LOGW(TAG, "VOICE: recording too short (%d samples)", captured_samples);
        heap_caps_free(capture);
        voice_error("ENREG. TROP COURT");
        return "";
    }

    // Recording is now finished. The second press means STOP + transcribe,
    // never "cancel and discard".
    g_runtime_state = MEL_TERMINAL_TRANSCRIBING;
    ui_status("TRANSCRIPTION...");

    int64_t dc_sum = 0;
    int16_t raw_min = 32767;
    int16_t raw_max = -32768;
    uint64_t raw_abs_sum = 0;
    for (int i = 0; i < captured_samples; ++i) {
        const int16_t sample = capture[i];
        dc_sum += sample;
        if (sample < raw_min) raw_min = sample;
        if (sample > raw_max) raw_max = sample;
        raw_abs_sum += (uint32_t)(sample < 0 ? -(int32_t)sample : (int32_t)sample);
    }
    const int32_t dc = (int32_t)(dc_sum / captured_samples);
    const uint32_t raw_mean_abs = (uint32_t)(raw_abs_sum / captured_samples);
    ESP_LOGI(TAG,
             "MIC RAW: samples=%d duration_ms=%d min=%d max=%d span=%ld mean_abs=%u dc=%ld",
             captured_samples, (captured_samples * 1000) / VOICE_CAPTURE_RATE,
             (int)raw_min, (int)raw_max,
             (long)((int32_t)raw_max - (int32_t)raw_min),
             (unsigned)raw_mean_abs, (long)dc);

    const int speech_samples = captured_samples / 3;
    const int speech_bytes = speech_samples * (int)sizeof(int16_t);
    auto *speech = static_cast<int16_t *>(heap_caps_malloc(speech_bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!speech) speech = static_cast<int16_t *>(heap_caps_malloc(speech_bytes, MALLOC_CAP_8BIT));
    if (!speech) {
        heap_caps_free(capture);
        ESP_LOGE(TAG, "VOICE: STT buffer allocation failed");
        voice_error("MEMOIRE STT");
        return "";
    }

    // The Waveshare BSP opens esp_codec_dev at 48 kHz. Low-pass then
    // decimate by 3 so Whisper receives a real 16 kHz signal with correct time.
    const int decimated = decimate_48k_to_16k(
        capture, captured_samples, speech, speech_samples, dc
    );
    heap_caps_free(capture);
    if (decimated != speech_samples || speech_samples <= 0) {
        heap_caps_free(speech);
        ESP_LOGE(TAG, "VOICE: decimator produced %d/%d samples", decimated, speech_samples);
        voice_error("DECIMATION STT");
        return "";
    }

    int32_t peak = 0;
    uint64_t speech_abs_sum = 0;
    for (int i = 0; i < speech_samples; ++i) {
        const int32_t v = speech[i];
        const int32_t a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        speech_abs_sum += (uint32_t)a;
    }

    uint32_t speech_mean_abs = (uint32_t)(speech_abs_sum / speech_samples);
    if (peak < 90 || speech_mean_abs < 18) {
        ESP_LOGW(TAG, "MIC SILENCE: peak=%ld mean_abs=%u samples=%d",
                 (long)peak, (unsigned)speech_mean_abs, speech_samples);
        heap_caps_free(speech);
        voice_error("AUCUNE VOIX");
        return "";
    }

    // Normalize conversational speech without excessive amplification of noise.
    int32_t scale_q15 = (int32_t)(((int64_t)16000 * 32768) / peak);
    const int32_t max_scale_q15 = 8 * 32768;
    if (scale_q15 > max_scale_q15) scale_q15 = max_scale_q15;
    if (scale_q15 < 8192) scale_q15 = 8192;
    peak = 0;
    speech_abs_sum = 0;
    for (int i = 0; i < speech_samples; ++i) {
        int32_t v = (int32_t)(((int64_t)speech[i] * scale_q15) >> 15);
        if (v > 30000) v = 30000;
        if (v < -30000) v = -30000;
        speech[i] = (int16_t)v;
        const int32_t a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        speech_abs_sum += (uint32_t)a;
    }
    speech_mean_abs = (uint32_t)(speech_abs_sum / speech_samples);
    ESP_LOGI(TAG, "MIC STT READY: rate=%d samples=%d bytes=%d peak=%ld mean_abs=%u scale_q15=%ld",
             VOICE_STT_RATE, speech_samples, speech_bytes, (long)peak,
             (unsigned)speech_mean_abs, (long)scale_q15);

    std::string response;
    int status = 0;
    esp_err_t err = ESP_FAIL;

    auto transcribe_wifi_direct = [&]() -> esp_err_t {
        const char *boundary = "----MEL-ESP32-VOICE";
        std::string prefix = std::string("--") + boundary +
            "\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"mel.wav\"\r\n"
            "Content-Type: audio/wav\r\n\r\n";
        std::string suffix = std::string("\r\n--") + boundary + "--\r\n";
        const size_t total = prefix.size() + 44 + (size_t)speech_bytes + suffix.size();
        auto *multipart = static_cast<uint8_t *>(
            heap_caps_malloc(total, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
        );
        if (!multipart) multipart = static_cast<uint8_t *>(heap_caps_malloc(total, MALLOC_CAP_8BIT));
        if (!multipart) {
            ESP_LOGE(TAG, "VOICE: Wi-Fi multipart allocation failed");
            return ESP_ERR_NO_MEM;
        }

        size_t off = 0;
        memcpy(multipart + off, prefix.data(), prefix.size()); off += prefix.size();
        wav_header(multipart + off, (uint32_t)speech_bytes, VOICE_STT_RATE); off += 44;
        memcpy(multipart + off, speech, speech_bytes); off += (size_t)speech_bytes;
        memcpy(multipart + off, suffix.data(), suffix.size());

        std::string content_type = std::string("multipart/form-data; boundary=") + boundary;
        ESP_LOGI(TAG, "STT WIFI DIRECT WAV: bytes=%u wav_bytes=%d rate=%d duration_ms=%d",
                 (unsigned)total, speech_bytes + 44, VOICE_STT_RATE,
                 (speech_samples * 1000) / VOICE_STT_RATE);
        const esp_err_t wifi_err = http_request_wifi_direct(
            HTTP_METHOD_POST,
            std::string(SERVER) + "/api/device/v1/voice/transcribe",
            content_type.c_str(),
            reinterpret_cast<const char *>(multipart),
            (int)total,
            response,
            status
        );
        heap_caps_free(multipart);
        ESP_LOGI(TAG, "STT WIFI DIRECT RESULT err=%s status=%d body=%.*s",
                 esp_err_to_name(wifi_err), status,
                 (int)std::min<size_t>(response.size(), 240), response.c_str());
        return wifi_err;
    };

    if (mel_mobile_bridge_ready()) {
        ui_status("STT V2...");
        ESP_LOGI(TAG,
                 "STT V2 ADPCM: pcm16_samples=%d pcm16_bytes=%d rate=%d",
                 speech_samples, speech_bytes, VOICE_STT_RATE);
        err = mel_link_v2_transport_transcribe_adpcm(
            speech,
            (size_t)speech_samples,
            g_device_id,
            response,
            status,
            stt_link_progress,
            nullptr
        );
        ESP_LOGI(TAG, "STT V2 RESULT err=%s status=%d body=%.*s",
                 esp_err_to_name(err), status,
                 (int)std::min<size_t>(response.size(), 240), response.c_str());

        if ((err != ESP_OK || status != 200) && g_wifi_connected) {
            ESP_LOGW(TAG,
                     "STT V2 failed err=%s status=%d; retrying direct Wi-Fi",
                     esp_err_to_name(err), status);
            ui_status("STT WIFI...");
            response.clear();
            status = 0;
            err = transcribe_wifi_direct();
        }
    } else {
        if (!g_wifi_connected) {
            heap_caps_free(speech);
            voice_error("AUCUN TRANSPORT");
            return "";
        }
        ui_status("STT WIFI...");
        err = transcribe_wifi_direct();
    }

    heap_caps_free(speech);

    if (err != ESP_OK) {
        if (!response.empty()) {
            // Transport returns compact actionable diagnostics such as
            // BT_MTU_23, BT_AUDIO_CREDIT_TIMEOUT, AUDIO_SEQUENCE or
            // STT_RESPONSE_TIMEOUT. Keep the exact reason visible on MINI.
            voice_error(response.c_str());
        } else {
            char diag[64] = {};
            snprintf(diag, sizeof(diag), "STT_TRANSPORT_%s", esp_err_to_name(err));
            voice_error(diag);
        }
        return "";
    }
    if (status != 200) {
        const std::string server_code = parse_json_text(response, "code");
        ESP_LOGE(TAG, "STT ERROR status=%d code=%s", status,
                 server_code.empty() ? "-" : server_code.c_str());
        if (server_code == "TRANSCRIPTION_UNAVAILABLE") voice_error("STT IA ERREUR");
        else if (server_code == "EMPTY_TRANSCRIPTION") voice_error("TRANSCRIPTION VIDE");
        else if (server_code == "AI_BINDING_MISSING") voice_error("STT IA ABSENTE");
        else if (status == 401 || status == 403) voice_error("SESSION MEL");
        else voice_error("SERVEUR STT");
        return "";
    }

    std::string text = parse_json_text(response, "text");
    ESP_LOGI(TAG, "STT TEXT: %s", text.empty() ? "<empty>" : text.c_str());
    if (text.empty()) voice_error("TRANSCRIPTION VIDE");
    return text;
}

static void voice_worker_task(void *) {
    ESP_LOGI(
        TAG,
        "VOICE WORKER READY core=%d free_heap=%u largest_internal=%u",
        xPortGetCoreID(),
        (unsigned)esp_get_free_heap_size(),
        (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)
    );

    for (;;) {
        // The worker is created once during boot, before camera/LVGL/BLE consume
        // internal heap. PARLER only sends a task notification; no stack
        // allocation happens at click time.
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        if (!g_voice_job_active) continue;

        g_runtime_state = MEL_TERMINAL_LISTENING;
        ui_status("ECOUTE...");
        ui_answer("");
        ESP_LOGI(TAG, "VOICE WORKER notified: capture begins immediately");
        vTaskDelay(pdMS_TO_TICKS(60));

        const int64_t stt_started_us = esp_timer_get_time();
        std::string text = record_and_transcribe();
        g_voice_capture_requested = false;
        ESP_LOGI(TAG, "VOICE PERF: STT total=%lld ms",
                 (long long)((esp_timer_get_time() - stt_started_us) / 1000));

        if (text.empty()) {
            g_runtime_state = MEL_TERMINAL_ERROR;
            ui_status(g_last_voice_error ? g_last_voice_error : "ERREUR STT");
            ui_answer("");
            vTaskDelay(pdMS_TO_TICKS(1800));
            g_runtime_state = MEL_TERMINAL_IDLE;
            g_voice_stop_requested = false;
            g_voice_job_active = false;
            continue;
        }

        if (handle_local_media_command(text)) {
            g_voice_stop_requested = false;
            g_voice_job_active = false;
            continue;
        }

        g_runtime_state = MEL_TERMINAL_THINKING;
        ui_status("REFLEXION...");
        ui_answer("");
        const int64_t chat_started_us = esp_timer_get_time();
        MelChatReply reply = chat_with_mel(text);
        set_display_results(reply);
        const std::string &answer = reply.text;
        ESP_LOGI(TAG, "VOICE PERF: CHAT=%lld ms chars=%u display_items=%u",
                 (long long)((esp_timer_get_time() - chat_started_us) / 1000),
                 (unsigned)answer.size(), (unsigned)reply.display_items.size());

        g_runtime_state = MEL_TERMINAL_SPEAKING;
        ui_status("MEL PARLE");
        std::string visible_answer = answer;
        if (visible_answer.size() > 2000) visible_answer.resize(2000);
        mini_ui_open_response_page(visible_answer.c_str());

        const int64_t tts_started_us = esp_timer_get_time();
        const bool voice_enabled = g_voice_output_enabled;
        const bool spoken = speak_text(answer);
        ESP_LOGI(TAG, "VOICE PERF: TTS+PLAY=%lld ms",
                 (long long)((esp_timer_get_time() - tts_started_us) / 1000));
        if (!spoken && voice_enabled) {
            ESP_LOGW(TAG, "Voice reply unavailable");
            vTaskDelay(pdMS_TO_TICKS(900));
        }

        if (!g_display_items.empty()) {
            ui_show_display_source(0);
            if (mel_link_v2_transport_ready() || mel_mobile_bridge_ready()) render_display_item_card(0);
        } else {
            ui_status("");
        }

        g_runtime_state = MEL_TERMINAL_IDLE;
        if (g_mobile_connected && g_online && mel_mobile_bridge_ready() && !g_wake_sync_task_handle) {
            xTaskCreatePinnedToCore(
                mobile_companion_sync_task,
                "mel_mobile_sync",
                6144,
                nullptr,
                3,
                &g_wake_sync_task_handle,
                0
            );
        }
        g_voice_stop_requested = false;
        g_voice_capture_requested = false;
        g_voice_job_active = false;
    }
}

bool mel_terminal_prepare_voice_worker(void) {
    if (g_voice_worker_handle) return true;

    const BaseType_t created = xTaskCreatePinnedToCoreWithCaps(
        voice_worker_task,
        "mel_voice",
        10240,
        nullptr,
        5,
        &g_voice_worker_handle,
        0,
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
    );

    if (created != pdPASS || !g_voice_worker_handle) {
        g_voice_worker_handle = nullptr;
        ESP_LOGE(
            TAG,
            "VOICE WORKER BOOT FAIL rc=%ld free_heap=%u largest_internal=%u",
            (long)created,
            (unsigned)esp_get_free_heap_size(),
            (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)
        );
        return false;
    }

    ESP_LOGI(
        TAG,
        "VOICE WORKER RESERVED at boot free_heap=%u largest_internal=%u",
        (unsigned)esp_get_free_heap_size(),
        (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)
    );
    return true;
}

void mel_terminal_request_voice(void) {
    if (!g_audio_ok || !input_dev) {
        voice_error("MICRO INDISPONIBLE");
        ui_status("MICRO INDISPONIBLE");
        ESP_LOGW(TAG, "PARLER refused: microphone unavailable");
        return;
    }
    if (!g_online && !mel_mobile_bridge_ready()) {
        voice_error("RELAIS MEL");
        ui_status("RELAIS MEL INDISPONIBLE");
        ESP_LOGW(TAG, "PARLER refused: no authenticated transport");
        return;
    }

    if (g_voice_job_active) {
        if (g_runtime_state == MEL_TERMINAL_LISTENING) {
            g_voice_stop_requested = true;
            ui_status("STOP...");
            ESP_LOGI(TAG, "VOICE STOP requested by second press");
        }
        return;
    }

    if (!g_voice_worker_handle) {
        g_runtime_state = MEL_TERMINAL_ERROR;
        voice_error("VOIX BOOT");
        ui_status("VOIX BOOT");
        ESP_LOGE(TAG, "PARLER refused: boot-time voice worker is unavailable");
        return;
    }

    voice_error(nullptr);
    g_voice_stop_requested = false;
    g_voice_capture_requested = true;
    g_voice_job_active = true;
    g_runtime_state = MEL_TERMINAL_LISTENING;
    ui_status("ECOUTE...");
    ui_answer("");

    xTaskNotifyGive(g_voice_worker_handle);
    ESP_LOGI(TAG, "PARLER -> permanent voice worker notified");
}

int mel_terminal_state(void) {
    return g_runtime_state;
}

bool mel_terminal_online(void) {
    return g_online;
}

int mel_terminal_voice_level(void) {
    return g_voice_level;
}

const char *mel_terminal_last_voice_error(void) {
    return g_last_voice_error ? g_last_voice_error : "";
}

bool mel_terminal_voice_output_enabled(void) {
    return g_voice_output_enabled;
}

void mel_terminal_set_voice_output_enabled(bool enabled) {
    g_voice_output_enabled = enabled;
    if (enabled) {
        // STOP VOIX used to leave this latch asserted until a later speak_text()
        // call. Rearm audio immediately when the user explicitly turns voice ON.
        g_tts_stop_requested = false;
        voice_error(nullptr);
        ESP_LOGI(TAG, "VOICE OUTPUT activation rearmed tts_stop=0 audio_ok=%d output_dev=%p", g_audio_ok ? 1 : 0, output_dev);
    } else {
        g_tts_stop_requested = true;
        if (output_dev) speaker_output_disable();
    }
    nvs_handle_t nvs;
    if (nvs_open("mel", NVS_READWRITE, &nvs) == ESP_OK) {
        nvs_set_u8(nvs, "voice_out", enabled ? 1 : 0);
        nvs_commit(nvs);
        nvs_close(nvs);
    }
    ESP_LOGI(TAG, "VOICE OUTPUT %s", enabled ? "ENABLED" : "DISABLED");
}

static void voice_output_test_task(void *) {
    ui_status("TEST VOIX...");
    const bool ok = speak_text("La reponse vocale est activee.");
    ui_status(ok ? "VOIX : ON" : "VOIX : ECHEC");
    if (!ok) voice_error("TTS TEST ECHEC");
    vTaskDelete(nullptr);
}

void mel_terminal_test_voice_output(void) {
    if (!g_voice_output_enabled) return;
    if (!g_audio_ok || !output_dev) {
        voice_error("HP INDISPONIBLE");
        ui_status("VOIX : HP INDISPONIBLE");
        return;
    }
    xTaskCreatePinnedToCore(
        voice_output_test_task,
        "mel_voice_test",
        6144,
        nullptr,
        4,
        nullptr,
        0
    );
}

static void speaker_tone_test_task(void *) {
    if (!output_dev || !g_audio_ok) {
        ui_status("HP INDISPONIBLE");
        vTaskDelete(nullptr);
        return;
    }
    constexpr int sample_rate = 48000;
    constexpr int samples = 12000; // 250 ms
    int16_t *pcm = static_cast<int16_t *>(heap_caps_malloc(samples * sizeof(int16_t), MALLOC_CAP_8BIT));
    if (!pcm) {
        ui_status("TEST HP MEMOIRE");
        vTaskDelete(nullptr);
        return;
    }
    // 750 Hz square-ish sine approximation, loud enough to hear.
    for (int i = 0; i < samples; ++i) {
        const int phase = i % 64;
        pcm[i] = (phase < 32) ? 11000 : -11000;
    }
    speaker_output_enable(85.0);
    const int rc = esp_codec_dev_write(output_dev, pcm, samples * sizeof(int16_t));
    vTaskDelay(pdMS_TO_TICKS(80));
    speaker_output_disable();
    heap_caps_free(pcm);
    ESP_LOGI(TAG, "SPEAKER local tone write rc=%d", rc);
    ui_status(rc == ESP_CODEC_DEV_OK ? "HP LOCAL : BIP ENVOYE" : "HP LOCAL : ECHEC");
    vTaskDelete(nullptr);
}

void mel_terminal_test_speaker_local(void) {
    xTaskCreatePinnedToCore(speaker_tone_test_task, "mel_spk_tone", 4096, nullptr, 4, nullptr, 0);
}

void mel_terminal_stop_voice_output(void) {
    g_tts_stop_requested = true;
    if (output_dev) speaker_output_disable();
    ESP_LOGI(TAG, "VOICE OUTPUT stop requested");
}

bool mel_terminal_has_display(void) {
    return !g_display_items.empty();
}

void mel_terminal_display_next(void) {
    if (g_display_items.empty()) return;
    const size_t next = (g_display_index + 1) % g_display_items.size();
    ui_show_display_source(next);
    if (mel_mobile_bridge_ready()) render_display_item_card(next);
}

void mel_terminal_display_previous(void) {
    if (g_display_items.empty()) return;
    const size_t previous = g_display_index == 0 ? g_display_items.size() - 1 : g_display_index - 1;
    ui_show_display_source(previous);
    if (mel_mobile_bridge_ready()) render_display_item_card(previous);
}

static void audio_test_task(void *) {
    ui_status("TEST AUDIO");
    ui_answer("Parle pendant 2 secondes : MEL va te le rejouer.");
    esp_es8311_test();
    ui_status("EN LIGNE");
    ui_answer("Test micro + haut-parleur termine.");
    vTaskDelete(nullptr);
}

void mel_terminal_test_audio(void) {
    if (!g_audio_ok || !input_dev || !output_dev) {
        ui_status("AUDIO ERREUR");
        ui_answer("Micro ou haut-parleur indisponible.");
        return;
    }
    xTaskCreatePinnedToCore(audio_test_task, "mel_audio_test", 6144, nullptr, 4, nullptr, 0);
}


static TaskHandle_t g_stt_test_task_handle = nullptr;
static mel_terminal_test_status_cb_t g_stt_test_cb = nullptr;

static void stt_test_task(void *) {
    if (g_stt_test_cb) g_stt_test_cb("VOIX/STT : parle maintenant, jusqu'a 10 secondes...");
    g_runtime_state = MEL_TERMINAL_LISTENING;
    vTaskDelay(pdMS_TO_TICKS(250));
    std::string text = record_and_transcribe();
    if (text.empty()) {
        std::string msg = std::string("VOIX/STT FAIL : ") +
                          (g_last_voice_error ? g_last_voice_error : "aucune transcription");
        if (g_stt_test_cb) g_stt_test_cb(msg.c_str());
    } else {
        std::string msg = std::string("VOIX/STT PASS : \"") + text + "\"";
        if (g_stt_test_cb) g_stt_test_cb(msg.c_str());
    }
    g_runtime_state = MEL_TERMINAL_IDLE;
    g_voice_stop_requested = false;
    g_stt_test_task_handle = nullptr;
    vTaskDelete(nullptr);
}

void mel_terminal_test_stt(mel_terminal_test_status_cb_t cb) {
    g_stt_test_cb = cb;
    if (!g_online) {
        if (g_stt_test_cb) g_stt_test_cb("VOIX/STT FAIL : MEL hors ligne.");
        return;
    }
    if (!g_audio_ok || !input_dev) {
        if (g_stt_test_cb) g_stt_test_cb("VOIX/STT FAIL : micro indisponible.");
        return;
    }
    if (g_stt_test_task_handle) {
        if (g_runtime_state == MEL_TERMINAL_LISTENING) {
            g_voice_stop_requested = true;
            if (g_stt_test_cb) g_stt_test_cb("VOIX/STT : STOP -> transcription...");
        } else if (g_stt_test_cb) {
            g_stt_test_cb("VOIX/STT : transcription deja en cours...");
        }
        return;
    }
    g_voice_stop_requested = false;
    xTaskCreatePinnedToCore(stt_test_task, "mel_stt_test", 12288, nullptr, 5, &g_stt_test_task_handle, 0);
}


static bool media_send_all(int fd, const void *data, size_t len) {
    const uint8_t *p = static_cast<const uint8_t *>(data);
    size_t sent = 0;
    while (sent < len) {
        const int n = send(fd, p + sent, len - sent, 0);
        if (n <= 0) return false;
        sent += (size_t)n;
    }
    return true;
}

static bool media_recv_all(int fd, void *data, size_t len) {
    uint8_t *p = static_cast<uint8_t *>(data);
    size_t received = 0;
    while (received < len) {
        const int n = recv(fd, p + received, len - received, 0);
        if (n <= 0) return false;
        received += (size_t)n;
    }
    return true;
}

static bool media_send_u8(int fd, uint8_t value) {
    return media_send_all(fd, &value, 1);
}

static bool media_send_u16(int fd, uint16_t value) {
    const uint16_t net = htons(value);
    return media_send_all(fd, &net, sizeof(net));
}

static bool media_send_u32(int fd, uint32_t value) {
    const uint32_t net = htonl(value);
    return media_send_all(fd, &net, sizeof(net));
}

static int media_open_socket(
    uint8_t type,
    const char *name,
    uint16_t width,
    uint16_t height,
    uint8_t fps,
    uint32_t sample_rate,
    uint8_t channels
) {
    if (!mel_mobile_bridge_ready()) return -1;

    MelLinkV2MediaConfig cfg = {};
    ui_status("PREPARATION TELEPHONE...");
    if (!mel_link_v2_transport_request_media_config(&cfg, 20000)) {
        ESP_LOGW(TAG, "MEDIA config unavailable");
        return -1;
    }

    char gateway[32] = {};
    if (!mini_media_wifi_connect(
            cfg.ssid,
            cfg.password,
            gateway,
            sizeof(gateway))) {
        ESP_LOGW(TAG, "MEDIA Wi-Fi connect failed");
        return -1;
    }

    const int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
    if (fd < 0) {
        mini_media_wifi_release();
        return -1;
    }

    struct timeval timeout = {};
    timeout.tv_sec = 20;
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    struct sockaddr_in dest = {};
    dest.sin_family = AF_INET;
    dest.sin_port = htons(cfg.port);
    if (inet_pton(AF_INET, gateway, &dest.sin_addr) != 1 ||
        connect(fd, reinterpret_cast<struct sockaddr *>(&dest), sizeof(dest)) != 0) {
        close(fd);
        mini_media_wifi_release();
        return -1;
    }

    static const uint8_t magic[5] = {'M','E','L','M','1'};
    const size_t token_len = strlen(cfg.token);
    const size_t name_len = name ? strlen(name) : 0;
    const bool header_ok =
        token_len >= 16 && token_len <= 96 &&
        name_len >= 1 && name_len <= 128 &&
        media_send_all(fd, magic, sizeof(magic)) &&
        media_send_u8(fd, type) &&
        media_send_u8(fd, (uint8_t)token_len) &&
        media_send_all(fd, cfg.token, token_len) &&
        media_send_u16(fd, (uint16_t)name_len) &&
        media_send_all(fd, name, name_len) &&
        media_send_u16(fd, width) &&
        media_send_u16(fd, height) &&
        media_send_u8(fd, fps) &&
        media_send_u32(fd, sample_rate) &&
        media_send_u8(fd, channels);

    if (!header_ok) {
        close(fd);
        mini_media_wifi_release();
        return -1;
    }
    return fd;
}

static void media_close_socket(int fd) {
    if (fd >= 0) {
        shutdown(fd, SHUT_RDWR);
        close(fd);
    }
    mini_media_wifi_release();
}

static bool frame_to_jpeg(camera_fb_t *fb, uint8_t **jpeg, size_t *jpeg_len, bool *owned) {
    if (!fb || !jpeg || !jpeg_len || !owned) return false;
    *jpeg = nullptr;
    *jpeg_len = 0;
    *owned = false;
    if (fb->format == PIXFORMAT_JPEG) {
        *jpeg = fb->buf;
        *jpeg_len = fb->len;
        return fb->buf && fb->len > 0;
    }
    if (!frame2jpg(fb, 78, jpeg, jpeg_len)) return false;
    *owned = true;
    return *jpeg && *jpeg_len > 0;
}

static bool capture_photo_to_phone() {
    if (!g_camera_ok) {
        esp_camera_port_init((i2c_port_num_t)0);
        g_camera_ok = esp_camera_sensor_get() != nullptr;
    }
    if (!g_camera_ok) return false;

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) return false;

    uint8_t *jpeg = nullptr;
    size_t jpeg_len = 0;
    bool owned = false;
    const bool converted = frame_to_jpeg(fb, &jpeg, &jpeg_len, &owned);
    const uint16_t width = fb->width;
    const uint16_t height = fb->height;

    bool ok = false;
    if (converted && jpeg_len <= 12U * 1024U * 1024U) {
        int fd = media_open_socket(
            1,
            "mel-mini-photo.jpg",
            width,
            height,
            1,
            0,
            0
        );
        if (fd >= 0) {
            ok =
                media_send_u32(fd, (uint32_t)jpeg_len) &&
                media_send_all(fd, jpeg, jpeg_len);
            media_close_socket(fd);
        }
    }

    if (owned && jpeg) free(jpeg);
    esp_camera_fb_return(fb);
    ESP_LOGI(TAG, "MEDIA PHOTO %s bytes=%u", ok ? "OK" : "FAIL", (unsigned)jpeg_len);
    return ok;
}

static bool capture_video_to_phone(int seconds) {
    seconds = std::max(1, std::min(30, seconds));
    if (!g_camera_ok) {
        esp_camera_port_init((i2c_port_num_t)0);
        g_camera_ok = esp_camera_sensor_get() != nullptr;
    }
    if (!g_camera_ok) return false;

    constexpr uint8_t fps = 5;
    const int frames_target = seconds * fps;
    int fd = -1;
    bool ok = true;
    int frames_sent = 0;
    const int64_t frame_period_us = 1000000LL / fps;

    for (int i = 0; i < frames_target && ok; ++i) {
        const int64_t started = esp_timer_get_time();
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            ok = false;
            break;
        }

        uint8_t *jpeg = nullptr;
        size_t jpeg_len = 0;
        bool owned = false;
        if (!frame_to_jpeg(fb, &jpeg, &jpeg_len, &owned) ||
            jpeg_len > 2U * 1024U * 1024U) {
            if (owned && jpeg) free(jpeg);
            esp_camera_fb_return(fb);
            ok = false;
            break;
        }

        if (fd < 0) {
            fd = media_open_socket(
                2,
                "mel-mini-video.avi",
                fb->width,
                fb->height,
                fps,
                0,
                0
            );
            if (fd < 0) {
                if (owned && jpeg) free(jpeg);
                esp_camera_fb_return(fb);
                return false;
            }
        }

        ok =
            media_send_u32(fd, (uint32_t)jpeg_len) &&
            media_send_all(fd, jpeg, jpeg_len);
        if (ok) ++frames_sent;

        if (owned && jpeg) free(jpeg);
        esp_camera_fb_return(fb);

        const int64_t elapsed = esp_timer_get_time() - started;
        if (elapsed < frame_period_us) {
            vTaskDelay(pdMS_TO_TICKS((frame_period_us - elapsed) / 1000));
        }
    }

    if (fd >= 0) {
        if (ok) ok = media_send_u32(fd, 0);
        media_close_socket(fd);
    }
    ESP_LOGI(TAG, "MEDIA VIDEO %s frames=%d/%d", ok ? "OK" : "FAIL", frames_sent, frames_target);
    return ok && frames_sent > 0;
}

static bool capture_audio_to_phone(int seconds) {
    seconds = std::max(1, std::min(120, seconds));
    if (!g_audio_ok || !input_dev) return false;

    int fd = media_open_socket(
        3,
        "mel-mini-audio.wav",
        0,
        0,
        0,
        VOICE_CAPTURE_RATE,
        1
    );
    if (fd < 0) return false;

    constexpr int chunk_samples = VOICE_CAPTURE_RATE / 10;
    auto *pcm = static_cast<int16_t *>(
        heap_caps_malloc(chunk_samples * sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
    );
    if (!pcm) pcm = static_cast<int16_t *>(malloc(chunk_samples * sizeof(int16_t)));
    if (!pcm) {
        media_close_socket(fd);
        return false;
    }

    ensure_mic_mutex();
    bool ok = g_mic_mutex &&
        xSemaphoreTake(g_mic_mutex, pdMS_TO_TICKS(1500)) == pdTRUE;
    if (ok) esp_codec_dev_set_in_gain(input_dev, 38.0);

    const int chunks = seconds * 10;
    for (int i = 0; i < chunks && ok; ++i) {
        const int rc = esp_codec_dev_read(
            input_dev,
            pcm,
            chunk_samples * (int)sizeof(int16_t)
        );
        if (rc != ESP_CODEC_DEV_OK) {
            ok = false;
            break;
        }
        const uint32_t bytes = chunk_samples * sizeof(int16_t);
        ok =
            media_send_u32(fd, bytes) &&
            media_send_all(fd, pcm, bytes);
    }

    if (g_mic_mutex && uxSemaphoreGetCount(g_mic_mutex) == 0) {
        esp_codec_dev_set_in_gain(input_dev, 0.0);
        xSemaphoreGive(g_mic_mutex);
    }
    free(pcm);

    if (ok) ok = media_send_u32(fd, 0);
    media_close_socket(fd);
    ESP_LOGI(TAG, "MEDIA AUDIO %s seconds=%d", ok ? "OK" : "FAIL", seconds);
    return ok;
}

static bool open_web_page_on_mini(const std::string &url) {
    if (url.rfind("https://", 0) != 0 && url.rfind("http://", 0) != 0) return false;
    if (url.size() > 2048) return false;

    constexpr uint16_t width = 320;
    constexpr uint16_t height = 320;
    int fd = media_open_socket(
        4,
        "mel-mini-browser",
        width,
        height,
        0,
        0,
        0
    );
    if (fd < 0) return false;

    bool ok =
        media_send_u16(fd, (uint16_t)url.size()) &&
        media_send_all(fd, url.data(), url.size());

    uint32_t net_len = 0;
    if (ok) ok = media_recv_all(fd, &net_len, sizeof(net_len));
    const uint32_t bytes = ntohl(net_len);
    const size_t expected = (size_t)width * (size_t)height * 2U;
    if (!ok || bytes != expected) {
        media_close_socket(fd);
        return false;
    }

    auto *pixels = static_cast<uint8_t *>(
        heap_caps_malloc(expected, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
    );
    if (!pixels) pixels = static_cast<uint8_t *>(malloc(expected));
    if (!pixels) {
        media_close_socket(fd);
        return false;
    }

    ok = media_recv_all(fd, pixels, expected);
    media_close_socket(fd);
    if (ok) {
        ok = mini_ui_show_rgb565(pixels, expected, width, height);
    }
    free(pixels);
    if (ok) {
        ui_status("WEB");
        ui_answer("Page ouverte via le telephone. Touchez l'image pour revenir.");
    }
    return ok;
}

static std::string command_lower(std::string value) {
    std::transform(
        value.begin(),
        value.end(),
        value.begin(),
        [](unsigned char c) { return (char)std::tolower(c); }
    );
    return value;
}

static int command_seconds(const std::string &text, int fallback, int maximum) {
    for (size_t i = 0; i < text.size(); ++i) {
        if (!std::isdigit((unsigned char)text[i])) continue;
        int value = atoi(text.c_str() + i);
        if (value > 0) return std::min(maximum, value);
    }
    return fallback;
}

static bool handle_local_media_command(const std::string &spoken) {
    const std::string text = command_lower(spoken);
    const bool photo =
        text.find("photo") != std::string::npos &&
        (text.find("prend") != std::string::npos ||
         text.find("prends") != std::string::npos ||
         text.find("prendre") != std::string::npos ||
         text.find("capture") != std::string::npos);

    const bool video =
        text.find("filme") != std::string::npos ||
        text.find("filmer") != std::string::npos ||
        text.find("video") != std::string::npos ||
        text.find("vidéo") != std::string::npos;

    const bool audio =
        !photo && !video &&
        (text.find("enregistre") != std::string::npos ||
         text.find("dictaphone") != std::string::npos ||
         text.find("audio") != std::string::npos);

    if (!photo && !video && !audio) return false;

    g_runtime_state = MEL_TERMINAL_THINKING;
    bool ok = false;
    if (photo) {
        ui_status("PHOTO...");
        ok = capture_photo_to_phone();
        ui_answer(ok ? "Photo enregistree sur le telephone." : "Echec de la photo.");
    } else if (video) {
        const int seconds = command_seconds(text, 10, 30);
        char status[48] = {};
        snprintf(status, sizeof(status), "VIDEO %d S...", seconds);
        ui_status(status);
        ok = capture_video_to_phone(seconds);
        ui_answer(ok ? "Video enregistree sur le telephone." : "Echec de la video.");
    } else {
        const int seconds = command_seconds(text, 30, 120);
        char status[48] = {};
        snprintf(status, sizeof(status), "ENREGISTREMENT %d S...", seconds);
        ui_status(status);
        ok = capture_audio_to_phone(seconds);
        ui_answer(ok ? "Audio enregistre sur le telephone." : "Echec de l'enregistrement.");
    }

    g_runtime_state = ok ? MEL_TERMINAL_SPEAKING : MEL_TERMINAL_ERROR;
    if (ok) {
        speak_text(
            photo ? "Photo enregistrée sur le téléphone." :
            video ? "Vidéo enregistrée sur le téléphone." :
                    "Enregistrement terminé sur le téléphone."
        );
    } else {
        vTaskDelay(pdMS_TO_TICKS(900));
    }
    g_runtime_state = MEL_TERMINAL_IDLE;
    ui_status("");
    return true;
}

static void camera_task(void *) {
    ui_status("CAMERA...");

    if (!g_camera_ok) {
        ESP_LOGI(TAG, "Lazy OV5640 init on core %d", xPortGetCoreID());
        esp_camera_port_init((i2c_port_num_t)0);
        g_camera_ok = esp_camera_sensor_get() != nullptr;
        ESP_LOGI(TAG, "Lazy OV5640 init %s", g_camera_ok ? "OK" : "FAILED");
    }

    if (!g_camera_ok) {
        i2c_master_bus_handle_t bus = nullptr;
        esp_err_t bus_err = i2c_master_get_bus_handle(0, &bus);
        esp_err_t p3c = bus_err == ESP_OK ? i2c_master_probe(bus, 0x3c, 100) : bus_err;
        esp_err_t p30 = bus_err == ESP_OK ? i2c_master_probe(bus, 0x30, 100) : bus_err;
        char diag[220] = {};
        snprintf(
            diag, sizeof(diag),
            "Aucun capteur DVP detecte.\nSCCB 0x3C: %s\nSCCB 0x30: %s\nSi les deux sont absents, verifier la nappe OV5640.",
            esp_err_to_name(p3c), esp_err_to_name(p30)
        );
        ui_status("CAMERA ERREUR");
        ui_answer(diag);
        ESP_LOGW(TAG, "CAMERA TEST no sensor: 0x3c=%s 0x30=%s",
                 esp_err_to_name(p3c), esp_err_to_name(p30));
        vTaskDelete(nullptr);
        return;
    }

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        ui_status("CAMERA ERREUR");
        ui_answer("Aucune image recue de l'OV5640.");
    } else {
        char msg[180];
        snprintf(msg, sizeof(msg), "Camera OK : %ux%u  %u octets.\nLe flux complet sera utilise par les fonctions visuelles MEL.", fb->width, fb->height, fb->len);
        ui_status("CAMERA OK");
        ui_answer(msg);
        esp_camera_fb_return(fb);
    }
    vTaskDelete(nullptr);
}

void mel_terminal_test_camera(void) {
    xTaskCreatePinnedToCore(camera_task, "mel_camera_test", 6144, nullptr, 4, nullptr, 0);
}

static bool ends_with_ci(const std::string &value, const char *suffix) {
    if (!suffix) return false;
    const size_t n = strlen(suffix);
    if (value.size() < n) return false;
    for (size_t i = 0; i < n; ++i) {
        const unsigned char a = (unsigned char)value[value.size() - n + i];
        const unsigned char b = (unsigned char)suffix[i];
        if (std::tolower(a) != std::tolower(b)) return false;
    }
    return true;
}

static bool show_mimg_file(const std::string &path) {
    FILE *fp = fopen(path.c_str(), "rb");
    if (!fp) return false;
    uint8_t header[12] = {};
    if (fread(header, 1, sizeof(header), fp) != sizeof(header)) {
        fclose(fp);
        return false;
    }
    if (memcmp(header, "MIMG", 4) != 0) {
        fclose(fp);
        return false;
    }
    const uint16_t width = (uint16_t)header[4] | ((uint16_t)header[5] << 8);
    const uint16_t height = (uint16_t)header[6] | ((uint16_t)header[7] << 8);
    const uint32_t declared = (uint32_t)header[8] |
                              ((uint32_t)header[9] << 8) |
                              ((uint32_t)header[10] << 16) |
                              ((uint32_t)header[11] << 24);
    const size_t expected = (size_t)width * (size_t)height * 2u;
    if (!width || !height || width > 320 || height > 320 || declared != expected || expected > 320u * 320u * 2u) {
        fclose(fp);
        return false;
    }

    auto *pixels = static_cast<uint8_t *>(heap_caps_malloc(expected, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!pixels) pixels = static_cast<uint8_t *>(heap_caps_malloc(expected, MALLOC_CAP_8BIT));
    if (!pixels) {
        fclose(fp);
        return false;
    }
    const bool read_ok = fread(pixels, 1, expected, fp) == expected;
    fclose(fp);
    const bool shown = read_ok && mini_ui_show_rgb565(pixels, expected, width, height);
    heap_caps_free(pixels);
    if (shown) {
        ESP_LOGI(TAG, "MIMG displayed %ux%u from %s", (unsigned)width, (unsigned)height, path.c_str());
        ui_status("IMAGE");
        ui_answer("Touchez l'image pour revenir a MEL.");
    }
    return shown;
}

static void storage_refresh_info() {
    if (!g_storage_ok || esp_vfs_fat_info("/melstore", &g_storage_total, &g_storage_free) != ESP_OK) {
        g_storage_total = 0;
        g_storage_free = 0;
    }
}

static void storage_reset_after_failure() {
    if (g_storage_wl != WL_INVALID_HANDLE) {
        const esp_err_t unmount_err = esp_vfs_fat_spiflash_unmount_rw_wl("/melstore", g_storage_wl);
        if (unmount_err != ESP_OK) {
            ESP_LOGW(TAG, "INTERNAL STORAGE unmount after failure: %s", esp_err_to_name(unmount_err));
        }
    }
    g_storage_wl = WL_INVALID_HANDLE;
    g_storage_ok = false;
    g_storage_total = 0;
    g_storage_free = 0;
}

bool mel_terminal_init_storage(void) {
    if (g_storage_ok) return true;

    const esp_vfs_fat_mount_config_t mount_config = {
        .format_if_mount_failed = true,
        .max_files = 8,
        .allocation_unit_size = 4096,
    };

    ESP_LOGI(TAG, "INTERNAL STORAGE: mounting FAT partition 'storage'");
    const esp_err_t err = esp_vfs_fat_spiflash_mount_rw_wl(
        "/melstore", "storage", &mount_config, &g_storage_wl
    );
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "INTERNAL STORAGE mount failed: %s", esp_err_to_name(err));
        g_storage_wl = WL_INVALID_HANDLE;
        g_storage_ok = false;
        g_storage_total = 0;
        g_storage_free = 0;
        return false;
    }

    mkdir("/melstore/mel", 0775);
    const char *probe_path = "/melstore/.mini-storage-test";
    FILE *probe = fopen(probe_path, "wb");
    if (!probe) {
        ESP_LOGE(TAG, "INTERNAL STORAGE self-test open failed");
        storage_reset_after_failure();
        return false;
    }

    static const char kProbe[] = "MEL-MINI-STORAGE-OK";
    const bool wrote = fwrite(kProbe, 1, sizeof(kProbe) - 1, probe) == sizeof(kProbe) - 1;
    fclose(probe);

    char verify[sizeof(kProbe)] = {};
    probe = fopen(probe_path, "rb");
    const bool read_ok = probe &&
        fread(verify, 1, sizeof(kProbe) - 1, probe) == sizeof(kProbe) - 1;
    if (probe) fclose(probe);
    remove(probe_path);

    if (!wrote || !read_ok || memcmp(verify, kProbe, sizeof(kProbe) - 1) != 0) {
        ESP_LOGE(TAG, "INTERNAL STORAGE self-test failed");
        storage_reset_after_failure();
        return false;
    }

    g_storage_ok = true;
    storage_refresh_info();
    ESP_LOGI(TAG, "INTERNAL STORAGE PASS: total=%llu free=%llu",
             (unsigned long long)g_storage_total,
             (unsigned long long)g_storage_free);
    return true;
}

bool mel_terminal_storage_ok(void) {
    return g_storage_ok;
}

static std::string safe_asset_name(const char *name) {
    std::string out;
    for (const char *p = name; p && *p && out.size() < 80; ++p) {
        char c = *p;
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-') out.push_back(c);
        else out.push_back('_');
    }
    return out;
}

struct MobileAssetContext {
    FILE *fp = nullptr;
    bool ok = true;
    size_t bytes = 0;
};

static bool mobile_asset_chunk(const uint8_t *data, size_t len, void *ctx_ptr) {
    auto *ctx = static_cast<MobileAssetContext *>(ctx_ptr);
    if (!ctx || !ctx->ok || !ctx->fp || (!data && len > 0)) return false;
    if (len == 0) return true;
    if (fwrite(data, 1, len, ctx->fp) != len) {
        ctx->ok = false;
        return false;
    }
    ctx->bytes += len;
    return true;
}

static bool render_display_item_card(size_t index) {
    if (!mel_mobile_bridge_ready() || g_display_items.empty()) return false;
    if (index >= g_display_items.size()) index = 0;
    const MelDisplayItem &item = g_display_items[index];

    // The phone owns the real browser engine. Render the page there and return
    // only a 320x320 RGB565 view to MINI RAM. No browser asset is persisted on MINI.
    if (open_web_page_on_mini(item.url)) return true;

    if (!g_storage_ok) return false;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "title", item.title.c_str());
    cJSON_AddStringToObject(root, "snippet", item.snippet.c_str());
    cJSON_AddStringToObject(root, "url", item.url.c_str());
    if (!item.image_url.empty()) cJSON_AddStringToObject(root, "image_url", item.image_url.c_str());
    const std::string body = json_string(root);
    cJSON_Delete(root);

    mkdir("/melstore/mel", 0775);
    const std::string path = "/melstore/mel/web-card.mimg";
    FILE *fp = fopen(path.c_str(), "wb");
    if (!fp) return false;
    MobileAssetContext ctx;
    ctx.fp = fp;
    int status = 0;
    ESP_LOGI(TAG, "DISPLAY card render via MEL MOBILE index=%u", (unsigned)index);
    const esp_err_t err = mel_mobile_bridge_request_stream(
        HTTP_METHOD_POST,
        "/api/device/v1/render/card",
        "application/json",
        g_cfg.token,
        g_device_id,
        reinterpret_cast<const uint8_t *>(body.data()),
        body.size(),
        status,
        mobile_asset_chunk,
        &ctx
    );
    fclose(fp);
    const bool ok = err == ESP_OK && status == 200 && ctx.ok && ctx.bytes > 12;
    if (!ok) {
        ESP_LOGW(TAG, "DISPLAY card render failed err=%s status=%d bytes=%u",
                 esp_err_to_name(err), status, (unsigned)ctx.bytes);
        remove(path.c_str());
        return false;
    }
    ESP_LOGI(TAG, "DISPLAY card received %u bytes", (unsigned)ctx.bytes);
    return show_mimg_file(path);
}

static bool download_asset(const std::string &key, const std::string &name) {
    if (!g_storage_ok || key.empty() || name.empty()) return false;
    mkdir("/melstore/mel", 0775);
    const std::string path = std::string("/melstore/mel/") + safe_asset_name(name.c_str());

    if (mel_mobile_bridge_ready()) {
        FILE *fp = fopen(path.c_str(), "wb");
        if (!fp) return false;
        MobileAssetContext ctx;
        ctx.fp = fp;
        int status = 0;
        const std::string request_path = "/api/device/v1/download?key=" + key;
        ESP_LOGI(TAG, "ASSET via MEL MOBILE: %s", name.c_str());
        const esp_err_t err = mel_mobile_bridge_request_stream(
            HTTP_METHOD_GET,
            request_path.c_str(),
            nullptr,
            g_cfg.token,
            g_device_id,
            nullptr,
            0,
            status,
            mobile_asset_chunk,
            &ctx
        );
        fclose(fp);
        const bool ok = err == ESP_OK && status == 200 && ctx.ok && ctx.bytes > 0;
        if (!ok) {
            ESP_LOGW(TAG, "ASSET MOBILE failed err=%s status=%d bytes=%u",
                     esp_err_to_name(err), status, (unsigned)ctx.bytes);
            remove(path.c_str());
            return false;
        }
        ESP_LOGI(TAG, "ASSET MOBILE saved: %s (%u bytes)", path.c_str(), (unsigned)ctx.bytes);
        if (ends_with_ci(name, ".mimg")) show_mimg_file(path);
        return true;
    }

    const std::string url = std::string(SERVER) + "/api/device/v1/download?key=" + key;
    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.timeout_ms = 60000;
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return false;
    const std::string auth = std::string("Bearer ") + g_cfg.token;
    esp_http_client_set_header(client, "Authorization", auth.c_str());
    esp_http_client_set_header(client, "X-MEL-Device-ID", g_device_id);
    if (esp_http_client_open(client, 0) != ESP_OK) { esp_http_client_cleanup(client); return false; }
    esp_http_client_fetch_headers(client);
    if (esp_http_client_get_status_code(client) != 200) {
        esp_http_client_close(client); esp_http_client_cleanup(client); return false;
    }
    FILE *fp = fopen(path.c_str(), "wb");
    if (!fp) { esp_http_client_close(client); esp_http_client_cleanup(client); return false; }
    uint8_t buffer[4096];
    bool ok = true;
    while (true) {
        const int n = esp_http_client_read(client, reinterpret_cast<char *>(buffer), sizeof(buffer));
        if (n < 0) { ok = false; break; }
        if (n == 0) break;
        if (fwrite(buffer, 1, n, fp) != (size_t)n) { ok = false; break; }
    }
    fclose(fp);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    if (!ok) remove(path.c_str());
    else if (ends_with_ci(name, ".mimg")) show_mimg_file(path);
    return ok;
}

static int sync_assets(cJSON *root) {
    if (!root || !g_storage_ok) return 0;
    cJSON *assets = cJSON_GetObjectItemCaseSensitive(root, "assets");
    cJSON *items = assets ? cJSON_GetObjectItemCaseSensitive(assets, "items") : nullptr;
    if (!cJSON_IsArray(items)) return 0;
    int synced = 0;
    cJSON *item = nullptr;
    cJSON_ArrayForEach(item, items) {
        cJSON *key = cJSON_GetObjectItemCaseSensitive(item, "key");
        cJSON *name = cJSON_GetObjectItemCaseSensitive(item, "name");
        if (cJSON_IsString(key) && cJSON_IsString(name) && key->valuestring && name->valuestring) {
            if (download_asset(key->valuestring, name->valuestring)) synced++;
        }
    }
    return synced;
}

static bool valid_sha256_hex(const std::string &value) {
    if (value.size() != 64) return false;
    for (char c : value) {
        const bool hex = (c >= '0' && c <= '9') ||
                         (c >= 'a' && c <= 'f') ||
                         (c >= 'A' && c <= 'F');
        if (!hex) return false;
    }
    return true;
}

struct MobileOtaContext {
    esp_ota_handle_t handle = 0;
    mbedtls_sha256_context *sha = nullptr;
    bool ok = true;
    size_t bytes = 0;
};

static bool mobile_ota_chunk(const uint8_t *data, size_t len, void *ctx_ptr) {
    auto *ctx = static_cast<MobileOtaContext *>(ctx_ptr);
    if (!ctx || !ctx->ok || !data || len == 0) return ctx && ctx->ok;
    if (mbedtls_sha256_update(ctx->sha, data, len) != 0) {
        ctx->ok = false;
        return false;
    }
    if (esp_ota_write(ctx->handle, data, len) != ESP_OK) {
        ctx->ok = false;
        return false;
    }
    ctx->bytes += len;
    return true;
}

static bool ota_download_mobile(const std::string &key, const std::string &expected_sha256) {
    const esp_partition_t *partition = esp_ota_get_next_update_partition(nullptr);
    esp_ota_handle_t handle = 0;
    if (!partition || esp_ota_begin(partition, OTA_SIZE_UNKNOWN, &handle) != ESP_OK) return false;

    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    if (mbedtls_sha256_starts(&sha, 0) != 0) {
        mbedtls_sha256_free(&sha);
        esp_ota_abort(handle);
        return false;
    }

    MobileOtaContext ctx;
    ctx.handle = handle;
    ctx.sha = &sha;
    int status = 0;
    const std::string path = "/api/device/v1/download?key=" + key;
    esp_err_t err = mel_mobile_bridge_request_stream(
        HTTP_METHOD_GET,
        path.c_str(),
        nullptr,
        g_cfg.token,
        g_device_id,
        nullptr,
        0,
        status,
        mobile_ota_chunk,
        &ctx
    );

    uint8_t digest[32] = {};
    bool ok = err == ESP_OK && status == 200 && ctx.ok && ctx.bytes > 0;
    if (ok && mbedtls_sha256_finish(&sha, digest) != 0) ok = false;
    mbedtls_sha256_free(&sha);
    if (!ok) {
        ESP_LOGE(TAG, "MOBILE OTA failed err=%s status=%d bytes=%u",
                 esp_err_to_name(err), status, (unsigned)ctx.bytes);
        esp_ota_abort(handle);
        return false;
    }

    char actual_hex[65] = {};
    for (int i = 0; i < 32; ++i) snprintf(actual_hex + (i * 2), 3, "%02x", digest[i]);
    std::string expected = expected_sha256;
    std::transform(expected.begin(), expected.end(), expected.begin(),
                   [](unsigned char c) { return (char)std::tolower(c); });
    if (expected != actual_hex) {
        ESP_LOGE(TAG, "MOBILE OTA SHA-256 mismatch; refusing boot partition switch");
        esp_ota_abort(handle);
        return false;
    }
    if (esp_ota_end(handle) != ESP_OK) return false;
    if (esp_ota_set_boot_partition(partition) != ESP_OK) return false;
    ESP_LOGI(TAG, "MOBILE OTA verified: %u bytes", (unsigned)ctx.bytes);
    return true;
}

static bool ota_download(const std::string &key, const std::string &expected_sha256) {
    if (!valid_sha256_hex(expected_sha256)) {
        ESP_LOGE(TAG, "OTA refused: missing/invalid manifest SHA-256");
        return false;
    }
    if (mel_mobile_bridge_ready()) {
        ESP_LOGI(TAG, "OTA via MEL MOBILE");
        return ota_download_mobile(key, expected_sha256);
    }

    std::string url = std::string(SERVER) + "/api/device/v1/download?key=" + key;
    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.timeout_ms = 60000;
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return false;
    std::string auth = std::string("Bearer ") + g_cfg.token;
    esp_http_client_set_header(client, "Authorization", auth.c_str());
    esp_http_client_set_header(client, "X-MEL-Device-ID", g_device_id);

    if (esp_http_client_open(client, 0) != ESP_OK) {
        esp_http_client_cleanup(client);
        return false;
    }
    esp_http_client_fetch_headers(client);
    if (esp_http_client_get_status_code(client) != 200) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return false;
    }

    const esp_partition_t *partition = esp_ota_get_next_update_partition(nullptr);
    esp_ota_handle_t handle = 0;
    if (!partition || esp_ota_begin(partition, OTA_SIZE_UNKNOWN, &handle) != ESP_OK) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return false;
    }

    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    bool ok = mbedtls_sha256_starts(&sha, 0) == 0;

    uint8_t *buffer = static_cast<uint8_t *>(heap_caps_malloc(8192, MALLOC_CAP_8BIT));
    if (!buffer) ok = false;
    while (ok) {
        int n = esp_http_client_read(client, reinterpret_cast<char *>(buffer), 8192);
        if (n < 0) { ok = false; break; }
        if (n == 0) break;
        if (mbedtls_sha256_update(&sha, buffer, (size_t)n) != 0) { ok = false; break; }
        if (esp_ota_write(handle, buffer, n) != ESP_OK) { ok = false; break; }
    }

    uint8_t digest[32] = {};
    if (ok && mbedtls_sha256_finish(&sha, digest) != 0) ok = false;
    mbedtls_sha256_free(&sha);

    if (buffer) heap_caps_free(buffer);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (!ok) {
        esp_ota_abort(handle);
        return false;
    }

    char actual_hex[65] = {};
    for (int i = 0; i < 32; ++i) {
        snprintf(actual_hex + (i * 2), 3, "%02x", digest[i]);
    }

    std::string expected = expected_sha256;
    std::transform(expected.begin(), expected.end(), expected.begin(),
                   [](unsigned char c) { return (char)std::tolower(c); });

    if (expected != actual_hex) {
        ESP_LOGE(TAG, "OTA SHA-256 mismatch; refusing boot partition switch");
        esp_ota_abort(handle);
        return false;
    }

    if (esp_ota_end(handle) != ESP_OK) return false;
    if (esp_ota_set_boot_partition(partition) != ESP_OK) return false;
    ESP_LOGI(TAG, "OTA image SHA-256 verified before boot switch");
    return true;
}

static void update_task(void *) {
    ui_status("RECHERCHE MAJ...");
    std::string response;
    int status = 0;
    esp_err_t err = http_request(
        HTTP_METHOD_GET,
        std::string(SERVER) + "/api/device/v1/manifest",
        nullptr, nullptr, 0, response, status
    );
    if (err != ESP_OK || status != 200) {
        ui_status("MAJ INDISPONIBLE");
        ui_answer("Impossible de lire le manifeste de mise a jour.");
        vTaskDelete(nullptr);
        return;
    }

    cJSON *root = cJSON_Parse(response.c_str());
    const int assets_synced = sync_assets(root);
    cJSON *fw = root ? cJSON_GetObjectItemCaseSensitive(root, "firmware") : nullptr;
    cJSON *available = fw ? cJSON_GetObjectItemCaseSensitive(fw, "available") : nullptr;
    cJSON *version = fw ? cJSON_GetObjectItemCaseSensitive(fw, "version") : nullptr;
    cJSON *key = fw ? cJSON_GetObjectItemCaseSensitive(fw, "key") : nullptr;
    cJSON *sha256 = fw ? cJSON_GetObjectItemCaseSensitive(fw, "sha256") : nullptr;
    const bool has = cJSON_IsTrue(available) &&
                     cJSON_IsString(key) && key->valuestring &&
                     cJSON_IsString(sha256) && sha256->valuestring &&
                     valid_sha256_hex(sha256->valuestring);
    const char *ver = cJSON_IsString(version) && version->valuestring ? version->valuestring : "";
    if (!has || !strcmp(ver, MEL_FW_VERSION)) {
        if (root) cJSON_Delete(root);
        ui_status("A JOUR");
        char msg[180];
        snprintf(msg, sizeof(msg), "Aucune mise a jour plus recente publiee.%s", assets_synced > 0 ? " Ressources telechargees dans la memoire interne." : "");
        ui_answer(msg);
        vTaskDelete(nullptr);
        return;
    }
    std::string update_key = key->valuestring;
    std::string update_sha256 = sha256->valuestring;
    if (root) cJSON_Delete(root);

    ui_status("TELECHARGEMENT...");
    ui_answer((std::string("Installation verifiee de MEL ") + ver + "...").c_str());
    if (ota_download(update_key, update_sha256)) {
        ui_status("REDEMARRAGE...");
        ui_answer("Mise a jour installee.");
        vTaskDelay(pdMS_TO_TICKS(1200));
        esp_restart();
    } else {
        ui_status("ECHEC MAJ");
        ui_answer("Le firmware actuel est conserve.");
    }
    vTaskDelete(nullptr);
}

static void heartbeat_task(void *) {
    while (true) {
        // Do not compete with voice capture / STT / chat / TTS for the BLE bridge.
        // Heartbeat is best-effort and resumes automatically once the companion is idle.
        if (g_online && g_cfg.token[0] && g_runtime_state == MEL_TERMINAL_IDLE) {
            if (g_storage_ok) storage_refresh_info();
            wifi_ap_record_t ap = {};
            int rssi = esp_wifi_sta_get_ap_info(&ap) == ESP_OK ? ap.rssi : 0;
            cJSON *root = cJSON_CreateObject();
            cJSON_AddStringToObject(root, "firmware", MEL_FW_VERSION);
            cJSON_AddStringToObject(root, "protocol_version", MEL_PROTOCOL_VERSION);
            cJSON_AddNumberToObject(root, "wifi_rssi", rssi);
            cJSON_AddNumberToObject(root, "free_heap", esp_get_free_heap_size());
            cJSON_AddStringToObject(root, "ip", g_ip);
            cJSON_AddNumberToObject(root, "uptime_ms", esp_timer_get_time() / 1000);
            cJSON_AddBoolToObject(root, "camera", g_camera_ok);
            cJSON_AddBoolToObject(root, "microphone", g_audio_ok);
            cJSON_AddBoolToObject(root, "speaker", g_audio_ok);
            cJSON_AddBoolToObject(root, "sdcard", g_sd_ok);
            cJSON_AddBoolToObject(root, "internal_storage", g_storage_ok);
            cJSON_AddNumberToObject(root, "storage_total_bytes", (double)g_storage_total);
            cJSON_AddNumberToObject(root, "storage_free_bytes", (double)g_storage_free);
            cJSON_AddStringToObject(root, "phase", "ONLINE");
            std::string body = json_string(root);
            cJSON_Delete(root);
            std::string response;
            int status = 0;
            http_request(
                HTTP_METHOD_POST,
                std::string(SERVER) + "/api/device/v1/heartbeat",
                "application/json",
                body.data(),
                (int)body.size(),
                response,
                status
            );
        }
        vTaskDelay(pdMS_TO_TICKS(15000));
    }
}

enum Action { ACTION_VOICE = 1, ACTION_CAMERA = 2, ACTION_AUDIO = 3, ACTION_UPDATE = 4 };

static void button_event(lv_event_t *event) {
    intptr_t action = reinterpret_cast<intptr_t>(lv_event_get_user_data(event));
    if (action == ACTION_VOICE) mel_terminal_request_voice();
    if (action == ACTION_CAMERA) xTaskCreatePinnedToCore(camera_task, "mel_camera", 6144, nullptr, 3, nullptr, 0);
    if (action == ACTION_AUDIO) xTaskCreatePinnedToCore(audio_test_task, "mel_audio", 4096, nullptr, 4, nullptr, 0);
    if (action == ACTION_UPDATE) xTaskCreatePinnedToCore(update_task, "mel_update", 8192, nullptr, 4, nullptr, 0);
}

static lv_obj_t *make_button(lv_obj_t *parent, const char *text, Action action) {
    lv_obj_t *btn = lv_btn_create(parent);
    lv_obj_set_size(btn, 142, 48);
    lv_obj_add_event_cb(btn, button_event, LV_EVENT_CLICKED, reinterpret_cast<void *>((intptr_t)action));
    lv_obj_t *label = lv_label_create(btn);
    lv_label_set_text(label, text);
    lv_obj_center(label);
    return btn;
}

void mel_terminal_ui_init(lv_disp_t *) {
    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x07111F), 0);
    lv_obj_set_style_text_color(screen, lv_color_hex(0xF8FAFC), 0);
    lv_obj_set_style_pad_all(screen, 0, 0);

    g_status = lv_label_create(screen);
    lv_label_set_text(g_status, "");
    lv_obj_set_style_text_color(g_status, lv_color_hex(0x94A3B8), 0);
    lv_obj_align(g_status, LV_ALIGN_TOP_MID, 0, 14);

    g_face = lv_obj_create(screen);
    lv_obj_set_size(g_face, 214, 214);
    lv_obj_align(g_face, LV_ALIGN_CENTER, 0, -58);
    lv_obj_set_style_radius(g_face, 107, 0);
    lv_obj_set_style_bg_color(g_face, lv_color_hex(0x0B1628), 0);
    lv_obj_set_style_bg_opa(g_face, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(g_face, 4, 0);
    lv_obj_set_style_border_color(g_face, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_shadow_width(g_face, 32, 0);
    lv_obj_set_style_shadow_color(g_face, lv_color_hex(0x0EA5E9), 0);
    lv_obj_set_style_shadow_opa(g_face, LV_OPA_40, 0);
    lv_obj_clear_flag(g_face, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *inner = lv_obj_create(g_face);
    lv_obj_set_size(inner, 166, 176);
    lv_obj_center(inner);
    lv_obj_set_style_radius(inner, 72, 0);
    lv_obj_set_style_bg_color(inner, lv_color_hex(0x111C30), 0);
    lv_obj_set_style_border_width(inner, 1, 0);
    lv_obj_set_style_border_color(inner, lv_color_hex(0x334155), 0);
    lv_obj_clear_flag(inner, LV_OBJ_FLAG_SCROLLABLE);

    g_eye_left = lv_obj_create(inner);
    lv_obj_set_size(g_eye_left, 30, 10);
    lv_obj_align(g_eye_left, LV_ALIGN_CENTER, -38, -24);
    lv_obj_set_style_radius(g_eye_left, 5, 0);
    lv_obj_set_style_bg_color(g_eye_left, lv_color_hex(0x7DD3FC), 0);
    lv_obj_set_style_border_width(g_eye_left, 0, 0);

    g_eye_right = lv_obj_create(inner);
    lv_obj_set_size(g_eye_right, 30, 10);
    lv_obj_align(g_eye_right, LV_ALIGN_CENTER, 38, -24);
    lv_obj_set_style_radius(g_eye_right, 5, 0);
    lv_obj_set_style_bg_color(g_eye_right, lv_color_hex(0x7DD3FC), 0);
    lv_obj_set_style_border_width(g_eye_right, 0, 0);

    g_mouth = lv_obj_create(inner);
    lv_obj_set_size(g_mouth, 42, 5);
    lv_obj_align(g_mouth, LV_ALIGN_CENTER, 0, 42);
    lv_obj_set_style_radius(g_mouth, 7, 0);
    lv_obj_set_style_bg_color(g_mouth, lv_color_hex(0xA5F3FC), 0);
    lv_obj_set_style_border_width(g_mouth, 0, 0);

    g_temple_left = lv_obj_create(g_face);
    lv_obj_set_size(g_temple_left, 8, 52);
    lv_obj_align(g_temple_left, LV_ALIGN_LEFT_MID, 13, 0);
    lv_obj_set_style_radius(g_temple_left, 4, 0);
    lv_obj_set_style_bg_color(g_temple_left, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_border_width(g_temple_left, 0, 0);

    g_temple_right = lv_obj_create(g_face);
    lv_obj_set_size(g_temple_right, 8, 52);
    lv_obj_align(g_temple_right, LV_ALIGN_RIGHT_MID, -13, 0);
    lv_obj_set_style_radius(g_temple_right, 4, 0);
    lv_obj_set_style_bg_color(g_temple_right, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_border_width(g_temple_right, 0, 0);

    g_answer = lv_label_create(screen);
    lv_label_set_long_mode(g_answer, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(g_answer, 284);
    lv_obj_set_height(g_answer, 74);
    lv_obj_set_style_text_align(g_answer, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_color(g_answer, lv_color_hex(0xCBD5E1), 0);
    lv_label_set_text(g_answer, "");
    lv_obj_align(g_answer, LV_ALIGN_BOTTOM_MID, 0, -84);
    lv_obj_add_flag(g_answer, LV_OBJ_FLAG_HIDDEN);

    g_actions = lv_obj_create(screen);
    lv_obj_set_size(g_actions, 250, 72);
    lv_obj_align(g_actions, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_obj_set_style_bg_opa(g_actions, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(g_actions, 0, 0);
    lv_obj_set_style_pad_all(g_actions, 0, 0);
    lv_obj_set_flex_flow(g_actions, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(g_actions, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    lv_obj_t *talk = make_button(g_actions, "PARLER", ACTION_VOICE);
    lv_obj_set_size(talk, 224, 62);
    lv_obj_set_style_radius(talk, 24, 0);
    lv_obj_set_style_bg_color(talk, lv_color_hex(0x1D4ED8), 0);
    lv_obj_set_style_shadow_width(talk, 18, 0);
    lv_obj_set_style_shadow_color(talk, lv_color_hex(0x2563EB), 0);
    lv_obj_set_style_shadow_opa(talk, LV_OPA_30, 0);

    mini_face_state(MINI_IDLE);
    g_face_timer = lv_timer_create(mini_face_timer_cb, 120, nullptr);
}

void mel_terminal_bind_external_ui(lv_obj_t *status_label, lv_obj_t *answer_label) {
    g_status = status_label;
    g_answer = answer_label;
}

void mel_terminal_set_hardware(bool camera_ok, bool audio_ok, bool sd_ok) {
    g_camera_ok = camera_ok;
    g_audio_ok = audio_ok;
    g_sd_ok = sd_ok;
}

static void network_task(void *arg) {
    bool force_setup = reinterpret_cast<intptr_t>(arg) != 0;
    make_device_id();

    ESP_ERROR_CHECK(esp_netif_init());
    esp_err_t loop = esp_event_loop_create_default();
    if (loop != ESP_OK && loop != ESP_ERR_INVALID_STATE) ESP_ERROR_CHECK(loop);

    if (force_setup) clear_config();
    load_config();

    if (!g_cfg.ssid[0]) {
        start_setup_ap();
        vTaskDelete(nullptr);
        return;
    }

    ui_status("CONNEXION WI-FI...");
    ui_answer(g_cfg.ssid);
    if (!connect_wifi()) {
        ui_status("WI-FI ECHEC");
        ui_answer("Connexion impossible. Redemarre en maintenant BOOT pour reconfigurer.");
        vTaskDelete(nullptr);
        return;
    }

    ui_status("APPAIRAGE...");
    if (!pair_terminal(false)) {
        ui_status("CODE A RENOUVELER");
        ui_answer("Le Wi-Fi fonctionne mais le code MEL est invalide ou expire. Maintiens BOOT au prochain demarrage puis recree un code.");
        vTaskDelete(nullptr);
        return;
    }

    g_online = true;
    ui_status("");
    char ready[420];
    snprintf(
        ready, sizeof(ready),
        "MINI prete  %s  %s",
        g_audio_ok ? "micro OK" : "micro indisponible",
        g_camera_ok ? "camera OK" : "camera indisponible"
    );
    ui_answer("");
    xTaskCreate(heartbeat_task, "mel_heartbeat", 6144, nullptr, 3, nullptr);
    vTaskDelete(nullptr);
}


bool mel_terminal_has_token(void) {
    nvs_handle_t nvs;
    char token[96] = {};
    if (nvs_open("mel", NVS_READONLY, &nvs) != ESP_OK) return false;
    bool ok = nvs_read_string(nvs, "token", token, sizeof(token)) && token[0] != '\0';
    nvs_close(nvs);
    return ok;
}

void mel_terminal_set_pair_code(const char *code) {
    const char *value = code ? code : "";
    strlcpy(g_cfg.pair_code, value, sizeof(g_cfg.pair_code));
    save_string("pair_code", g_cfg.pair_code);
    if (g_cfg.pair_code[0]) {
        g_online = false;
        g_cfg.token[0] = '\0';
        save_string("token", "");
    }
}

void mel_terminal_set_network_info(const char *ip) {
    strlcpy(g_ip, ip ? ip : "", sizeof(g_ip));
}

void mel_terminal_set_wifi_connected(bool connected) {
    g_wifi_connected = connected;
    if (!connected) {
        if (g_mobile_connected && mel_mobile_bridge_ready()) {
            ui_status(g_online ? "MEL MOBILE" : "MOBILE CONNECTE");
            return;
        }
        g_online = false;
        ui_status("WI-FI PERDU");
        return;
    }
    ui_status(g_online ? "" : "WI-FI CONNECTE");
}

void mel_terminal_set_mobile_connected(bool connected) {
    g_mobile_connected = connected;
    if (connected) {
        // Mobile BLE is an independent transport signal. Show it even when the
        // ESP32 still has a Wi-Fi association, because Wi-Fi association alone
        // does not prove that MEL has usable Internet.
        ui_status(g_online ? "MEL MOBILE CONNECTE" : "MOBILE CONNECTE");
        if (g_online && g_runtime_state == MEL_TERMINAL_IDLE && !g_wake_sync_task_handle) {
            xTaskCreatePinnedToCore(mobile_companion_sync_task, "mel_mobile_sync", 6144, nullptr, 3, &g_wake_sync_task_handle, 0);
        }
        return;
    }

    if (!g_wifi_connected) {
        g_online = false;
        ui_status("HORS LIGNE");
    } else {
        ui_status(g_online ? "" : "WI-FI CONNECTE");
    }
}

bool mel_terminal_mobile_connected(void) {
    return g_mobile_connected && mel_mobile_bridge_ready();
}

int mel_terminal_last_session_status(void) {
    return g_last_session_status;
}

static bool apply_wake_profile_json(const std::string &raw, const char *source, bool persist) {
    if (raw.empty()) return false;
    cJSON *root = cJSON_Parse(raw.c_str());
    if (!root) return false;
    cJSON *enrolled = cJSON_GetObjectItemCaseSensitive(root, "enrolled");
    cJSON *features = cJSON_GetObjectItemCaseSensitive(root, "features");
    cJSON *threshold = cJSON_GetObjectItemCaseSensitive(root, "threshold");
    const int count = cJSON_IsArray(features) ? cJSON_GetArraySize(features) : 0;
    bool valid = cJSON_IsTrue(enrolled) && count == WAKE_FEATURE_COUNT;
    if (valid) {
        for (int i = 0; i < WAKE_FEATURE_COUNT; ++i) {
            cJSON *item = cJSON_GetArrayItem(features, i);
            if (!cJSON_IsNumber(item)) { valid = false; break; }
            g_wake_template[i] = (float)item->valuedouble;
        }
    }
    if (valid) {
        g_wake_threshold = cJSON_IsNumber(threshold) ? (float)threshold->valuedouble : 0.78f;
        g_wake_threshold = std::max(0.66f, std::min(0.86f, g_wake_threshold));
        g_wake_profile_ready = true;
        if (persist) save_string("wake_prof", raw.c_str());
        cJSON *samples = cJSON_GetObjectItemCaseSensitive(root, "sample_count");
        ESP_LOGI(TAG, "WAKE PROFILE loaded source=%s samples=%d threshold=%.3f",
                 source ? source : "unknown",
                 cJSON_IsNumber(samples) ? samples->valueint : 0,
                 g_wake_threshold);
        ensure_wake_detector();
    }
    cJSON_Delete(root);
    return valid;
}

static bool restore_phone_wake_profile_from_mini(const std::string &saved) {
    if (!mel_mobile_bridge_ready() || saved.empty()) return false;
    std::string response;
    int status = 0;
    const esp_err_t err = http_request(
        HTTP_METHOD_POST,
        std::string(SERVER) + "/api/device/v1/wake-profile/import",
        "application/json",
        saved.data(),
        (int)saved.size(),
        response,
        status
    );
    const bool ok = err == ESP_OK && status == 200;
    ESP_LOGI(TAG, "WAKE PROFILE restore MINI->Android %s status=%d", ok ? "OK" : "FAILED", status);
    return ok;
}

static void sync_wake_phrase_profile() {
    if (!mel_mobile_bridge_ready()) return;
    std::string response;
    int status = 0;
    const esp_err_t err = http_request(
        HTTP_METHOD_GET,
        std::string(SERVER) + "/api/device/v1/wake-profile",
        nullptr, nullptr, 0, response, status
    );
    if (err != ESP_OK || status != 200 || response.empty()) {
        ESP_LOGW(TAG, "WAKE PROFILE sync unavailable err=%s status=%d", esp_err_to_name(err), status);
        const std::string saved = load_string_dynamic("wake_prof");
        if (apply_wake_profile_json(saved, "mini-nvs-offline", false)) return;
        return;
    }

    cJSON *root = cJSON_Parse(response.c_str());
    if (!root) {
        ESP_LOGW(TAG, "WAKE PROFILE invalid JSON");
        const std::string saved = load_string_dynamic("wake_prof");
        apply_wake_profile_json(saved, "mini-nvs-invalid-phone", false);
        return;
    }
    sync_phone_clock_from_json(root);
    cJSON *enrolled = cJSON_GetObjectItemCaseSensitive(root, "enrolled");
    cJSON *reset_requested = cJSON_GetObjectItemCaseSensitive(root, "reset_requested");
    const bool phone_has_profile = cJSON_IsTrue(enrolled);
    const bool explicit_reset = cJSON_IsTrue(reset_requested);
    cJSON_Delete(root);

    if (phone_has_profile && apply_wake_profile_json(response, "android", true)) return;

    if (explicit_reset) {
        g_wake_profile_ready = false;
        save_string("wake_prof", "");
        ESP_LOGI(TAG, "WAKE PROFILE cleared by explicit Android reset");
        return;
    }

    const std::string saved = load_string_dynamic("wake_prof");
    if (apply_wake_profile_json(saved, "mini-nvs-restore", false)) {
        restore_phone_wake_profile_from_mini(saved);
        return;
    }

    g_wake_profile_ready = false;
    ESP_LOGI(TAG, "WAKE PROFILE not enrolled on Android and no MINI backup exists");
}

static void mobile_companion_sync_task(void *) {
    vTaskDelay(pdMS_TO_TICKS(250));
    if (mel_mobile_bridge_ready()) sync_wake_phrase_profile();
    g_wake_sync_task_handle = nullptr;
    vTaskDelete(nullptr);
}

static int device_session_status() {
    if (!g_cfg.token[0]) {
        g_last_session_status = 401;
        return 401;
    }

    // Session proof must stay tiny over BLE. The old GET /manifest response is
    // much larger than a liveness check and had to cross many GATT frames before
    // MINI could declare itself online. Use the authenticated heartbeat route
    // instead; it validates the same device token with a small response.
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "firmware", MEL_FW_VERSION);
    cJSON_AddStringToObject(root, "protocol_version", MEL_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "phase", "SESSION_CHECK");
    std::string body = json_string(root);
    cJSON_Delete(root);

    std::string response;
    int status = 0;
    esp_err_t err = http_request(
        HTTP_METHOD_POST,
        std::string(SERVER) + "/api/device/v1/heartbeat",
        "application/json",
        body.data(), (int)body.size(), response, status
    );
    if (err != ESP_OK) {
        g_last_session_status = -1;
        ESP_LOGW(TAG, "MEL session validation unavailable: %s; keeping stored token", esp_err_to_name(err));
        return -1;
    }
    g_last_session_status = status;
    if (status == 200 && !response.empty()) {
        cJSON *json = cJSON_Parse(response.c_str());
        if (json) {
            sync_phone_clock_from_json(json);
            cJSON_Delete(json);
        }
    }
    return status;
}

static void online_runtime_task(void *) {
    make_device_id();
    load_config();
    const std::string saved_wake = load_string_dynamic("wake_prof");
    if (!saved_wake.empty()) apply_wake_profile_json(saved_wake, "mini-nvs-boot", false);

    ui_status("APPAIRAGE...");
    if (!pair_terminal()) {
        g_online = false;
        ui_status("CODE MEL REQUIS");
        ui_answer("Entre un code d'appairage MEL depuis l'icone de liaison.");
        g_online_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    int session_status = g_fresh_pair_proved_online ? 200 : -1;

    // GATT can be physically ready a little before the Android relay has
    // completed Internet/session validation. Retry transient failures locally
    // instead of declaring MINI permanently offline after one heartbeat.
    if (session_status != 200) {
        for (int attempt = 1; attempt <= 6; ++attempt) {
            if (!mel_mobile_bridge_ready() && !g_wifi_connected) {
                ui_status("MEL MOBILE RECONNEXION...");
                wait_for_mobile_bridge_ready(3000);
            } else {
                ui_status("MEL MOBILE VALIDATION...");
            }

            session_status = device_session_status();
            if (session_status == 200 || session_status == 401 || session_status == 403) break;

            ESP_LOGW(TAG, "MEL session transient failure attempt=%d status=%d; retrying",
                     attempt, session_status);
            vTaskDelay(pdMS_TO_TICKS(1000 + attempt * 500));
        }
    }

    if (session_status == 401 || session_status == 403) {
        ESP_LOGW(TAG, "Stored MEL token explicitly rejected with HTTP %d; clearing token", session_status);
        g_online = false;
        g_cfg.token[0] = '\0';
        save_string("token", "");

        if (mel_mobile_bridge_ready()) {
            ESP_LOGI(TAG, "Retrying MEL pairing through authenticated Android bridge");
            for (int attempt = 1; attempt <= 3 && !g_cfg.token[0]; ++attempt) {
                if (pair_terminal(true)) {
                    session_status = g_fresh_pair_proved_online ? 200 : device_session_status();
                    break;
                }
                ESP_LOGW(TAG, "Android-sponsored MINI re-pair attempt=%d failed", attempt);
                vTaskDelay(pdMS_TO_TICKS(1500));
            }
        }

        if (session_status == 401 || session_status == 403 || !g_cfg.token[0]) {
            ui_status("REAPPARIAGE REQUIS");
            ui_answer("La liaison MEL a ete revoquee. Entre un nouveau code d'appairage.");
            g_online_task_handle = nullptr;
            vTaskDelete(nullptr);
            return;
        }
    }

    if (session_status != 200) {
        ESP_LOGW(TAG, "MEL session still unavailable after retries: %d; keeping pairing for automatic retry", session_status);
        g_online = false;
        ui_status(mel_terminal_mobile_connected() ? "MEL MOBILE CONNECTE · VALIDATION..." : "MEL TEMPORAIREMENT INDISPONIBLE");
        ui_answer("");
        g_online_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    g_online = true;
    ui_status(mel_terminal_mobile_connected() ? "MEL MOBILE CONNECTE" : "");
    ui_answer("");
    sync_wake_phrase_profile();
    if (!g_heartbeat_task_handle) {
        xTaskCreatePinnedToCore(heartbeat_task, "mel_heartbeat", 6144, nullptr, 2, &g_heartbeat_task_handle, 0);
    }
    ESP_LOGI(TAG, "MEL ONLINE: authenticated device session ready");
    g_online_task_handle = nullptr;
    vTaskDelete(nullptr);
}

void mel_terminal_start_online(void) {
    if (g_online || g_online_task_handle) return;
    xTaskCreatePinnedToCore(online_runtime_task, "mel_online", 10240, nullptr, 5, &g_online_task_handle, 0);
}

void mel_terminal_refresh_mobile_identity(void) {
    if (!mel_mobile_bridge_ready()) return;
    if (g_online_task_handle) return;

    // Do not destroy the last known token before a replacement exists.
    // A successful Android-sponsored /pair atomically stores the fresh token.
    make_device_id();
    load_config();
    ui_status("MEL MOBILE · IDENTITE...");
    if (pair_terminal(true)) {
        g_online = true;
        ui_status("MEL MOBILE CONNECTE");
        ui_answer("");
        if (!g_heartbeat_task_handle) {
            xTaskCreatePinnedToCore(heartbeat_task, "mel_heartbeat", 6144, nullptr, 2, &g_heartbeat_task_handle, 0);
        }
        ESP_LOGI(TAG, "MEL MOBILE identity refreshed through authenticated Android sponsor");
        return;
    }

    // Keep the previous token untouched and fall back to the normal retry loop.
    g_online = false;
    ESP_LOGW(TAG, "MEL MOBILE identity refresh failed; retaining previous token");
    mel_terminal_start_online();
}

void mel_terminal_start(bool force_setup) {
    xTaskCreate(network_task, "mel_network", 10240, reinterpret_cast<void *>((intptr_t)(force_setup ? 1 : 0)), 5, nullptr);
}
