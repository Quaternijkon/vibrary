# Vibrary

Vibrary is a local-first library and search MVP based on
`qdrant_android_windows_agent_plan_v2.md`.

The system is split into three deliverables:

- `backend/`: Windows-only FastAPI service with SQLite persistence, asset
  lifecycle, resumable upload import, Qdrant vector-store adapter integration,
  source-aware retrieval, bearer-token pairing, and safe cache cleanup.
- `desktop/`: Electron + React + TypeScript Windows client shell that manages
  `qdrant.exe` and `backend.exe` sidecars and exposes only narrow IPC to the
  renderer.
- `android/`: Kotlin + Jetpack Compose Android app with Room entities,
  WorkManager upload scheduling, SAF file/folder selection, Retrofit pairing
  and search APIs, source-aware result handling, and cache cleanup policy.

## Verification

Backend tests:

```powershell
python -m unittest discover backend/tests

$venv = Join-Path $env:TEMP 'vibrary-api-test-venv'
py -3.13 -m venv $venv
& "$venv\Scripts\python.exe" -m pip install 'fastapi>=0.111,<1' 'httpx>=0.27,<1' 'pydantic>=2.7,<3'
& "$venv\Scripts\python.exe" -m unittest backend.tests.test_api_security -v
```

Desktop tests and build:

```powershell
cd desktop
npm test -- --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true --poolOptions.forks.isolate=false
npm run typecheck
npm run build
```

Android tests and debug build:

```powershell
cd android
$env:ANDROID_HOME='C:\Users\17293\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon
```

## Runtime Notes

- Qdrant runs only as a Windows sidecar bound to `127.0.0.1:6333` with an API key.
- The desktop backend listens on `127.0.0.1` by default. Set
  `VIBRARY_ENABLE_LAN=1` or `VIBRARY_BACKEND_HOST` only when LAN access is
  intentionally enabled.
- Android only talks to the Windows backend API, using a bearer token obtained
  from the pairing flow.
- Files must be copied into the Windows library before indexing.
- Production indexing uses FastEmbed-backed text and image embedding providers
  before upserting into Qdrant. The in-memory vector store is used by unit tests.
- Cache cleanup only deletes application-owned cache files. It does not delete
  Android SAF source originals, Windows external source originals, library
  copies, models, SQLite data, or Qdrant storage.
