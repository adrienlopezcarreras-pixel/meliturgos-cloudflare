package fr.veriteinterdite.mel

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

object MelBargeInDetector {
    private const val SAMPLE_RATE = 16_000
    private const val FRAME_SAMPLES = 320 // 20 ms
    private const val SETTLE_FRAMES = 35 // ~700 ms for AEC + speaker leakage baseline
    private const val REQUIRED_VOICED_FRAMES = 7 // ~140 ms sustained user speech

    fun start(
        shouldContinue: () -> Boolean,
        onSpeech: () -> Unit
    ): Thread = thread(name = "mel-barge-in", isDaemon = true) {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) return@thread

        val recorder = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                max(minBuffer * 2, FRAME_SAMPLES * 8)
            )
        }.getOrNull() ?: return@thread
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            return@thread
        }

        val aec = if (AcousticEchoCanceler.isAvailable()) {
            runCatching { AcousticEchoCanceler.create(recorder.audioSessionId) }.getOrNull()?.also { it.enabled = true }
        } else null
        val ns = if (NoiseSuppressor.isAvailable()) {
            runCatching { NoiseSuppressor.create(recorder.audioSessionId) }.getOrNull()?.also { it.enabled = true }
        } else null

        val frame = ShortArray(FRAME_SAMPLES)
        var baseline = 220.0
        var voicedFrames = 0
        var frames = 0
        try {
            recorder.startRecording()
            while (shouldContinue() && !Thread.currentThread().isInterrupted) {
                val read = recorder.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                if (read <= 0) continue
                val level = rms(frame, read)
                frames++

                // Calibrate on MEL's own loudspeaker leakage. Do not accept barge-in yet.
                if (frames <= SETTLE_FRAMES) {
                    baseline = if (frames == 1) level else baseline * .88 + level * .12
                    continue
                }

                // Slow adaptation follows changes in MEL volume but won't absorb a human interruption quickly.
                val trigger = max(800.0, baseline * 2.10)
                if (level >= trigger) {
                    voicedFrames++
                    if (voicedFrames >= REQUIRED_VOICED_FRAMES) {
                        onSpeech()
                        break
                    }
                } else {
                    voicedFrames = 0
                    baseline = baseline * .975 + level * .025
                }
            }
        } catch (_: Throwable) {
            // Barge-in is best-effort; never break normal playback if the microphone path is unavailable.
        } finally {
            runCatching { recorder.stop() }
            runCatching { aec?.release() }
            runCatching { ns?.release() }
            recorder.release()
        }
    }

    private fun rms(samples: ShortArray, count: Int): Double {
        var energy = 0.0
        for (i in 0 until count) {
            val v = samples[i].toDouble()
            energy += v * v
        }
        return sqrt(energy / count.coerceAtLeast(1))
    }
}
