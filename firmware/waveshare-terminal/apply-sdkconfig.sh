#!/usr/bin/env bash
set -euo pipefail

SDKCONFIG="${1:?usage: apply-sdkconfig.sh <sdkconfig>}"
test -f "$SDKCONFIG"

set_cfg_y() {
  local key="$1"
  sed -i -E "/^${key}=|^# ${key} is not set$/d" "$SDKCONFIG"
  printf '%s=y\n' "$key" >> "$SDKCONFIG"
}

set_cfg_n() {
  local key="$1"
  sed -i -E "/^${key}=|^# ${key} is not set$/d" "$SDKCONFIG"
  printf '# %s is not set\n' "$key" >> "$SDKCONFIG"
}

# Runtime performance settings for the LVGL-heavy UI.
set_cfg_y CONFIG_COMPILER_OPTIMIZATION_PERF
set_cfg_y CONFIG_LV_ATTRIBUTE_FAST_MEM_USE_IRAM
set_cfg_y CONFIG_LV_MEMCPY_MEMSET_STD

# Physical board camera: OV5640 only.
set_cfg_n CONFIG_OV7670_SUPPORT
set_cfg_n CONFIG_OV7725_SUPPORT
set_cfg_n CONFIG_NT99141_SUPPORT
set_cfg_n CONFIG_OV2640_SUPPORT
set_cfg_n CONFIG_OV3660_SUPPORT
set_cfg_y CONFIG_OV5640_SUPPORT
set_cfg_n CONFIG_GC2145_SUPPORT
set_cfg_n CONFIG_GC032A_SUPPORT
set_cfg_n CONFIG_GC0308_SUPPORT
set_cfg_n CONFIG_BF3005_SUPPORT
set_cfg_n CONFIG_BF20A6_SUPPORT
set_cfg_n CONFIG_SC101IOT_SUPPORT
set_cfg_n CONFIG_SC030IOT_SUPPORT
set_cfg_n CONFIG_SC031GS_SUPPORT
set_cfg_n CONFIG_MEGA_CCM_SUPPORT

# Safe OTA boot confirmation/rollback.
set_cfg_y CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE

grep -Fxq 'CONFIG_OV5640_SUPPORT=y' "$SDKCONFIG"
grep -Fxq '# CONFIG_OV3660_SUPPORT is not set' "$SDKCONFIG"
grep -Fxq 'CONFIG_COMPILER_OPTIMIZATION_PERF=y' "$SDKCONFIG"
grep -Fxq 'CONFIG_LV_ATTRIBUTE_FAST_MEM_USE_IRAM=y' "$SDKCONFIG"
grep -Fxq 'CONFIG_LV_MEMCPY_MEMSET_STD=y' "$SDKCONFIG"
grep -Fxq 'CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y' "$SDKCONFIG"
