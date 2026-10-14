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
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Opt-in foreground microphone lifecycle foundation.
 *
 * The detector is opt-in and local. A match offers a notification handoff;
 * it does not auto-launch an activity or promise hands-free locked-screen replies.
 * Starting a microphone FGS must happen from a visible user action while the app
 * is eligible under current Android foreground-service restrictions.
 */
class MelWakeForegroundService : Service() {
    companion object {
        const val ACTION_STOP = "fr.veriteinterdite.mel.WAKE_STOP"
        const val ACTION_START = "fr.veriteinterdite.mel.WAKE_START"
        const val EXTRA_WAKE_NOTIFICATION_TAP = "fr.veriteinterdite.mel.WAKE_NOTIFICATION_TAP"
        private const val CHANNEL_ID = "mel_wake_microphone"
        private const val NOTIFICATION_ID = 807
        private const val OPT_IN_PREFS = "mel_wake_background_opt_in"
        private const val OPT_IN_KEY = "microphone_enabled"
    }

    @Volatile private var listening = false
    private var worker: Thread? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE).edit().putBoolean(OPT_IN_KEY, false).apply()
            getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID + 1)
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
            getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE)
                .edit().putBoolean(OPT_IN_KEY, false).commit()
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
            .setContentText("Écoute locale OK MEL activée. Arrêter à tout moment.")
            .setContentIntent(open)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stop)
            .setOngoing(true)
            .build()
        val foregroundStarted = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        }.isSuccess
        if (!foregroundStarted) {
            getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE)
                .edit().putBoolean(OPT_IN_KEY, false).commit()
            stopSelf()
            return START_NOT_STICKY
        }
        if (!listening && worker?.isAlive != true) {
            val store = WakePhraseProfileStore(this)
            val template = store.templateFeatures()
            if (template == null) {
                getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE)
                    .edit().putBoolean(OPT_IN_KEY, false).commit()
                stopSelf()
                return START_NOT_STICKY
            }
            val threshold = store.threshold()
            listening = true
            worker = Thread({
                val outcome = runCatching {
                    WakePhraseTrainer.listenForWake(
                        template = template,
                        threshold = threshold,
                        shouldContinue = { listening && !Thread.currentThread().isInterrupted },
                        onMatch = { _ ->
                            listening = false
                            mainHandler.post {
                                if (getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE).getBoolean(OPT_IN_KEY, false)) {
                                    val launch = Intent(this, MainActivity::class.java)
                                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                                        .putExtra(EXTRA_WAKE_NOTIFICATION_TAP, true)
                                    // A wake match cannot silently launch an activity from the
                                    // background. Provide an actionable notification instead.
                                    val tap = PendingIntent.getActivity(
                                        this, 2, launch,
                                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                                    )
                                    val ready = NotificationCompat.Builder(this, CHANNEL_ID)
                                        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                                        .setContentTitle("OK MEL reconnu")
                                        .setContentText("Touchez pour ouvrir la conversation MEL.")
                                        .setContentIntent(tap)
                                        .setAutoCancel(true)
                                        .build()
                                    getSystemService(NotificationManager::class.java)
                                        .notify(NOTIFICATION_ID + 1, ready)
                                }
                                stopSelf()
                            }
                        }
                    )
                }
                if (outcome.isFailure) {
                    mainHandler.post { stopSelf() }
                }
            }, "mel-foreground-wake").apply { isDaemon = true; start() }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        // Clear stale opt-in when Android stops the service so the Activity's
        // normal foreground detector can resume on the next interaction.
        getSharedPreferences(OPT_IN_PREFS, MODE_PRIVATE)
            .edit().putBoolean(OPT_IN_KEY, false).commit()
        listening = false
        worker?.interrupt()
        worker = null
        super.onDestroy()
    }
}
