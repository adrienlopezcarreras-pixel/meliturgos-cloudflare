package fr.veriteinterdite.mel

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.round

sealed class MelCompanionCommand {
    data class Reply(val text: String) : MelCompanionCommand()
    data class SetTimer(val seconds: Int, val label: String) : MelCompanionCommand()
    data class SetAlarm(val hour: Int, val minute: Int, val label: String) : MelCompanionCommand()
    data object ShowAlarms : MelCompanionCommand()
    data class Dial(val number: String) : MelCompanionCommand()
    data class Sms(val number: String, val body: String) : MelCompanionCommand()
    data class Navigate(val query: String) : MelCompanionCommand()
    data object WifiSettings : MelCompanionCommand()
    data object BluetoothSettings : MelCompanionCommand()
    data object LocationSettings : MelCompanionCommand()
    data object Camera : MelCompanionCommand()
    data object FilePicker : MelCompanionCommand()
    data object EnableNotifications : MelCompanionCommand()
}

object MelCompanionCommands {
    private val duration = Regex("""(\d{1,4})\s*(secondes?|minutes?|heures?)""", RegexOption.IGNORE_CASE)
    private val alarmTime = Regex("""\b([01]?\d|2[0-3])\s*(?:h|:|heures?)\s*([0-5]?\d)?\b""", RegexOption.IGNORE_CASE)
    private val phone = Regex("""\+?[0-9][0-9 .-]{5,}[0-9]""")
    private val arithmetic = Regex(
        """(-?\d+(?:[.,]\d+)?)\s*(\+|-|\*|x|×|/|plus|moins|fois|multipli(?:é|e)\s+par|divis(?:é|e)\s+par)\s*(-?\d+(?:[.,]\d+)?)""",
        RegexOption.IGNORE_CASE
    )
    private val conversion = Regex(
        """(-?\d+(?:[.,]\d+)?)\s*(km|kilom[eè]tres?|m[eè]tres?|m|cm|centim[eè]tres?|kg|kilogrammes?|g|grammes?|l|litres?|ml|millilitres?|°?c|celsius|°?f|fahrenheit)\s+(?:en|vers)\s*(km|kilom[eè]tres?|m[eè]tres?|m|cm|centim[eè]tres?|kg|kilogrammes?|g|grammes?|l|litres?|ml|millilitres?|°?c|celsius|°?f|fahrenheit)""",
        RegexOption.IGNORE_CASE
    )

