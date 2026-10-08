#include "esp_es8311_port.h"

#include <math.h>
#include <string.h>

#include "driver/i2s_std.h"
#include "esp_codec_dev.h"
#include "esp_codec_dev_defaults.h"
#include "esp_heap_caps.h"
#include "esp_log.h"

#define I2S_MCK_PIN 12
#define I2S_BCK_PIN 13
#define I2S_LRCK_PIN 15
#define I2S_DOUT_PIN 16
#define I2S_DIN_PIN 14

static const char *TAG = "MEL_ES8311_ZERO";

i2s_chan_handle_t tx_handle = nullptr;
i2s_chan_handle_t rx_handle = nullptr;
esp_codec_dev_handle_t output_dev = nullptr;
esp_codec_dev_handle_t input_dev = nullptr;

static bool g_ready = false;
static esp_err_t g_last_error = ESP_OK;

// Intentionally follows Waveshare factory bring-up as literally as possible.
static esp_err_t waveshare_i2s_init(void) {
    esp_err_t err = ESP_OK;

    i2s_chan_config_t chan_cfg =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);

    i2s_std_config_t std_cfg = {};
    std_cfg.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000);
    std_cfg.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
        (i2s_data_bit_width_t)16,
        I2S_SLOT_MODE_STEREO
    );
    std_cfg.gpio_cfg.mclk = (gpio_num_t)I2S_MCK_PIN;
    std_cfg.gpio_cfg.bclk = (gpio_num_t)I2S_BCK_PIN;
    std_cfg.gpio_cfg.ws = (gpio_num_t)I2S_LRCK_PIN;
    std_cfg.gpio_cfg.dout = (gpio_num_t)I2S_DOUT_PIN;
    std_cfg.gpio_cfg.din = (gpio_num_t)I2S_DIN_PIN;

    err = i2s_new_channel(&chan_cfg, &tx_handle, &rx_handle);
    if (err != ESP_OK) return err;

    err = i2s_channel_init_std_mode(tx_handle, &std_cfg);
    if (err != ESP_OK) return err;

    err = i2s_channel_init_std_mode(rx_handle, &std_cfg);
    if (err != ESP_OK) return err;

    err = i2s_channel_enable(tx_handle);
    if (err != ESP_OK) return err;

    return i2s_channel_enable(rx_handle);
}

void esp_es8311_port_init(i2c_master_bus_handle_t bus_handle) {
    g_ready = false;
    g_last_error = ESP_OK;
    output_dev = nullptr;
    input_dev = nullptr;

    const esp_err_t i2s_err = waveshare_i2s_init();
    if (i2s_err != ESP_OK) {
        g_last_error = i2s_err;
        ESP_LOGE(TAG, "Waveshare I2S init failed: %s", esp_err_to_name(i2s_err));
        return;
    }

    audio_codec_i2s_cfg_t i2s_cfg = {
        .rx_handle = rx_handle,
        .tx_handle = tx_handle,
    };
    const audio_codec_data_if_t *data_if = audio_codec_new_i2s_data(&i2s_cfg);
    if (!data_if) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "audio_codec_new_i2s_data failed");
        return;
    }

    static audio_codec_i2c_cfg_t i2c_cfg = {};
    i2c_cfg.addr = ES8311_CODEC_DEFAULT_ADDR;
    i2c_cfg.bus_handle = bus_handle;

    const audio_codec_ctrl_if_t *ctrl_if = audio_codec_new_i2c_ctrl(&i2c_cfg);
    const audio_codec_gpio_if_t *gpio_if = audio_codec_new_gpio();
    if (!ctrl_if || !gpio_if) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "codec control/gpio interface failed");
        return;
    }

    es8311_codec_cfg_t es8311_cfg = {};
    es8311_cfg.codec_mode = ESP_CODEC_DEV_WORK_MODE_BOTH;
    es8311_cfg.ctrl_if = ctrl_if;
    es8311_cfg.gpio_if = gpio_if;
    es8311_cfg.pa_pin = GPIO_NUM_NC;
    es8311_cfg.use_mclk = true;
    es8311_cfg.hw_gain.pa_voltage = 5.0;
    es8311_cfg.hw_gain.codec_dac_voltage = 3.3;

    const audio_codec_if_t *codec_if = es8311_codec_new(&es8311_cfg);
    if (!codec_if) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "es8311_codec_new failed");
        return;
    }

    esp_codec_dev_cfg_t dev_cfg = {
        .dev_type = ESP_CODEC_DEV_TYPE_OUT,
        .codec_if = codec_if,
        .data_if = data_if,
    };
    output_dev = esp_codec_dev_new(&dev_cfg);
    if (!output_dev) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "output codec create failed");
        return;
    }

    dev_cfg.dev_type = ESP_CODEC_DEV_TYPE_IN;
    input_dev = esp_codec_dev_new(&dev_cfg);
    if (!input_dev) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "input codec create failed");
        return;
    }

    esp_codec_set_disable_when_closed(output_dev, false);
    esp_codec_set_disable_when_closed(input_dev, false);

    esp_codec_dev_sample_info_t fs = {};
    fs.sample_rate = 48000;
    fs.channel = 1;
    fs.bits_per_sample = 16;
    fs.channel_mask = 0;
    fs.mclk_multiple = 0;

    const int out_rc = esp_codec_dev_open(output_dev, &fs);
    const int in_rc = esp_codec_dev_open(input_dev, &fs);
    if (out_rc != ESP_CODEC_DEV_OK || in_rc != ESP_CODEC_DEV_OK) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "codec open failed out=%d in=%d", out_rc, in_rc);
        return;
    }

    // Waveshare's example proves playback by setting volume and writing PCM.
    const int vol_rc = esp_codec_dev_set_out_vol(output_dev, 70.0);
    const int gain_rc = esp_codec_dev_set_in_gain(input_dev, 40.0);
    if (vol_rc != ESP_CODEC_DEV_OK || gain_rc != ESP_CODEC_DEV_OK) {
        g_last_error = ESP_FAIL;
        ESP_LOGE(TAG, "codec level setup failed vol=%d gain=%d", vol_rc, gain_rc);
        return;
    }

    g_ready = true;
    ESP_LOGI(TAG, "ZERO AUDIO READY: official Waveshare topology, 48k mono16");
}

