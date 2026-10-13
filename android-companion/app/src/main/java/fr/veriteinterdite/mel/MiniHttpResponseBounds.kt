package fr.veriteinterdite.mel

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

/**
 * Bounded HTTP bytes for BLE relay; does not depend on Android UI or a radio.
 * Reads progressively even when the server omits Content-Length.
 */
object MiniHttpResponseBounds {
    fun read(stream: InputStream?, maxBytes: Int): ByteArray {
        require(maxBytes > 0)
        if (stream == null) return byteArrayOf()
        return stream.use { input ->
            val out = ByteArrayOutputStream(minOf(maxBytes, 16 * 1024))
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count == 0) continue
                if (count > maxBytes - total) throw IOException("MEL_RESPONSE_TOO_LARGE")
                out.write(buffer, 0, count)
                total += count
            }
            out.toByteArray()
        }
    }
}
