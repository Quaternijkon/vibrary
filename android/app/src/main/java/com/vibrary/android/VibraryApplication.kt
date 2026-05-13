package com.vibrary.android

import android.app.Application
import com.vibrary.android.data.AppDatabase

class VibraryApplication : Application() {
    val database: AppDatabase by lazy { AppDatabase.create(this) }
}
