#pragma once
#include <stdbool.h>

#define MEL_BLE_SERVICE_UUID "7d4b0001-6d65-4c49-4e49-2d4252494447"
#define MEL_BLE_STATUS_UUID  "7d4b0002-6d65-4c49-4e49-2d4252494447"
#define MEL_BLE_COMMAND_UUID "7d4b0003-6d65-4c49-4e49-2d4252494447"

bool mel_ble_bridge_start(void);
bool mel_ble_bridge_connected(void);
void mel_ble_bridge_notify_status(void);
