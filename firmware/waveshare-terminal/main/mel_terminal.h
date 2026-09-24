#pragma once
#include <stdbool.h>
#include "lvgl.h"

#define MEL_LCD_H_RES 320
#define MEL_LCD_V_RES 480
#define MEL_FW_VERSION "0.4.5-stability"
#define MEL_PROTOCOL_VERSION "1.0"

void mel_terminal_ui_init(lv_disp_t *display);
void mel_terminal_start(bool force_setup);
void mel_terminal_set_hardware(bool camera_ok, bool audio_ok, bool sd_ok);

bool mel_terminal_has_token(void);
void mel_terminal_set_pair_code(const char *code);
void mel_terminal_set_network_info(const char *ip);
void mel_terminal_set_wifi_connected(bool connected);
void mel_terminal_start_online(void);

enum MelTerminalState {
  MEL_TERMINAL_IDLE = 0,
  MEL_TERMINAL_LISTENING = 1,
  MEL_TERMINAL_THINKING = 2,
  MEL_TERMINAL_SPEAKING = 3,
  MEL_TERMINAL_ERROR = 4
};

void mel_terminal_request_voice(void);
int mel_terminal_state(void);
bool mel_terminal_online(void);
void mel_terminal_test_audio(void);
void mel_terminal_test_camera(void);
typedef void (*mel_terminal_test_status_cb_t)(const char *text);
void mel_terminal_test_stt(mel_terminal_test_status_cb_t cb);

void mel_terminal_bind_external_ui(lv_obj_t *status_label, lv_obj_t *answer_label);
