package fr.veriteinterdite.mel

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

object MelCompanionInternetValidator {
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)

    fun refresh(context: Context) {
        val app = context.applicationContext
        val cm = app.getSystemService(ConnectivityManager::class.java)
        val network = cm?.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }
        val available = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)

        MelCompanionRuntime.phoneInternetAvailable.value = available

        if (!available) {
            MelCompanionRuntime.internetReady.value = false
            if (MelCompanionRuntime.miniLinkReady.value) {
                MelCompanionRuntime.bridgeState.value = "MINI CONNECTÉE · TÉLÉPHONE HORS LIGNE"
            }
            return
        }

        if (!MelCompanionRuntime.miniLinkReady.value) return
        validateMelSession(app)
    }

    private fun validateMelSession(context: Context) {
        if (!running.compareAndSet(false, true)) return
        MelCompanionRuntime.internetReady.value = false
        MelCompanionRuntime.bridgeState.value = "MINI CONNECTÉE · VALIDATION MEL…"

        executor.execute {
            try {
                val rawAndroidId = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ANDROID_ID
                )
                val androidDeviceId = "android-" + (rawAndroidId ?: "unknown").take(64)
                val vault = TokenVault(context)
                if (vault.load().isNullOrBlank()) {
                    MelCompanionRuntime.bridgeState.value =
                        "MINI CONNECTÉE · APPLI MEL À RÉAPPAIRER"
                    return@execute
                }

                runCatching {
                    MelApiClient(BuildConfig.MEL_BASE_URL, androidDeviceId, vault)
                        .heartbeat(sdkInt = Build.VERSION.SDK_INT, phase = "MINI_BRIDGE_READY")
                }.onSuccess {
                    MelCompanionRuntime.internetReady.value =
                        MelCompanionRuntime.miniLinkReady.value &&
                        MelCompanionRuntime.phoneInternetAvailable.value
                    MelCompanionRuntime.bridgeState.value =
                        if (MelCompanionRuntime.internetReady.value)
                            "MINI CONNECTÉE · INTERNET OK"
                        else
                            "MINI CONNECTÉE · MEL PRÊT"
                }.onFailure { error ->
                    MelCompanionRuntime.internetReady.value = false
                    MelCompanionRuntime.bridgeState.value =
                        if (error is MelApiException && (error.status == 401 || error.status == 403))
                            "MINI CONNECTÉE · APPLI MEL À RÉAPPAIRER"
                        else
                            "MINI CONNECTÉE · MEL INJOIGNABLE"
                }
            } finally {
                running.set(false)
            }
        }
    }
}
