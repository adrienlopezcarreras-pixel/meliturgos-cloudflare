package fr.veriteinterdite.mel

import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.net.Socket

/**
 * A slow-dripping unauthenticated client must not monopolize a MINI media slot.
 * Enforce one 30-second monotonic budget across the entire connection header.
 * After authentication/metadata, payloads use their own media-specific budgets.
 */
internal class MiniMediaHandshakeReader(
    input: InputStream,
    private val socket: Socket,
    private val clockNanos: () -> Long = System::nanoTime
) : FilterInputStream(input) {
    companion object {
        const val MAX_HANDSHAKE_NANOS = 30L * 1_000_000_000L
    }

    private val startedNanos = clockNanos()
    private var handshakeComplete = false

    private fun checkBeforeRead() {
        if (handshakeComplete) return
        val remaining = MAX_HANDSHAKE_NANOS - (clockNanos() - startedNanos)
        if (remaining <= 0L) throw IOException("MINI_MEDIA_HEADER_TIMEOUT")
        val timeoutMs = ((remaining / 1_000_000L) + if (remaining % 1_000_000L != 0L) 1 else 0)
            .coerceIn(1L, 30_000L).toInt()
        socket.soTimeout = timeoutMs
        if (clockNanos() - startedNanos >= MAX_HANDSHAKE_NANOS) {
            throw IOException("MINI_MEDIA_HEADER_TIMEOUT")
        }
    }

    private fun checkAfterRead() {
        if (!handshakeComplete && clockNanos() - startedNanos >= MAX_HANDSHAKE_NANOS) {
            throw IOException("MINI_MEDIA_HEADER_TIMEOUT")
        }
    }

    override fun read(): Int {
        checkBeforeRead()
        val result = super.read()
        checkAfterRead()
        return result
    }

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        checkBeforeRead()
        val result = super.read(bytes, offset, length)
        checkAfterRead()
        return result
    }

    fun finishHandshake() {
        checkAfterRead()
        handshakeComplete = true
    }
}
