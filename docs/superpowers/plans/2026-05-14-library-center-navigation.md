# Library Center Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a shared资料中心 and true navigation experience for Windows and Android clients.

**Architecture:** The FastAPI backend remains the only library, embedding, indexing, and Qdrant owner. Desktop and Android consume a new library assets API and render richer product pages around the same Asset model.

**Tech Stack:** Python FastAPI + SQLite, Electron + React + TypeScript, Kotlin + Jetpack Compose + Retrofit.

---

### Task 1: Backend Library Center API

**Files:**
- Modify: `backend/src/vibrary_backend/library.py`
- Modify: `backend/src/vibrary_backend/api.py`
- Test: `backend/tests/test_backend_core.py`

- [x] Add a library listing method that joins `assets`, `library_files`, `device_asset_refs`, `devices`, and latest `index_jobs`.
- [x] Return title, MIME type, size, content hash, source devices, library availability, index status, thumbnail URL, content URL, and requesting-device availability.
- [x] Add `GET /v1/library/assets`.
- [x] Implement `GET /v1/assets/{asset_id}/thumbnail` for image assets backed by a library copy.
- [x] Add tests for list visibility and thumbnail behavior.

### Task 2: Desktop Navigation and Library Center

**Files:**
- Modify: `desktop/src/renderer/backendClient.ts`
- Modify: `desktop/src/renderer/backendData.ts`
- Modify: `desktop/src/renderer/uiCopy.ts`
- Modify: `desktop/src/renderer/main.tsx`
- Modify: `desktop/src/renderer/styles.css`
- Test: `desktop/src/renderer/__tests__/backendClient.test.ts`
- Test: `desktop/src/renderer/__tests__/backendData.test.ts`
- Test: `desktop/src/renderer/__tests__/uiCopy.test.ts`

- [x] Add TypeScript types and client method for `/v1/library/assets`.
- [x] Include library assets in dashboard refresh.
- [x] Replace anchor navigation with active page state.
- [x] Add pages for home, library center, import, search, transfer, devices, and settings.
- [x] Render image thumbnails in library center and search results with stable dimensions.
- [x] Update CSS to a more modern product shell with responsive behavior.
- [x] Add tests for the new client/data/copy behavior.

### Task 3: Android Library Center

**Files:**
- Modify: `android/app/build.gradle.kts`
- Modify: `android/app/src/main/java/com/vibrary/android/network/VibraryApi.kt`
- Modify: `android/app/src/main/java/com/vibrary/android/MainActivity.kt`
- Modify: `android/app/src/main/java/com/vibrary/android/ui/VibraryApp.kt`
- Test: `android/app/src/test/java/com/vibrary/android/ui/ChineseUiCopyTest.kt`
- Add: `android/app/src/test/java/com/vibrary/android/network/LibraryAssetsDtoTest.kt`

- [x] Add library assets DTOs and Retrofit method.
- [x] Add UI state for library assets and a refresh action.
- [x] Add a资料中心 tab that shows list items and thumbnails.
- [x] Load thumbnails through authenticated backend URLs.
- [x] Add tests for DTO serialization and UI copy.

### Task 4: Version, Docs, Build, and Verification

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/src/vibrary_backend/api.py`
- Modify: `desktop/package.json`
- Modify: `android/app/build.gradle.kts`
- Modify: `docs/USER_MANUAL_zh-CN.md`

- [x] Bump version to `0.1.5`.
- [x] Update user manual with资料中心 and navigation behavior.
- [x] Run backend tests.
- [x] Run desktop tests and typecheck.
- [x] Run Android unit tests and build APK.
- [x] Rebuild release artifacts when packaging inputs pass.

