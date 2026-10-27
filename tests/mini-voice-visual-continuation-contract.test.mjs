import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (name) => readFile(new URL('../firmware/waveshare-terminal/main/' + name, import.meta.url), 'utf8');

test('spoken responses retain the avatar except requested media or a real display result', async () => {
  const fw = await read('mel_terminal.cpp');
  assert.match(fw, /const bool show_visual = !g_display_items\.empty\(\) \|\| spoken_visual_request\(text\);/);
  assert.match(fw, /if \(show_visual\)\s*\{[\s\S]*?mini_ui_open_response_page\(visible_answer\.c_str\(\)\);/);
  assert.match(fw, /if \(show_visual && !g_display_items\.empty\(\)\)/);
  assert.match(fw, /VOICE UI route=%s/);
  assert.match(fw, /mini_ui_close_response_page\(\);[\s\S]*?ui_status\("ECOUTE\.\.\."\);/);
  assert.match(fw, /const bool show = has\("montre"\) \|\| has\("affiche"\)/);
});

test('showing a video or audio does not accidentally launch local recording', async () => {
  const fw = await read('mel_terminal.cpp');
  const captureFn = fw.slice(fw.indexOf('static bool handle_local_media_command(const std::string &spoken) {'));
  assert.match(captureFn, /const bool video =[\s\S]*?\(capture_action && \(text\.find\("video"\)/);
  assert.doesNotMatch(captureFn, /text\.find\("video"\) != std::string::npos;\s*\n\s*const bool audio/);
  assert.match(captureFn, /const bool audio = !photo && !video &&/);
});

test('media view preserves controls for PARLER, STOP and media navigation', async () => {
  const ui = await read('main.cpp');
  assert.match(ui, /response_talk_btn = lv_btn_create\(response_panel\)/);
  assert.match(ui, /lv_obj_add_event_cb\(response_talk_btn, response_talk_clicked, LV_EVENT_CLICKED/);
  assert.match(ui, /static void response_talk_clicked\(lv_event_t \*e\)\s*\{[\s\S]*?mel_terminal_request_voice\(\);/);
  assert.match(ui, /active_view == MINI_VIEW_RESPONSE && response_talk_label/);
  assert.match(ui, /"ATTENTE" : "PARLER"/);
  assert.match(ui, /lv_obj_add_event_cb\(prev, response_previous_clicked/);
  assert.match(ui, /lv_obj_add_event_cb\(next, response_next_clicked/);
  assert.match(ui, /lv_obj_add_event_cb\(response_stop_voice_btn, response_stop_voice_clicked/);
  assert.doesNotMatch(ui, /lv_obj_add_state\(response_stop_voice_btn, LV_STATE_DISABLED\)/);
});
