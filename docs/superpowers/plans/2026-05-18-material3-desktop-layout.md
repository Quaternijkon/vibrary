# Material 3 Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Windows desktop client so users can immediately see unfinished setup steps and manage all configuration in one Material 3 style configuration center.

**Architecture:** Keep the existing React, Vite, Electron, and backend API stack. Move renderer state orchestration into `App.tsx`, extract setup/status decisions into pure functions for tests, keep pages focused by workflow, and replace the old visual system with Material 3 inspired CSS tokens using Google blue, red, yellow, and green as restrained semantic accents.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Electron, lucide-react.

---

### Task 1: Add Pure UI Model Tests

**Files:**
- Create: `desktop/src/renderer/dashboardModel.ts`
- Create: `desktop/src/renderer/__tests__/dashboardModel.test.ts`
- Modify: `desktop/src/renderer/__tests__/uiCopy.test.ts`

- [ ] **Step 1: Write failing tests**

Test that the setup checklist marks stopped services, no assets, no paired phone, queued index jobs, and missing Qdrant points as actionable. Test that navigation copy uses Chinese labels and includes the centralized configuration page.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- --reporter=verbose src/renderer/__tests__/dashboardModel.test.ts src/renderer/__tests__/uiCopy.test.ts`

Expected: Fail because `dashboardModel.ts` does not exist and copy still uses the old page names.

- [ ] **Step 3: Implement `dashboardModel.ts`**

Add `buildSetupSteps`, `buildOverviewStats`, and `getNavigationPages` helpers. They should consume the existing desktop snapshot, library assets, devices, upload queue, index queue, and index status data.

- [ ] **Step 4: Run focused tests again**

Run: `npm test -- --reporter=verbose src/renderer/__tests__/dashboardModel.test.ts src/renderer/__tests__/uiCopy.test.ts`

Expected: Pass.

### Task 2: Rebuild Renderer Structure

**Files:**
- Create: `desktop/src/renderer/App.tsx`
- Modify: `desktop/src/renderer/main.tsx`
- Modify: `desktop/src/renderer/uiCopy.ts`

- [ ] **Step 1: Move app orchestration to `App.tsx`**

Keep backend refresh, import, search, pairing, settings update, cache clear, process index, and rebuild index behavior. Change page IDs to `overview`, `library`, `import`, `search`, `devices`, `config`, and `tasks`.

- [ ] **Step 2: Make the overview page a product checklist**

Render setup steps with status chips, details, and action buttons that navigate to the relevant page or call the relevant command.

- [ ] **Step 3: Centralize configuration**

Move LAN, discovery, auto-index, embedding provider, retrieval mode, HNSW, index rebuild, Qdrant collections, cache, and data path into one `配置中心` page.

- [ ] **Step 4: Keep operational queues separate**

Move upload and index queues to the `任务` page so the overview stays focused on next actions.

### Task 3: Apply Material 3 Visual System

**Files:**
- Modify: `desktop/src/renderer/styles.css`

- [ ] **Step 1: Replace old CSS tokens**

Use Material 3 inspired `surface`, `surface-container`, `primary`, `secondary-container`, `outline`, `error`, and semantic Google brand colors.

- [ ] **Step 2: Rework layout**

Use a fixed navigation rail/drawer on desktop, a responsive top navigation on small widths, high-density but readable content bands, and clear action rows.

- [ ] **Step 3: Polish controls**

Use filled buttons for primary actions, outlined buttons for secondary actions, tonal status chips, segmented controls, toggles, and stable card dimensions.

### Task 4: Version and Verification

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/package-lock.json`
- Modify: `backend/pyproject.toml`
- Modify: `backend/src/vibrary_backend/__init__.py`
- Modify: `backend/src/vibrary_backend/api.py`
- Modify: `android/app/build.gradle.kts`
- Modify: `docs/USER_MANUAL_zh-CN.md`

- [ ] **Step 1: Bump version**

Bump from `0.1.8` to `0.1.9` and Android versionCode from `9` to `10`.

- [ ] **Step 2: Run verification**

Run desktop tests, typecheck, and build:

```powershell
npm test -- --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true --poolOptions.forks.isolate=false
npm run typecheck
npm run build
```

Expected: All pass.

- [ ] **Step 3: Commit and push**

Commit with `feat: redesign desktop material layout` and push to `origin/main`.
