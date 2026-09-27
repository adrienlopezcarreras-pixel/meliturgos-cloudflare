package fr.veriteinterdite.mel

import android.annotation.SuppressLint
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * System companion presence hook. Once MINI is associated through Android's
 * CompanionDeviceManager, Android can wake/bind MEL when MINI appears instead
 * of relying on aggressive application-side reconnect loops.
 */
@SuppressLint("MissingPermission")
class MelCompanionPresenceService : CompanionDeviceService() {
    private fun ensureBridge(reason: String) {
        MelBleBridgeService.bridgeState.value = "MINI PRÉSENTE · $reason"
        ContextCompat.startForegroundService(
            this,
            Intent(this, MelBleBridgeService::class.java)
        )
    }

    @Deprecated("API 31-32 compatibility")
    override fun onDeviceAppeared(address: String) {
        super.onDeviceAppeared(address)
        ensureBridge("BLE")
    }

    @Deprecated("API 31-32 compatibility")
    override fun onDeviceDisappeared(address: String) {
        super.onDeviceDisappeared(address)
        MelBleBridgeService.bridgeState.value = "MINI HORS PORTÉE"
    }

    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        super.onDeviceAppeared(associationInfo)
        ensureBridge("COMPAGNON")
    }

    override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
        super.onDeviceDisappeared(associationInfo)
        MelBleBridgeService.bridgeState.value = "MINI HORS PORTÉE"
    }
}
