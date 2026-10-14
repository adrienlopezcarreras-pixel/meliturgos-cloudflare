package fr.veriteinterdite.mel

/**
 * Native, read-only snapshot of conversation activity actually observed by
 * the Android APK. A local phase does NOT prove propagation to MINI/Windows.
 * In particular, no WAKE_DETECTED or remote TURN ACK is synthesized.
 */
internal data class MelTriadConversationActivity(
    val label: String,
    val phase: String,
    val active: Boolean,
    val locallyObserved: Boolean = true
)

internal fun triadConversationActivity(
    session: SessionStage,
    recording: Boolean,
    busy: Boolean,
    speaking: Boolean,
    error: String?
): MelTriadConversationActivity {
    val (phase, label) = when {
        session != SessionStage.CONNECTED -> "UNAVAILABLE" to "Android · conversation non connectée"
        !error.isNullOrBlank() -> "ERROR" to "Android · conversation en erreur"
        recording -> "CAPTURING" to "Android · écoute en cours"
        speaking -> "RESPONDING" to "Android · réponse vocale en cours"
        busy -> "THINKING" to "Android · traitement en cours"
        else -> "IDLE" to "Android · prêt pour la conversation"
    }
    return MelTriadConversationActivity(label = label, phase = phase,
        active = phase == "CAPTURING" || phase == "THINKING" || phase == "RESPONDING")
}
