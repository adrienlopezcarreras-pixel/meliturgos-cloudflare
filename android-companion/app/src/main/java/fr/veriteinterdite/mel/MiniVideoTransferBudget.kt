package fr.veriteinterdite.mel

/**
 * Bounds a MINI MJPEG upload before reserving each frame.
 * Both the number of frames and their cumulative payload must be limited:
 * the per-frame bound alone cannot prevent unbounded disk consumption.
 */
internal class MiniVideoTransferBudget(fps: Int, private val monotonicNanos: () -> Long = System::nanoTime) {
    companion object {
        const val MAX_FRAME_BYTES = 2 * 1024 * 1024
        const val MAX_DURATION_SECONDS = 180
        const val MAX_DURATION_NANOS = MAX_DURATION_SECONDS * 1_000_000_000L
        const val MAX_TOTAL_BYTES = 256L * 1024 * 1024
    }

    init { require(fps in 1..30) { "MINI_VIDEO_FPS_INVALID" } }
    private val maxFrames = fps * MAX_DURATION_SECONDS
    private val startedAtNanos = monotonicNanos()

    private var frames = 0
    private var totalBytes = 0L

    fun withinDeadline(): Boolean = monotonicNanos() - startedAtNanos < MAX_DURATION_NANOS

    /** Bound the next socket operation by the remaining total video deadline. */
    fun remainingSocketTimeoutMs(): Int {
        val remaining = MAX_DURATION_NANOS - (monotonicNanos() - startedAtNanos)
        if (remaining <= 0L) return 0
        return ((remaining / 1_000_000L) + if (remaining % 1_000_000L != 0L) 1 else 0)
            .coerceIn(1L, 45_000L).toInt()
    }

    fun reserve(frameBytes: Int): Boolean {
        // The FPS-derived count is not a wall-clock cap if the sender stalls.
        if (!withinDeadline()) return false
        if (frameBytes !in 1..MAX_FRAME_BYTES) return false
        if (frames >= maxFrames) return false
        if (frameBytes.toLong() > MAX_TOTAL_BYTES - totalBytes) return false
        frames++
        totalBytes += frameBytes
        return true
    }
}
