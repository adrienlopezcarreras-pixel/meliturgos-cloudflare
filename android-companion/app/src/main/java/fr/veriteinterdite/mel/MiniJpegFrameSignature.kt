package fr.veriteinterdite.mel

/**
 * Cheap JPEG framing gate for MINI camera payloads.
 * This is NOT a full JPEG decoder or content authentication check.
 */
internal object MiniJpegFrameSignature {
    fun hasMarkers(bytes: ByteArray): Boolean {
        if (bytes.size < 4) return false
        return (bytes[0].toInt() and 0xff) == 0xff &&
            (bytes[1].toInt() and 0xff) == 0xd8 &&
            (bytes[bytes.lastIndex - 1].toInt() and 0xff) == 0xff &&
            (bytes[bytes.lastIndex].toInt() and 0xff) == 0xd9
    }
}