bool esp_es8311_port_ready(void) {
    return g_ready && output_dev && input_dev;
}

esp_err_t esp_es8311_port_last_error(void) {
    return g_last_error;
}

void esp_es8311_port_dump(void) {
    if (output_dev) esp_codec_dev_dump_reg(output_dev);
}

bool esp_es8311_play_proof_tone(void) {
    if (!esp_es8311_port_ready()) {
        ESP_LOGE(TAG, "PROOF TONE refused: codec not ready");
        return false;
    }

    constexpr int sample_rate = 48000;
    constexpr int duration_ms = 900;
    constexpr int samples = sample_rate * duration_ms / 1000;
    constexpr int amplitude = 12000;
    constexpr int half_period = 24; // 1 kHz square wave @ 48 kHz

    auto *pcm = static_cast<int16_t *>(
        heap_caps_malloc(samples * sizeof(int16_t), MALLOC_CAP_8BIT)
    );
    if (!pcm) {
        ESP_LOGE(TAG, "PROOF TONE allocation failed");
        return false;
    }

    for (int i = 0; i < samples; ++i) {
        pcm[i] = ((i / half_period) & 1) ? amplitude : -amplitude;
    }

    const int vol_rc = esp_codec_dev_set_out_vol(output_dev, 80.0);
    const int write_rc = esp_codec_dev_write(
        output_dev,
        pcm,
        samples * sizeof(int16_t)
    );
    heap_caps_free(pcm);

    ESP_LOGI(TAG, "PROOF TONE volume_rc=%d write_rc=%d samples=%d",
             vol_rc, write_rc, samples);
    return vol_rc == ESP_CODEC_DEV_OK && write_rc == ESP_CODEC_DEV_OK;
}

void esp_es8311_test(void) {
    if (!esp_es8311_port_ready()) return;

    const int limit_size = 2 * 48000 * 1 * (16 >> 3);
    uint8_t *data = static_cast<uint8_t *>(
        heap_caps_malloc(limit_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
    );
    if (!data) return;

    esp_codec_dev_set_in_gain(input_dev, 40.0);
    const int rr = esp_codec_dev_read(input_dev, data, limit_size);
    esp_codec_dev_set_in_gain(input_dev, 0.0);

    esp_codec_dev_set_out_vol(output_dev, 70.0);
    const int wr = rr == ESP_CODEC_DEV_OK
        ? esp_codec_dev_write(output_dev, data, limit_size)
        : ESP_FAIL;

    ESP_LOGI(TAG, "factory-style loopback read=%d write=%d bytes=%d",
             rr, wr, limit_size);
    heap_caps_free(data);
}
