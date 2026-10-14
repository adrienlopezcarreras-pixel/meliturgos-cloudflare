package fr.veriteinterdite.mel

/**
 * Presentation-only evidence snapshot for the three MEL clients.
 * A phone cannot infer Windows owner approval from MINI pairing or MEL login.
 */
internal data class MelTriadReadiness(
    val androidLabel: String,
    val androidVerified: Boolean,
    val miniLabel: String,
    val miniVerified: Boolean,
    val windowsLabel: String,
    val windowsVerified: Boolean
)

internal fun triadReadiness(
    androidSession: SessionStage,
    mini: MelMiniReadiness,
    windowsPresence: MelWindowsPresence = MelWindowsPresence(),
    nowElapsedMs: Long = -1L
): MelTriadReadiness = MelTriadReadiness(
    androidLabel = when (androidSession) {
        SessionStage.CONNECTED -> "Android · session MEL vérifiée"
        SessionStage.VERIFYING -> "Android · vérification en cours"
        SessionStage.ERROR -> "Android · connexion en erreur"
        SessionStage.DISCONNECTED -> "Android · non connecté"
    },
    androidVerified = androidSession == SessionStage.CONNECTED,
    miniLabel = when {
        mini.melInternetVerified -> "MINI · session et Internet vérifiés"
        mini.linkV2Verified -> "MINI · Link V2 vérifié"
        mini.bleConnected -> "MINI · Bluetooth uniquement"
        else -> "MINI · déconnectée"
    },
    miniVerified = mini.linkV2Verified,
    // Companion PC authorizations are only verifiable by the owner's local
    // Windows control plane. The Android MINI list does not contain that proof.
    windowsLabel = when {
        androidSession != SessionStage.CONNECTED -> "Windows · état indisponible sans session Android"
        windowsPresence.receivedAtElapsedMs < 0 ||
            nowElapsedMs < windowsPresence.receivedAtElapsedMs ||
            nowElapsedMs - windowsPresence.receivedAtElapsedMs > 35_000L ->
            "Windows · état à actualiser"
        windowsPresence.halted -> "Windows · HALT actif · contrôle non vérifié"
        windowsPresence.online -> "Windows · en ligne · contrôle local non vérifié"
        windowsPresence.known -> "Windows · hors ligne"
        else -> "Windows · disponibilité inconnue"
    },
    windowsVerified = false
)
