package com.vibrary.android.network

import kotlin.test.Test
import kotlin.test.assertEquals

class ApiClientFactoryTest {
    @Test
    fun `normalizes Retrofit base URL with trailing slash`() {
        assertEquals("http://192.168.1.20:8765/", normalizeRetrofitBaseUrl("http://192.168.1.20:8765"))
        assertEquals("http://192.168.1.20:8765/", normalizeRetrofitBaseUrl("http://192.168.1.20:8765/"))
    }
}
