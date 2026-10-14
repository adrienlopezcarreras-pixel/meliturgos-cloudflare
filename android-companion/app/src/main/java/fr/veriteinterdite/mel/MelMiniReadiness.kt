package fr.veriteinterdite.mel

/**
 * Read-only MINI readiness for the native APK UI.
 *
 * A BLE GATT link is not a verified Link V2 session. Likewise, a verified
 * Link V2 session is not proof of an authenticated MEL Internet relay.
 * Source booleans come from MelLinkV2ClientService StateFlows.
 */
internal data class MelMiniReadiness(
    val bleConnected: Boolean,
    val linkV2Verified: Boolean,
    val melInternetVerified: Boolean,
    val statusLabel: String,
    val sessionDescription: String
)

internal fun miniReadiness(
    bleConnected: Boolean,
    protocolReady: Boolean,
    internetReady: Boolean
): MelMiniReadiness {
    val verified = bleConnected && protocolReady
    val internetVerified = verified && internetReady
    return MelMiniReadiness(
        bleConnected = bleConnected,
        linkV2Verified = verified,
        melInternetVerified = internetVerified,
        statusLabel = when {
            internetVerified -> "MINI ET MEL VÉRIFIÉS"
            verified -> "SESSION LINK V2 VÉRIFIÉE"
            bleConnected -> "BLUETOOTH CONNECTÉ · SESSION EN ATTENTE"
            else -> "MINI DÉCONNECTÉE"
        },
        sessionDescription = when {
            internetVerified -> "SESSION_OK vérifié · relais Internet MEL authentifié."
            verified -> "SESSION_OK vérifié · liaison MINI prête, Internet MEL non confirmé."
            bleConnected -> "Bluetooth établi · attente de la confirmation SESSION_OK."
            else -> "Aucune session MINI établie."
        }
    )
}
