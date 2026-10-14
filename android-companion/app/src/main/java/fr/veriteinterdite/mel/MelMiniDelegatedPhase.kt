package fr.veriteinterdite.mel

import org.json.JSONObject

// Informative preview of the server route. This is NOT proof of delivery to the
// physical MINI over BLE or of a synchronized conversation turn.
internal data class MelMiniDelegatedPhase(
    val phase: String? = null,
    val receivedAtElapsedMs: Long = -1L,
    val serverExpiresAtMs: Long = 0L
)

private val allowedMiniPhases = setOf(
    "IDLE", "CAPTURING", "TRANSCRIBING", "THINKING",
    "RESPONDING", "OTHER_BUSY", "ERROR"
)

internal fun parseMiniDelegatedPhase(
    payload: JSONObject,
    receivedAtElapsedMs: Long,
    wallClockMs: Long
): MelMiniDelegatedPhase {
    if (payload.optString("schema") != "mel.mini.linked-android-phase.v1" ||
        payload.optString("state") != "FRESH" ||
        payload.optBoolean("conversation_synced", true) ||
        payload.optString("source") != "android" ||
        receivedAtElapsedMs < 0L || wallClockMs < 0L
    ) return MelMiniDelegatedPhase()
    val phase = payload.optString("phase")
    val at = payload.optLong("observed_at_ms", -1L)
    val expiry = payload.optLong("expires_at_ms", -1L)
    if (phase !in allowedMiniPhases || at <= 0L || at > wallClockMs ||
        expiry <= wallClockMs || expiry - at != 30_000L ||
        expiry - wallClockMs > 30_000L
    ) return MelMiniDelegatedPhase()
    return MelMiniDelegatedPhase(phase, receivedAtElapsedMs, expiry)
}

internal fun miniDelegatedPhaseLabel(
    preview: MelMiniDelegatedPhase,
    nowElapsedMs: Long,
    nowWallMs: Long
): String {
    if (preview.phase == null || preview.receivedAtElapsedMs < 0L ||
        nowElapsedMs < preview.receivedAtElapsedMs ||
        nowElapsedMs - preview.receivedAtElapsedMs > 30_000L ||
        nowWallMs >= preview.serverExpiresAtMs ||
        nowWallMs < 0L
    ) return "API MINI · phase Android non vérifiée"
    val activity = when (preview.phase) {
        "IDLE" -> "prêt"
        "CAPTURING" -> "écoute"
        "TRANSCRIBING" -> "transcription"
        "THINKING" -> "traitement"
        "RESPONDING" -> "réponse"
        "OTHER_BUSY" -> "autre activité"
        "ERROR" -> "erreur"
        else -> return "API MINI · phase Android non vérifiée"
    }
    return "API MINI · Android : $activity (BLE non transmis)"
}
