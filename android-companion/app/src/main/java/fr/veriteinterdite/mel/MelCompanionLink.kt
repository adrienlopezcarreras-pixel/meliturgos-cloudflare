package fr.veriteinterdite.mel

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Context

object MelCompanionLink {
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
        if (address.isNullOrBlank()) {
            MelCompanionRuntime.markError("adresse MINI absente")
            return false
        }
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null) {
            MelCompanionRuntime.markError("Bluetooth indisponible")
            return false
        }
        return runCatching {
            MelCompanionRuntime.markPresent(address)
            client(context).connect(adapter.getRemoteDevice(address))
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
