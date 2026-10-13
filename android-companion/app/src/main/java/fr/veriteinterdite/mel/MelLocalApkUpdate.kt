package fr.veriteinterdite.mel

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID

/**
 * Side-loaded MEL update without ADB/developer settings. This only launches
 * Android's installer UI after the user chooses an APK; it never installs silently.
 * Caller performs prepare() on Dispatchers.IO.
 */
internal object MelLocalApkUpdate {
    private const val MAX_APK_BYTES = 128L * 1024L * 1024L
    data class Candidate(val file: File, val versionCode: Long, val sha256: String)

    fun prepare(context: Context, source: Uri): Candidate {
        val directory = File(context.filesDir, "mel-local-apk-update")
        check(directory.isDirectory || directory.mkdirs()) { "UPDATE_STAGING_DIRECTORY_FAILED" }
        val temp = File(directory, "pending-${UUID.randomUUID()}.apk")
        try {
            val input = context.contentResolver.openInputStream(source)
                ?: error("UPDATE_SOURCE_NOT_READABLE")
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            input.use { stream ->
                FileOutputStream(temp).use { output ->
                    val bytes = ByteArray(32768)
                    while (true) {
                        val read = stream.read(bytes)
                        if (read < 0) break
                        total += read
                        check(total <= MAX_APK_BYTES) { "UPDATE_APK_TOO_LARGE" }
                        digest.update(bytes, 0, read)
                        output.write(bytes, 0, read)
                    }
                    output.fd.sync()
                }
            }
            check(total >= 1_048_576) { "UPDATE_APK_TOO_SMALL" }
            val pm = context.packageManager
            @Suppress("DEPRECATION")
            val candidate = pm.getPackageArchiveInfo(temp.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
                ?: error("UPDATE_APK_INVALID")
            check(candidate.packageName == context.packageName) { "UPDATE_PACKAGE_MISMATCH" }
            @Suppress("DEPRECATION")
            val installed = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            val candidateVersion = if (Build.VERSION.SDK_INT >= 28) candidate.longVersionCode else @Suppress("DEPRECATION") candidate.versionCode.toLong()
            val installedVersion = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else @Suppress("DEPRECATION") installed.versionCode.toLong()
            check(candidateVersion > installedVersion) { "UPDATE_VERSION_NOT_NEWER" }

            @Suppress("DEPRECATION")
            val installedSignatures = if (Build.VERSION.SDK_INT >= 28) installed.signingInfo?.apkContentsSigners?.toList()
                else installed.signatures?.toList()
            @Suppress("DEPRECATION")
            val candidateSignatures = if (Build.VERSION.SDK_INT >= 28) candidate.signingInfo?.apkContentsSigners?.toList()
                else candidate.signatures?.toList()
            check(installedSignatures?.size == 1 && candidateSignatures?.size == 1) { "UPDATE_SIGNER_MISSING_OR_AMBIGUOUS" }
            check(installedSignatures[0] == candidateSignatures[0]) { "UPDATE_SIGNER_MISMATCH" }

            val sha = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
            val staged = File(directory, "approved-${sha}.apk")
            if (staged.exists()) {
                check(staged.length() == total && MessageDigest.isEqual(
                    MessageDigest.getInstance("SHA-256").digest(staged.readBytes()), digestFromHex(sha)
                )) { "UPDATE_STAGED_COPY_MISMATCH" }
                check(temp.delete()) { "UPDATE_TEMP_CLEANUP_FAILED" }
            } else {
                check(temp.renameTo(staged)) { "UPDATE_STAGE_RENAME_FAILED" }
            }
            return Candidate(staged, candidateVersion, sha)
        } catch (error: Exception) {
            temp.delete()
            throw error
        }
    }

    private fun digestFromHex(hex: String): ByteArray = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    fun requestInstaller(activity: Activity, candidate: Candidate): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}")))
            return false
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", candidate.file)
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newRawUri("MEL APK", uri)
        }
        activity.startActivity(installIntent)
        return true // request displayed; installation success is NOT verified here
    }
}
