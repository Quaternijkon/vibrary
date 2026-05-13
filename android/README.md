# Vibrary Android MVP

This directory contains the Android client for Vibrary.

## Stack

- Kotlin
- Jetpack Compose + Material 3
- Room for local state
- WorkManager for upload queue execution
- Retrofit + OkHttp for the Windows backend API
- Android Storage Access Framework for file and folder grants

## Build Prerequisites

- JDK 17
- Android SDK Platform 35
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing at the Android SDK

The repository includes the Gradle wrapper, so a system Gradle install is not
required.

```powershell
cd android
$env:ANDROID_HOME='C:\Users\17293\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon
```

## Implemented MVP Boundaries

- Room database `vibrary-local.db` with:
  - `local_sources`
  - `upload_queue`
  - `local_asset_refs`
  - `cache_entries`
  - `paired_servers`
- Compose UI entry points for pairing, file/folder selection, queue status,
  search, result opening, and cache cleanup.
- Pairing claim endpoint support. The resulting bearer token is stored in
  `paired_servers` and used for all backend calls.
- SAF abstraction for file and folder selection, persistable URI permission,
  and cancellable folder enumeration.
- Selection persistence creates `upload_queue` records and schedules
  `UploadWorker` through WorkManager.
- `UploadWorker` reads the SAF source as a stream, computes SHA-256, performs
  preflight, skips already received chunks, uploads chunks with per-chunk
  SHA-256 validation, completes the upload, records a `source_original` local
  asset ref, and syncs that ref to the backend.
- Source-aware result handling:
  - `local_reference` opens a local SAF reference when available.
  - Local open failure reports revoked permission and falls back to cache
    download.
  - `download_to_cache` writes under app cache and includes the authenticated
    `device_id` query binding required by the backend.
  - Downloaded cache files are recorded in `cache_entries`, mapped into
    `local_asset_refs`, and synced back to the backend as `cache_copy`.
- Cache cleanup only allows app-owned cache entry kinds and also checks resolved
  paths remain inside `context.cacheDir`.
