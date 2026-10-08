package fr.veriteinterdite.mel

import android.companion.AssociationInfo
import android.companion.AssociationRequest
import android.companion.BluetoothLeDeviceFilter
import android.companion.CompanionDeviceManager
import android.content.Context
import android.content.IntentSender
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import java.util.regex.Pattern

object MelCompanionController {
    fun restore(context: Context) {
        val manager = context.getSystemService(CompanionDeviceManager::class.java) ?: return
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_COMPANION_DEVICE_SETUP)) {
            MelCompanionRuntime.markError("CompanionDeviceManager indisponible")
            return
        }
        if (Build.VERSION.SDK_INT >= 33) {
            val association = manager.myAssociations.firstOrNull()
            if (association != null) {
                val address = association.deviceMacAddress?.toString()
                MelCompanionRuntime.markAssociated(association.id, address)
                if (!address.isNullOrBlank() && Build.VERSION.SDK_INT >= 31) {
                    runCatching { manager.startObservingDevicePresence(address) }
                }
                return
            }
        }
        MelCompanionRuntime.bridgeState.value = "MINI À ASSOCIER"
    }

    fun connectExisting(context: Context): Boolean {
        val manager = context.getSystemService(CompanionDeviceManager::class.java) ?: return false
        if (Build.VERSION.SDK_INT < 33) return false
        val association = manager.myAssociations.firstOrNull() ?: return false
        val address = association.deviceMacAddress?.toString()
        MelCompanionRuntime.markAssociated(association.id, address)
        return MelCompanionLink.connect(context, address)
    }

    fun associate(
        context: Context,
        launchChooser: (IntentSender) -> Unit,
        onCreated: (AssociationInfo) -> Unit = {}
    ) {
        val manager = context.getSystemService(CompanionDeviceManager::class.java)
        if (manager == null) {
            MelCompanionRuntime.markError("CompanionDeviceManager indisponible")
            return
        }
        val filter = BluetoothLeDeviceFilter.Builder()
            .setScanFilter(
                android.bluetooth.le.ScanFilter.Builder()
                    .setServiceUuid(ParcelUuid(MelLinkV2Client.SERVICE_UUID))
                    .build()
            )
            .setNamePattern(Pattern.compile("(?i).*MEL.*|.*MINI.*"))
            .build()
        val request = AssociationRequest.Builder()
            .addDeviceFilter(filter)
            .setSingleDevice(false)
            .build()

        MelCompanionRuntime.bridgeState.value = "RECHERCHE MINI…"
        manager.associate(
            request,
            context.mainExecutor,
            object : CompanionDeviceManager.Callback() {
                override fun onAssociationPending(intentSender: IntentSender) {
                    launchChooser(intentSender)
                }

                override fun onAssociationCreated(associationInfo: AssociationInfo) {
                    val address = if (Build.VERSION.SDK_INT >= 33) {
                        associationInfo.deviceMacAddress?.toString()
                    } else null
                    MelCompanionRuntime.markAssociated(associationInfo.id, address)
                    if (!address.isNullOrBlank() && Build.VERSION.SDK_INT >= 31) {
                        runCatching { manager.startObservingDevicePresence(address) }
                    }
                    onCreated(associationInfo)
                }

                override fun onFailure(errorMessage: CharSequence?) {
                    MelCompanionRuntime.markError(errorMessage?.toString() ?: "association refusée")
                }
            }
        )
    }
}
