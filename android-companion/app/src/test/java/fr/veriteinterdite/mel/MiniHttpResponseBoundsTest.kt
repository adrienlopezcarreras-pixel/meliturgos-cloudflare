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
}
