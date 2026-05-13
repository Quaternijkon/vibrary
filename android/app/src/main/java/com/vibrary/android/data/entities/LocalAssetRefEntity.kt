package com.vibrary.android.data.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "local_asset_refs",
    indices = [
        Index(value = ["asset_id"]),
        Index(value = ["local_ref_id"]),
        Index(value = ["local_source_id"]),
        Index(value = ["cache_entry_id"]),
    ],
)
data class LocalAssetRefEntity(
    @PrimaryKey
    @ColumnInfo(name = "ref_id")
    val refId: String,
    @ColumnInfo(name = "asset_id")
    val assetId: String,
    @ColumnInfo(name = "asset_version_id")
    val assetVersionId: String?,
    @ColumnInfo(name = "ref_type")
    val refType: String,
    @ColumnInfo(name = "local_ref_id")
    val localRefId: String?,
    @ColumnInfo(name = "local_source_id")
    val localSourceId: String?,
    @ColumnInfo(name = "cache_entry_id")
    val cacheEntryId: String?,
    @ColumnInfo(name = "display_name")
    val displayName: String?,
    @ColumnInfo(name = "size_bytes")
    val sizeBytes: Long?,
    @ColumnInfo(name = "last_known_mtime")
    val lastKnownMtime: String?,
    @ColumnInfo(name = "content_sha256")
    val contentSha256: String?,
    @ColumnInfo(name = "permission_status")
    val permissionStatus: String,
    @ColumnInfo(name = "created_at")
    val createdAt: String,
    @ColumnInfo(name = "last_verified_at")
    val lastVerifiedAt: String?,
    @ColumnInfo(name = "is_available")
    val isAvailable: Boolean,
)
