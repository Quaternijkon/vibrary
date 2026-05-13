package com.vibrary.android.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.vibrary.android.data.entities.CacheEntryEntity

@Dao
interface CacheEntryDao {
    @Query("SELECT * FROM cache_entries WHERE cache_entry_id = :cacheEntryId LIMIT 1")
    suspend fun findById(cacheEntryId: String): CacheEntryEntity?

    @Query("SELECT * FROM cache_entries WHERE can_delete = 1")
    suspend fun deletableEntries(): List<CacheEntryEntity>

    @Query("DELETE FROM cache_entries WHERE cache_entry_id IN (:cacheEntryIds)")
    suspend fun deleteMetadata(cacheEntryIds: List<String>)

    @Upsert
    suspend fun upsert(entry: CacheEntryEntity)
}
