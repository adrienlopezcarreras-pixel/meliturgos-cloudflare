package fr.veriteinterdite.mel

import java.io.EOFException
import java.io.IOException
import java.io.InputStream

/** Receive a size-limited MINI camera photo without allowing endless drip feeds. */
internal object MiniPhotoDeadlineReader {
    const val MAX_PHOTO_BYTES = 12 * 1024 * 1024
    const val MAX_DURATION_NANOS = 180L * 1_000_000_000L

    fun read(input: InputStream, expectedBytes: Int, clockNanos: () -> Long = System::nanoTime, beforeRead: (Int) -> Unit = {}): ByteArray {
        require(expectedBytes in 1..MAX_PHOTO_BYTES) { "MINI_PHOTO_SIZE_INVALID" }
        val result = ByteArray(expectedBytes)
        val started = clockNanos()
        var read = 0
        var emptyReads = 0
        while (read < expectedBytes) {
            val elapsed = clockNanos() - started
            if (elapsed >= MAX_DURATION_NANOS) throw IOException("MINI_PHOTO_TIMEOUT")
            // Socket reads must never wait beyond the remaining transfer deadline.
            val remainingNanos = MAX_DURATION_NANOS - elapsed
            val remainingMs = ((remainingNanos + 999_999L) / 1_000_000L).coerceIn(1L, 45_000L).toInt()
            beforeRead(remainingMs)
            val count = input.read(result, read, minOf(32 * 1024, expectedBytes - read))
            if (count < 0) throw EOFException("MINI_PHOTO_INCOMPLETE")
            if (count == 0) {
                if (++emptyReads >= 16) throw IOException("MINI_PHOTO_STALLED")
                continue
            }
            emptyReads = 0
            read += count
        }
        if (clockNanos() - started >= MAX_DURATION_NANOS) throw IOException("MINI_PHOTO_TIMEOUT")
        return result
    }
}
