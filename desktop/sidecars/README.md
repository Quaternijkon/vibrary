# Sidecar Binaries

The portable Windows package expects these runtime files:

```text
sidecars/
  backend/
    backend.exe
    <PyInstaller runtime files>
  qdrant/
    qdrant.exe
```

`backend.exe` is produced from the Python backend package for release builds.
`qdrant.exe` is the Windows Qdrant server binary. They are generated local
build outputs and are not committed to the source repository.

Run `.\scripts\build_release.ps1` from the repository root to build
`backend.exe`, download the official Windows x64 Qdrant binary, stage this
layout, and then build the Electron portable executable.
