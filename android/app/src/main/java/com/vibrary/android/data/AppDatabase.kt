package com.vibrary.android.data

import android.content.Context
import androidx.room.Database
import androidx.room.migration.Migration
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.sqlite.db.SupportSQLiteDatabase
import com.vibrary.android.data.dao.CacheEntryDao
import com.vibrary.android.data.dao.LocalAssetRefDao
import com.vibrary.android.data.dao.LocalSourceDao
import com.vibrary.android.data.dao.PairedServerDao
import com.vibrary.android.data.dao.UploadQueueDao
import com.vibrary.android.data.entities.CacheEntryEntity
import com.vibrary.android.data.entities.LocalAssetRefEntity
import com.vibrary.android.data.entities.LocalSourceEntity
import com.vibrary.android.data.entities.PairedServerEntity
import com.vibrary.android.data.entities.UploadQueueEntity

@Database(
    entities = [
        LocalSourceEntity::class,
        UploadQueueEntity::class,
        LocalAssetRefEntity::class,
        CacheEntryEntity::class,
        PairedServerEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun localSourceDao(): LocalSourceDao
    abstract fun uploadQueueDao(): UploadQueueDao
    abstract fun localAssetRefDao(): LocalAssetRefDao
    abstract fun cacheEntryDao(): CacheEntryDao
    abstract fun pairedServerDao(): PairedServerDao

    companion object {
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE paired_servers ADD COLUMN server_instance_id TEXT")
            }
        }

        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "vibrary-local.db")
                .addMigrations(MIGRATION_1_2)
                .build()
    }
}
