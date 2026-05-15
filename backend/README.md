# Vibrary Backend

This backend is the Windows-only service layer for the Vibrary MVP. Android and
the desktop renderer talk to this API; neither client talks to Qdrant directly.
It is the backend-core boundary of the project: research/indexing/library logic
lives here, while desktop and Android client engineering code lives outside this
package.

## Responsibilities

- Maintain the SQLite schema for assets, versions, library copies, device refs,
  upload jobs, upload chunks, index jobs, Qdrant point metadata, and cache entries.
- Copy every indexed file into the Windows library before indexing.
- Accept resumable chunk uploads from Android and import completed uploads into
  the library.
- Queue indexing jobs, embed text/image inputs with FastEmbed on the production
  Qdrant path, upsert versioned points through the vector-store adapter, and
  keep SQLite metadata for recovery and snippets.
- For images, maintain two Qdrant collections: raw image vectors in
  `image_semantic_v1` and bilingual visual-label text vectors in
  `image_labels_v1`. This keeps Chinese visual searches such as `猴子` on the
  Qdrant path instead of falling back to filename or SQLite scans.
- Resolve search results through local source/cache/library replica rules before
  deciding whether a file should be downloaded or streamed.
- Clear only app-owned cache files; source originals and library copies are not
  cache and are never deleted by cache cleanup.

## Development

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .\backend
.\.venv\Scripts\python -m unittest discover backend/tests
.\.venv\Scripts\vibrary-backend
```

The core test suite does not require a running Qdrant process. API security
tests require FastAPI/TestClient dependencies; if the default Python environment
does not contain them, create a temporary venv and run:

```powershell
$venv = Join-Path $env:TEMP 'vibrary-api-test-venv'
py -3.13 -m venv $venv
& "$venv\Scripts\python.exe" -m pip install 'fastapi>=0.111,<1' 'httpx>=0.27,<1' 'pydantic>=2.7,<3'
& "$venv\Scripts\python.exe" -m unittest backend.tests.test_api_security -v
```

The production adapter enforces parsed `127.0.0.1` Qdrant URLs, rejects
userinfo host spoofing, uses the sidecar HTTP API for collection creation,
point upsert, and vector search, and loads FastEmbed models from the configured
models directory.

`GET /v1/search/diagnostics` reports whether the active store is Qdrant,
collection point counts, and the embedding profiles recorded in SQLite. It is
intended for checking whether a search result came from the expected Qdrant
collections.

## Sidecar Environment

The packaged Electron shell passes these variables to `backend.exe`:

```text
VIBRARY_DATA_DIR
VIBRARY_BACKEND_HOST
VIBRARY_BACKEND_PORT
VIBRARY_PUBLIC_URL
VIBRARY_QDRANT_URL
VIBRARY_QDRANT_API_KEY
```

`VIBRARY_BACKEND_HOST=0.0.0.0` allows Android LAN access to the backend API.
Remote clients must pair first and then send `Authorization: Bearer <token>`.
Qdrant must stay at `127.0.0.1`.

## Building backend.exe

The repository-level release script builds this package with PyInstaller and
stages the full onedir output where the desktop app expects it:

```powershell
.\scripts\build_release.ps1 -SkipDesktop -SkipAndroid
```

The staged sidecar is written to:

```text
desktop/sidecars/backend/backend.exe
```
