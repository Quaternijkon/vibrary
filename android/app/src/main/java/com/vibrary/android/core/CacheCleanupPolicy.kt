package com.vibrary.android.core

enum class CacheEntryKind(val wireValue: String) {
    THUMBNAIL("thumbnail"),
    PREVIEW("preview"),
    DOWNLOADED_FILE("downloaded_file"),
    UPLOAD_TEMP("upload_temp"),
    PARSE_TEMP("parse_temp"),
    SOURCE_ORIGINAL("source_original"),
    LIBRARY_COPY("library_copy"),
    EXPORT_COPY("export_copy");
}

object CacheCleanupPolicy {
    private val appOwnedCacheKinds = setOf(
        CacheEntryKind.THUMBNAIL,
        CacheEntryKind.PREVIEW,
        CacheEntryKind.DOWNLOADED_FILE,
        CacheEntryKind.UPLOAD_TEMP,
        CacheEntryKind.PARSE_TEMP,
    )

    fun canDelete(kind: CacheEntryKind, canDelete: Boolean): Boolean =
        canDelete && kind in appOwnedCacheKinds
}
