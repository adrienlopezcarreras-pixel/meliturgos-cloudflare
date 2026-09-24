package fr.veriteinterdite.mel

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Plays MEL's canonical MINI-compatible TTS stream:
 * PCM signed 16-bit little-endian, 48 kHz, mono.
 */
object MelVoicePlayer {
    private const val SAMPLE_RATE = 48_000
    private val lock = Any()
    private var activeTrack: AudioTrack? = null

    fun playPcm48kMono(bytes: ByteArray): Long {
        require(bytes.isNotEmpty()) { "TTS_AUDIO_EMPTY" }

        val minBuffer = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        require(minBuffer > 0) { "AUDIO_OUTPUT_UNAVAILABLE" }

        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(bytes.size, minBuffer))
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()

        require(track.state == AudioTrack.STATE_INITIALIZED) {
            track.release()
            "AUDIO_TRACK_INIT_FAILED"
        }

        val written = track.write(bytes, 0, bytes.size)
        if (written != bytes.size) {
            track.release()
            throw IllegalStateException("AUDIO_WRITE_FAILED")
        }

        synchronized(lock) {
            stopLocked()
            activeTrack = track
            track.setVolume(1f)
            track.play()
        }

        val durationMs = ((bytes.size / 2L) * 1000L / SAMPLE_RATE).coerceAtLeast(180L)
        try {
            Thread.sleep(durationMs + 180L)
        } finally {
            synchronized(lock) {
                if (activeTrack === track) {
                    stopLocked()
                } else {
                    runCatching { track.stop() }
                    track.release()
                }
            }
        }
        return durationMs
    }

    fun stop() {
        synchronized(lock) {
            stopLocked()
        }
    }

    private fun stopLocked() {
        val track = activeTrack ?: return
        activeTrack = null
        runCatching { track.stop() }
        track.release()
    }
}
