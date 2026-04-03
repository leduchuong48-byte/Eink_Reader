# WebDAV Settings And Sync Design

## Context

The shelf page currently lists local `.txt` and `.epub` files under `STORAGE_PATH`. There is no settings entry on the shelf page and no backend support for managing WebDAV book sources.

The confirmed scope is:

- add a unified settings entry (`⚙️`) on the shelf page
- manage multiple WebDAV book sources from the WebUI
- support source add, edit, delete, single-source sync, and sync-all
- map each source to one exclusive local directory under `STORAGE_PATH`
- mirror remote `.txt` and `.epub` files into the mapped local directory
- delete local files when the remote source no longer has them
- add file and folder deletion on the shelf page
- when deleting content under a bound local directory, delete both the local item and the remote WebDAV item
- use directory-level strong binding: a mapped local directory is fully owned by its source

## Architecture

The backend remains the source of truth for source configuration and sync execution. WebDAV source definitions and sync metadata will be stored in a hidden config directory under `STORAGE_PATH` so they are not shown in the shelf tree. The frontend uses the new API to manage source records and trigger sync.

Each WebDAV source binds one remote directory to one local directory. Sync is a one-way mirror from remote to local for supported book files, with directory creation and removal support. Deletion from the shelf will resolve whether the target path belongs to a bound directory and, if so, delete the matching remote item before removing the local item.

## Data Model

Store config under `STORAGE_PATH/.eink_box/`:

- `webdav_sources.json`
  - source `id`
  - `name`
  - `base_url`
  - `username`
  - `password`
  - `remote_path`
  - `local_path`
  - `enabled`

Rules:

- `local_path` is relative to `STORAGE_PATH`
- two sources cannot bind overlapping local directories
- hidden config directory must be excluded from file listings

## Sync Semantics

For each enabled source:

1. connect to WebDAV
2. recursively list the configured remote directory
3. create local directories as needed
4. download new or changed `.txt` and `.epub` files
5. delete local files that no longer exist remotely within the bound directory
6. delete now-empty local directories that no longer exist remotely

Comparison will use remote metadata when available and otherwise fall back to downloading when needed.

## Delete Semantics

- Shelf page supports deleting both files and directories.
- If the target is outside any bound local directory, only local deletion happens.
- If the target is inside a bound local directory, delete the remote counterpart first, then remove the local file or directory recursively.
- Directory delete uses a strong confirmation because it may delete remote WebDAV content.

## Frontend

Shelf page changes:

- add `⚙️` button to the header
- add a settings modal/panel
- add WebDAV source management form and source list
- expose `立即同步` per source and `全部同步`
- show operation status and errors
- add delete actions for directories in the tree

The reader page already has a settings concept; shelf settings should reuse the same visual language but stay local to `index.html`.

## Testing

Backend tests will cover:

- source CRUD
- invalid overlapping local directory validation
- sync creating local files from a mocked WebDAV client
- sync deleting local files removed from remote
- deleting a synced file removes both local and remote
- deleting a synced directory removes both local and remote recursively
- hidden config directory does not appear in listings
