package fr.veriteinterdite.mel

import java.io.InputStream
import java.net.Socket

/** Limits slow-dripped MINI browser URL headers and bytes to one 30-second deadline. */
internal object MiniBrowserRequestReader {
    const val MAX_URL_BYTES = 2048
    const val MIN_URL_BYTES = 8
    const val MAX_REQUEST_NANOS = 30L * 1_000_000_000L

    fun readUrl(
        input: InputStream,
        socket: Socket,
        clockNanos: () -> Long = System::nanoTime
    ): String? {
        val started = clockNanos()
        val withinDeadline = { clockNanos() - started < MAX_REQUEST_NANOS }
        val timeoutMs = {
            val remaining = MAX_REQUEST_NANOS - (clockNanos() - started)
            if (remaining <= 0L) 0 else
                ((remaining / 1_000_000L) + if (remaining % 1_000_000L != 0L) 1 else 0)
                    .coerceIn(1L, 15_000L).toInt()
        }
        val header = MiniMediaChunkReader.read(input, 2, socket, timeoutMs, withinDeadline)
        val size = ((header[0].toInt() and 0xff) shl 8) or (header[1].toInt() and 0xff)
        if (size !in MIN_URL_BYTES..MAX_URL_BYTES) return null
        val bytes = MiniMediaChunkReader.read(input, size, socket, timeoutMs, withinDeadline)
        return String(bytes, Charsets.UTF_8).trim()
    }
}
