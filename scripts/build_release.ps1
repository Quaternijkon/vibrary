param(
  [string]$QdrantVersion = "latest",
  [switch]$SkipTests,
  [switch]$SkipQdrantDownload,
  [switch]$SkipDesktop,
  [switch]$SkipAndroid
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$BuildRoot = Join-Path $RepoRoot ".build"
$ReleaseRoot = Join-Path $RepoRoot "release"
$BackendVenv = Join-Path $BuildRoot "backend-venv"
$BackendDist = Join-Path $BuildRoot "backend-dist"
$PyInstallerWork = Join-Path $BuildRoot "pyinstaller-work"
$BackendSidecar = Join-Path $RepoRoot "desktop\sidecars\backend"
$QdrantSidecar = Join-Path $RepoRoot "desktop\sidecars\qdrant"
$RootDesktopRelease = Join-Path $ReleaseRoot "desktop"
$RootAndroidRelease = Join-Path $ReleaseRoot "android"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Get-FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-InRepo([string]$Path) {
  $full = Get-FullPath $Path
  $root = Get-FullPath $RepoRoot
  if ($full -ne $root -and -not $full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "Refusing to operate outside repository: $full"
  }
  return $full
}

function Get-RelativePath([string]$BasePath, [string]$ChildPath) {
  $base = Get-FullPath $BasePath
  $child = Get-FullPath $ChildPath
  if (-not $base.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $base = $base + [System.IO.Path]::DirectorySeparatorChar
  }
  if (-not $child.StartsWith($base)) {
    throw "Path is not under base path: $child"
  }
  return $child.Substring($base.Length)
}

function Reset-Directory([string]$Path) {
  $full = Assert-InRepo $Path
  if (Test-Path -LiteralPath $full) {
    Remove-Item -LiteralPath $full -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $full | Out-Null
  return $full
}

function Ensure-Directory([string]$Path) {
  $full = Assert-InRepo $Path
  New-Item -ItemType Directory -Force -Path $full | Out-Null
  return $full
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory = $RepoRoot) {
  Write-Host "+ $File $($Arguments -join ' ')"
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $File $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Get-PythonLauncherArgs() {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    foreach ($version in @("-3.13", "-3.12", "-3.11")) {
      & $py.Source $version -c "import sys; raise SystemExit(0 if sys.platform == 'win32' else 1)" *> $null
      if ($LASTEXITCODE -eq 0) {
        return @($py.Source, $version)
      }
    }
    & $py.Source -c "import sys; raise SystemExit(0 if sys.platform == 'win32' else 1)" *> $null
    if ($LASTEXITCODE -eq 0) {
      return @($py.Source)
    }
  }
  $python = Get-Command python -ErrorAction Stop
  & $python.Source -c "import sys; raise SystemExit(0 if sys.platform == 'win32' else 1)" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "No Windows Python runtime found for backend executable packaging"
  }
  return @($python.Source)
}

function Invoke-Python([string[]]$Arguments) {
  $launcher = Get-PythonLauncherArgs
  $file = $launcher[0]
  $prefix = @()
  if ($launcher.Length -gt 1) {
    $prefix = $launcher[1..($launcher.Length - 1)]
  }
  Invoke-Checked $file ($prefix + $Arguments)
}

function Get-VenvPython() {
  return Join-Path $BackendVenv "Scripts\python.exe"
}

function Build-BackendSidecar() {
  Write-Step "Building backend.exe sidecar with PyInstaller"
  Ensure-Directory $BuildRoot | Out-Null
  if (-not (Test-Path -LiteralPath (Get-VenvPython))) {
    if (Test-Path -LiteralPath $BackendVenv) {
      Remove-Item -LiteralPath (Assert-InRepo $BackendVenv) -Recurse -Force
    }
    Invoke-Python @("-m", "venv", $BackendVenv)
  }

  $venvPython = Get-VenvPython
  Invoke-Checked $venvPython @("-m", "pip", "install", "--upgrade", "pip")
  Invoke-Checked $venvPython @("-m", "pip", "install", "-r", (Join-Path $RepoRoot "backend\requirements.txt"), "pyinstaller>=6.0,<7")
  Invoke-Checked $venvPython @("-m", "pip", "install", "-e", (Join-Path $RepoRoot "backend"))

  if (-not $SkipTests) {
    Invoke-Checked $venvPython @("-m", "compileall", "-q", (Join-Path $RepoRoot "backend\src"))
    Invoke-Checked $venvPython @("-m", "unittest", "discover", (Join-Path $RepoRoot "backend\tests"))
  }

  Reset-Directory $BackendDist | Out-Null
  Reset-Directory $PyInstallerWork | Out-Null

  $entryPoint = Join-Path $RepoRoot "backend\packaging\backend_entry.py"
  $backendSrc = Join-Path $RepoRoot "backend\src"
  $pyinstallerArgs = @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--name", "backend",
    "--distpath", $BackendDist,
    "--workpath", $PyInstallerWork,
    "--specpath", $BuildRoot,
    "--paths", $backendSrc,
    "--collect-all", "fastembed",
    "--collect-all", "qdrant_client",
    "--collect-all", "uvicorn",
    "--collect-all", "pydantic",
    "--collect-all", "pydantic_core",
    "--collect-all", "onnxruntime",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan.on",
    $entryPoint
  )
  Invoke-Checked $venvPython $pyinstallerArgs

  $builtBackend = Join-Path $BackendDist "backend\backend.exe"
  if (-not (Test-Path -LiteralPath $builtBackend)) {
    throw "PyInstaller did not produce backend.exe at $builtBackend"
  }

  Reset-Directory $BackendSidecar | Out-Null
  Copy-Item -Path (Join-Path $BackendDist "backend\*") -Destination $BackendSidecar -Recurse -Force
  Write-Host "Backend sidecar ready: $BackendSidecar"
}

