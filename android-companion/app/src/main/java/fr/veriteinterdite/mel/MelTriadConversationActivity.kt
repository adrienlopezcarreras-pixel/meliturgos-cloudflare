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
    status: String,
    error: String?
): MelTriadConversationActivity {
    val (phase, label) = when {
        session != SessionStage.CONNECTED -> "UNAVAILABLE" to "Android · conversation non connectée"
        !error.isNullOrBlank() -> "ERROR" to "Android · conversation en erreur"
        recording -> "CAPTURING" to "Android · écoute en cours"
        speaking -> "RESPONDING" to "Android · réponse vocale en cours"
        busy && status.startsWith("Transcription de ta voix") ->
            "TRANSCRIBING" to "Android · transcription en cours"
        busy && (status.startsWith("MEL réfléchit") ||
            status.startsWith("Réponse locale MINI") ||
            status.startsWith("MEL prépare sa voix")) ->
            "THINKING" to "Android · traitement de la conversation"
        busy -> "OTHER_BUSY" to "Android · autre opération en cours"
        else -> "IDLE" to "Android · prêt pour la conversation"
    }
    return MelTriadConversationActivity(label = label, phase = phase,
        active = phase == "CAPTURING" || phase == "TRANSCRIBING" ||
            phase == "THINKING" || phase == "RESPONDING")
}
