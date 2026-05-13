package com.vibrary.android.data.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "cache_entries",
    indices = [
        Index(value = ["asset_id"]),
        Index(value = ["cache_type"]),
    ],
)
data class CacheEntryEntity(
    @PrimaryKey
    @ColumnInfo(name = "cache_entry_id")
    val cacheEntryId: String,
    @ColumnInfo(name = "asset_id")
    val assetId: String?,
    @ColumnInfo(name = "cache_type")
    val cacheType: String,
    @ColumnInfo(name = "relative_path")
    val relativePath: String,
    @ColumnInfo(name = "size_bytes")
    val sizeBytes: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: String,
    @ColumnInfo(name = "last_accessed_at")
    val lastAccessedAt: String?,
    @ColumnInfo(name = "can_delete")
    val canDelete: Boolean,
)
