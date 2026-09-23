package fr.veriteinterdite.mel

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit

object MelBackground {
    const val HEARTBEAT_WORK_NAME = "mel-android-heartbeat-v1"
    private const val CHANNEL_ID = "mel_background_status"
    private const val SESSION_NOTIFICATION_ID = 4101
    private const val STATUS_NOTIFICATION_ID = 4102

    fun schedule(context: Context) {
        ensureChannel(context)
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<MelHeartbeatWorker>(
            15,
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(HEARTBEAT_WORK_NAME)
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniquePeriodicWork(
                HEARTBEAT_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .cancelUniqueWork(HEARTBEAT_WORK_NAME)
        NotificationManagerCompat.from(context).cancel(STATUS_NOTIFICATION_ID)
    }

    fun notificationsAllowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun showBackgroundEnabled(context: Context) {
        ensureChannel(context)
        if (!notificationsAllowed(context)) return
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_mel)
            .setContentTitle("MEL connectée")
            .setContentText("La vérification d’arrière-plan est active.")
            .setContentIntent(openAppIntent(context))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(STATUS_NOTIFICATION_ID, notification)
    }

    fun notifySessionExpired(context: Context) {
        ensureChannel(context)
        if (!notificationsAllowed(context)) return
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_mel)
            .setContentTitle("Reconnecter MEL")
            .setContentText("La session sécurisée de ce téléphone a expiré.")
            .setContentIntent(openAppIntent(context))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(SESSION_NOTIFICATION_ID, notification)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "État de MEL",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Connexion et session du compagnon MEL Android"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun openAppIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(
            context,
            4100,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}

class MelHeartbeatWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val vault = TokenVault(applicationContext)
        if (vault.load().isNullOrBlank()) return Result.success()

        val raw = Settings.Secure.getString(
            applicationContext.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        val deviceId = "android-" + (raw ?: "unknown").take(64)
        val client = MelApiClient(BuildConfig.MEL_BASE_URL, deviceId, vault)

        return try {
            client.heartbeat(sdkInt = Build.VERSION.SDK_INT)
            Result.success()
        } catch (error: MelApiException) {
            if (error.code in setOf(
                    "DEVICE_AUTH_REQUIRED",
                    "DEVICE_AUTH_INVALID",
                    "DEVICE_NOT_PAIRED"
                )
            ) {
                vault.clear()
                MelBackground.notifySessionExpired(applicationContext)
                Result.success()
            } else if (error.status >= 500 || error.status == 429) {
                Result.retry()
            } else {
                Result.failure()
            }
        } catch (_: SocketTimeoutException) {
            Result.retry()
        } catch (_: UnknownHostException) {
            Result.retry()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
