package fr.veriteinterdite.mel

import java.io.EOFException
import java.io.IOException
import java.io.InputStream

/** Receive a size-limited MINI camera photo without allowing endless drip feeds. */
internal object MiniPhotoDeadlineReader {
    const val MAX_PHOTO_BYTES = 12 * 1024 * 1024
    const val MAX_DURATION_NANOS = 180L * 1_000_000_000L

    fun read(input: InputStream, expectedBytes: Int, clockNanos: () -> Long = System::nanoTime): ByteArray {
        require(expectedBytes in 1..MAX_PHOTO_BYTES) { "MINI_PHOTO_SIZE_INVALID" }
        val result = ByteArray(expectedBytes)
        val started = clockNanos()
        var read = 0
        var emptyReads = 0
        while (read < expectedBytes) {
            if (clockNanos() - started >= MAX_DURATION_NANOS) throw IOException("MINI_PHOTO_TIMEOUT")
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
