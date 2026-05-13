package com.vibrary.android.network

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ApiClientFactoryTest {
    @Test
    fun `normalizes Retrofit base URL with trailing slash`() {
        assertEquals("http://192.168.1.20:8765/", normalizeRetrofitBaseUrl("http://192.168.1.20:8765"))
        assertEquals("http://192.168.1.20:8765/", normalizeRetrofitBaseUrl("http://192.168.1.20:8765/"))
    }

    @Test
    fun `adds HTTP scheme when LAN address is entered without one`() {
        assertEquals("http://192.168.1.20:8765/", normalizeRetrofitBaseUrl("192.168.1.20:8765"))
    }

    @Test
    fun `allows cleartext only for local or private network hosts`() {
        assertEquals("http://10.0.0.8:8765/", normalizeRetrofitBaseUrl("http://10.0.0.8:8765"))
        assertEquals("http://172.16.1.8:8765/", normalizeRetrofitBaseUrl("http://172.16.1.8:8765"))
        assertEquals("http://localhost:8765/", normalizeRetrofitBaseUrl("http://localhost:8765"))
        assertEquals("http://vibrary.local:8765/", normalizeRetrofitBaseUrl("http://vibrary.local:8765"))

        assertFailsWith<IllegalArgumentException> {
            normalizeRetrofitBaseUrl("http://example.com:8765")
        }
        assertEquals("https://example.com/", normalizeRetrofitBaseUrl("https://example.com"))
    }
}
