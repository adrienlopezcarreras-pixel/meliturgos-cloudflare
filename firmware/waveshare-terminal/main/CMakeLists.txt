idf_component_register(
  SRCS "main.cpp" "mel_terminal.cpp" "mel_mobile_bridge.cpp" "nimble_peer.c" "mel_avatar_mode_complet.c"
  INCLUDE_DIRS "."
  REQUIRES
    nvs_flash
    esp_wifi
    esp_event
    esp_netif
    lwip
    esp_http_server
    esp_http_client
    app_update
    esp_timer
    json
    mbedtls
    esp_port
    esp32-camera
    bt
)
