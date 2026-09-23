#pragma once
#include <stdbool.h>
#include "lvgl.h"

#define MEL_LCD_H_RES 320
#define MEL_LCD_V_RES 480
#define MEL_FW_VERSION "0.2.0-mini-test"
#define MEL_PROTOCOL_VERSION "1.0"

void mel_terminal_ui_init(lv_disp_t *display);
void mel_terminal_start(bool force_setup);
void mel_terminal_set_hardware(bool camera_ok, bool audio_ok, bool sd_ok);
