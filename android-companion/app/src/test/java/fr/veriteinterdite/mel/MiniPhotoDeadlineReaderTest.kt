package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream

class MiniPhotoDeadlineReaderTest {
    @Test fun readsPhotoFullyAcrossPartialReads() {
        val photo = ByteArray(70001) { (it % 251).toByte() }
        val actual = MiniPhotoDeadlineReader.read(ByteArrayInputStream(photo), photo.size) { 0L }
        assertArrayEquals(photo, actual)
    }

    @Test fun rejectsNeverAdvancingPhotoSourceWithoutLooping() {
        var attempts = 0
        val stuck = object : InputStream() {
            override fun read(): Int = 0
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                attempts++
                return 0
            }
        }
        val error = assertThrows(IOException::class.java) {
            MiniPhotoDeadlineReader.read(stuck, 128) { 0L }
        }
        assertEquals("MINI_PHOTO_STALLED", error.message)
        assertEquals(16, attempts)
    }

    @Test fun slowlyDrippedImageExpiresBeforeCompletion() {
        var now = 0L
        val slow = object : InputStream() {
            override fun read(): Int = 1
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                now += 60_000_000_000L
                bytes[offset] = 1
                return 1
            }
        }
        val error = assertThrows(IOException::class.java) {
            MiniPhotoDeadlineReader.read(slow, 10) { now }
        }
        assertEquals("MINI_PHOTO_TIMEOUT", error.message)
    }

    @Test fun rejectsEndOfStreamAndOversizeBeforeSaving() {
        val error = assertThrows(EOFException::class.java) {
            MiniPhotoDeadlineReader.read(ByteArrayInputStream(byteArrayOf(1)), 10) { 0L }
        }
        assertEquals("MINI_PHOTO_INCOMPLETE", error.message)
        assertThrows(IllegalArgumentException::class.java) {
            MiniPhotoDeadlineReader.read(ByteArrayInputStream(byteArrayOf()), MiniPhotoDeadlineReader.MAX_PHOTO_BYTES + 1) { 0L }
        }
    }

    @Test fun acceptsShortZeroReadBurstThatRecovers() {
        val src = ByteArrayInputStream(byteArrayOf(10, 20, 30))
        var emptyReads = 0
        val input = object : InputStream() {
            override fun read(): Int = src.read()
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                return if (emptyReads++ < 3) 0 else src.read(bytes, offset, length)
            }
        }
        assertArrayEquals(byteArrayOf(10, 20, 30), MiniPhotoDeadlineReader.read(input, 3) { 0L })
    }
    @Test fun rejectsPhotoThatFinishesExactlyAtDeadline() {
        var now = 0L
        val input = object : InputStream() {
            override fun read(): Int = 7
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                bytes[offset] = 7
                now = MiniPhotoDeadlineReader.MAX_DURATION_NANOS
                return 1
            }
        }
        val error = assertThrows(IOException::class.java) {
            MiniPhotoDeadlineReader.read(input, 1) { now }
        }
        assertEquals("MINI_PHOTO_TIMEOUT", error.message)
    }

    @Test fun acceptsPhotoCompletedJustBeforeDeadline() {
        var now = 0L
        val input = object : InputStream() {
            override fun read(): Int = 7
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                bytes[offset] = 7
                now = MiniPhotoDeadlineReader.MAX_DURATION_NANOS - 1
                return 1
            }
        }
        assertArrayEquals(byteArrayOf(7), MiniPhotoDeadlineReader.read(input, 1) { now })
    }

    @Test fun rejectsEmptyDeclaredPhotoBeforeReadingStream() {
        var touched = false
        val input = object : InputStream() {
            override fun read(): Int {
                touched = true
                return -1
            }
        }
        assertThrows(IllegalArgumentException::class.java) {
            MiniPhotoDeadlineReader.read(input, 0) { 0L }
        }
        assertEquals(false, touched)
    }

}
