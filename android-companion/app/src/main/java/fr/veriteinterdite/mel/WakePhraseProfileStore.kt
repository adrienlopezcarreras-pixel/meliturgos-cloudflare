package fr.veriteinterdite.mel

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class WakePhraseProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("mel_wake_phrase_profile", Context.MODE_PRIVATE)

    fun load(): JSONObject {
        val raw = prefs.getString(KEY_PROFILE, null)
        if (raw.isNullOrBlank()) return emptyProfile()
        return runCatching { JSONObject(raw) }.getOrElse { emptyProfile() }
    }

    fun sampleCount(): Int = loadSamples().size

    fun isEnrolled(): Boolean = load().optBoolean("enrolled", false)

    fun addSample(vector: FloatArray): EnrollmentState {
        require(vector.isNotEmpty()) { "WAKE_TEMPLATE_EMPTY" }
        val samples = loadSamples().toMutableList()
        samples += vector
        if (samples.size >= WakePhraseTrainer.REQUIRED_SAMPLES) {
            val (template, threshold) = WakePhraseTrainer.template(samples.take(WakePhraseTrainer.REQUIRED_SAMPLES))
            saveTemplate(template, WakePhraseTrainer.REQUIRED_SAMPLES, threshold)
            prefs.edit().remove(KEY_SAMPLES).apply()
            return EnrollmentState(WakePhraseTrainer.REQUIRED_SAMPLES, true, threshold)
        }
        saveSamples(samples)
        val profile = emptyProfile().put("sample_count", samples.size)
        prefs.edit().putString(KEY_PROFILE, profile.toString()).apply()
        return EnrollmentState(samples.size, false, null)
    }

    fun resetEnrollment() {
        prefs.edit().remove(KEY_PROFILE).remove(KEY_SAMPLES).apply()
    }

    fun saveTemplate(vector: FloatArray, sampleCount: Int, threshold: Float) {
        require(vector.isNotEmpty()) { "WAKE_TEMPLATE_EMPTY" }
        val values = JSONArray()
        vector.forEach { values.put(it.toDouble()) }
        val json = JSONObject()
            .put("version", 1)
            .put("enrolled", true)
            .put("phrase", "ok mel")
            .put("sample_count", sampleCount)
            .put("threshold", threshold.toDouble())
            .put("features", values)
        prefs.edit().putString(KEY_PROFILE, json.toString()).apply()
    }

    private fun loadSamples(): List<FloatArray> {
        val raw = prefs.getString(KEY_SAMPLES, null) ?: return emptyList()
        val root = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (i in 0 until root.length()) {
                val row = root.optJSONArray(i) ?: continue
                val vector = FloatArray(row.length()) { j -> row.optDouble(j, 0.0).toFloat() }
                if (vector.isNotEmpty()) add(vector)
            }
        }
    }

    private fun saveSamples(samples: List<FloatArray>) {
        val root = JSONArray()
        samples.forEach { sample ->
            val row = JSONArray()
            sample.forEach { row.put(it.toDouble()) }
            root.put(row)
        }
        prefs.edit().putString(KEY_SAMPLES, root.toString()).apply()
    }

    private fun emptyProfile(): JSONObject = JSONObject()
        .put("version", 1)
        .put("enrolled", false)
        .put("phrase", "ok mel")
        .put("sample_count", sampleCountFromSamples())

    private fun sampleCountFromSamples(): Int {
        val raw = prefs.getString(KEY_SAMPLES, null) ?: return 0
        return runCatching { JSONArray(raw).length() }.getOrDefault(0)
    }

    data class EnrollmentState(val sampleCount: Int, val enrolled: Boolean, val threshold: Float?)

    companion object {
        private const val KEY_PROFILE = "profile_json"
        private const val KEY_SAMPLES = "sample_vectors_json"
    }
}
