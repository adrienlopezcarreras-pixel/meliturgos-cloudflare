#include "esp_es8311_port.h"

#include "driver/i2s_std.h"
#include "esp_codec_dev.h"
#include "esp_codec_dev_defaults.h"
#include "esp_log.h"
#include "esp_heap_caps.h"

#define I2S_MCK_PIN 12
#define I2S_BCK_PIN 13
#define I2S_LRCK_PIN 15
#define I2S_DOUT_PIN 16
#define I2S_DIN_PIN 14

static const char *TAG = "MEL_ES8311_PORT";

i2s_chan_handle_t tx_handle = nullptr;
i2s_chan_handle_t rx_handle = nullptr;
esp_codec_dev_handle_t output_dev = nullptr;
esp_codec_dev_handle_t input_dev = nullptr;
static esp_codec_dev_handle_t output_codec_dev = nullptr;
static esp_codec_dev_handle_t input_codec_dev = nullptr;

static bool g_ready = false;
static esp_err_t g_last_error = ESP_OK;

static esp_err_t checked(const char *step, esp_err_t err) {
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "%s failed: %s (%d)", step, esp_err_to_name(err), (int)err);
        g_last_error = err;
    } else {
        ESP_LOGI(TAG, "%s OK", step);
    }
    return err;
}

static esp_err_t es8311_i2s_init() {
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    esp_err_t err = checked("i2s_new_channel", i2s_new_channel(&chan_cfg, &tx_handle, &rx_handle));
    if (err != ESP_OK) return err;

    i2s_std_config_t std_cfg = {};
    std_cfg.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(48000);
    std_cfg.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
    std_cfg.gpio_cfg.mclk = (gpio_num_t)I2S_MCK_PIN;
    std_cfg.gpio_cfg.bclk = (gpio_num_t)I2S_BCK_PIN;
    std_cfg.gpio_cfg.ws = (gpio_num_t)I2S_LRCK_PIN;
    std_cfg.gpio_cfg.dout = (gpio_num_t)I2S_DOUT_PIN;
    std_cfg.gpio_cfg.din = (gpio_num_t)I2S_DIN_PIN;
    std_cfg.gpio_cfg.invert_flags = {};

    err = checked("i2s_tx_init_48k", i2s_channel_init_std_mode(tx_handle, &std_cfg));
    if (err != ESP_OK) return err;
    err = checked("i2s_rx_init_48k", i2s_channel_init_std_mode(rx_handle, &std_cfg));
    if (err != ESP_OK) return err;

    err = checked("i2s_tx_enable", i2s_channel_enable(tx_handle));
    if (err != ESP_OK) return err;
    err = checked("i2s_rx_enable", i2s_channel_enable(rx_handle));
    return err;
}

