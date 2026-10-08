#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_io_expander_tca9554.h"

#include "esp_axp2101_port.h"
#include "esp_es8311_port.h"

#define PIN_I2C_SDA GPIO_NUM_8
#define PIN_I2C_SCL GPIO_NUM_7
#define I2C_PORT_NUM 0

static const char *TAG = "mini_audio_zero";
static i2c_master_bus_handle_t g_i2c = nullptr;
static esp_io_expander_handle_t g_expander = nullptr;

static void init_i2c(void) {
    i2c_master_bus_config_t cfg = {};
    cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    cfg.i2c_port = (i2c_port_num_t)I2C_PORT_NUM;
    cfg.scl_io_num = PIN_I2C_SCL;
    cfg.sda_io_num = PIN_I2C_SDA;
    cfg.glitch_ignore_cnt = 7;
    cfg.flags.enable_internal_pullup = 1;
    ESP_ERROR_CHECK(i2c_new_master_bus(&cfg, &g_i2c));
}

static void init_expander_and_pa(void) {
    ESP_ERROR_CHECK(esp_io_expander_new_i2c_tca9554(
        g_i2c,
        ESP_IO_EXPANDER_I2C_TCA9554_ADDRESS_000,
        &g_expander
    ));

    // Exact Waveshare reset pulse on EXIO1.
    ESP_ERROR_CHECK(esp_io_expander_set_dir(
        g_expander,
        IO_EXPANDER_PIN_NUM_1,
        IO_EXPANDER_OUTPUT
    ));
    ESP_ERROR_CHECK(esp_io_expander_set_level(g_expander, IO_EXPANDER_PIN_NUM_1, 0));
    vTaskDelay(pdMS_TO_TICKS(100));
    ESP_ERROR_CHECK(esp_io_expander_set_level(g_expander, IO_EXPANDER_PIN_NUM_1, 1));
    vTaskDelay(pdMS_TO_TICKS(100));

    // MINI board speaker amplifier enable (TCA9554 P2 / PA_CTRL).
    ESP_ERROR_CHECK(esp_io_expander_set_dir(
        g_expander,
        IO_EXPANDER_PIN_NUM_2,
        IO_EXPANDER_OUTPUT
    ));
    ESP_ERROR_CHECK(esp_io_expander_set_level(
        g_expander,
        IO_EXPANDER_PIN_NUM_2,
        1
    ));
    vTaskDelay(pdMS_TO_TICKS(100));
}

extern "C" void app_main(void) {
    ESP_LOGI(TAG, "AUDIO ZERO PROOF BOOT");
    ESP_LOGI(TAG, "No BLE, no Wi-Fi, no Android, no TTS, no camera, no LVGL");

    init_i2c();
    ESP_LOGI(TAG, "I2C READY");

    init_expander_and_pa();
    ESP_LOGI(TAG, "TCA9554 READY: reset pulse + PA_CTRL(P2)=HIGH");

    const esp_err_t pmu = esp_axp2101_port_init(g_i2c);
    ESP_LOGI(TAG, "AXP2101 init: %s", esp_err_to_name(pmu));
    vTaskDelay(pdMS_TO_TICKS(100));

    esp_es8311_port_init(g_i2c);
    if (!esp_es8311_port_ready()) {
        ESP_LOGE(TAG, "ES8311 FAILED: %s", esp_err_to_name(esp_es8311_port_last_error()));
        while (true) vTaskDelay(pdMS_TO_TICKS(1000));
    }

    ESP_LOGI(TAG, "ES8311 READY; local PCM proof only");

    const bool first = esp_es8311_play_proof_tone();
    ESP_LOGI(TAG, "AUDIO ZERO PROOF RESULT: %s", first ? "PASS" : "FAIL");

    // Hard stop after one physical proof tone. Disable the external amplifier
    // first, then enter deep sleep with no wake timer. The tone can only play
    // again after an intentional hardware reset/power cycle.
    const esp_err_t pa_off = esp_io_expander_set_level(
        g_expander,
        IO_EXPANDER_PIN_NUM_2,
        0
    );
    ESP_LOGI(TAG, "PA_CTRL(P2)=LOW before deep sleep: %s", esp_err_to_name(pa_off));
    vTaskDelay(pdMS_TO_TICKS(100));
    ESP_LOGI(TAG, "AUDIO ZERO PROOF HALT: entering deep sleep, no timer wake");
    esp_deep_sleep_start();
}
