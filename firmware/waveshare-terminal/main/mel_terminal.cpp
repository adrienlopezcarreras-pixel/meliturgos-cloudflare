#include "mel_terminal.h"

#include <algorithm>
#include <cstring>
#include <string>
#include <cstdio>
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
#include "esp_codec_dev.h"
#include "esp_lvgl_port.h"
#include "cJSON.h"

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
static const int VOICE_SECONDS = 4;
static const int VOICE_RATE = 48000;
static const int VOICE_BYTES = VOICE_SECONDS * VOICE_RATE * 2;

extern esp_codec_dev_handle_t input_dev;

struct MelConfig {
    char ssid[33] = {};
    char password[65] = {};
    char pair_code[17] = {};
    char token[96] = {};
};

struct HttpBuffer {
    std::string body;
};

static MelConfig g_cfg;
static char g_device_id[40] = {};
static char g_ip[20] = {};
static bool g_camera_ok = false;
static bool g_audio_ok = false;
static bool g_sd_ok = false;
static bool g_online = false;
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

    esp_err_t err = esp_http_client_perform(client);
    status = esp_http_client_get_status_code(client);
    response = buffer.body;
    esp_http_client_cleanup(client);
    return err;
}

static std::string json_string(cJSON *obj) {
    char *raw = cJSON_PrintUnformatted(obj);
    std::string out = raw ? raw : "{}";
    if (raw) cJSON_free(raw);
    return out;
}

static bool pair_terminal() {
    if (g_cfg.token[0]) return true;
    if (!g_cfg.pair_code[0]) return false;

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
        "button{background:#2563eb;color:white;font-weight:700}</style><h1>MINI · premier démarrage</h1>"
        "<p>Saisis ton Wi-Fi et le code créé dans MEL &gt; MINI.</p>"
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
        return httpd_resp_sendstr(req, "Paramètres invalides.");
    }

    save_string("ssid", ssid.c_str());
    save_string("wifi_pass", password.c_str());
    save_string("pair_code", code.c_str());
    save_string("token", "");

    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_sendstr(req, "<html><meta charset=utf-8><body><h2>Configuration enregistrée.</h2><p>MEL redémarre et se connecte…</p></body></html>");
    xTaskCreate(restart_task, "mel_restart", 2048, nullptr, 3, nullptr);
    return ESP_OK;
}

