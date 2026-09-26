#include "mel_terminal.h"
#include "mel_mobile_bridge.h"

#include <algorithm>
#include <cstring>
#include <string>
#include <cstdio>
#include <cctype>
#include <sys/stat.h>

#include "nvs.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_http_server.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_heap_caps.h"
#include "esp_ota_ops.h"
#include "esp_camera.h"
#include "esp_camera_port.h"
#include "esp_codec_dev.h"
#include "esp_lvgl_port.h"
#include "cJSON.h"
#include "mbedtls/sha256.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_es8311_port.h"

static const char *TAG = "mel_terminal";
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

static MelConfig g_cfg = {};
static char g_device_id[40] = {};
static char g_ip[20] = {};
static bool g_camera_ok = false;
static bool g_audio_ok = false;
static bool g_sd_ok = false;
static bool g_online = false;
static bool g_wifi_connected = false;
static bool g_mobile_connected = false;
static volatile int g_runtime_state = MEL_TERMINAL_IDLE;
static TaskHandle_t g_voice_task_handle = nullptr;
static volatile bool g_voice_stop_requested = false;
static volatile int g_voice_level = 0;
static const char *g_last_voice_error = nullptr;

static void voice_error(const char *reason) {
    g_last_voice_error = reason;
    if (reason) ESP_LOGW(TAG, "VOICE ERROR: %s", reason);
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
    nvs_close(nvs);
}

static void save_string(const char *key, const char *value) {
    nvs_handle_t nvs;
    if (nvs_open("mel", NVS_READWRITE, &nvs) != ESP_OK) return;
    nvs_set_str(nvs, key, value ? value : "");
    nvs_commit(nvs);
    nvs_close(nvs);
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
        if (!mel_mobile_bridge_ready() || url.rfind(prefix, 0) != 0) return ESP_ERR_INVALID_STATE;
        const std::string path = url.substr(prefix.size());
        ESP_LOGI(TAG, "HTTP via MEL MOBILE: %s", path.c_str());
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

    if (mel_mobile_bridge_ready()) {
        return mobile_request();
    }

    HttpBuffer buffer;
    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.event_handler = http_event;
    cfg.user_data = &buffer;
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.timeout_ms = 45000;
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return mel_mobile_bridge_ready() ? mobile_request() : ESP_FAIL;

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

    if (err != ESP_OK && mel_mobile_bridge_ready()) {
        ESP_LOGW(TAG, "Wi-Fi HTTP failed (%s), falling back to MEL MOBILE", esp_err_to_name(err));
        response.clear();
        status = 0;
        return mobile_request();
    }
    return err;
}


static std::string json_string(cJSON *obj);

struct MobileTtsContext {
    bool ok = true;
    bool have_carry = false;
    uint8_t carry = 0;
    bool first_audio = true;
    int64_t started_us = 0;
};

