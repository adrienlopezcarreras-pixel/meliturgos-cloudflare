#include <stdio.h>

#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_io_expander_tca9554.h"
#include "esp_lvgl_port.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "nvs.h"
#include "lvgl.h"

#include "esp_3inch5_lcd_port.h"
#include "esp_wifi_port.h"

extern esp_err_t esp_wifi_port_sta_connect(const char *ssid, const char *password);

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
static lv_obj_t *face_obj = nullptr;
static lv_obj_t *left_eye = nullptr;
static lv_obj_t *right_eye = nullptr;
static lv_obj_t *mouth_obj = nullptr;
static lv_timer_t *anim_timer = nullptr;
static bool listening = false;

#define MINI_WIFI_MAX_AP 12
static lv_obj_t *wifi_panel = nullptr;
static lv_obj_t *wifi_list = nullptr;
static lv_obj_t *wifi_status = nullptr;
static lv_obj_t *wifi_pwd = nullptr;
static lv_obj_t *wifi_keyboard = nullptr;
static lv_obj_t *wifi_connect_btn = nullptr;
static lv_obj_t *main_panel = nullptr;
static char wifi_ssids[MINI_WIFI_MAX_AP][33] = {};
static char selected_ssid[33] = {};
static TaskHandle_t wifi_scan_task_handle = nullptr;
static TaskHandle_t wifi_connect_task_handle = nullptr;

static void mini_anim_cb(lv_timer_t *) {
    if (!left_eye || !right_eye || !mouth_obj || !face_obj) return;
    const uint32_t phase = (lv_tick_get() / 120) % 32;
    const bool blink = !listening && (phase == 0 || phase == 1);
    lv_obj_set_height(left_eye, blink ? 2 : 10);
    lv_obj_set_height(right_eye, blink ? 2 : 10);
    if (listening) {
        lv_obj_set_style_border_color(face_obj, lv_color_hex(0x34D399), 0);
        lv_obj_set_height(mouth_obj, (phase % 3 == 0) ? 12 : 5);
    } else {
        lv_obj_set_style_border_color(face_obj, lv_color_hex(0x22D3EE), 0);
        lv_obj_set_height(mouth_obj, 5);
    }
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

static void wifi_show_main() {
    if (!main_panel || !wifi_panel) return;
    lv_obj_clear_flag(main_panel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(wifi_panel, LV_OBJ_FLAG_HIDDEN);
    if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
}

static void wifi_show_password(const char *ssid) {
    snprintf(selected_ssid, sizeof(selected_ssid), "%s", ssid ? ssid : "");
    if (!wifi_status || !wifi_pwd || !wifi_keyboard || !wifi_list) return;
    lv_label_set_text_fmt(wifi_status, "Reseau: %s", selected_ssid);
    lv_obj_add_flag(wifi_list, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
    if (wifi_connect_btn) lv_obj_clear_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
    lv_textarea_set_text(wifi_pwd, "");
    lv_keyboard_set_textarea(wifi_keyboard, wifi_pwd);
}

static void wifi_ap_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    const char *ssid = (const char *)lv_event_get_user_data(e);
    wifi_show_password(ssid);
}

static void wifi_scan_task(void *) {
    wifi_ap_record_t aps[MINI_WIFI_MAX_AP] = {};
    uint16_t count = 0;
    const bool ok = esp_wifi_port_scan(aps, &count, MINI_WIFI_MAX_AP);
    if (lvgl_port_lock(0)) {
        if (wifi_list) lv_obj_clean(wifi_list);
        if (!ok || count == 0) {
            if (wifi_status) lv_label_set_text(wifi_status, "Aucun reseau detecte");
        } else {
            if (wifi_status) lv_label_set_text_fmt(wifi_status, "%u reseaux detectes", count);
            for (uint16_t i = 0; i < count && i < MINI_WIFI_MAX_AP; ++i) {
                snprintf(wifi_ssids[i], sizeof(wifi_ssids[i]), "%s", (char *)aps[i].ssid);
                char row[52];
                snprintf(row, sizeof(row), "%s   %d dBm", wifi_ssids[i], aps[i].rssi);
                lv_obj_t *btn = lv_list_add_btn(wifi_list, LV_SYMBOL_WIFI, row);
                lv_obj_add_event_cb(btn, wifi_ap_clicked, LV_EVENT_CLICKED, wifi_ssids[i]);
            }
        }
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
    if (wifi_pwd) lv_obj_add_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);
    if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
    if (wifi_connect_btn) lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
    if (wifi_status) lv_label_set_text(wifi_status, "Recherche des reseaux...");
    if (!wifi_scan_task_handle) {
        xTaskCreate(wifi_scan_task, "mini_wifi_scan", 6144, nullptr, 3, &wifi_scan_task_handle);
    }
}

static void wifi_scan_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) wifi_start_scan();
}

