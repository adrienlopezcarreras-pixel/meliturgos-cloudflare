package fr.veriteinterdite.mel

/** Bounds a MINI PCM upload both by total bytes and elapsed monotonic time. */
internal class MiniAudioTransferBudget(private val monotonicNanos: () -> Long = System::nanoTime) {
    companion object {
        const val MAX_CHUNK_BYTES = 512 * 1024
        const val MAX_PCM_BYTES = 96_000L * 2L * 2L * 180L
        const val MAX_DURATION_NANOS = 180L * 1_000_000_000L
    }

    private val startedAtNanos = monotonicNanos()
    private var receivedBytes = 0L

    fun withinDeadline(): Boolean = monotonicNanos() - startedAtNanos < MAX_DURATION_NANOS

    fun reserve(bytes: Int): Boolean {
        if (!withinDeadline()) return false
        if (bytes !in 1..MAX_CHUNK_BYTES) return false
        if (bytes.toLong() > MAX_PCM_BYTES - receivedBytes) return false
        receivedBytes += bytes
        return true
    }
}