static bool mobile_tts_chunk(const uint8_t *data, size_t len, void *ctx_ptr) {
    auto *ctx = static_cast<MobileTtsContext *>(ctx_ptr);
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

static bool speak_text(const std::string &text) {
    if (!g_audio_ok || !output_dev || !g_cfg.token[0] || text.empty()) return false;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "text", text.c_str());
    cJSON_AddStringToObject(root, "speaker", "luna");
    std::string body = json_string(root);
    cJSON_Delete(root);

    if (mel_mobile_bridge_ready()) {
        MobileTtsContext ctx;
        ctx.started_us = esp_timer_get_time();
        int status = 0;
        esp_codec_dev_set_out_vol(output_dev, 100.0);
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
        esp_codec_dev_set_out_vol(output_dev, 0.0);
        const bool ok = err == ESP_OK && status == 200 && ctx.ok && !ctx.have_carry;
        if (!ok) ESP_LOGW(TAG, "MOBILE TTS failed err=%s status=%d", esp_err_to_name(err), status);
        return ok;
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
                uint8_t *buffer = static_cast<uint8_t *>(heap_caps_malloc(4097, MALLOC_CAP_8BIT));
                if (buffer) {
                    esp_codec_dev_set_out_vol(output_dev, 100.0);
                    ok = true;
                    bool have_carry = false;
                    uint8_t carry = 0;
                    bool first_audio = true;
                    while (true) {
                        const size_t offset = have_carry ? 1 : 0;
                        if (have_carry) buffer[0] = carry;
                        int n = esp_http_client_read(
                            client,
                            reinterpret_cast<char *>(buffer + offset),
                            4096
                        );
                        if (n < 0) { ok = false; break; }
                        if (n == 0) {
                            if (have_carry) {
                                ESP_LOGE(TAG, "TTS returned truncated 16-bit PCM");
                                ok = false;
                            }
                            break;
                        }

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
                                ok = false;
                                break;
                            }
                        }
                    }
                    esp_codec_dev_set_out_vol(output_dev, 0.0);
                    heap_caps_free(buffer);
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

static bool pair_terminal() {
    if (g_cfg.token[0]) return true;
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

static std::string chat_with_mel(const std::string &text) {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "text", text.c_str());
    cJSON_AddStringToObject(root, "conversation_id", g_device_id);
    cJSON_AddStringToObject(root, "input_source", "voice-server-transcription");
    cJSON_AddBoolToObject(root, "voice_mode", true);
    cJSON_AddBoolToObject(root, "parallel", false);
    std::string body = json_string(root);
    cJSON_Delete(root);

    std::string response;
    int status = 0;
    esp_err_t err = http_request(
        HTTP_METHOD_POST,
        std::string(SERVER) + "/api/device/v1/chat",
        "application/json",
        body.data(),
        (int)body.size(),
        response,
        status
    );
    if (err != ESP_OK || status != 200) return "Connexion chat impossible.";
    std::string answer = parse_json_text(response, "text");
    return answer.empty() ? "MEL n'a pas renvoye de texte." : answer;
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

static std::string record_and_transcribe() {
    g_last_voice_error = nullptr;
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

    // 48 kHz -> 16 kHz mono: average each group of three samples while
    // removing the measured DC offset.
    int32_t peak = 0;
    uint64_t speech_abs_sum = 0;
    for (int i = 0; i < speech_samples; ++i) {
        const int j = i * 3;
        int32_t v = ((int32_t)capture[j] + capture[j + 1] + capture[j + 2]) / 3 - dc;
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        speech[i] = (int16_t)v;
        const int32_t a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        speech_abs_sum += (uint32_t)a;
    }
    heap_caps_free(capture);

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

    const char *boundary = "----MEL-ESP32-VOICE";
    std::string prefix = std::string("--") + boundary +
        "\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"mel.wav\"\r\n"
        "Content-Type: audio/wav\r\n\r\n";
    std::string suffix = std::string("\r\n--") + boundary + "--\r\n";
    const size_t total = prefix.size() + 44 + (size_t)speech_bytes + suffix.size();
    auto *multipart = static_cast<uint8_t *>(heap_caps_malloc(total, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!multipart) multipart = static_cast<uint8_t *>(heap_caps_malloc(total, MALLOC_CAP_8BIT));
    if (!multipart) {
        heap_caps_free(speech);
        ESP_LOGE(TAG, "VOICE: multipart allocation failed");
        voice_error("MEMOIRE REQUETE");
        return "";
    }

    size_t off = 0;
    memcpy(multipart + off, prefix.data(), prefix.size()); off += prefix.size();
    wav_header(multipart + off, (uint32_t)speech_bytes, VOICE_STT_RATE); off += 44;
    memcpy(multipart + off, speech, speech_bytes); off += (size_t)speech_bytes;
    memcpy(multipart + off, suffix.data(), suffix.size());
    heap_caps_free(speech);

    std::string response;
    int status = 0;
    std::string content_type = std::string("multipart/form-data; boundary=") + boundary;
    ESP_LOGI(TAG, "STT UPLOAD: bytes=%u wav_bytes=%d rate=%d duration_ms=%d",
             (unsigned)total, speech_bytes + 44, VOICE_STT_RATE,
             (speech_samples * 1000) / VOICE_STT_RATE);

    esp_err_t err = ESP_FAIL;
    for (int attempt = 1; attempt <= 2; ++attempt) {
        response.clear();
        status = 0;
        err = http_request(
            HTTP_METHOD_POST,
            std::string(SERVER) + "/api/device/v1/voice/transcribe",
            content_type.c_str(),
            reinterpret_cast<const char *>(multipart),
            (int)total,
            response,
            status
        );
        ESP_LOGI(TAG, "STT RESULT attempt=%d err=%s status=%d body=%.*s",
                 attempt, esp_err_to_name(err), status,
                 (int)std::min<size_t>(response.size(), 240), response.c_str());
        if (err == ESP_OK && status == 200) break;
        if (status > 0 && status < 500) break;
        if (attempt == 1) {
            ui_status("STT RETRY...");
            vTaskDelay(pdMS_TO_TICKS(300));
        }
    }
    heap_caps_free(multipart);

    if (err != ESP_OK) {
        voice_error("RESEAU STT");
        return "";
    }
    if (status != 200) {
        voice_error(status == 401 ? "SESSION MEL" : "SERVEUR STT");
        return "";
    }

    std::string text = parse_json_text(response, "text");
    ESP_LOGI(TAG, "STT TEXT: %s", text.empty() ? "<empty>" : text.c_str());
    if (text.empty()) voice_error("TRANSCRIPTION VIDE");
    return text;
}

static void voice_task(void *) {
    g_runtime_state = MEL_TERMINAL_LISTENING;
    ui_status("ECOUTE...");
    ui_answer("");
    vTaskDelay(pdMS_TO_TICKS(100));
    const int64_t stt_started_us = esp_timer_get_time();
    std::string text = record_and_transcribe();
    ESP_LOGI(TAG, "VOICE PERF: STT total=%lld ms", (long long)((esp_timer_get_time() - stt_started_us) / 1000));
    if (text.empty()) {
        g_runtime_state = MEL_TERMINAL_ERROR;
        ui_status(g_last_voice_error ? g_last_voice_error : "ERREUR STT");
        ui_answer("");
        vTaskDelay(pdMS_TO_TICKS(1800));
        g_runtime_state = MEL_TERMINAL_IDLE;
        g_voice_stop_requested = false;
        g_voice_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }
    g_runtime_state = MEL_TERMINAL_THINKING;
    ui_status("REFLEXION...");
    ui_answer("");
    const int64_t chat_started_us = esp_timer_get_time();
    std::string answer = chat_with_mel(text);
    ESP_LOGI(TAG, "VOICE PERF: CHAT=%lld ms chars=%u", (long long)((esp_timer_get_time() - chat_started_us) / 1000), (unsigned)answer.size());
    g_runtime_state = MEL_TERMINAL_SPEAKING;
    ui_status("MEL PARLE");
    ui_answer("");
    const int64_t tts_started_us = esp_timer_get_time();
    const bool spoken = speak_text(answer);
    ESP_LOGI(TAG, "VOICE PERF: TTS+PLAY=%lld ms", (long long)((esp_timer_get_time() - tts_started_us) / 1000));
    if (!spoken) {
        ESP_LOGW(TAG, "Voice reply unavailable");
        ui_status("TTS ERREUR");
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    ui_status("");
    g_runtime_state = MEL_TERMINAL_IDLE;
    g_voice_stop_requested = false;
    g_voice_task_handle = nullptr;
    vTaskDelete(nullptr);
}


void mel_terminal_request_voice(void) {
    if (!g_online || !g_audio_ok) return;

    if (g_voice_task_handle) {
        if (g_runtime_state == MEL_TERMINAL_LISTENING) {
            g_voice_stop_requested = true;
            ui_status("STOP...");
            ESP_LOGI(TAG, "VOICE STOP requested by second press");
        }
        return;
    }

    g_voice_stop_requested = false;
    xTaskCreatePinnedToCore(voice_task, "mel_voice", 10240, nullptr, 5, &g_voice_task_handle, 0);
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

static void camera_task(void *) {
    ui_status("CAMERA...");

    if (!g_camera_ok) {
        ESP_LOGI(TAG, "Lazy OV5640 init on core %d", xPortGetCoreID());
        esp_camera_port_init((i2c_port_num_t)0);
        g_camera_ok = esp_camera_sensor_get() != nullptr;
        ESP_LOGI(TAG, "Lazy OV5640 init %s", g_camera_ok ? "OK" : "FAILED");
    }

    if (!g_camera_ok) {
        ui_status("CAMERA ERREUR");
        ui_answer("OV5640 indisponible.");
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

static std::string safe_asset_name(const char *name) {
    std::string out;
    for (const char *p = name; p && *p && out.size() < 80; ++p) {
        char c = *p;
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-') out.push_back(c);
        else out.push_back('_');
    }
    return out;
}

static bool download_asset(const std::string &key, const std::string &name) {
    if (!g_sd_ok || key.empty() || name.empty()) return false;
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
    if (esp_http_client_open(client, 0) != ESP_OK) { esp_http_client_cleanup(client); return false; }
    esp_http_client_fetch_headers(client);
    if (esp_http_client_get_status_code(client) != 200) {
        esp_http_client_close(client); esp_http_client_cleanup(client); return false;
    }
    mkdir("/sdcard/mel", 0775);
    std::string path = std::string("/sdcard/mel/") + safe_asset_name(name.c_str());
    FILE *fp = fopen(path.c_str(), "wb");
    if (!fp) { esp_http_client_close(client); esp_http_client_cleanup(client); return false; }
    uint8_t buffer[4096];
    bool ok = true;
    while (true) {
        int n = esp_http_client_read(client, reinterpret_cast<char *>(buffer), sizeof(buffer));
        if (n < 0) { ok = false; break; }
        if (n == 0) break;
        if (fwrite(buffer, 1, n, fp) != (size_t)n) { ok = false; break; }
    }
    fclose(fp);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    if (!ok) remove(path.c_str());
    return ok;
}

static int sync_assets(cJSON *root) {
    if (!root || !g_sd_ok) return 0;
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
        snprintf(msg, sizeof(msg), "Aucune mise a jour plus recente publiee.%s", assets_synced > 0 ? " Ressources telechargees sur la microSD." : "");
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
        if (g_online && g_cfg.token[0]) {
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
    if (!pair_terminal()) {
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
        if (!g_wifi_connected) ui_status(g_online ? "MEL MOBILE" : "MOBILE CONNECTE");
        return;
    }
    if (!g_wifi_connected) {
        g_online = false;
        ui_status("HORS LIGNE");
    }
}

static int device_session_status() {
    if (!g_cfg.token[0]) return 401;
    std::string response;
    int status = 0;
    esp_err_t err = http_request(
        HTTP_METHOD_GET,
        std::string(SERVER) + "/api/device/v1/manifest",
        nullptr, nullptr, 0, response, status
    );
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "MEL session validation unavailable: %s; keeping stored token", esp_err_to_name(err));
        return -1;
    }
    return status;
}

static void online_runtime_task(void *) {
    make_device_id();
    load_config();

    ui_status("APPAIRAGE...");
    if (!pair_terminal()) {
        g_online = false;
        ui_status("CODE MEL REQUIS");
        ui_answer("Entre un code d'appairage MEL depuis l'icone de liaison.");
        g_online_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    int session_status = device_session_status();
    if (session_status == 401 || session_status == 403) {
        ESP_LOGW(TAG, "Stored MEL token explicitly rejected with HTTP %d; clearing token", session_status);
        g_online = false;
        g_cfg.token[0] = '\0';
        save_string("token", "");

        if (mel_mobile_bridge_ready()) {
            ESP_LOGI(TAG, "Retrying MEL pairing through authenticated Android bridge");
            if (pair_terminal()) {
                session_status = device_session_status();
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
        ESP_LOGW(TAG, "MEL session check returned %d; preserving persistent pairing", session_status);
        g_online = false;
        ui_status("MEL TEMPORAIREMENT INDISPONIBLE");
        ui_answer("");
        g_online_task_handle = nullptr;
        vTaskDelete(nullptr);
        return;
    }

    g_online = true;
    ui_status("");
    ui_answer("");
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

void mel_terminal_start(bool force_setup) {
    xTaskCreate(network_task, "mel_network", 10240, reinterpret_cast<void *>((intptr_t)(force_setup ? 1 : 0)), 5, nullptr);
}
