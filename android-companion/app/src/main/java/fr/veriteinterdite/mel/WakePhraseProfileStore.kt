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

    fun sampleCount(): Int {
        val profile = load()
        val savedCount = profile.optInt("sample_count", 0)
        if (profile.optBoolean("enrolled", false)) return savedCount.coerceAtLeast(WakePhraseTrainer.REQUIRED_SAMPLES)
        return maxOf(savedCount, sampleCountFromSamples())
    }

    fun isEnrolled(): Boolean = load().optBoolean("enrolled", false)

    fun templateFeatures(): FloatArray? {
        val profile = load()
        if (!profile.optBoolean("enrolled", false)) return null
        val array = profile.optJSONArray("features") ?: return null
        if (array.length() <= 0) return null
        return FloatArray(array.length()) { i -> array.optDouble(i, 0.0).toFloat() }
    }

    fun threshold(): Float = load().optDouble("threshold", 0.78).toFloat().coerceIn(0.68f, 0.94f)

    @Synchronized
    fun addSample(vector: FloatArray): EnrollmentState {
        require(vector.isNotEmpty()) { "WAKE_TEMPLATE_EMPTY" }
        if (isEnrolled()) {
            return EnrollmentState(sampleCount(), true, load().optDouble("threshold", 0.84).toFloat())
        }

        val samples = loadSamples().toMutableList()
        samples += vector
        if (samples.size >= WakePhraseTrainer.REQUIRED_SAMPLES) {
            val (template, threshold) = WakePhraseTrainer.template(samples.take(WakePhraseTrainer.REQUIRED_SAMPLES))
            saveTemplate(template, WakePhraseTrainer.REQUIRED_SAMPLES, threshold)
            return EnrollmentState(WakePhraseTrainer.REQUIRED_SAMPLES, true, threshold)
        }

        val profile = JSONObject()
            .put("version", 1)
            .put("enrolled", false)
            .put("phrase", "ok mel")
            .put("sample_count", samples.size)

        val committed = prefs.edit()
            .putString(KEY_SAMPLES, encodeSamples(samples).toString())
            .putString(KEY_PROFILE, profile.toString())
            .commit()
        check(committed) { "WAKE_STORAGE_FAILED" }
        return EnrollmentState(samples.size, false, null)
    }

    @Synchronized
    fun resetEnrollment() {
        check(prefs.edit().remove(KEY_PROFILE).remove(KEY_SAMPLES).commit()) { "WAKE_STORAGE_FAILED" }
    }

    @Synchronized
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
        val committed = prefs.edit()
            .putString(KEY_PROFILE, json.toString())
            .remove(KEY_SAMPLES)
            .commit()
        check(committed) { "WAKE_STORAGE_FAILED" }
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

    private fun encodeSamples(samples: List<FloatArray>): JSONArray {
        val root = JSONArray()
        samples.forEach { sample ->
            val row = JSONArray()
            sample.forEach { row.put(it.toDouble()) }
            root.put(row)
        }
        return root
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
