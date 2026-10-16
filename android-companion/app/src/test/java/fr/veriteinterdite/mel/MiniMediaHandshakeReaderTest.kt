package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.net.Socket

class MiniMediaHandshakeReaderTest {
    @Test fun shortHeaderThenPayloadIsNotSubjectToHandshakeBudget() {
        var now = 0L
        val socket = Socket()
        try {
            val input = MiniMediaHandshakeReader(
                ByteArrayInputStream(byteArrayOf(1, 2, 3)), socket
            ) { now }
            assertEquals(1, input.read())
            input.finishHandshake()
            now = MiniMediaHandshakeReader.MAX_HANDSHAKE_NANOS + 1
            assertArrayEquals(byteArrayOf(2, 3), input.readBytes())
        } finally { socket.close() }
    }

    @Test fun headerDripCannotReadAfterAbsoluteDeadline() {
        var now = 0L
        var reads = 0
        val source = object : InputStream() {
            override fun read(): Int { reads++; now += 16_000_000_000L; return 1 }
        }
        val socket = Socket()
        try {
            val input = MiniMediaHandshakeReader(source, socket) { now }
            assertEquals(1, input.read())
            val failure = assertThrows(IOException::class.java) { input.read() }
            assertEquals("MINI_MEDIA_HEADER_TIMEOUT", failure.message)
            assertEquals(2, reads)
        } finally { socket.close() }
    }

    @Test fun expiredBudgetIsRejectedBeforeAnotherRead() {
        var now = 0L
        var reads = 0
        val source = object : InputStream() {
            override fun read(): Int { reads++; return 1 }
        }
        val socket = Socket()
        try {
            val input = MiniMediaHandshakeReader(source, socket) { now }
            now = MiniMediaHandshakeReader.MAX_HANDSHAKE_NANOS
            val error = assertThrows(IOException::class.java) { input.read() }
            assertEquals("MINI_MEDIA_HEADER_TIMEOUT", error.message)
            assertEquals(0, reads)
        } finally { socket.close() }
    }

    @Test fun headerDeadlineAlsoAppliesToBulkReadsAndFinish() {
        var now = 0L
        val source = object : InputStream() {
            override fun read(): Int = 1
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                bytes[offset] = 1
                now = MiniMediaHandshakeReader.MAX_HANDSHAKE_NANOS
                return 1
            }
        }
        val socket = Socket()
        try {
            val input = MiniMediaHandshakeReader(source, socket) { now }
            val error = assertThrows(IOException::class.java) {
                input.read(ByteArray(1), 0, 1)
            }
            assertEquals("MINI_MEDIA_HEADER_TIMEOUT", error.message)
            assertThrows(IOException::class.java) { input.finishHandshake() }
        } finally { socket.close() }
    }
}
