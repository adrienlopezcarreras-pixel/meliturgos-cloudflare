#include <stdio.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/gpio.h"
#include "driver/i2c_master.h"

#include "esp_io_expander_tca9554.h"
#include "esp_log.h"

#include "esp_axp2101_port.h"
#include "esp_es8311_port.h"

#define EXAMPLE_PIN_I2C_SDA GPIO_NUM_8
#define EXAMPLE_PIN_I2C_SCL GPIO_NUM_7
#define I2C_PORT_NUM 0

static const char *TAG = "waveshare_audio_base";

static i2c_master_bus_handle_t i2c_bus_handle;
static esp_io_expander_handle_t expander_handle = NULL;

static void i2c_bus_init(void)
{
    i2c_master_bus_config_t i2c_mst_config = {};
    i2c_mst_config.clk_source = I2C_CLK_SRC_DEFAULT;
    i2c_mst_config.i2c_port = (i2c_port_num_t)I2C_PORT_NUM;
    i2c_mst_config.scl_io_num = EXAMPLE_PIN_I2C_SCL;
    i2c_mst_config.sda_io_num = EXAMPLE_PIN_I2C_SDA;
    i2c_mst_config.glitch_ignore_cnt = 7;
    i2c_mst_config.flags.enable_internal_pullup = 1;

    ESP_ERROR_CHECK(i2c_new_master_bus(&i2c_mst_config, &i2c_bus_handle));
}

static void io_expander_init(void)
{
    ESP_ERROR_CHECK(esp_io_expander_new_i2c_tca9554(
        i2c_bus_handle,
        ESP_IO_EXPANDER_I2C_TCA9554_ADDRESS_000,
        &expander_handle
    ));
    ESP_ERROR_CHECK(esp_io_expander_set_dir(
        expander_handle,
        IO_EXPANDER_PIN_NUM_1,
        IO_EXPANDER_OUTPUT
    ));
    ESP_ERROR_CHECK(esp_io_expander_set_level(
        expander_handle,
        IO_EXPANDER_PIN_NUM_1,
        0
    ));
    vTaskDelay(pdMS_TO_TICKS(100));
    ESP_ERROR_CHECK(esp_io_expander_set_level(
        expander_handle,
        IO_EXPANDER_PIN_NUM_1,
        1
    ));
    vTaskDelay(pdMS_TO_TICKS(100));
}

extern "C" void app_main(void)
{
    ESP_LOGI(TAG, "WAVESHARE OFFICIAL AUDIO BASE");

    // Same board bring-up order as Waveshare's official lvgl_system example.
    i2c_bus_init();
    io_expander_init();
    esp_axp2101_port_init(i2c_bus_handle);
    vTaskDelay(pdMS_TO_TICKS(100));
    esp_es8311_port_init(i2c_bus_handle);

    // Only addition to the official base: invoke Waveshare's own microphone
    // record/playback diagnostic once. It records ~2 seconds, then plays the
    // captured audio and returns the codec output volume to zero exactly as
    // the vendor code does.
    ESP_LOGI(TAG, "Starting official Waveshare esp_es8311_test()");
    esp_es8311_test();
    ESP_LOGI(TAG, "Official Waveshare audio test finished");

    // Keep the official-initialized system alive without adding MEL, BLE,
    // Android, TTS, synthetic tones, PA_CTRL assumptions, or custom muting.
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
