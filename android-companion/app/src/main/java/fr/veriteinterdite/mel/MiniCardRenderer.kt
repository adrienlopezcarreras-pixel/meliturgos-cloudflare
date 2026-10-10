package fr.veriteinterdite.mel

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Retains bounded, HTTPS-only legacy MINI result-card rendering over V2.
 * No Bluetooth transport is created here.
 */
object MiniCardRenderer {
    fun renderMiniCardMimg(title: String, snippet: String, url: String, imageUrl: String): ByteArray {
        val width = 240
        val height = 240
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(7, 17, 31))

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(248, 250, 252)
            textSize = 22f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(203, 213, 225)
            textSize = 16f
        }
        val urlPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(103, 232, 249)
            textSize = 12f
        }
        val rulePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(34, 211, 238)
            strokeWidth = 2f
        }

        val remote = fetchMiniCardImage(imageUrl)
        if (remote != null) {
            drawCenterCrop(canvas, remote, RectF(0f, 0f, width.toFloat(), 108f))
            remote.recycle()
            canvas.drawRect(0f, 100f, width.toFloat(), 116f, Paint().apply { color = Color.argb(150, 7, 17, 31) })
            var y = drawMiniWrappedText(canvas, title.ifBlank { "Résultat MEL" }, titlePaint, 14f, 136f, 212f, 2)
            y += 5f
            y = drawMiniWrappedText(canvas, snippet, bodyPaint, 14f, y, 212f, 3)
            drawMiniWrappedText(canvas, url, urlPaint, 14f, maxOf(y + 4f, 224f).coerceAtMost(232f), 212f, 1)
        } else {
            canvas.drawLine(14f, 14f, 226f, 14f, rulePaint)
            var y = drawMiniWrappedText(canvas, title.ifBlank { "Résultat MEL" }, titlePaint, 14f, 38f, 212f, 2)
            y += 8f
            y = drawMiniWrappedText(canvas, snippet, bodyPaint, 14f, y, 212f, 6)
            val urlY = maxOf(y + 10f, 205f)
            drawMiniWrappedText(canvas, url, urlPaint, 14f, urlY.coerceAtMost(222f), 212f, 2)
        }

        val pixelBytes = width * height * 2
        val out = ByteBuffer.allocate(12 + pixelBytes).order(ByteOrder.LITTLE_ENDIAN)
        out.put(byteArrayOf('M'.code.toByte(), 'I'.code.toByte(), 'M'.code.toByte(), 'G'.code.toByte()))
        out.putShort(width.toShort())
        out.putShort(height.toShort())
        out.putInt(pixelBytes)
        val row = IntArray(width)
        for (yy in 0 until height) {
            bitmap.getPixels(row, 0, width, 0, yy, width, 1)
            for (argb in row) {
                val r = (argb shr 16) and 0xff
                val g = (argb shr 8) and 0xff
                val b = argb and 0xff
                val rgb565 = ((r shr 3) shl 11) or ((g shr 2) shl 5) or (b shr 3)
                out.putShort(rgb565.toShort())
            }
        }
        bitmap.recycle()
        return out.array()
    }

    private fun fetchMiniCardImage(rawUrl: String): Bitmap? {
        val start = safeMiniImageUrl(rawUrl) ?: return null
        var current = start
        repeat(3) {
            val connection = (current.openConnection() as? HttpURLConnection) ?: return null
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                connection.setRequestProperty("Accept", "image/*")
                connection.setRequestProperty("User-Agent", "MEL-Android/${BuildConfig.VERSION_NAME}")
                val status = connection.responseCode
                if (status in 300..399) {
                    val next = connection.getHeaderField("Location") ?: return null
                    current = safeMiniImageUrl(URL(current, next).toString()) ?: return null
                    return@repeat
                }
                if (status !in 200..299) return null
                val contentType = connection.contentType.orEmpty().lowercase()
                if (!contentType.startsWith("image/")) return null
                val declared = connection.contentLengthLong
                if (declared > 3_000_000L) return null
                val bytes = ByteArrayOutputStream()
                connection.inputStream.use { input ->
                    val buffer = ByteArray(16 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        if (read == 0) continue
                        if (bytes.size() + read > 3_000_000) return null
                        bytes.write(buffer, 0, read)
                    }
                }
                val data = bytes.toByteArray()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
                var sample = 1
                while (bounds.outWidth / sample > 720 || bounds.outHeight / sample > 720) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                return BitmapFactory.decodeByteArray(data, 0, data.size, options)
            } finally {
                connection.disconnect()
            }
        }
        return null
    }

    private fun safeMiniImageUrl(rawUrl: String): URL? {
        if (rawUrl.isBlank()) return null
        val url = runCatching { URL(rawUrl.trim()) }.getOrNull() ?: return null
        if (!url.protocol.equals("https", ignoreCase = true) || url.userInfo != null) return null
        val host = url.host.trim().lowercase()
        if (host.isBlank() || host == "localhost" || host.endsWith(".local")) return null
        val addresses = runCatching { InetAddress.getAllByName(host).toList() }.getOrNull() ?: return null
        if (addresses.isEmpty() || addresses.any { address ->
                address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress ||
                    address.hostAddress?.startsWith("100.64.") == true || address.hostAddress?.startsWith("169.254.") == true
            }) return null
        return url
    }

    private fun drawCenterCrop(canvas: Canvas, bitmap: Bitmap, dest: RectF) {
        val targetRatio = dest.width() / dest.height()
        val sourceRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
        val src = if (sourceRatio > targetRatio) {
            val wanted = (bitmap.height * targetRatio).toInt().coerceAtLeast(1)
            val left = ((bitmap.width - wanted) / 2).coerceAtLeast(0)
            Rect(left, 0, (left + wanted).coerceAtMost(bitmap.width), bitmap.height)
        } else {
            val wanted = (bitmap.width / targetRatio).toInt().coerceAtLeast(1)
            val top = ((bitmap.height - wanted) / 2).coerceAtLeast(0)
            Rect(0, top, bitmap.width, (top + wanted).coerceAtMost(bitmap.height))
        }
        canvas.drawBitmap(bitmap, src, dest, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    }

    private fun drawMiniWrappedText(
        canvas: Canvas,
        raw: String,
        paint: Paint,
        x: Float,
        startY: Float,
        maxWidth: Float,
        maxLines: Int
    ): Float {
        val text = raw.replace(Regex("\\s+"), " ").trim()
        if (text.isEmpty()) return startY
        val lineHeight = paint.fontSpacing.coerceAtLeast(paint.textSize + 3f)
        var remaining = text
        var y = startY
        var line = 0
        while (remaining.isNotEmpty() && line < maxLines) {
            var count = paint.breakText(remaining, true, maxWidth, null).coerceAtLeast(1)
            if (count < remaining.length) {
                val space = remaining.lastIndexOf(' ', count - 1)
                if (space > 0) count = space
            }
            var part = remaining.substring(0, count).trim()
            remaining = remaining.substring(count).trimStart()
            if (line == maxLines - 1 && remaining.isNotEmpty()) {
                while (part.length > 1 && paint.measureText(part + "…") > maxWidth) part = part.dropLast(1)
                part += "…"
                remaining = ""
            }
            canvas.drawText(part, x, y, paint)
            y += lineHeight
            line++
        }
        return y
    }

}
