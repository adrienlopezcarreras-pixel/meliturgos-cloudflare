package fr.veriteinterdite.mel

import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.net.Socket

/** Stop fragmented media payloads from extending a global transfer deadline. */
internal object MiniMediaChunkReader {
    /** Read a network-order length under the same absolute deadline as payload fragments. */
    fun readInt(
        input: InputStream,
        socket: Socket,
        remainingTimeoutMs: () -> Int,
        withinDeadline: () -> Boolean
    ): Int {
        val header = read(input, 4, socket, remainingTimeoutMs, withinDeadline)
        return ((header[0].toInt() and 0xff) shl 24) or
            ((header[1].toInt() and 0xff) shl 16) or
            ((header[2].toInt() and 0xff) shl 8) or
            (header[3].toInt() and 0xff)
    }

    fun read(
        input: InputStream,
        expectedBytes: Int,
        socket: Socket,
        remainingTimeoutMs: () -> Int,
        withinDeadline: () -> Boolean
    ): ByteArray {
        require(expectedBytes in 1..MiniVideoTransferBudget.MAX_FRAME_BYTES)
        val bytes = ByteArray(expectedBytes)
        var offset = 0
        var emptyReads = 0
        while (offset < expectedBytes) {
            val timeout = remainingTimeoutMs()
            if (timeout <= 0 || !withinDeadline()) throw IOException("MINI_MEDIA_TIMEOUT")
            socket.soTimeout = timeout
            if (!withinDeadline()) throw IOException("MINI_MEDIA_TIMEOUT")
            val count = input.read(bytes, offset, minOf(32 * 1024, expectedBytes - offset))
            if (count < 0) throw EOFException("MINI_MEDIA_INCOMPLETE")
            if (count == 0) {
                if (++emptyReads >= 16) throw IOException("MINI_MEDIA_STALLED")
                continue
            }
            emptyReads = 0
            offset += count
        }
        if (!withinDeadline()) throw IOException("MINI_MEDIA_TIMEOUT")
        return bytes
    }
}
