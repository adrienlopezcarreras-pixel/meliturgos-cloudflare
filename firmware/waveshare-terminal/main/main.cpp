#include <stdio.h>

#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_io_expander_tca9554.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

#include "esp_axp2101_port.h"
#include "esp_camera_port.h"
#include "esp_es8311_port.h"
#include "esp_pcf85063_port.h"
#include "esp_sdcard_port.h"
#include "esp_3inch5_lcd_port.h"

#include "mel_terminal.h"

#define PIN_I2C_SDA GPIO_NUM_8
#define PIN_I2C_SCL GPIO_NUM_7
#define PIN_BUTTON  GPIO_NUM_0
#define DISPLAY_ROTATION 0
#define LCD_BUFFER_SIZE (MEL_LCD_H_RES * MEL_LCD_V_RES / 8)
#define I2C_PORT_NUM 0

static i2c_master_bus_handle_t i2c_bus_handle = nullptr;
static esp_lcd_panel_io_handle_t io_handle = nullptr;
static esp_lcd_panel_handle_t panel_handle = nullptr;
static esp_io_expander_handle_t expander_handle = nullptr;
static esp_lcd_touch_handle_t touch_handle = nullptr;
static lv_display_t *lvgl_disp = nullptr;

static void i2c_bus_init() {
    i2c_master_bus_config_t cfg = {};
    cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    cfg.i2c_port = (i2c_port_num_t)I2C_PORT_NUM;
    cfg.scl_io_num = PIN_I2C_SCL;
    cfg.sda_io_num = PIN_I2C_SDA;
    cfg.glitch_ignore_cnt = 7;
    cfg.flags.enable_internal_pullup = 1;
    ESP_ERROR_CHECK(i2c_new_master_bus(&cfg, &i2c_bus_handle));
}

static void io_expander_init() {
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
}

static void lv_port_init() {
    lvgl_port_cfg_t port_cfg = ESP_LVGL_PORT_INIT_CONFIG();
    ESP_ERROR_CHECK(lvgl_port_init(&port_cfg));

    lvgl_port_display_cfg_t display_cfg = {};
    display_cfg.io_handle = io_handle;
    display_cfg.panel_handle = panel_handle;
    display_cfg.control_handle = nullptr;
    display_cfg.buffer_size = LCD_BUFFER_SIZE;
    display_cfg.double_buffer = true;
    display_cfg.trans_size = 0;
    display_cfg.hres = MEL_LCD_H_RES;
    display_cfg.vres = MEL_LCD_V_RES;
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
}

extern "C" void app_main(void) {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    } else {
        ESP_ERROR_CHECK(ret);
    }

    gpio_config_t button_cfg = {};
    button_cfg.pin_bit_mask = 1ULL << PIN_BUTTON;
    button_cfg.mode = GPIO_MODE_INPUT;
    button_cfg.pull_up_en = GPIO_PULLUP_ENABLE;
    button_cfg.pull_down_en = GPIO_PULLDOWN_DISABLE;
    button_cfg.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&button_cfg);
    const bool force_setup = gpio_get_level(PIN_BUTTON) == 0;

    i2c_bus_init();
    io_expander_init();

    ESP_ERROR_CHECK(esp_3inch5_display_port_init(&io_handle, &panel_handle, LCD_BUFFER_SIZE));
    ESP_ERROR_CHECK(esp_3inch5_touch_port_init(
        &touch_handle, i2c_bus_handle, MEL_LCD_H_RES, MEL_LCD_V_RES, DISPLAY_ROTATION
    ));

    bool audio_ok = esp_axp2101_port_init(i2c_bus_handle) == ESP_OK;
    vTaskDelay(pdMS_TO_TICKS(100));
    esp_es8311_port_init(i2c_bus_handle);
    audio_ok = true;

    esp_pcf85063_port_init(i2c_bus_handle);

    bool sd_ok = true;
    esp_sdcard_port_init();

    bool camera_ok = true;
    esp_camera_port_init(I2C_PORT_NUM);

    esp_3inch5_brightness_port_init();
    esp_3inch5_brightness_port_set(75);
    lv_port_init();

    mel_terminal_set_hardware(camera_ok, audio_ok, sd_ok);

    if (lvgl_port_lock(0)) {
        mel_terminal_ui_init(lvgl_disp);
        lvgl_port_unlock();
    }

    mel_terminal_start(force_setup);
}
