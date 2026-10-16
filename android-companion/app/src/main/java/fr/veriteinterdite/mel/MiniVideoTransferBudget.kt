package fr.veriteinterdite.mel

/**
 * Bounds a MINI MJPEG upload before reserving each frame.
 * Both the number of frames and their cumulative payload must be limited:
 * the per-frame bound alone cannot prevent unbounded disk consumption.
 */
internal class MiniVideoTransferBudget {
    companion object {
        const val MAX_FRAME_BYTES = 2 * 1024 * 1024
        const val MAX_FRAMES = 30 * 180 // Up to three minutes at 30 fps.
        const val MAX_TOTAL_BYTES = 256L * 1024 * 1024
    }

    private var frames = 0
    private var totalBytes = 0L

    fun reserve(frameBytes: Int): Boolean {
        if (frameBytes !in 1..MAX_FRAME_BYTES) return false
        if (frames >= MAX_FRAMES) return false
        if (frameBytes.toLong() > MAX_TOTAL_BYTES - totalBytes) return false
        frames++
        totalBytes += frameBytes
        return true
    }
}
