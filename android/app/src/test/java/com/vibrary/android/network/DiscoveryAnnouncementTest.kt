package com.vibrary.android.network

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class DiscoveryAnnouncementTest {
    @Test
    fun `parses desktop LAN discovery announcement`() {
        val announcement = DiscoveryAnnouncement.parse(
            """
            {
              "type": "vibrary-desktop",
              "version": 1,
              "instance_id": "desktop-abc",
              "device_name": "Lab PC",
              "server_url": "http://192.168.1.142:8765",
              "pairing_path": "/v1/pairing/claim"
            }
            """.trimIndent(),
        )

        assertEquals("desktop-abc", announcement.instanceId)
        assertEquals("Lab PC", announcement.deviceName)
        assertEquals("http://192.168.1.142:8765", announcement.serverUrl)
        assertEquals("/v1/pairing/claim", announcement.pairingPath)
    }

    @Test
    fun `rejects unrelated discovery packets`() {
        assertFailsWith<IllegalArgumentException> {
            DiscoveryAnnouncement.parse("""{"type":"other","server_url":"http://192.168.1.10:8765"}""")
        }
    }
}