static void wifi_open_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    if (main_panel) lv_obj_add_flag(main_panel, LV_OBJ_FLAG_HIDDEN);
    if (wifi_panel) lv_obj_clear_flag(wifi_panel, LV_OBJ_FLAG_HIDDEN);
    wifi_start_scan();
}

static void wifi_back_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    if (wifi_list && lv_obj_has_flag(wifi_list, LV_OBJ_FLAG_HIDDEN)) {
        lv_obj_clear_flag(wifi_list, LV_OBJ_FLAG_HIDDEN);
        if (wifi_pwd) lv_obj_add_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);
        if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
        if (wifi_connect_btn) lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
        if (wifi_status) lv_label_set_text(wifi_status, "Choisis un reseau");
    } else {
        wifi_show_main();
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
    esp_wifi_port_sta_connect(ssid, pwd);

    bool connected = false;
    wifi_ap_record_t info = {};
    for (int i = 0; i < 30; ++i) {
        if (esp_wifi_sta_get_ap_info(&info) == ESP_OK) {
            connected = true;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }

    if (connected) wifi_save_credentials(ssid, pwd);

    if (lvgl_port_lock(0)) {
        if (connected) {
            char ip[32] = {};
            esp_wifi_port_get_ip(ip);
            if (wifi_status) lv_label_set_text_fmt(wifi_status, "Connecte a %s\nIP %s", ssid, ip);
            if (status_label) lv_label_set_text(status_label, "PARLER");
            vTaskDelay(pdMS_TO_TICKS(1200));
            wifi_show_main();
        } else {
            if (wifi_status) lv_label_set_text(wifi_status, "Connexion impossible. Verifie le mot de passe.");
            if (wifi_keyboard) lv_obj_clear_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
            if (wifi_connect_btn) lv_obj_clear_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
        }
        lvgl_port_unlock();
    }
    wifi_connect_task_handle = nullptr;
    vTaskDelete(nullptr);
}

static void wifi_connect_clicked(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED || !wifi_pwd || !selected_ssid[0]) return;
    const char *pwd = lv_textarea_get_text(wifi_pwd);
    char *payload = (char *)calloc(1, 33 + 65);
    if (!payload) return;
    snprintf(payload, 33, "%s", selected_ssid);
    snprintf(payload + 33, 65, "%s", pwd ? pwd : "");
    if (wifi_status) lv_label_set_text(wifi_status, "Connexion...");
    if (wifi_keyboard) lv_obj_add_flag(wifi_keyboard, LV_OBJ_FLAG_HIDDEN);
    if (wifi_connect_btn) lv_obj_add_flag(wifi_connect_btn, LV_OBJ_FLAG_HIDDEN);
    if (!wifi_connect_task_handle) {
        xTaskCreate(wifi_connect_task, "mini_wifi_connect", 6144, payload, 3, &wifi_connect_task_handle);
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
    lv_label_set_text(title, "MINI · Wi-Fi");
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

    wifi_pwd = lv_textarea_create(wifi_panel);
    lv_obj_set_size(wifi_pwd, 282, 50);
    lv_obj_align(wifi_pwd, LV_ALIGN_TOP_MID, 0, 72);
    lv_textarea_set_placeholder_text(wifi_pwd, "Mot de passe Wi-Fi");
    lv_textarea_set_password_mode(wifi_pwd, true);
    lv_textarea_set_one_line(wifi_pwd, true);
    lv_obj_add_flag(wifi_pwd, LV_OBJ_FLAG_HIDDEN);

    wifi_connect_btn = lv_btn_create(wifi_panel);
    lv_obj_set_size(wifi_connect_btn, 170, 44);
    lv_obj_align(wifi_connect_btn, LV_ALIGN_TOP_MID, 0, 128);
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
    listening = !listening;
    lv_label_set_text(status_label, listening ? "ECOUTE" : "PARLER");
    ESP_LOGI(TAG, "TOUCH OK - MINI %s", listening ? "LISTENING" : "IDLE");
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

    lv_obj_t *title = lv_label_create(main_panel);
    lv_label_set_text(title, "MINI");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 28);

    lv_obj_t *wifi_btn = lv_btn_create(main_panel);
    lv_obj_set_size(wifi_btn, 48, 38);
    lv_obj_align(wifi_btn, LV_ALIGN_TOP_RIGHT, -10, 16);
    lv_obj_t *wl = lv_label_create(wifi_btn);
    lv_label_set_text(wl, LV_SYMBOL_WIFI);
    lv_obj_center(wl);
    lv_obj_add_event_cb(wifi_btn, wifi_open_clicked, LV_EVENT_CLICKED, nullptr);

    face_obj = lv_obj_create(main_panel);
    lv_obj_set_size(face_obj, 210, 210);
    lv_obj_align(face_obj, LV_ALIGN_CENTER, 0, -52);
    lv_obj_set_style_radius(face_obj, 105, 0);
    lv_obj_set_style_bg_color(face_obj, lv_color_hex(0x0B1628), 0);
    lv_obj_set_style_border_width(face_obj, 4, 0);
    lv_obj_set_style_border_color(face_obj, lv_color_hex(0x22D3EE), 0);
    lv_obj_set_style_shadow_width(face_obj, 24, 0);
    lv_obj_set_style_shadow_color(face_obj, lv_color_hex(0x0EA5E9), 0);
    lv_obj_set_style_shadow_opa(face_obj, LV_OPA_40, 0);
    lv_obj_clear_flag(face_obj, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *inner = lv_obj_create(face_obj);
    lv_obj_set_size(inner, 160, 170);
    lv_obj_center(inner);
    lv_obj_set_style_radius(inner, 70, 0);
    lv_obj_set_style_bg_color(inner, lv_color_hex(0x111C30), 0);
    lv_obj_set_style_border_width(inner, 1, 0);
    lv_obj_set_style_border_color(inner, lv_color_hex(0x334155), 0);
    lv_obj_clear_flag(inner, LV_OBJ_FLAG_SCROLLABLE);

    left_eye = lv_obj_create(inner);
    lv_obj_set_size(left_eye, 30, 10);
    lv_obj_align(left_eye, LV_ALIGN_CENTER, -38, -24);
    lv_obj_set_style_radius(left_eye, 5, 0);
    lv_obj_set_style_bg_color(left_eye, lv_color_hex(0x7DD3FC), 0);
    lv_obj_set_style_border_width(left_eye, 0, 0);

    right_eye = lv_obj_create(inner);
    lv_obj_set_size(right_eye, 30, 10);
    lv_obj_align(right_eye, LV_ALIGN_CENTER, 38, -24);
    lv_obj_set_style_radius(right_eye, 5, 0);
    lv_obj_set_style_bg_color(right_eye, lv_color_hex(0x7DD3FC), 0);
    lv_obj_set_style_border_width(right_eye, 0, 0);

    mouth_obj = lv_obj_create(inner);
    lv_obj_set_size(mouth_obj, 42, 5);
    lv_obj_align(mouth_obj, LV_ALIGN_CENTER, 0, 42);
    lv_obj_set_style_radius(mouth_obj, 7, 0);
    lv_obj_set_style_bg_color(mouth_obj, lv_color_hex(0xA5F3FC), 0);
    lv_obj_set_style_border_width(mouth_obj, 0, 0);

    lv_obj_t *btn = lv_btn_create(main_panel);
    lv_obj_set_size(btn, 220, 62);
    lv_obj_align(btn, LV_ALIGN_BOTTOM_MID, 0, -34);
    lv_obj_set_style_radius(btn, 24, 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x1D4ED8), 0);
    lv_obj_add_event_cb(btn, touch_cb, LV_EVENT_CLICKED, nullptr);

    status_label = lv_label_create(btn);
    lv_label_set_text(status_label, "PARLER");
    lv_obj_center(status_label);

    wifi_ui_create(screen);
    anim_timer = lv_timer_create(mini_anim_cb, 120, nullptr);
    ESP_LOGI(TAG, "STEP 6 OK: MINI ANIMATED UI + WIFI READY");
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

    ESP_LOGI(TAG, "STEP 4: BACKLIGHT");
    esp_3inch5_brightness_port_init();
    esp_3inch5_brightness_port_set(80);
    ESP_LOGI(TAG, "STEP 4 OK");

    lv_port_init();

    ESP_LOGI(TAG, "STEP 6: WIFI STACK");
    esp_wifi_port_init(nullptr, nullptr);
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "STEP 6 OK: WIFI STACK STARTED");

    if (lvgl_port_lock(0)) {
        mini_smoke_ui();
        lvgl_port_unlock();
    }

    char saved_ssid[33] = {};
    char saved_pwd[65] = {};
    if (wifi_load_credentials(saved_ssid, sizeof(saved_ssid), saved_pwd, sizeof(saved_pwd))) {
        esp_wifi_port_sta_connect(saved_ssid, saved_pwd);
        ESP_LOGI(TAG, "Saved WiFi requested: %s", saved_ssid);
    } else if (lvgl_port_lock(0)) {
        lv_obj_add_flag(main_panel, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(wifi_panel, LV_OBJ_FLAG_HIDDEN);
        wifi_start_scan();
        lvgl_port_unlock();
    }

    ESP_LOGI(TAG, "MINI WIFI TEST READY");
}
