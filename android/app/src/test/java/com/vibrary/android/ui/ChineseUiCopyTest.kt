package com.vibrary.android.ui

import java.io.File
import kotlin.test.Test
import kotlin.test.assertContains

class ChineseUiCopyTest {
    @Test
    fun `compose app defaults to Chinese user-facing copy`() {
        val source = projectFile("app/src/main/java/com/vibrary/android/ui/VibraryApp.kt").readText()

        listOf("配对", "资料", "队列", "搜索", "缓存", "连接电脑", "验证码", "选择文件", "选择文件夹").forEach {
            assertContains(source, it)
        }
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
