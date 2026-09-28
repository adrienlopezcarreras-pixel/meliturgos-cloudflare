#pragma once
#include <stddef.h>
#include <stdint.h>

bool mini_ui_show_rgb565(const uint8_t *pixels, size_t bytes, uint16_t width, uint16_t height);
void mini_ui_hide_visual();
bool mini_ui_visual_active();
