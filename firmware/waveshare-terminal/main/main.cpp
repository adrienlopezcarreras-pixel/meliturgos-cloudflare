#include <stdio.h>

#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_io_expander_tca9554.h"
#include "esp_lvgl_port.h"
#include "esp_log.h"
#include "lvgl.h"

#include "esp_3inch5_lcd_port.h"

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

    lv_obj_t *title = lv_label_create(screen);
    lv_label_set_text(title, "MINI");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 28);

    face_obj = lv_obj_create(screen);
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

    lv_obj_t *btn = lv_btn_create(screen);
    lv_obj_set_size(btn, 220, 62);
    lv_obj_align(btn, LV_ALIGN_BOTTOM_MID, 0, -34);
    lv_obj_set_style_radius(btn, 24, 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x1D4ED8), 0);
    lv_obj_add_event_cb(btn, touch_cb, LV_EVENT_CLICKED, nullptr);

    status_label = lv_label_create(btn);
    lv_label_set_text(status_label, "PARLER");
    lv_obj_center(status_label);

    anim_timer = lv_timer_create(mini_anim_cb, 120, nullptr);
    ESP_LOGI(TAG, "STEP 6 OK: MINI ANIMATED UI READY");
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

    if (lvgl_port_lock(0)) {
        mini_smoke_ui();
        lvgl_port_unlock();
    }

    ESP_LOGI(TAG, "MINI HW SMOKE READY");
}