void esp_es8311_port_init(i2c_master_bus_handle_t bus_handle) {
    g_ready = false;
    g_last_error = ESP_OK;

    if (es8311_i2s_init() != ESP_OK) return;

    audio_codec_i2s_cfg_t i2s_cfg = {
        .rx_handle = rx_handle,
        .tx_handle = tx_handle,
    };
    const audio_codec_data_if_t *data_if = audio_codec_new_i2s_data(&i2s_cfg);
    if (!data_if) { g_last_error = ESP_FAIL; ESP_LOGE(TAG, "audio_codec_new_i2s_data failed"); return; }

    static audio_codec_i2c_cfg_t i2c_cfg = {};
    i2c_cfg.addr = ES8311_CODEC_DEFAULT_ADDR;
    i2c_cfg.bus_handle = bus_handle;
    const audio_codec_ctrl_if_t *ctrl_if = audio_codec_new_i2c_ctrl(&i2c_cfg);
    const audio_codec_gpio_if_t *gpio_if = audio_codec_new_gpio();
    if (!ctrl_if || !gpio_if) { g_last_error = ESP_FAIL; ESP_LOGE(TAG, "codec control/gpio interface failed"); return; }

    es8311_codec_cfg_t es8311_cfg = {};
    es8311_cfg.codec_mode = ESP_CODEC_DEV_WORK_MODE_BOTH;
    es8311_cfg.master_mode = false;
    es8311_cfg.ctrl_if = ctrl_if;
    es8311_cfg.gpio_if = gpio_if;
    es8311_cfg.pa_pin = GPIO_NUM_NC;
    es8311_cfg.use_mclk = true;
    es8311_cfg.mclk_div = 256;
    es8311_cfg.hw_gain.pa_voltage = 5.0;
    es8311_cfg.hw_gain.codec_dac_voltage = 3.3;

    const audio_codec_if_t *codec_if = es8311_codec_new(&es8311_cfg);
    if (!codec_if) { g_last_error = ESP_FAIL; ESP_LOGE(TAG, "es8311_codec_new failed"); return; }

    // Keep the exact Waveshare topology that has already produced audible
    // PCM on this board: one OUT handle and one IN handle sharing the same
    // ES8311 codec interface and the same I2S data interface.
    esp_codec_dev_cfg_t out_cfg = {
        .dev_type = ESP_CODEC_DEV_TYPE_OUT,
        .codec_if = codec_if,
        .data_if = data_if,
    };
    output_codec_dev = esp_codec_dev_new(&out_cfg);
    if (!output_codec_dev) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "codec OUT create failed");
        return;
    }

    esp_codec_dev_cfg_t in_cfg = {
        .dev_type = ESP_CODEC_DEV_TYPE_IN,
        .codec_if = codec_if,
        .data_if = data_if,
    };
    input_codec_dev = esp_codec_dev_new(&in_cfg);
    if (!input_codec_dev) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "codec IN create failed");
        return;
    }

    output_dev = output_codec_dev;
    input_dev = input_codec_dev;
    esp_codec_set_disable_when_closed(output_dev, false);
    esp_codec_set_disable_when_closed(input_dev, false);

    esp_codec_dev_sample_info_t fs = {};
    fs.sample_rate = 48000;
    fs.channel = 1;
    fs.bits_per_sample = 16;
    fs.channel_mask = 0;
    fs.mclk_multiple = 0;

    const int out_open_rc = esp_codec_dev_open(output_dev, &fs);
    const int in_open_rc = esp_codec_dev_open(input_dev, &fs);
    ESP_LOGI(TAG, "codec OUT open rc=%d IN open rc=%d rate=%u ch=%u",
             out_open_rc, in_open_rc, (unsigned)fs.sample_rate, (unsigned)fs.channel);
    if (out_open_rc != ESP_CODEC_DEV_OK || in_open_rc != ESP_CODEC_DEV_OK) {
        g_last_error = ESP_FAIL;
        return;
    }

    const int mute_rc = esp_codec_dev_set_out_mute(output_dev, false);
    const int vol_rc = esp_codec_dev_set_out_vol(output_dev, 75.0);
    const int gain_rc = esp_codec_dev_set_in_gain(input_dev, 38.0);
    ESP_LOGI(TAG, "initial codec unmute=%d volume=%d gain=%d", mute_rc, vol_rc, gain_rc);
    if (mute_rc != ESP_CODEC_DEV_OK || vol_rc != ESP_CODEC_DEV_OK || gain_rc != ESP_CODEC_DEV_OK) {
        g_last_error = ESP_FAIL;
        return;
    }

    g_ready = true;
    ESP_LOGI(TAG, "ES8311 AUDIO READY WAVESHARE PATH 48k mono16");
}

bool esp_es8311_port_ready(void) {
    return g_ready && input_dev && output_dev;
}

esp_err_t esp_es8311_port_last_error(void) {
    return g_last_error;
}

void esp_es8311_port_dump(void) {
    if (output_dev) {
        ESP_LOGI(TAG, "Dumping ES8311 registers via Waveshare OUT handle");
        esp_codec_dev_dump_reg(output_dev);
    }
}

void esp_es8311_test(void) {
    if (!esp_es8311_port_ready()) {
        ESP_LOGE(TAG, "audio test refused: port not ready err=%s", esp_err_to_name(g_last_error));
        return;
    }
    const int limit_size = 2 * 48000 * 2;
    uint8_t *data = (uint8_t *)heap_caps_malloc(limit_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!data) { ESP_LOGE(TAG, "audio test allocation failed"); return; }

    esp_codec_dev_set_in_gain(input_dev, 40.0);
    int rr = esp_codec_dev_read(input_dev, data, limit_size);
    esp_codec_dev_set_in_gain(input_dev, 0.0);
    ESP_LOGI(TAG, "loopback read rc=%d bytes=%d", rr, limit_size);

    esp_codec_dev_set_out_mute(output_dev, false);
    esp_codec_dev_set_out_vol(output_dev, 70.0);
    int wr = rr == ESP_CODEC_DEV_OK ? esp_codec_dev_write(output_dev, data, limit_size) : ESP_FAIL;
    ESP_LOGI(TAG, "loopback write rc=%d", wr);
    esp_es8311_port_dump();

    heap_caps_free(data);
}
