package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.net.Socket

class MiniMediaChunkReaderTest {
    @Test fun fragmentedPayloadCannotReadAfterDeadline() {
        var reads = 0
        var remaining = 45_000
        val input = object : InputStream() {
            override fun read(): Int = 1
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                reads++
                bytes[offset] = 7
                remaining = 0
                return 1
            }
        }
        val socket = Socket()
        try {
            val error = assertThrows(IOException::class.java) {
                MiniMediaChunkReader.read(input, 2, socket, { remaining }, { remaining > 0 })
            }
            assertEquals("MINI_MEDIA_TIMEOUT", error.message)
            assertEquals(1, reads)
        } finally { socket.close() }
    }

    @Test fun acceptsCompleteFragmentedPayload() {
        val socket = Socket()
        try {
            val bytes = byteArrayOf(1, 2, 3, 4)
            assertArrayEquals(bytes, MiniMediaChunkReader.read(
                ByteArrayInputStream(bytes), bytes.size, socket, { 45_000 }, { true }
            ))
        } finally { socket.close() }
    }
}
