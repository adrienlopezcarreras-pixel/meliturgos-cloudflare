idf_component_register(
  SRCS "main.cpp" "mel_terminal.cpp" "mel_mobile_bridge_v2.cpp" "mel_link_v2_protocol.cpp" "mel_link_v2_server.cpp" "mel_link_v2_transport.cpp" "mel_ima_adpcm.cpp" "mel_avatar_mode_complet.c"
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
    fatfs
    wear_levelling
    esp_port
    esp32-camera
    bt
)
