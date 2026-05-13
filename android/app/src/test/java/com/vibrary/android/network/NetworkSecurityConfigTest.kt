package com.vibrary.android.network

import java.io.File
import kotlin.test.Test
import kotlin.test.assertContains

class NetworkSecurityConfigTest {
    @Test
    fun `manifest uses network security config for LAN pairing over HTTP`() {
        val manifest = projectFile("app/src/main/AndroidManifest.xml").readText()

        assertContains(manifest, """android:networkSecurityConfig="@xml/network_security_config"""")
        assertContains(manifest, """android:usesCleartextTraffic="true"""")
    }

    @Test
    fun `network security config permits HTTP while app code restricts public cleartext hosts`() {
        val config = projectFile("app/src/main/res/xml/network_security_config.xml").readText()

        assertContains(config, """cleartextTrafficPermitted="true"""")
        assertContains(config, "<base-config")
        assertContains(config, """src="system"""")
    }
}

private fun projectFile(relativePath: String): File {
    val cwd = File(requireNotNull(System.getProperty("user.dir"))).canonicalFile
    val candidates = generateSequence(cwd) { it.parentFile }
        .map { File(it, relativePath).canonicalFile }
        .toList()
    return candidates.firstOrNull { it.exists() }
        ?: error("Could not find $relativePath under ${cwd.path} or its parents")
}
