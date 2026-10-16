package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.net.Socket

class MiniBrowserRequestReaderTest {
    @Test fun readsLengthAndUrlAcrossOneByteFragments() {
        val url = "https://example.org/path"
        val raw = url.toByteArray(Charsets.UTF_8)
        val bytes = ByteArrayInputStream(byteArrayOf(0, raw.size.toByte()) + raw)
        val fragmented = object : InputStream() {
            override fun read(): Int = bytes.read()
            override fun read(dst: ByteArray, offset: Int, length: Int): Int =
                bytes.read(dst, offset, minOf(length, 1))
        }
        val socket = Socket()
        try {
            assertEquals(url, MiniBrowserRequestReader.readUrl(fragmented, socket) { 0L })
        } finally { socket.close() }
    }

    @Test fun slowHeaderExpiresBeforeReadingUrl() {
        var now = 0L
        var reads = 0
        val input = object : InputStream() {
            override fun read(): Int = 1
            override fun read(dst: ByteArray, offset: Int, length: Int): Int {
                reads++
                dst[offset] = 0
                now = MiniBrowserRequestReader.MAX_REQUEST_NANOS
                return 1
            }
        }
        val socket = Socket()
        try {
            val failure = assertThrows(IOException::class.java) {
                MiniBrowserRequestReader.readUrl(input, socket) { now }
            }
            assertEquals("MINI_MEDIA_TIMEOUT", failure.message)
            assertEquals(1, reads)
        } finally { socket.close() }
    }

    @Test fun urlBodyInheritsTimeSpentReceivingLengthHeader() {
        var now = 0L
        var reads = 0
        val url = "https://example.org/"
        val body = url.toByteArray(Charsets.UTF_8)
        val backing = ByteArrayInputStream(byteArrayOf(0, body.size.toByte()) + body)
        val input = object : InputStream() {
            override fun read(): Int = backing.read()
            override fun read(dst: ByteArray, offset: Int, length: Int): Int {
                reads++
                if (reads == 3) now = MiniBrowserRequestReader.MAX_REQUEST_NANOS
                return backing.read(dst, offset, minOf(length, 1))
            }
        }
        val socket = Socket()
        try {
            val failure = assertThrows(IOException::class.java) {
                MiniBrowserRequestReader.readUrl(input, socket) { now }
            }
            assertEquals("MINI_MEDIA_TIMEOUT", failure.message)
            assertEquals(3, reads)
        } finally { socket.close() }
    }

    @Test fun invalidDeclaredUrlSizeDoesNotReadPayload() {
        var reads = 0
        val input = object : InputStream() {
            val backing = ByteArrayInputStream(byteArrayOf(0, 1, 9, 9, 9))
            override fun read(): Int = backing.read()
            override fun read(dst: ByteArray, offset: Int, length: Int): Int {
                reads++
                return backing.read(dst, offset, length)
            }
        }
        val socket = Socket()
        try {
            assertNull(MiniBrowserRequestReader.readUrl(input, socket) { 0L })
            assertEquals(1, reads)
        } finally { socket.close() }
    }

    @Test fun truncatedUrlFailsWithoutReturningPartialRequest() {
        val socket = Socket()
        try {
            val failure = assertThrows(EOFException::class.java) {
                MiniBrowserRequestReader.readUrl(
                    ByteArrayInputStream(byteArrayOf(0, 12, 1, 2)), socket
                ) { 0L }
            }
            assertEquals("MINI_MEDIA_INCOMPLETE", failure.message)
        } finally { socket.close() }
    }
}
