package com.vibrary.android.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.vibrary.android.data.entities.UploadQueueEntity

class UploadWorkScheduler(context: Context) {
    private val workManager = WorkManager.getInstance(context)

    fun enqueue(item: UploadQueueEntity) {
        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .setRequiresBatteryNotLow(true)
                    .build(),
            )
            .setInputData(
                Data.Builder()
                    .putString(UploadWorker.KEY_QUEUE_ID, item.queueId)
                    .build(),
            )
            .build()

        workManager.enqueueUniqueWork("upload-${item.queueId}", ExistingWorkPolicy.KEEP, request)
    }
}
