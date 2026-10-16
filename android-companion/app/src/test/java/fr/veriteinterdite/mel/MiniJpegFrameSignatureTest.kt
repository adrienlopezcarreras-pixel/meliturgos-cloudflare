package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MiniJpegFrameSignatureTest {
    @Test fun rejectsEmptyTruncatedAndNonJpegBytes() {
        assertFalse(MiniJpegFrameSignature.hasMarkers(byteArrayOf()))
        assertFalse(MiniJpegFrameSignature.hasMarkers(byteArrayOf(0xff.toByte(), 0xd8.toByte())))
        assertFalse(MiniJpegFrameSignature.hasMarkers("not a jpeg".toByteArray()))
        assertFalse(MiniJpegFrameSignature.hasMarkers(byteArrayOf(0xff.toByte(), 0xd8.toByte(), 1, 2)))
        assertFalse(MiniJpegFrameSignature.hasMarkers(byteArrayOf(1, 2, 0xff.toByte(), 0xd9.toByte())))
    }

    @Test fun acceptsMinimalMarkerFramedJpegBytePayload() {
        assertTrue(MiniJpegFrameSignature.hasMarkers(byteArrayOf(
            0xff.toByte(), 0xd8.toByte(), 0xff.toByte(), 0xd9.toByte()
        )))
        assertTrue(MiniJpegFrameSignature.hasMarkers(byteArrayOf(
            0xff.toByte(), 0xd8.toByte(), 0, 1, 2, 3, 0xff.toByte(), 0xd9.toByte()
        )))
    }
}
