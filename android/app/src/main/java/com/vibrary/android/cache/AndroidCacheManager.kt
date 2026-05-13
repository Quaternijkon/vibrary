package com.vibrary.android.cache

import android.content.Context
import com.vibrary.android.core.CacheCleanupPolicy
import com.vibrary.android.core.CacheEntryKind
import com.vibrary.android.data.dao.CacheEntryDao
import com.vibrary.android.data.entities.CacheEntryEntity
import java.io.File

class AndroidCacheManager(
    private val context: Context,
    private val cacheEntryDao: CacheEntryDao,
) {
    fun cacheRoot(): File = context.cacheDir

    fun downloadsDir(assetId: String): File = File(context.cacheDir, "downloads/$assetId").also { it.mkdirs() }

    fun downloadTarget(assetId: String, fileName: String): File {
        val safeName = File(fileName).name.ifBlank { "download.bin" }
        val target = File(downloadsDir(assetId), safeName).canonicalFile
        require(isUnderCacheRoot(target)) { "download target escapes app cache" }
        return target
    }

    fun resolveCacheEntry(entry: CacheEntryEntity): File? {
        val target = File(context.cacheDir, entry.relativePath).canonicalFile
        return target.takeIf { isUnderCacheRoot(it) && it.isFile }
    }

    suspend fun cleanupAppCacheOnly(): CleanupReport {
        val deleted = mutableListOf<String>()
        val skipped = mutableListOf<String>()

        for (entry in cacheEntryDao.deletableEntries()) {
            val kind = CacheEntryKind.entries.firstOrNull { it.wireValue == entry.cacheType }
            if (kind == null || !CacheCleanupPolicy.canDelete(kind, entry.canDelete)) {
                skipped += entry.cacheEntryId
                continue
            }

            val file = File(context.cacheDir, entry.relativePath).canonicalFile
            if (!isUnderCacheRoot(file)) {
                skipped += entry.cacheEntryId
                continue
            }

            if (!file.exists() || file.deleteRecursively()) {
                deleted += entry.cacheEntryId
            } else {
                skipped += entry.cacheEntryId
            }
        }

        if (deleted.isNotEmpty()) {
            cacheEntryDao.deleteMetadata(deleted)
        }
        return CleanupReport(deletedEntryIds = deleted, skippedEntryIds = skipped)
    }
}

private fun AndroidCacheManager.isUnderCacheRoot(file: File): Boolean {
    val root = cacheRoot().canonicalFile.toPath()
    return file.canonicalFile.toPath().startsWith(root)
}

data class CleanupReport(
    val deletedEntryIds: List<String>,
    val skippedEntryIds: List<String>,
)

fun CacheEntryEntity.isAppCacheEntry(): Boolean =
    CacheEntryKind.entries.firstOrNull { it.wireValue == cacheType }
        ?.let { CacheCleanupPolicy.canDelete(it, canDelete) }
        ?: false
