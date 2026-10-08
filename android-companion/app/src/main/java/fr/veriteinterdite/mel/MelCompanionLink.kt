package fr.veriteinterdite.mel

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothAdapter
import android.content.Context

object MelCompanionLink {
    private const val PREFS_NAME = "mel_companion_link"
    private const val KEY_MINI_ADDRESS = "mini_address"

    fun rememberAddress(context: Context, address: String?) {
        if (isValidAddress(address)) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_MINI_ADDRESS, address).apply()
        }
    }

    fun rememberedAddress(context: Context): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_MINI_ADDRESS, null)
            ?.takeIf { isValidAddress(it) }

    fun isValidAddress(address: String?): Boolean =
        !address.isNullOrBlank() && BluetoothAdapter.checkBluetoothAddress(address)

    @Volatile
    private var client: MelLinkV2Client? = null

    private fun client(context: Context): MelLinkV2Client {
        val current = client
        if (current != null) return current
        return synchronized(this) {
            client ?: MelLinkV2Client(context.applicationContext).also { client = it }
        }
    }

    @SuppressLint("MissingPermission")
    fun connect(context: Context, address: String?): Boolean {
        val safeAddress = address?.takeIf { isValidAddress(it) } ?: rememberedAddress(context)
        if (safeAddress == null) {
            MelCompanionRuntime.markError("adresse MINI invalide")
            return false
        }
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null) {
            MelCompanionRuntime.markError("Bluetooth indisponible")
            return false
        }
        return runCatching {
            MelCompanionRuntime.markPresent(safeAddress)
            rememberAddress(context, safeAddress)
            client(context).connect(adapter.getRemoteDevice(safeAddress))
            true
        }.getOrElse { error ->
            MelCompanionRuntime.markError("connexion MINI: " + (error.message ?: error.javaClass.simpleName))
            false
        }
    }

    fun close() {
        client?.close()
    }
}
