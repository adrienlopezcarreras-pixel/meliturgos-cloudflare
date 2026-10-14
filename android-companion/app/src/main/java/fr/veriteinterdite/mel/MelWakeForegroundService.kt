package fr.veriteinterdite.mel

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Opt-in foreground microphone lifecycle foundation.
 *
 * Not yet wired to the wake detector: never report background "OK MEL" as active.
 * Starting a microphone FGS must happen from a visible user action while the app
 * is eligible under current Android foreground-service restrictions.
 */
class MelWakeForegroundService : Service() {
    companion object {
        const val ACTION_STOP = "fr.veriteinterdite.mel.WAKE_STOP"
        const val ACTION_START = "fr.veriteinterdite.mel.WAKE_START"
        private const val CHANNEL_ID = "mel_wake_microphone"
        private const val NOTIFICATION_ID = 807
        private const val OPT_IN_PREFS = "mel_wake_background_opt_in"
        private const val OPT_IN_KEY = "microphone_enabled"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE).edit().putBoolean(OPT_IN_KEY, false).apply()
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_START ||
            !getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE).getBoolean(OPT_IN_KEY, false)
        ) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf()
            return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "MEL — microphone", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, MelWakeForegroundService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("MEL — microphone autorisé")
            .setContentText("Préparation du réveil vocal. Détection en arrière-plan non active.")
            .setContentIntent(open)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stop)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }
}
