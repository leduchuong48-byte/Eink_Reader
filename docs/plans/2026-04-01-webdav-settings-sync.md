# WebDAV Settings And Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add shelf-side WebDAV source settings, remote-to-local sync, and remote-linked file/folder deletion for strongly bound source directories.

**Architecture:** Extend the FastAPI backend with persisted WebDAV source configuration, a small sync service layer, and delete-path ownership resolution. Extend the shelf frontend with a settings panel, source CRUD UI, sync actions, and folder delete controls. Keep config under a hidden directory within `STORAGE_PATH` so existing file browsing behavior remains intact.

**Tech Stack:** FastAPI, pytest, vanilla HTML/CSS/JavaScript, a Python WebDAV client library

---

### Task 1: Document and prepare

**Files:**
- Create: `docs/plans/2026-04-01-webdav-settings-sync-design.md`
- Create: `docs/plans/2026-04-01-webdav-settings-sync.md`

**Step 1: Confirm the design content**

Check the confirmed scope against the user-approved design.

**Step 2: Save the design doc**

Write the confirmed design to `docs/plans/2026-04-01-webdav-settings-sync-design.md`.

**Step 3: Save this implementation plan**

Write the execution plan to `docs/plans/2026-04-01-webdav-settings-sync.md`.

### Task 2: Add failing backend tests for source CRUD and validation

**Files:**
- Modify: `tests/test_main.py`

**Step 1: Write failing tests**

Add tests for:

- listing zero sources from a clean storage root
- creating a source
- updating a source
- rejecting overlapping local directory bindings
- deleting a source

**Step 2: Run the focused tests to verify failure**

Run: `pytest tests/test_main.py -k webdav_source -q`

Expected: FAIL because the API routes and config helpers do not exist yet.

**Step 3: Write minimal implementation**

Add persisted source CRUD routes and validation.

**Step 4: Run the focused tests to verify pass**

Run: `pytest tests/test_main.py -k webdav_source -q`

Expected: PASS

### Task 3: Add failing backend tests for sync and recursive delete

**Files:**
- Modify: `tests/test_main.py`

**Step 1: Write failing tests**

Add tests for:

- sync downloads supported remote files into the bound local directory
- sync deletes local files removed from remote
- deleting a bound file deletes the remote file
- deleting a bound directory deletes the remote directory recursively

Use monkeypatching to replace the WebDAV client wrapper with a fake in-memory implementation.

**Step 2: Run the focused tests to verify failure**

Run: `pytest tests/test_main.py -k "webdav_sync or webdav_delete" -q`

Expected: FAIL because sync/delete behavior is not implemented.

**Step 3: Write minimal implementation**

Add sync service, ownership resolution, and recursive delete behavior.

**Step 4: Run the focused tests to verify pass**

Run: `pytest tests/test_main.py -k "webdav_sync or webdav_delete" -q`

Expected: PASS

### Task 4: Implement backend routes and dependency updates

**Files:**
- Modify: `app/main.py`
- Modify: `requirements.txt`

**Step 1: Add dependency**

Add a maintained WebDAV client package to `requirements.txt`.

**Step 2: Implement config storage helpers**

Add hidden config directory setup, source load/save helpers, and local binding validation.

**Step 3: Implement API routes**

Add:

- `GET /api/webdav/sources`
- `POST /api/webdav/sources`
- `PUT /api/webdav/sources/{id}`
- `DELETE /api/webdav/sources/{id}`
- `POST /api/webdav/sources/{id}/sync`
- `POST /api/webdav/sync-all`

**Step 4: Extend delete behavior**

Allow recursive deletion of directories and remote-linked deletion for bound paths.

**Step 5: Run backend tests**

Run: `pytest tests/test_main.py -q`

Expected: PASS

### Task 5: Add failing frontend behavior checks by inspection and wire UI

**Files:**
- Modify: `static/index.html`
- Modify: `static/js/main.js`
- Modify: `static/css/eink.css`

**Step 1: Add shelf settings structure**

Add the settings trigger and modal markup without disturbing current modified layout.

**Step 2: Implement source management UI**

Add source list rendering, form state, CRUD submit handlers, and sync actions in `static/js/main.js`.

**Step 3: Implement folder delete UI**

Add delete controls for directories, updated confirmation messaging, and tree refresh behavior.

**Step 4: Add styles**

Add only the CSS needed for the settings panel, source cards, forms, and status states.

**Step 5: Perform static verification**

Check that all new element IDs used in JS exist in HTML and that route strings match backend paths.

### Task 6: End-to-end verification and handoff

**Files:**
- Modify: `README.md`
- Modify: `README_en.md`

**Step 1: Update docs**

Document WebUI WebDAV settings and sync/delete behavior in both READMEs.

**Step 2: Install dependencies and run tests**

Run:

- `pip install -r requirements.txt`
- `pytest tests/test_main.py -q`

Expected: PASS

**Step 3: Sync changes back to the target host**

Copy only the changed files back to `/vol1/1000/services/docker/Eink_Reader` on `n97`.

**Step 4: Re-run tests on `n97` if the environment supports them**

Run the same test command on the target host and record the result.