function Install-QdrantSidecar() {
  Write-Step "Installing qdrant.exe sidecar"
  if ($SkipQdrantDownload -and -not (Test-Path -LiteralPath (Join-Path $QdrantSidecar "qdrant.exe"))) {
    throw "SkipQdrantDownload was set, but qdrant.exe is missing in $QdrantSidecar"
  }

  if ($SkipQdrantDownload) {
    Write-Host "Using existing qdrant.exe in $QdrantSidecar"
    return
  }

  Ensure-Directory $BuildRoot | Out-Null
  Reset-Directory $QdrantSidecar | Out-Null
  $headers = @{ "User-Agent" = "vibrary-release-builder" }
  $releaseUri = if ($QdrantVersion -eq "latest") {
    "https://api.github.com/repos/qdrant/qdrant/releases/latest"
  } else {
    "https://api.github.com/repos/qdrant/qdrant/releases/tags/$QdrantVersion"
  }
  $release = Invoke-RestMethod -Uri $releaseUri -Headers $headers
  $asset = $release.assets | Where-Object { $_.name -eq "qdrant-x86_64-pc-windows-msvc.zip" } | Select-Object -First 1
  if (-not $asset) {
    throw "Could not find qdrant-x86_64-pc-windows-msvc.zip in release $($release.tag_name)"
  }

  $zipPath = Join-Path $BuildRoot "qdrant-$($release.tag_name).zip"
  $extractPath = Reset-Directory (Join-Path $BuildRoot "qdrant-extract")
  Write-Host "Downloading Qdrant $($release.tag_name): $($asset.browser_download_url)"
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers $headers
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
  $qdrantExe = Get-ChildItem -LiteralPath $extractPath -Recurse -Filter "qdrant.exe" | Select-Object -First 1
  if (-not $qdrantExe) {
    throw "Downloaded Qdrant archive did not contain qdrant.exe"
  }
  Copy-Item -LiteralPath $qdrantExe.FullName -Destination (Join-Path $QdrantSidecar "qdrant.exe") -Force
  Write-Host "Qdrant sidecar ready: $QdrantSidecar"
}

