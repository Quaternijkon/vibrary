package com.vibrary.android.network

import com.vibrary.android.data.entities.PairedServerEntity
import java.net.URI

object PairedServerDiscoveryPolicy {
    fun replacementFor(
        activeServer: PairedServerEntity?,
        announcements: Collection<DiscoveryAnnouncement>,
    ): DiscoveryAnnouncement? {
        if (activeServer == null || announcements.isEmpty()) return null

        activeServer.serverInstanceId
            ?.let { instanceId -> announcements.firstOrNull { it.instanceId == instanceId } }
            ?.let { matchingAnnouncement ->
                return if (matchingAnnouncement.needsRefresh(activeServer)) matchingAnnouncement else null
            }

        if (activeServer.serverInstanceId != null || announcements.size != 1) return null

        val onlyAnnouncement = announcements.single()
        if (!legacyServerNameMatches(activeServer.displayName, onlyAnnouncement.deviceName)) return null
        if (portOf(activeServer.baseUrl) != portOf(onlyAnnouncement.serverUrl)) return null
        return onlyAnnouncement
    }

    private fun DiscoveryAnnouncement.needsRefresh(activeServer: PairedServerEntity): Boolean =
        serverUrl != activeServer.baseUrl ||
            deviceName != activeServer.displayName ||
            instanceId != activeServer.serverInstanceId

    private fun legacyServerNameMatches(activeName: String?, discoveredName: String): Boolean {
        if (activeName.isNullOrBlank()) return true
        if (activeName == discoveredName) return true
        return activeName == "Windows Vibrary" || discoveredName == "Windows Vibrary"
    }

    private fun portOf(url: String): Int? =
        runCatching { URI(url).port.takeIf { it > 0 } }.getOrNull()
}
