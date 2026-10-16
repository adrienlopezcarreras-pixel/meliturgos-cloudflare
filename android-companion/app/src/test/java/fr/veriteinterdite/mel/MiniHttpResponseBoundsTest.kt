package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.util.Random

class MiniHttpResponseBoundsTest {
    @Test fun nullAndEmptyStreamsAreSafe() {
        assertArrayEquals(byteArrayOf(), MiniHttpResponseBounds.read(null, 1))
        assertArrayEquals(byteArrayOf(), MiniHttpResponseBounds.read(ByteArrayInputStream(byteArrayOf()), 1))
    }

    @Test fun exactLimitSucceedsAndOverLimitFails() {
        val source = ByteArray(32768) { (it % 251).toByte() }
        assertArrayEquals(source, MiniHttpResponseBounds.read(ByteArrayInputStream(source), source.size))
        assertThrows(IOException::class.java) {
            MiniHttpResponseBounds.read(ByteArrayInputStream(source), source.size - 1)
        }
    }

    @Test fun randomizedLengthsAndUnknownLengthRejectOversizeResponses() {
        val random = Random(20261010L)
        repeat(1000) {
            val size = random.nextInt(20_000)
            val limit = random.nextInt(20_000) + 1
            val source = ByteArray(size)
            random.nextBytes(source)
            if (size > limit) {
                assertThrows(IOException::class.java) {
                    MiniHttpResponseBounds.read(ByteArrayInputStream(source), limit)
                }
            } else {
                assertArrayEquals(source, MiniHttpResponseBounds.read(ByteArrayInputStream(source), limit))
            }
        }
    }

    @Test fun infiniteLikeNetworkStreamIsStoppedAtLimit() {
        var emitted = 0
        val stream = object : InputStream() {
            override fun read(): Int { emitted++; return 0x55 }
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                val count = minOf(8192, length)
                buffer.fill(0x55.toByte(), offset, offset + count)
                emitted += count
                return count
            }
        }
        assertThrows(IOException::class.java) {
            MiniHttpResponseBounds.read(stream, 128 * 1024)
        }
        assertEquals(true, emitted <= 128 * 1024 + 8192)
    }

    @Test fun permanentlyStalledStreamFailsClosedAndCloses() {
        var attempts = 0
        var closed = false
        val stream = object : InputStream() {
            override fun read(): Int = 0
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                attempts++
                return 0
            }
            override fun close() { closed = true }
        }
        val error = assertThrows(IOException::class.java) {
            MiniHttpResponseBounds.read(stream, 1024)
        }
        assertEquals("MEL_RESPONSE_STALLED", error.message)
        assertEquals(16, attempts)
        assertEquals(true, closed)
    }

    @Test fun shortZeroReadBurstsDoNotDiscardNetworkData() {
        val payload = "Bonjour MINI".toByteArray(Charsets.UTF_8)
        var index = 0
        var zeros = 0
        val stream = object : InputStream() {
            override fun read(): Int = if (index < payload.size) payload[index++].toInt() and 255 else -1
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                if (zeros++ % 4 < 2) return 0
                if (index >= payload.size) return -1
                val count = minOf(length, 3, payload.size - index)
                payload.copyInto(buffer, offset, index, index + count)
                index += count
                return count
            }
        }
        assertArrayEquals(payload, MiniHttpResponseBounds.read(stream, payload.size))
    }

    @Test fun slowDripExpiresBeforeReadingMoreChunksAndClosesStream() {
        var now = 0L
        var calls = 0
        var closed = false
        val stream = object : InputStream() {
            override fun read(): Int = 65
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                calls++
                buffer[offset] = 65
                now = MiniHttpResponseBounds.MAX_READ_DURATION_NANOS
                return 1
            }
            override fun close() { closed = true }
        }
        val error = assertThrows(IOException::class.java) {
            MiniHttpResponseBounds.read(stream, 1024) { now }
        }
        assertEquals("MEL_RESPONSE_TIMEOUT", error.message)
        assertEquals(1, calls)
        assertEquals(true, closed)
    }

    @Test fun deadlineIncludesTimeSpentWaitingForEof() {
        var now = 0L
        val input = object : InputStream() {
            override fun read(): Int = -1
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                now = MiniHttpResponseBounds.MAX_READ_DURATION_NANOS
                return -1
            }
        }
        val error = assertThrows(IOException::class.java) {
            MiniHttpResponseBounds.read(input, 16) { now }
        }
        assertEquals("MEL_RESPONSE_TIMEOUT", error.message)
    }

    @Test fun dripCompletedJustBeforeDeadlineIsAccepted() {
        var now = 0L
        val backing = ByteArrayInputStream(byteArrayOf(1, 2, 3))
        val input = object : InputStream() {
            override fun read(): Int = backing.read()
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                val count = backing.read(buffer, offset, minOf(1, length))
                if (count < 0) now = MiniHttpResponseBounds.MAX_READ_DURATION_NANOS - 1
                return count
            }
        }
        assertArrayEquals(byteArrayOf(1, 2, 3), MiniHttpResponseBounds.read(input, 3) { now })
    }

    @Test fun expiredBudgetDoesNotTouchInput() {
        var now = 0L
        var reads = 0
        val input = object : InputStream() {
            override fun read(): Int { reads++; return -1 }
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                reads++
                return -1
            }
        }
        val error = assertThrows(IOException::class.java) {
            MiniHttpResponseBounds.read(input, 1) {
                val current = now
                now = MiniHttpResponseBounds.MAX_READ_DURATION_NANOS
                current
            }
        }
        assertEquals("MEL_RESPONSE_TIMEOUT", error.message)
        assertEquals(0, reads)
    }
}
