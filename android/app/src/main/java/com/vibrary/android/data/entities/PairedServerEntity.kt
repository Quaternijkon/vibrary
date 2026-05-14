package com.vibrary.android.data.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "paired_servers")
data class PairedServerEntity(
    @PrimaryKey
    @ColumnInfo(name = "paired_server_id")
    val pairedServerId: String,
    @ColumnInfo(name = "server_instance_id")
    val serverInstanceId: String?,
    @ColumnInfo(name = "base_url")
    val baseUrl: String,
    @ColumnInfo(name = "device_id")
    val deviceId: String,
    @ColumnInfo(name = "pairing_token")
    val pairingToken: String,
    @ColumnInfo(name = "display_name")
    val displayName: String?,
    @ColumnInfo(name = "is_active")
    val isActive: Boolean,
    @ColumnInfo(name = "created_at")
    val createdAt: String,
    @ColumnInfo(name = "last_seen_at")
    val lastSeenAt: String?,
)
