package fr.veriteinterdite.mel

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class WakePhraseProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("mel_wake_phrase_profile", Context.MODE_PRIVATE)

    fun load(): JSONObject {
        val raw = prefs.getString(KEY_PROFILE, null)
        if (raw.isNullOrBlank()) {
            return JSONObject()
                .put("version", 1)
                .put("enrolled", false)
                .put("phrase", "ok mel")
                .put("sample_count", 0)
        }
        return runCatching { JSONObject(raw) }.getOrElse {
            JSONObject()
                .put("version", 1)
                .put("enrolled", false)
                .put("phrase", "ok mel")
                .put("sample_count", 0)
        }
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

    fun clear() {
        prefs.edit().remove(KEY_PROFILE).apply()
    }

    companion object {
        private const val KEY_PROFILE = "profile_json"
    }
}
