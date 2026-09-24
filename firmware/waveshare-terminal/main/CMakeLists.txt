idf_component_register(
  SRCS "main.cpp" "mel_terminal.cpp" "mel_ble_bridge.cpp"
  INCLUDE_DIRS "."
  REQUIRES
    nvs_flash
    esp_wifi
    bt
    esp_event
    esp_netif
    esp_http_server
    esp_http_client
    app_update
    esp_timer
    json
    mbedtls
    esp_port
    esp32-camera
)
