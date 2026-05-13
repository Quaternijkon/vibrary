# Sidecar Binaries

The portable Windows package expects these runtime files:

```text
sidecars/
  backend/backend.exe
  qdrant/qdrant.exe
```

`backend.exe` is produced from the Python backend package for release builds.
`qdrant.exe` is the Windows Qdrant server binary. They are not committed to the
source repository.
