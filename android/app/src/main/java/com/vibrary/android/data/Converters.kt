package com.vibrary.android.data

import androidx.room.TypeConverter
import com.vibrary.android.core.UploadQueueState

class Converters {
    @TypeConverter
    fun uploadQueueStateToString(value: UploadQueueState): String = value.wireValue

    @TypeConverter
    fun uploadQueueStateFromString(value: String): UploadQueueState = UploadQueueState.fromWireValue(value)
}
