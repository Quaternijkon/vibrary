package com.vibrary.android.saf

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.documentfile.provider.DocumentFile
import java.util.UUID

class SafPicker(private val context: Context) {
    fun openDocumentIntent(allowMultiple: Boolean = true): Intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }

    fun openTreeIntent(): Intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }

    fun persistReadPermission(uri: Uri, flags: Int) {
        val readFlags = flags and Intent.FLAG_GRANT_READ_URI_PERMISSION
        context.contentResolver.takePersistableUriPermission(uri, readFlags)
    }

    fun documentsFromResult(data: Intent): List<SafDocumentRef> {
        val clipData = data.clipData
        if (clipData != null) {
            return (0 until clipData.itemCount).map { index ->
                documentRefForUri(clipData.getItemAt(index).uri, SafSourceType.ANDROID_FILE_GRANT)
            }
        }

        return data.data?.let { uri ->
            listOf(documentRefForUri(uri, SafSourceType.ANDROID_FILE_GRANT))
        }.orEmpty()
    }

    fun enumerateTree(treeUri: Uri, isCancelled: () -> Boolean): Sequence<SafDocumentRef> = sequence {
        val root = DocumentFile.fromTreeUri(context, treeUri) ?: return@sequence
        val stack = ArrayDeque<DocumentFile>()
        stack.add(root)
        while (stack.isNotEmpty() && !isCancelled()) {
            val current = stack.removeLast()
            if (current.isDirectory) {
                current.listFiles().forEach { stack.add(it) }
            } else if (current.isFile) {
                yield(documentRefForDocumentFile(current, SafSourceType.ANDROID_TREE_GRANT))
            }
        }
    }

    private fun documentRefForDocumentFile(file: DocumentFile, sourceType: SafSourceType): SafDocumentRef =
        SafDocumentRef(
            localSourceId = UUID.randomUUID().toString(),
            sourceType = sourceType,
            uri = file.uri,
            displayName = file.name ?: file.uri.lastPathSegment.orEmpty(),
            mimeType = file.type,
            sizeBytes = file.length().takeIf { it >= 0 },
            lastModifiedEpochMillis = file.lastModified().takeIf { it > 0 },
        )

    private fun documentRefForUri(uri: Uri, sourceType: SafSourceType): SafDocumentRef {
        val metadata = context.contentResolver.queryOpenable(uri)
        return SafDocumentRef(
            localSourceId = UUID.randomUUID().toString(),
            sourceType = sourceType,
            uri = uri,
            displayName = metadata.displayName ?: uri.lastPathSegment.orEmpty(),
            mimeType = context.contentResolver.getType(uri),
            sizeBytes = metadata.sizeBytes,
            lastModifiedEpochMillis = null,
        )
    }
}

private data class OpenableMetadata(val displayName: String?, val sizeBytes: Long?)

private fun ContentResolver.queryOpenable(uri: Uri): OpenableMetadata {
    query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null).use { cursor ->
        if (cursor == null || !cursor.moveToFirst()) return OpenableMetadata(null, null)
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        return OpenableMetadata(
            displayName = nameIndex.takeIf { it >= 0 }?.let(cursor::getString),
            sizeBytes = sizeIndex.takeIf { it >= 0 }?.let(cursor::getLong),
        )
    }
}
