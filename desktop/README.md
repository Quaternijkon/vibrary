# Vibrary Desktop

This folder contains the Windows Electron + React + TypeScript shell for Vibrary. It is intentionally scoped to `desktop/`; the backend and Android projects are owned by separate slices.

## Responsibilities

- Electron main process owns sidecar lifecycle for `qdrant.exe` and `backend.exe`.
- Qdrant is configured through environment variables to bind only to
  `127.0.0.1` and requires a generated API key. The desktop app prefers port
  `6333`; if it is occupied, the main process selects the next available
  localhost port and passes that URL to `backend.exe`.
- The backend listens on `127.0.0.1` by default. LAN binding requires
  `VIBRARY_ENABLE_LAN=1` or an explicit `VIBRARY_BACKEND_HOST`.
- The renderer receives a narrow IPC API through `preload.ts`. It can inspect service status and ask the main process to open native file/folder pickers, but it cannot spawn arbitrary processes.
- Data paths support portable mode. If `portable.flag` exists next to the executable, data goes to `<app-dir>/portable-data`; otherwise data goes to `%LOCALAPPDATA%/Vibrary`.

## Expected Sidecar Layout

The release script stages sidecars under `desktop/sidecars/`, and
`electron-builder` places them under Electron resources:

```text
resources/
  sidecars/
    qdrant/
      qdrant.exe
    backend/
      backend.exe
      <PyInstaller runtime files>
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
enabled. Qdrant remains bound to `127.0.0.1` only, even when the selected port
is not `6333`. LAN clients must use bearer-token authentication obtained from
the pairing flow.

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

For a full runnable Windows package, use the repository release script instead
of invoking `electron-builder` directly:

```powershell
cd ..
.\scripts\build_release.ps1
```

That script creates `backend.exe`, downloads `qdrant.exe`, builds the portable
desktop executable, and copies the final artifact to `release/desktop/`.
