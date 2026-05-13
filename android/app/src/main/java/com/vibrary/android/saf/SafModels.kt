package com.vibrary.android.saf

import android.net.Uri

enum class SafSourceType(val wireValue: String) {
    ANDROID_FILE_GRANT("android_file_grant"),
    ANDROID_TREE_GRANT("android_tree_grant"),
}

data class SafDocumentRef(
    val localSourceId: String,
    val sourceType: SafSourceType,
    val uri: Uri,
    val displayName: String,
    val mimeType: String?,
    val sizeBytes: Long?,
    val lastModifiedEpochMillis: Long?,
)

interface SafSelectionStore {
    suspend fun persistSelection(documents: List<SafDocumentRef>)
}
