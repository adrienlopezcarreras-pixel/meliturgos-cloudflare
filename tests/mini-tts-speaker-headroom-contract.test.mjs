import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI reserves speaker headroom for all TTS transports', async () => {
  const src = await readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8');
  assert.match(src, /static constexpr float MEL_TTS_SPEAKER_VOLUME = 75\.0f;/);
  const calls = src.match(/speaker_output_enable\(MEL_TTS_SPEAKER_VOLUME\)/g) || [];
  assert.equal(calls.length, 3, 'BLE Link V2, legacy mobile and Wi-Fi TTS should use one volume limit');
  assert.doesNotMatch(src, /speaker_output_enable\(100\.0\)/);
  assert.match(src, /esp_codec_dev_set_out_mute\(output_dev, false\)/);
  assert.match(src, /esp_codec_dev_set_out_vol\(output_dev, volume\)/);
  assert.match(src, /ESP_LOGI\(TAG, "SPEAKER enable mute_rc=/);
});
