package com.vibrary.android.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UploadQueuePolicyTest {
    @Test
    fun `selection creates queued work without starting upload`() {
        val item = UploadQueuePolicy.newQueueItem(
            id = "queue-1",
            localSourceId = "source-1",
            displayName = "paper.pdf",
            sizeBytes = 42L,
            mimeType = "application/pdf",
            createdAtEpochMillis = 100L,
        )

        assertTrue(item.state == UploadQueueState.QUEUED)
        assertFalse(item.hasStartedNetworkTransfer)
    }

    @Test
    fun `only active states are eligible for worker scheduling`() {
        assertTrue(UploadQueuePolicy.isSchedulable(UploadQueueState.QUEUED))
        assertTrue(UploadQueuePolicy.isSchedulable(UploadQueueState.RETRY_WAIT))
        assertFalse(UploadQueuePolicy.isSchedulable(UploadQueueState.PAUSED))
        assertFalse(UploadQueuePolicy.isSchedulable(UploadQueueState.UPLOADED))
        assertFalse(UploadQueuePolicy.isSchedulable(UploadQueueState.CANCELLED))
    }
}
