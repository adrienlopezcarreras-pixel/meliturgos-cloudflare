idf_component_register(
  SRCS "main.cpp" "mel_terminal.cpp"
  INCLUDE_DIRS "."
  REQUIRES
    nvs_flash
    esp_wifi
    esp_event
    esp_netif
    esp_http_server
    esp_http_client
    app_update
    esp_timer
    json
    mbedtls
)
