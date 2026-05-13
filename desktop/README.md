# Vibrary Desktop

This folder contains the Windows Electron + React + TypeScript shell for Vibrary. It is intentionally scoped to `desktop/`; the backend and Android projects are owned by separate slices.

## Responsibilities

- Electron main process owns sidecar lifecycle for `qdrant.exe` and `backend.exe`.
- Qdrant is configured through environment variables to bind only to `127.0.0.1:6333` and requires a generated API key.
- The backend listens on `127.0.0.1` by default. LAN binding requires
  `VIBRARY_ENABLE_LAN=1` or an explicit `VIBRARY_BACKEND_HOST`.
- The renderer receives a narrow IPC API through `preload.ts`. It can inspect service status and ask the main process to open native file/folder pickers, but it cannot spawn arbitrary processes.
- Data paths support portable mode. If `portable.flag` exists next to the executable, data goes to `<app-dir>/portable-data`; otherwise data goes to `%LOCALAPPDATA%/Vibrary`.

## Expected Sidecar Layout

Packaged builds should place sidecars under Electron resources:

```text
resources/
  sidecars/
    qdrant/
      qdrant.exe
    backend/
      backend.exe
```

The backend receives these environment variables:

```text
VIBRARY_DATA_DIR
VIBRARY_BACKEND_HOST
VIBRARY_BACKEND_PORT
VIBRARY_PUBLIC_URL
VIBRARY_QDRANT_URL
VIBRARY_QDRANT_API_KEY
```

The backend may bind to `0.0.0.0` for Android LAN access only when explicitly
enabled. Qdrant remains bound to `127.0.0.1` only. LAN clients must use
bearer-token authentication obtained from the pairing flow.

The desktop renderer should call backend HTTP APIs for library import, queue status, search, devices, cache, models, and settings. IPC is reserved for local desktop capabilities such as sidecar status and user file/folder selection.

## Development

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run dist:portable
```

For interactive development, run Vite with `npm run dev` and launch Electron against `http://127.0.0.1:5173` after compiling the main/preload TypeScript.
