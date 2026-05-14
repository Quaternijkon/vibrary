package com.vibrary.android.network

import com.vibrary.android.data.entities.PairedServerEntity
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PairedServerDiscoveryPolicyTest {
    @Test
    fun `refreshes paired server url when the same desktop instance moves to a new ip`() {
        val activeServer = pairedServer(
            baseUrl = "http://192.168.1.142:8765",
            serverInstanceId = "desktop-abc",
        )
        val announcement = DiscoveryAnnouncement(
            instanceId = "desktop-abc",
            deviceName = "Windows Vibrary",
            serverUrl = "http://192.168.1.132:8765",
            pairingPath = "/v1/pairing/claim",
        )

        val replacement = PairedServerDiscoveryPolicy.replacementFor(activeServer, listOf(announcement))

        assertEquals(announcement, replacement)
    }

    @Test
    fun `adopts discovery instance for legacy paired server when there is one matching desktop`() {
        val activeServer = pairedServer(
            baseUrl = "http://192.168.1.142:8765",
            serverInstanceId = null,
        )
        val announcement = DiscoveryAnnouncement(
            instanceId = "desktop-new",
            deviceName = "dry",
            serverUrl = "http://192.168.1.132:8765",
            pairingPath = "/v1/pairing/claim",
        )

        val replacement = PairedServerDiscoveryPolicy.replacementFor(activeServer, listOf(announcement))

        assertEquals(announcement, replacement)
    }

    @Test
    fun `does not rewrite a legacy paired server when multiple desktops are visible`() {
        val activeServer = pairedServer(
            baseUrl = "http://192.168.1.142:8765",
            serverInstanceId = null,
        )

        val replacement = PairedServerDiscoveryPolicy.replacementFor(
            activeServer,
            listOf(
                DiscoveryAnnouncement("desktop-a", "Windows Vibrary", "http://192.168.1.132:8765", "/v1/pairing/claim"),
                DiscoveryAnnouncement("desktop-b", "Other PC", "http://192.168.1.150:8765", "/v1/pairing/claim"),
            ),
        )

        assertNull(replacement)
    }

    private fun pairedServer(baseUrl: String, serverInstanceId: String?): PairedServerEntity =
        PairedServerEntity(
            pairedServerId = "server-1",
            serverInstanceId = serverInstanceId,
            baseUrl = baseUrl,
            deviceId = "android-1",
            pairingToken = "token",
            displayName = "Windows Vibrary",
            isActive = true,
            createdAt = "2026-05-14T00:00:00Z",
            lastSeenAt = null,
        )
}
