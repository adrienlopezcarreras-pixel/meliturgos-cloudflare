package fr.veriteinterdite.mel

import java.nio.ByteBuffer
import java.nio.ByteOrder

object MelLinkV2Protocol {
    const val VERSION = 2
    const val MAGIC0: Int = 0x4d
    const val MAGIC1: Int = 0x32
    const val HEADER_SIZE = 13
    const val DEFAULT_MTU = 185
    // 132-byte ADPCM block + 13-byte MEL header + 3-byte ATT overhead.
    const val MIN_AUDIO_MTU = 148
    const val CREDIT_WINDOW = 6

    const val HELLO = 0x01
    const val SESSION = 0x02
    const val CLOCK = 0x03
    const val REQUEST_BEGIN = 0x10
    const val REQUEST_DATA = 0x11
    const val REQUEST_END = 0x12
    const val MEDIA_CONFIG_REQUEST = 0x13
    const val MEDIA_CONFIG = 0x14
    const val RESPONSE_BEGIN = 0x20
    const val RESPONSE_DATA = 0x21
    const val RESPONSE_END = 0x22
    const val AUDIO_BEGIN = 0x30
    const val AUDIO_DATA = 0x31
    const val AUDIO_END = 0x32
    const val CREDIT = 0x40
    const val ACK = 0x41
    const val ERROR = 0x7e
    const val PING = 0x7f
    const val PONG = 0x80

    data class Frame(
        val type: Int,
        val flags: Int,
        val streamId: Int,
        val seq: Int,
        val payload: ByteArray
    )

    fun encode(type: Int, flags: Int, streamId: Int, seq: Int, payload: ByteArray = byteArrayOf()): ByteArray {
        require(payload.size <= 0xffff) { "payload too large" }
        val out = ByteBuffer.allocate(HEADER_SIZE + payload.size).order(ByteOrder.LITTLE_ENDIAN)
        out.put(MAGIC0.toByte())
        out.put(MAGIC1.toByte())
        out.put(VERSION.toByte())
        out.put(type.toByte())
        out.put(flags.toByte())
        out.putShort(streamId.toShort())
        out.putShort(seq.toShort())
        out.putShort(payload.size.toShort())
        out.putShort(crc16(payload).toShort())
        out.put(payload)
        return out.array()
    }

    fun decode(raw: ByteArray): Frame {
        require(raw.size >= HEADER_SIZE) { "short frame" }
        val input = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
        require((input.get().toInt() and 0xff) == MAGIC0 && (input.get().toInt() and 0xff) == MAGIC1) { "bad magic" }
        require((input.get().toInt() and 0xff) == VERSION) { "bad protocol" }
        val type = input.get().toInt() and 0xff
        val flags = input.get().toInt() and 0xff
        val streamId = input.short.toInt() and 0xffff
        val seq = input.short.toInt() and 0xffff
        val length = input.short.toInt() and 0xffff
        val expectedCrc = input.short.toInt() and 0xffff
        require(raw.size == HEADER_SIZE + length) { "length mismatch" }
        val payload = ByteArray(length)
        input.get(payload)
        require(crc16(payload) == expectedCrc) { "crc mismatch" }
        return Frame(type, flags, streamId, seq, payload)
    }

    fun crc16(data: ByteArray): Int {
        var crc = 0xffff
        for (b in data) {
            crc = crc xor (b.toInt() and 0xff)
            repeat(8) {
                crc = if ((crc and 1) != 0) (crc ushr 1) xor 0xA001 else crc ushr 1
            }
        }
        return crc and 0xffff
    }
}
