package com.vibrary.android.repository

import com.vibrary.android.data.entities.LocalAssetRefEntity
import kotlin.test.Test
import kotlin.test.assertEquals

class LocalRefOpenTargetTest {
    @Test
    fun `source originals open through local source lookup`() {
        val target = LocalRefOpenTarget.from(ref(localSourceId = "source-1", cacheEntryId = null))

        assertEquals(LocalRefOpenTarget.Source("source-1"), target)
    }

    @Test
    fun `cache copies open through cache entry lookup`() {
        val target = LocalRefOpenTarget.from(ref(localSourceId = null, cacheEntryId = "cache-1"))

        assertEquals(LocalRefOpenTarget.Cache("cache-1"), target)
    }

    private fun ref(localSourceId: String?, cacheEntryId: String?): LocalAssetRefEntity =
        LocalAssetRefEntity(
            refId = "ref-1",
            assetId = "asset-1",
            assetVersionId = null,
            refType = if (cacheEntryId == null) "source_original" else "cache_copy",
            localRefId = "local-1",
            localSourceId = localSourceId,
            cacheEntryId = cacheEntryId,
            displayName = "file.txt",
            sizeBytes = 1,
            lastKnownMtime = null,
            contentSha256 = null,
            permissionStatus = "granted",
            createdAt = "now",
            lastVerifiedAt = "now",
            isAvailable = true,
        )
}
