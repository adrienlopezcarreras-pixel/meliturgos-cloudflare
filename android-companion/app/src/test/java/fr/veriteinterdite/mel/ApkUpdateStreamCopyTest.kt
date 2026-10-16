package fr.veriteinterdite.mel

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.security.MessageDigest

class ApkUpdateStreamCopyTest {
    @Test fun permanentlyStalledContentProviderDoesNotSpinForever() {
        var calls = 0
        val input = object : InputStream() {
            override fun read(): Int = 0
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                calls++
                return 0
            }
        }
        val out = ByteArrayOutputStream()
        val error = assertThrows(IllegalStateException::class.java) {
            ApkUpdateStreamCopy.copy(input, out, MessageDigest.getInstance("SHA-256"), 1024)
        }
        assertEquals("UPDATE_SOURCE_STALLED", error.message)
        assertEquals(16, calls)
        assertEquals(0, out.size())
    }

    @Test fun briefZeroReadsRecoverAndDigestMatchesCopiedBytes() {
        val bytes = "MEL-local-update".toByteArray(Charsets.UTF_8)
        val input = object : InputStream() {
            private val delegate = ByteArrayInputStream(bytes)
            private var turns = 0
            override fun read(): Int = delegate.read()
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                turns++
                return if (turns % 3 != 0) 0 else delegate.read(b, off, len)
            }
        }
        val out = ByteArrayOutputStream()
        val digest = MessageDigest.getInstance("SHA-256")
        assertEquals(bytes.size.toLong(), ApkUpdateStreamCopy.copy(input, out, digest, bytes.size.toLong()))
        assertArrayEquals(bytes, out.toByteArray())
        assertArrayEquals(MessageDigest.getInstance("SHA-256").digest(bytes), digest.digest())
    }

    @Test fun rejectsOversizedSourceBeforeWritingExcess() {
        val bytes = ByteArray(101) { it.toByte() }
        val out = ByteArrayOutputStream()
        val error = assertThrows(IllegalStateException::class.java) {
            ApkUpdateStreamCopy.copy(ByteArrayInputStream(bytes), out, MessageDigest.getInstance("SHA-256"), 100)
        }
        assertEquals("UPDATE_APK_TOO_LARGE", error.message)
        assertEquals(0, out.size())
    }
}
