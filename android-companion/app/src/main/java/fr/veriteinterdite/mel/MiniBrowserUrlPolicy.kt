package fr.veriteinterdite.mel

import java.net.URI
import java.util.Locale

/**
 * Reject obvious private or malformed destinations before a MINI web preview.
 * Domain DNS rebinding requires network-level controls; this is a URL guard.
 */
internal object MiniBrowserUrlPolicy {
    private val numericHost = Regex("(?i)(?:0x[0-9a-f]+|[0-9]+)(?:\\.(?:0x[0-9a-f]+|[0-9]+))*")
    private val privateSuffixes = listOf(".localhost", ".local", ".localdomain", ".internal", ".lan", ".home.arpa")

    fun allows(url: String): Boolean {
        if (url.length !in 8..2048) return false
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        if (uri.scheme?.lowercase(Locale.ROOT) !in listOf("http", "https")) return false
        if (uri.rawUserInfo != null) return false
        val host = uri.host?.trimEnd('.')?.lowercase(Locale.ROOT) ?: return false
        if (host.isBlank() || !host.contains('.') || host.contains(':')) return false
        if (host == "localhost" || privateSuffixes.any { host.endsWith(it) }) return false
        if (host.split('.').any { it.isBlank() }) return false
        // IPv4, shortened numeric forms and hexadecimal IP aliases are not public DNS hosts.
        if (numericHost.matches(host)) return false
        if (!host.all { it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '.' }) return false
        if (uri.port == 0 || uri.port > 65535) return false
        return true
    }
}
