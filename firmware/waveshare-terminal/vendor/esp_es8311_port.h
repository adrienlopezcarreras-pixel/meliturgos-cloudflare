#pragma once

#include <stdio.h>
#include <stdbool.h>
#include "esp_err.h"
#include "driver/i2c_master.h"

void esp_es8311_port_init(i2c_master_bus_handle_t bus_handle);
bool esp_es8311_port_ready(void);
esp_err_t esp_es8311_port_last_error(void);
void esp_es8311_port_dump(void);
void esp_es8311_test(void);
