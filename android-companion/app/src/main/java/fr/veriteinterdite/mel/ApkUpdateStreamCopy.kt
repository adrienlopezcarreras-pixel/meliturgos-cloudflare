package fr.veriteinterdite.mel

import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

/**
 * Copies a user-selected APK without trusting Content-Length or a provider's
 * InputStream implementation. Rejects a source that makes no forward progress.
 */
internal object ApkUpdateStreamCopy {
    fun copy(input: InputStream, output: OutputStream, digest: MessageDigest, maxBytes: Long): Long {
        require(maxBytes > 0)
        val buffer = ByteArray(32 * 1024)
        var total = 0L
        var stalledReads = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            if (count == 0) {
                if (++stalledReads >= 16) throw IllegalStateException("UPDATE_SOURCE_STALLED")
                continue
            }
            stalledReads = 0
            check(count.toLong() <= maxBytes - total) { "UPDATE_APK_TOO_LARGE" }
            digest.update(buffer, 0, count)
            output.write(buffer, 0, count)
            total += count
        }
        return total
    }
}