static void show_setup_ui(const char *ssid, const char *pass) {
    char message[420];
    snprintf(
        message, sizeof(message),
        "Premier démarrage\n\n1. Wi-Fi : %s\n2. Mot de passe : %s\n3. Ouvre http://192.168.4.1\n4. Dans MEL > MINI, crée un code puis saisis-le.\n\nBOOT au démarrage = réinitialiser.",
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
    return answer.empty() ? "MEL n'a pas renvoyé de texte." : answer;
}

static void wav_header(uint8_t *h, uint32_t data_size) {
    const uint32_t byte_rate = VOICE_RATE * 2;
    const uint32_t riff_size = 36 + data_size;
    memcpy(h, "RIFF", 4); memcpy(h + 8, "WAVEfmt ", 8);
    h[4]=(uint8_t)riff_size; h[5]=(uint8_t)(riff_size>>8); h[6]=(uint8_t)(riff_size>>16); h[7]=(uint8_t)(riff_size>>24);
    h[16]=16; h[17]=h[18]=h[19]=0;
    h[20]=1; h[21]=0; h[22]=1; h[23]=0;
    h[24]=(uint8_t)VOICE_RATE; h[25]=(uint8_t)(VOICE_RATE>>8); h[26]=(uint8_t)(VOICE_RATE>>16); h[27]=(uint8_t)(VOICE_RATE>>24);
    h[28]=(uint8_t)byte_rate; h[29]=(uint8_t)(byte_rate>>8); h[30]=(uint8_t)(byte_rate>>16); h[31]=(uint8_t)(byte_rate>>24);
    h[32]=2; h[33]=0; h[34]=16; h[35]=0; memcpy(h+36,"data",4);
    h[40]=(uint8_t)data_size; h[41]=(uint8_t)(data_size>>8); h[42]=(uint8_t)(data_size>>16); h[43]=(uint8_t)(data_size>>24);
}

static std::string record_and_transcribe() {
    if (!g_audio_ok || !input_dev) return "Micro indisponible.";
    auto *pcm = static_cast<uint8_t *>(heap_caps_malloc(VOICE_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!pcm) pcm = static_cast<uint8_t *>(heap_caps_malloc(VOICE_BYTES, MALLOC_CAP_8BIT));
    if (!pcm) return "Mémoire insuffisante pour enregistrer.";

    esp_codec_dev_set_in_gain(input_dev, 38.0);
    int rc = esp_codec_dev_read(input_dev, pcm, VOICE_BYTES);
    esp_codec_dev_set_in_gain(input_dev, 0.0);
    if (rc != ESP_CODEC_DEV_OK) {
        heap_caps_free(pcm);
        return "Échec de l'enregistrement micro.";
    }

    const char *boundary = "----MEL-ESP32-VOICE";
    std::string prefix = std::string("--") + boundary +
        "\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"mel.wav\"\r\n"
        "Content-Type: audio/wav\r\n\r\n";
    std::string suffix = std::string("\r\n--") + boundary + "--\r\n";
    const size_t total = prefix.size() + 44 + VOICE_BYTES + suffix.size();
    auto *multipart = static_cast<uint8_t *>(heap_caps_malloc(total, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!multipart) multipart = static_cast<uint8_t *>(heap_caps_malloc(total, MALLOC_CAP_8BIT));
    if (!multipart) {
        heap_caps_free(pcm);
        return "Mémoire insuffisante pour envoyer la voix.";
    }

    size_t off = 0;
    memcpy(multipart + off, prefix.data(), prefix.size()); off += prefix.size();
    wav_header(multipart + off, VOICE_BYTES); off += 44;
    memcpy(multipart + off, pcm, VOICE_BYTES); off += VOICE_BYTES;
    memcpy(multipart + off, suffix.data(), suffix.size());
    heap_caps_free(pcm);

    std::string response;
    int status = 0;
    std::string content_type = std::string("multipart/form-data; boundary=") + boundary;
    esp_err_t err = http_request(
        HTTP_METHOD_POST,
        std::string(SERVER) + "/api/device/v1/voice/transcribe",
        content_type.c_str(),
        reinterpret_cast<const char *>(multipart),
        (int)total,
        response,
        status
    );
    heap_caps_free(multipart);
    if (err != ESP_OK || status != 200) return "";
    return parse_json_text(response, "text");
}

static void voice_task(void *) {
    if (lvgl_port_lock(1000)) {
        mini_face_state(MINI_LISTENING);
        lvgl_port_unlock();
    }
    ui_status("ÉCOUTE…");
    ui_answer("Parle maintenant.");
    std::string text = record_and_transcribe();
    if (text.empty()) {
        if (lvgl_port_lock(1000)) {
            mini_face_state(MINI_ERROR);
            lvgl_port_unlock();
        }
        ui_status("MICRO");
        ui_answer("Je n'ai pas réussi à transcrire. Réessaie.");
        vTaskDelay(pdMS_TO_TICKS(1800));
        if (lvgl_port_lock(1000)) {
            mini_face_state(MINI_IDLE);
            lvgl_port_unlock();
        }
        vTaskDelete(nullptr);
        return;
    }
    if (lvgl_port_lock(1000)) {
        mini_face_state(MINI_THINKING);
        lvgl_port_unlock();
    }
    ui_status("RÉFLEXION…");
    ui_answer("");
    std::string answer = chat_with_mel(text);
    if (lvgl_port_lock(1000)) {
        mini_face_state(MINI_SPEAKING);
        lvgl_port_unlock();
    }
    ui_status("MINI");
    ui_answer(answer.c_str());
    vTaskDelay(pdMS_TO_TICKS(900));
    if (lvgl_port_lock(1000)) {
        mini_face_state(MINI_IDLE);
        lvgl_port_unlock();
    }
    ui_status("");
    vTaskDelete(nullptr);
}

static void audio_test_task(void *) {
    ui_status("TEST AUDIO");
    ui_answer("Parle pendant 2 secondes : MEL va te le rejouer.");
    esp_es8311_test();
    ui_status("EN LIGNE");
    ui_answer("Test micro + haut-parleur terminé.");
    vTaskDelete(nullptr);
}

static void camera_task(void *) {
    ui_status("TEST CAMÉRA");
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        ui_status("CAMÉRA ERREUR");
        ui_answer("Aucune image reçue de l'OV5640.");
    } else {
        char msg[180];
        snprintf(msg, sizeof(msg), "Caméra OK : %ux%u · %u octets.\nLe flux complet sera utilisé par les fonctions visuelles MEL.", fb->width, fb->height, fb->len);
        ui_status("CAMÉRA OK");
        ui_answer(msg);
        esp_camera_fb_return(fb);
    }
    vTaskDelete(nullptr);
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

static bool ota_download(const std::string &key) {
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

    uint8_t *buffer = static_cast<uint8_t *>(heap_caps_malloc(8192, MALLOC_CAP_8BIT));
    bool ok = buffer != nullptr;
    while (ok) {
        int n = esp_http_client_read(client, reinterpret_cast<char *>(buffer), 8192);
        if (n < 0) { ok = false; break; }
        if (n == 0) break;
        if (esp_ota_write(handle, buffer, n) != ESP_OK) { ok = false; break; }
    }
    if (buffer) heap_caps_free(buffer);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (!ok || esp_ota_end(handle) != ESP_OK) return false;
    if (esp_ota_set_boot_partition(partition) != ESP_OK) return false;
    return true;
}

static void update_task(void *) {
    ui_status("RECHERCHE MAJ…");
    std::string response;
    int status = 0;
    esp_err_t err = http_request(
        HTTP_METHOD_GET,
        std::string(SERVER) + "/api/device/v1/manifest",
        nullptr, nullptr, 0, response, status
    );
    if (err != ESP_OK || status != 200) {
        ui_status("MAJ INDISPONIBLE");
        ui_answer("Impossible de lire le manifeste de mise à jour.");
        vTaskDelete(nullptr);
        return;
    }

    cJSON *root = cJSON_Parse(response.c_str());
    const int assets_synced = sync_assets(root);
    cJSON *fw = root ? cJSON_GetObjectItemCaseSensitive(root, "firmware") : nullptr;
    cJSON *available = fw ? cJSON_GetObjectItemCaseSensitive(fw, "available") : nullptr;
    cJSON *version = fw ? cJSON_GetObjectItemCaseSensitive(fw, "version") : nullptr;
    cJSON *key = fw ? cJSON_GetObjectItemCaseSensitive(fw, "key") : nullptr;
    const bool has = cJSON_IsTrue(available) && cJSON_IsString(key) && key->valuestring;
    const char *ver = cJSON_IsString(version) && version->valuestring ? version->valuestring : "";
    if (!has || !strcmp(ver, MEL_FW_VERSION)) {
        if (root) cJSON_Delete(root);
        ui_status("À JOUR");
        char msg[180];
        snprintf(msg, sizeof(msg), "Aucune mise à jour plus récente publiée.%s", assets_synced > 0 ? " Ressources téléchargées sur la microSD." : "");
        ui_answer(msg);
        vTaskDelete(nullptr);
        return;
    }
    std::string update_key = key->valuestring;
    if (root) cJSON_Delete(root);

    ui_status("TÉLÉCHARGEMENT…");
    ui_answer((std::string("Installation de MEL ") + ver + "…").c_str());
    if (ota_download(update_key)) {
        ui_status("REDÉMARRAGE…");
        ui_answer("Mise à jour installée.");
        vTaskDelay(pdMS_TO_TICKS(1200));
        esp_restart();
    } else {
        ui_status("ÉCHEC MAJ");
        ui_answer("Le firmware actuel est conservé.");
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
    if (action == ACTION_VOICE) xTaskCreate(voice_task, "mel_voice", 8192, nullptr, 5, nullptr);
    if (action == ACTION_CAMERA) xTaskCreate(camera_task, "mel_camera", 4096, nullptr, 4, nullptr);
    if (action == ACTION_AUDIO) xTaskCreate(audio_test_task, "mel_audio", 4096, nullptr, 4, nullptr);
    if (action == ACTION_UPDATE) xTaskCreate(update_task, "mel_update", 8192, nullptr, 4, nullptr);
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

    ui_status("CONNEXION WI-FI…");
    ui_answer(g_cfg.ssid);
    if (!connect_wifi()) {
        ui_status("WI-FI ÉCHEC");
        ui_answer("Connexion impossible. Redémarre en maintenant BOOT pour reconfigurer.");
        vTaskDelete(nullptr);
        return;
    }

    ui_status("APPAIRAGE…");
    if (!pair_terminal()) {
        ui_status("CODE À RENOUVELER");
        ui_answer("Le Wi-Fi fonctionne mais le code MEL est invalide ou expiré. Maintiens BOOT au prochain démarrage puis recrée un code.");
        vTaskDelete(nullptr);
        return;
    }

    g_online = true;
    ui_status("");
    char ready[420];
    snprintf(
        ready, sizeof(ready),
        "MINI prête · %s · %s",
        g_audio_ok ? "micro OK" : "micro indisponible",
        g_camera_ok ? "caméra OK" : "caméra indisponible"
    );
    ui_answer("");
    if (lvgl_port_lock(1000)) {
        mini_face_state(MINI_IDLE);
        lvgl_port_unlock();
    }
    xTaskCreate(heartbeat_task, "mel_heartbeat", 6144, nullptr, 3, nullptr);
    vTaskDelete(nullptr);
}

void mel_terminal_start(bool force_setup) {
    xTaskCreate(network_task, "mel_network", 10240, reinterpret_cast<void *>((intptr_t)(force_setup ? 1 : 0)), 5, nullptr);
}
