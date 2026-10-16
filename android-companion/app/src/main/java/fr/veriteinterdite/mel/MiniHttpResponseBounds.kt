package fr.veriteinterdite.mel

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

/**
 * Bounded HTTP bytes for BLE relay; does not depend on Android UI or a radio.
 * Reads progressively even when the server omits Content-Length.
 */
object MiniHttpResponseBounds {
    const val MAX_READ_DURATION_NANOS = 180L * 1_000_000_000L

    fun read(
        stream: InputStream?,
        maxBytes: Int,
        clockNanos: () -> Long = System::nanoTime
    ): ByteArray {
        require(maxBytes > 0)
        if (stream == null) return byteArrayOf()
        return stream.use { input ->
            val started = clockNanos()
            fun checkDeadline() {
                if (clockNanos() - started >= MAX_READ_DURATION_NANOS) {
                    throw IOException("MEL_RESPONSE_TIMEOUT")
                }
            }
            val out = ByteArrayOutputStream(minOf(maxBytes, 16 * 1024))
            val buffer = ByteArray(8192)
            var total = 0
            var zeroProgressReads = 0
            while (true) {
                // Existing HTTP read timeouts bound an individual blocking call;
                // this monotonic timer bounds the complete slow-dripped body.
                checkDeadline()
                val count = input.read(buffer)
                checkDeadline()
                if (count < 0) break
                if (count == 0) {
                    // A faulty network stream may return zero indefinitely.
                    // Do not spin forever, but tolerate brief zero-progress reads.
                    if (++zeroProgressReads >= 16) throw IOException("MEL_RESPONSE_STALLED")
                    continue
                }
                zeroProgressReads = 0
                if (count > maxBytes - total) throw IOException("MEL_RESPONSE_TOO_LARGE")
                out.write(buffer, 0, count)
                total += count
            }
            out.toByteArray()
        }
    }
}
