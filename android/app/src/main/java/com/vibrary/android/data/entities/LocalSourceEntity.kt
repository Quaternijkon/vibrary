package com.vibrary.android.data.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "local_sources")
data class LocalSourceEntity(
    @PrimaryKey
    @ColumnInfo(name = "local_source_id")
    val localSourceId: String,
    @ColumnInfo(name = "source_type")
    val sourceType: String,
    @ColumnInfo(name = "uri_alias")
    val uriAlias: String,
    @ColumnInfo(name = "persisted_uri")
    val persistedUri: String,
    @ColumnInfo(name = "display_name")
    val displayName: String,
    @ColumnInfo(name = "mime_type")
    val mimeType: String?,
    @ColumnInfo(name = "size_bytes")
    val sizeBytes: Long?,
    @ColumnInfo(name = "last_modified_at")
    val lastModifiedAt: String?,
    @ColumnInfo(name = "permission_status")
    val permissionStatus: String,
    @ColumnInfo(name = "created_at")
    val createdAt: String,
    @ColumnInfo(name = "last_verified_at")
    val lastVerifiedAt: String?,
)