    fun parse(raw: String, now: Date = Date()): MelCompanionCommand? {
        val text = raw.trim()
        if (text.isBlank()) return null
        val lower = text.lowercase(Locale.FRENCH)

        if (Regex("""\b(?:quelle?\s+heure|il\s+est\s+quelle?\s+heure|donne[- ]moi\s+l['’]heure|heure\s+actuelle)\b""").containsMatchIn(lower)) {
            val value = SimpleDateFormat("HH:mm", Locale.FRENCH).format(now)
            return MelCompanionCommand.Reply("Il est $value.")
        }

        if (Regex("""\b(?:quel\s+jour|quelle\s+date|date\s+d['’]aujourd['’]hui|on\s+est\s+quel\s+jour)\b""").containsMatchIn(lower)) {
            val value = SimpleDateFormat("EEEE d MMMM yyyy", Locale.FRENCH).format(now)
            return MelCompanionCommand.Reply("Nous sommes $value.")
        }

        conversion.find(lower)?.let { match ->
            convert(match)?.let { return MelCompanionCommand.Reply(it) }
        }

        arithmetic.find(lower)?.let { match ->
            calculate(match)?.let { return MelCompanionCommand.Reply(it) }
        }

        if (Regex("""\b(?:montre|affiche|ouvre)\b.*\b(?:alarmes?|r[eé]veils?)\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.ShowAlarms
        }

        if (Regex("""\b(?:minuteur|timer|compte\s*[àa]\s*rebours|rappelle[- ]moi\s+dans)\b""").containsMatchIn(lower)) {
            duration.find(lower)?.let { match ->
                val amount = match.groupValues[1].toIntOrNull() ?: return@let
                val unit = match.groupValues[2].lowercase(Locale.FRENCH)
                val seconds = when {
                    unit.startsWith("seconde") -> amount
                    unit.startsWith("minute") -> amount * 60
                    else -> amount * 3600
                }.coerceIn(1, 86_400)
                val label = reminderLabel(text, match.range.last + 1).ifBlank { "MEL" }
                return MelCompanionCommand.SetTimer(seconds, label)
            }
        }

        if (Regex("""\b(?:alarme|r[eé]veil|r[eé]veille[- ]moi|rappelle[- ]moi\s+[àa])\b""").containsMatchIn(lower)) {
            alarmTime.find(lower)?.let { match ->
                val hour = match.groupValues[1].toInt()
                val minute = match.groupValues.getOrNull(2)?.takeIf { it.isNotBlank() }?.toInt() ?: 0
                val label = reminderLabel(text, match.range.last + 1).ifBlank { "MEL" }
                return MelCompanionCommand.SetAlarm(hour, minute, label)
            }
        }

        if (Regex("""\b(?:wifi|wi-fi)\b""").containsMatchIn(lower) &&
            Regex("""\b(?:ouvre|r[eé]glages?|param[eè]tres?|active|connexion)\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.WifiSettings
        }

        if (lower.contains("bluetooth") &&
            Regex("""\b(?:ouvre|r[eé]glages?|param[eè]tres?|active|connexion)\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.BluetoothSettings
        }

        if (Regex("""\b(?:gps|localisation|position)\b""").containsMatchIn(lower) &&
            Regex("""\b(?:ouvre|r[eé]glages?|param[eè]tres?|active)\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.LocationSettings
        }

        if (Regex("""\b(?:prends?|prendre|ouvre)\b.*\b(?:photo|cam[eé]ra)\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.Camera
        }

        if (Regex("""\b(?:choisis|ouvre|s[eé]lectionne)\b.*\b(?:fichier|document)\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.FilePicker
        }

        if (Regex("""\b(?:active|autorise)\b.*\bnotifications?\b""").containsMatchIn(lower)) {
            return MelCompanionCommand.EnableNotifications
        }

        if (Regex("""\b(?:appelle|compose)\b""").containsMatchIn(lower)) {
            phone.find(text)?.value?.let { number ->
                return MelCompanionCommand.Dial(cleanPhone(number))
            }
        }

        if (Regex("""\b(?:sms|message)\b""").containsMatchIn(lower) &&
            Regex("""\b(?:envoie|pr[eé]pare|[ée]cris)\b""").containsMatchIn(lower)) {
            phone.find(text)?.let { match ->
                val body = text.substring(match.range.last + 1)
                    .replace(Regex("""^\s*(?:disant|avec|message|:|-)?\s*""", RegexOption.IGNORE_CASE), "")
                    .trim()
                return MelCompanionCommand.Sms(cleanPhone(match.value), body)
            }
        }

        val navigation = listOf(
            Regex("""(?:itin[eé]raire|navigation)\s+(?:vers|pour)\s+(.+)""", RegexOption.IGNORE_CASE),
            Regex("""emm[eè]ne[- ]moi\s+(?:[àa]|au|aux|vers)\s+(.+)""", RegexOption.IGNORE_CASE),
            Regex("""conduis[- ]moi\s+(?:[àa]|au|aux|vers)\s+(.+)""", RegexOption.IGNORE_CASE)
        )
        navigation.forEach { regex ->
            regex.find(text)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }?.let {
                return MelCompanionCommand.Navigate(it)
            }
        }

        return null
    }

    private fun reminderLabel(text: String, start: Int): String {
        if (start >= text.length) return ""
        return text.substring(start)
            .replace(Regex("""^\s*(?:pour|de|afin\s+de|:|-)?\s*""", RegexOption.IGNORE_CASE), "")
            .trim()
            .take(80)
    }

    private fun cleanPhone(value: String): String =
        value.replace(Regex("""[^+0-9]"""), "")

    private fun number(value: String): Double? =
        value.replace(',', '.').toDoubleOrNull()

    private fun calculate(match: MatchResult): String? {
        val left = number(match.groupValues[1]) ?: return null
        val right = number(match.groupValues[3]) ?: return null
        val op = match.groupValues[2].lowercase(Locale.FRENCH)
        val result = when {
            op == "+" || op == "plus" -> left + right
            op == "-" || op == "moins" -> left - right
            op == "*" || op == "x" || op == "×" || op == "fois" || op.startsWith("multipli") -> left * right
            op == "/" || op.startsWith("divis") -> if (right == 0.0) return "Je ne peux pas diviser par zéro." else left / right
            else -> return null
        }
        return "Le résultat est ${format(result)}."
    }

    private fun convert(match: MatchResult): String? {
        val value = number(match.groupValues[1]) ?: return null
        val from = canonicalUnit(match.groupValues[2])
        val target = canonicalUnit(match.groupValues[3])
        val result = when (from to target) {
            "km" to "m" -> value * 1000
            "m" to "km" -> value / 1000
            "m" to "cm" -> value * 100
            "cm" to "m" -> value / 100
            "kg" to "g" -> value * 1000
            "g" to "kg" -> value / 1000
            "l" to "ml" -> value * 1000
            "ml" to "l" -> value / 1000
            "c" to "f" -> value * 9 / 5 + 32
            "f" to "c" -> (value - 32) * 5 / 9
            else -> return null
        }
        return "${format(value)} ${spokenUnit(from)} font ${format(result)} ${spokenUnit(target)}."
    }

    private fun canonicalUnit(raw: String): String {
        val value = raw.lowercase(Locale.FRENCH)
        return when {
            value == "km" || value.startsWith("kilom") -> "km"
            value == "cm" || value.startsWith("centim") -> "cm"
            value == "m" || value.startsWith("mè") || value.startsWith("me") -> "m"
            value == "kg" || value.startsWith("kilogram") -> "kg"
            value == "g" || value.startsWith("gram") -> "g"
            value == "ml" || value.startsWith("millil") -> "ml"
            value == "l" || value.startsWith("litr") -> "l"
            value.contains("fahren") || value.contains("°f") || value == "f" -> "f"
            else -> "c"
        }
    }

    private fun spokenUnit(unit: String): String = when (unit) {
        "km" -> "kilomètres"
        "m" -> "mètres"
        "cm" -> "centimètres"
        "kg" -> "kilogrammes"
        "g" -> "grammes"
        "l" -> "litres"
        "ml" -> "millilitres"
        "c" -> "degrés Celsius"
        "f" -> "degrés Fahrenheit"
        else -> unit
    }

    private fun format(value: Double): String {
        val rounded = round(value * 100.0) / 100.0
        return if (rounded % 1.0 == 0.0) rounded.toLong().toString()
        else String.format(Locale.FRENCH, "%.2f", rounded).trimEnd('0').trimEnd(',')
    }
}
