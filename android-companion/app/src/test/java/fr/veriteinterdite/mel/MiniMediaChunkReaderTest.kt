package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.EOFException
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
    @Test fun incompletePayloadFailsWithoutReturningPartialMedia() {
        val socket = Socket()
        try {
            val error = assertThrows(EOFException::class.java) {
                MiniMediaChunkReader.read(
                    ByteArrayInputStream(byteArrayOf(1)), 3, socket, { 45_000 }, { true }
                )
            }
            assertEquals("MINI_MEDIA_INCOMPLETE", error.message)
        } finally { socket.close() }
    }

    @Test fun repeatedZeroLengthReadsAreBounded() {
        var reads = 0
        val input = object : InputStream() {
            override fun read(): Int = 0
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                reads++
                return 0
            }
        }
        val socket = Socket()
        try {
            val error = assertThrows(IOException::class.java) {
                MiniMediaChunkReader.read(input, 1, socket, { 45_000 }, { true })
            }
            assertEquals("MINI_MEDIA_STALLED", error.message)
            assertEquals(16, reads)
        } finally { socket.close() }
    }

    @Test fun expiredDuringSocketTimeoutSetupNeverReadsPayload() {
        var reads = 0
        var checks = 0
        val input = object : InputStream() {
            override fun read(): Int { reads++; return 1 }
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                reads++
                return 1
            }
        }
        val socket = Socket()
        try {
            val error = assertThrows(IOException::class.java) {
                MiniMediaChunkReader.read(input, 1, socket, { 45_000 }, {
                    checks++
                    checks == 1
                })
            }
            assertEquals("MINI_MEDIA_TIMEOUT", error.message)
            assertEquals(0, reads)
        } finally { socket.close() }
    }

    @Test fun invalidChunkSizeIsRejectedBeforeReadingStream() {
        var reads = 0
        val input = object : InputStream() {
            override fun read(): Int { reads++; return -1 }
        }
        val socket = Socket()
        try {
            assertThrows(IllegalArgumentException::class.java) {
                MiniMediaChunkReader.read(input, 0, socket, { 45_000 }, { true })
            }
            assertEquals(0, reads)
        } finally { socket.close() }
    }

    @Test fun readsNetworkOrderSizeHeaderAcrossSingleByteFragments() {
        val socket = Socket()
        try {
            val bytes = ByteArrayInputStream(byteArrayOf(0, 0, 1, 0))
            val fragmented = object : InputStream() {
                override fun read(): Int = bytes.read()
                override fun read(dst: ByteArray, offset: Int, length: Int): Int =
                    bytes.read(dst, offset, minOf(length, 1))
            }
            assertEquals(256, MiniMediaChunkReader.readInt(fragmented, socket, { 45_000 }, { true }))
        } finally { socket.close() }
    }

    @Test fun fragmentedSizeHeaderExpiresBeforeAnotherByte() {
        var now = 0L
        var reads = 0
        val socket = Socket()
        val budget = MiniVideoTransferBudget(5) { now }
        val source = object : InputStream() {
            override fun read(): Int = 0
            override fun read(dst: ByteArray, offset: Int, length: Int): Int {
                reads++
                dst[offset] = 0
                now = MiniVideoTransferBudget.MAX_DURATION_NANOS
                return 1
            }
        }
        try {
            val failure = assertThrows(IOException::class.java) {
                MiniMediaChunkReader.readInt(source, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline)
            }
            assertEquals("MINI_MEDIA_TIMEOUT", failure.message)
            assertEquals(1, reads)
        } finally { socket.close() }
    }

    @Test fun zeroLengthEndMarkerAndNegativeLengthRemainDistinct() {
        val socket = Socket()
        try {
            val zero = ByteArrayInputStream(byteArrayOf(0, 0, 0, 0))
            assertEquals(0, MiniMediaChunkReader.readInt(zero, socket, { 45_000 }, { true }))
            val negative = ByteArrayInputStream(byteArrayOf(-1, -1, -1, -1))
            assertEquals(-1, MiniMediaChunkReader.readInt(negative, socket, { 45_000 }, { true }))
        } finally { socket.close() }
    }

}
