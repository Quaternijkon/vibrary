package com.vibrary.android.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CacheCleanupPolicyTest {
    @Test
    fun `cleanup allows only app owned cache entries`() {
        assertTrue(CacheCleanupPolicy.canDelete(CacheEntryKind.DOWNLOADED_FILE, canDelete = true))
        assertTrue(CacheCleanupPolicy.canDelete(CacheEntryKind.THUMBNAIL, canDelete = true))
        assertFalse(CacheCleanupPolicy.canDelete(CacheEntryKind.SOURCE_ORIGINAL, canDelete = true))
        assertFalse(CacheCleanupPolicy.canDelete(CacheEntryKind.LIBRARY_COPY, canDelete = true))
        assertFalse(CacheCleanupPolicy.canDelete(CacheEntryKind.EXPORT_COPY, canDelete = true))
    }

    @Test
    fun `cleanup honors can delete flag for cache entries`() {
        assertFalse(CacheCleanupPolicy.canDelete(CacheEntryKind.DOWNLOADED_FILE, canDelete = false))
    }
}
