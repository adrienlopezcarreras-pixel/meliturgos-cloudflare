package fr.veriteinterdite.mel

import org.json.JSONObject

// Informative preview of the server route. This is NOT proof of delivery to the
// physical MINI over BLE or of a synchronized conversation turn.
data class MelMiniDelegatedPhase(
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
): MelMiniDelegatedPhase = validatedMiniDelegatedPhase(
    schema = payload.optString("schema"),
    state = payload.optString("state"),
    synced = payload.optBoolean("conversation_synced", true),
    source = payload.optString("source"),
    phase = payload.optString("phase"),
    observedAtMs = payload.optLong("observed_at_ms", -1L),
    expiresAtMs = payload.optLong("expires_at_ms", -1L),
    receivedAtElapsedMs = receivedAtElapsedMs,
    wallClockMs = wallClockMs
)

// Pure validator, suitable for JVM tests without Android's JSON runtime.
internal fun validatedMiniDelegatedPhase(
    schema: String,
    state: String,
    synced: Boolean,
    source: String,
    phase: String,
    observedAtMs: Long,
    expiresAtMs: Long,
    receivedAtElapsedMs: Long,
    wallClockMs: Long
): MelMiniDelegatedPhase {
    if (schema != "mel.mini.linked-android-phase.v1" ||
        state != "FRESH" || synced || source != "android" ||
        receivedAtElapsedMs < 0L || wallClockMs < 0L ||
        phase !in allowedMiniPhases || observedAtMs <= 0L ||
        observedAtMs > wallClockMs || expiresAtMs <= wallClockMs ||
        expiresAtMs - observedAtMs != 30_000L ||
        expiresAtMs - wallClockMs > 30_000L
    ) return MelMiniDelegatedPhase()
    return MelMiniDelegatedPhase(phase, receivedAtElapsedMs, expiresAtMs)
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