function Build-DesktopPortable() {
  if ($SkipDesktop) {
    Write-Step "Skipping desktop portable build"
    return
  }

  Write-Step "Building Electron portable desktop package"
  $backendExe = Join-Path $BackendSidecar "backend.exe"
  $qdrantExe = Join-Path $QdrantSidecar "qdrant.exe"
  if (-not (Test-Path -LiteralPath $backendExe)) {
    throw "Missing backend sidecar: $backendExe"
  }
  if (-not (Test-Path -LiteralPath $qdrantExe)) {
    throw "Missing Qdrant sidecar: $qdrantExe"
  }

  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "desktop\node_modules"))) {
    Invoke-Checked "npm" @("ci") (Join-Path $RepoRoot "desktop")
  }

  if (-not $SkipTests) {
    Invoke-Checked "npm" @("test", "--", "--reporter=verbose", "--pool=forks", "--poolOptions.forks.singleFork=true", "--poolOptions.forks.isolate=false") (Join-Path $RepoRoot "desktop")
    Invoke-Checked "npm" @("run", "typecheck") (Join-Path $RepoRoot "desktop")
  }
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  if (-not $env:ELECTRON_BUILDER_BINARIES_MIRROR) {
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
  }
  Invoke-Checked "npm" @("run", "dist:portable") (Join-Path $RepoRoot "desktop")

  Reset-Directory $RootDesktopRelease | Out-Null
  $portable = Get-ChildItem -LiteralPath (Join-Path $RepoRoot "desktop\release") -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $portable) {
    throw "electron-builder did not produce a portable .exe"
  }
  Copy-Item -LiteralPath $portable.FullName -Destination (Join-Path $RootDesktopRelease $portable.Name) -Force
  Write-Host "Desktop portable ready: $(Join-Path $RootDesktopRelease $portable.Name)"
}

function Build-AndroidApk() {
  if ($SkipAndroid) {
    Write-Step "Skipping Android APK build"
    return
  }

  Write-Step "Building Android debug APK"
  $sdkDefault = "C:\Users\17293\AppData\Local\Android\Sdk"
  if (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath $sdkDefault)) {
    $env:ANDROID_HOME = $sdkDefault
  }
  if (-not $env:ANDROID_SDK_ROOT -and $env:ANDROID_HOME) {
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  }

  $gradleArgs = if ($SkipTests) {
    @("assembleDebug", "--no-daemon", "--console=plain")
  } else {
    @("testDebugUnitTest", "assembleDebug", "--no-daemon", "--console=plain")
  }
  Invoke-Checked ".\gradlew.bat" $gradleArgs (Join-Path $RepoRoot "android")

  Reset-Directory $RootAndroidRelease | Out-Null
  $apk = Join-Path $RepoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
  if (-not (Test-Path -LiteralPath $apk)) {
    throw "Gradle did not produce debug APK at $apk"
  }
  Copy-Item -LiteralPath $apk -Destination (Join-Path $RootAndroidRelease "Vibrary-debug.apk") -Force
  Write-Host "Android APK ready: $(Join-Path $RootAndroidRelease "Vibrary-debug.apk")"
}

function Write-ReleaseManifest() {
  Write-Step "Writing release manifest and checksums"
  Ensure-Directory $ReleaseRoot | Out-Null
  $manual = Join-Path $RepoRoot "docs\USER_MANUAL_zh-CN.md"
  if (Test-Path -LiteralPath $manual) {
    Copy-Item -LiteralPath $manual -Destination (Join-Path $ReleaseRoot "Vibrary_User_Manual_zh-CN.md") -Force
  }
  $files = Get-ChildItem -LiteralPath $ReleaseRoot -Recurse -File | Sort-Object FullName
  $manifest = @()
  $checksumLines = @()
  foreach ($file in $files) {
    if ($file.Name -in @("manifest.json", "SHA256SUMS.txt")) {
      continue
    }
    $relative = Get-RelativePath $ReleaseRoot $file.FullName
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest += [pscustomobject]@{
      path = $relative.Replace("\", "/")
      bytes = $file.Length
      sha256 = $hash
    }
    $checksumLines += "$hash  $($relative.Replace("\", "/"))"
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $ReleaseRoot "manifest.json") -Encoding UTF8
  $checksumLines | Set-Content -Path (Join-Path $ReleaseRoot "SHA256SUMS.txt") -Encoding ASCII
}

Build-BackendSidecar
Install-QdrantSidecar
Build-DesktopPortable
Build-AndroidApk
Write-ReleaseManifest

Write-Host ""
Write-Host "Release artifacts are in: $ReleaseRoot"
