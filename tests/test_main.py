import importlib
import io
from pathlib import Path
from typing import Optional

import pytest
from fastapi.testclient import TestClient


def _collect_file_paths(nodes: list[dict]) -> set[str]:
    paths: set[str] = set()
    for node in nodes:
        if node.get("type") == "file":
            node_path = node.get("path")
            if isinstance(node_path, str):
                paths.add(node_path)
    return paths


@pytest.fixture()
def client_and_storage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[TestClient, Path, object]:
    monkeypatch.setenv("STORAGE_PATH", str(tmp_path))
    import app.main as main_module

    importlib.reload(main_module)
    client = TestClient(main_module.app)
    return client, tmp_path, main_module


class FakeWebDavClient:
    def __init__(self, entries: dict[str, dict[str, object]]) -> None:
        self.entries = self._normalize_entries(entries)
        self.removed_paths: list[str] = []

    def _normalize_entries(
        self, entries: dict[str, dict[str, object]]
    ) -> dict[str, dict[str, object]]:
        normalized: dict[str, dict[str, object]] = {}
        for path, payload in entries.items():
            normalized[self._normalize_path(path)] = dict(payload)
        return normalized

    def _normalize_path(self, path: str) -> str:
        cleaned = "/" + str(path or "/").strip("/")
        return cleaned if cleaned != "//" else "/"

    def _parent_path(self, path: str) -> Optional[str]:
        normalized = self._normalize_path(path)
        if normalized == "/":
            return None
        parent = normalized.rsplit("/", 1)[0]
        return parent or "/"

    def _entry_name(self, path: str) -> str:
        normalized = self._normalize_path(path)
        return normalized.rsplit("/", 1)[-1]

    def exists(self, path: str) -> bool:
        return self._normalize_path(path) in self.entries

    def mkdir(self, path: str) -> None:
        normalized = self._normalize_path(path)
        if normalized in self.entries:
            return
        parent = self._parent_path(normalized)
        if parent and parent not in self.entries:
            self.mkdir(parent)
        self.entries[normalized] = {"isdir": True, "name": self._entry_name(normalized)}

    def ls(
        self, path: str, detail: bool = True, allow_listing_resource: bool = True
    ) -> list[dict[str, object]]:
        normalized = self._normalize_path(path)
        if normalized not in self.entries:
            raise FileNotFoundError(normalized)

        results: list[dict[str, object]] = []
        if allow_listing_resource:
            results.append(self._to_detail(normalized))

        for child_path in sorted(self.entries):
            if child_path == normalized:
                continue
            if self._parent_path(child_path) != normalized:
                continue
            results.append(self._to_detail(child_path))

        if detail:
            return results
        return [str(item["name"]) for item in results]

    def info(self, path: str) -> dict[str, object]:
        normalized = self._normalize_path(path)
        if normalized not in self.entries:
            raise FileNotFoundError(normalized)
        return self._to_detail(normalized)

    def download_fileobj(self, from_path: str, file_obj: io.BytesIO, **_: object) -> None:
        normalized = self._normalize_path(from_path)
        entry = self.entries[normalized]
        content = entry.get("content", b"")
        if not isinstance(content, bytes):
            raise TypeError("content must be bytes")
        file_obj.write(content)

    def remove(self, path: str) -> None:
        normalized = self._normalize_path(path)
        self.removed_paths.append(normalized)
        targets = [
            entry_path
            for entry_path in list(self.entries)
            if entry_path == normalized or entry_path.startswith(f"{normalized}/")
        ]
        for target in targets:
            self.entries.pop(target, None)

    def _to_detail(self, path: str) -> dict[str, object]:
        entry = self.entries[self._normalize_path(path)]
        detail = {
            "name": self._entry_name(path),
            "path": self._normalize_path(path),
            "isdir": bool(entry.get("isdir", False)),
            "size": int(entry.get("size", len(entry.get("content", b"")))),
            "etag": entry.get("etag"),
            "modified": entry.get("modified"),
        }
        return detail


def _create_source_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "NAS 书库",
        "base_url": "https://api.openai.com/v1",
        "username": "reader",
        "password": "secret",
        "remote_path": "/books",
        "local_path": "imports/webdav",
        "enabled": True,
    }
    payload.update(overrides)
    return payload


def test_list_files_root_lazy_and_hidden_directory_filter(
    client_and_storage: tuple[TestClient, Path, object],
) -> None:
    client, storage, _ = client_and_storage
    nested = storage / "books"
    nested.mkdir(parents=True, exist_ok=True)
    (storage / "assets").mkdir(parents=True, exist_ok=True)
    (storage / "cache").mkdir(parents=True, exist_ok=True)
    (storage / ".eink_box").mkdir(parents=True, exist_ok=True)

    (nested / "demo.epub").write_bytes(b"epub-binary")
    (nested / "demo.txt").write_text("hello reader", encoding="utf-8")
    (nested / "ignore.jpg").write_bytes(b"jpg")
    (storage / "root.txt").write_text("root file", encoding="utf-8")

    response = client.get("/api/files")
    assert response.status_code == 200

    payload = response.json()
    assert payload["root"] == str(storage)

    dir_paths = {
        node["path"] for node in payload["items"] if node.get("type") == "directory"
    }
    assert "books" in dir_paths
    assert "assets" not in dir_paths
    assert "cache" not in dir_paths
    assert ".eink_box" not in dir_paths

    file_paths = _collect_file_paths(payload["items"])
    assert "root.txt" in file_paths
    assert "books/demo.epub" not in file_paths
    assert "books/demo.txt" not in file_paths
    assert "books/ignore.jpg" not in file_paths

    child_response = client.get("/api/files?path=books")
    assert child_response.status_code == 200
    child_payload = child_response.json()
    child_file_paths = _collect_file_paths(child_payload["items"])
    assert "books/demo.epub" in child_file_paths
    assert "books/demo.txt" in child_file_paths


def test_get_content_for_txt_and_epub(
    client_and_storage: tuple[TestClient, Path, object],
) -> None:
    client, storage, _ = client_and_storage
    (storage / "chapter.txt").write_text("chapter text", encoding="utf-8")
    (storage / "book.epub").write_bytes(b"fake-epub")

    txt_response = client.get("/api/content/chapter.txt?offset=0&limit=10")
    assert txt_response.status_code == 200
    txt_payload = txt_response.json()
    assert txt_payload["type"] == "txt"
    assert txt_payload["content"] == "chapter te"
    assert txt_payload["next_offset"] == 10
    assert txt_payload["total_size"] == len("chapter text".encode("utf-8"))

    epub_response = client.get("/api/content/book.epub")
    assert epub_response.status_code == 200
    assert epub_response.headers["content-type"].startswith("application/epub+zip")


def test_delete_file_then_read_returns_404_and_cover_jpg_state(
    client_and_storage: tuple[TestClient, Path, object],
) -> None:
    client, storage, _ = client_and_storage
    txt_path = storage / "novel.txt"
    cover_path = storage / "novel.jpg"
    txt_path.write_text("delete me", encoding="utf-8")
    cover_path.write_bytes(b"cover")

    delete_response = client.delete("/api/files/novel.txt")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] == "novel.txt"

    read_response = client.get("/api/content/novel.txt")
    assert read_response.status_code == 404
    assert not txt_path.exists()
    assert cover_path.exists()


def test_path_traversal_is_blocked(
    client_and_storage: tuple[TestClient, Path, object]
) -> None:
    client, _, _ = client_and_storage
    response = client.get("/api/content/%2E%2E/%2E%2E/etc/passwd")
    assert response.status_code == 400
    assert "Path traversal" in response.json()["detail"]


def test_txt_chunking_and_encoding_safety(
    client_and_storage: tuple[TestClient, Path, object],
) -> None:
    client, storage, _ = client_and_storage
    content = "你好世界"
    encoded = content.encode("utf-8")
    (storage / "utf8.txt").write_bytes(encoded)

    first = client.get("/api/content/utf8.txt?offset=0&limit=4")
    assert first.status_code == 200
    first_payload = first.json()
    assert first_payload["content"] == "你"
    assert first_payload["next_offset"] == 3
    assert first_payload["total_size"] == len(encoded)
    assert "�" not in first_payload["content"]

    second = client.get(
        f"/api/content/utf8.txt?offset={first_payload['next_offset']}&limit=4"
    )
    assert second.status_code == 200
    second_payload = second.json()
    assert second_payload["content"] == "好"
    assert second_payload["next_offset"] == 6
    assert second_payload["total_size"] == len(encoded)
    assert "�" not in second_payload["content"]


def test_list_files_pagination(
    client_and_storage: tuple[TestClient, Path, object]
) -> None:
    client, storage, _ = client_and_storage

    for index in range(205):
        (storage / f"book-{index:03d}.txt").write_text("x", encoding="utf-8")

    first = client.get("/api/files?page=1&page_size=200")
    assert first.status_code == 200
    first_payload = first.json()
    assert len(first_payload["items"]) == 200
    assert first_payload["total"] == 205
    assert first_payload["has_more"] is True
    assert first_payload["next_page"] == 2

    second = client.get("/api/files?page=2&page_size=200")
    assert second.status_code == 200
    second_payload = second.json()
    assert len(second_payload["items"]) == 5
    assert second_payload["total"] == 205
    assert second_payload["has_more"] is False
    assert second_payload["next_page"] is None


def test_search_files_returns_matches_and_skips_hidden_dirs(
    client_and_storage: tuple[TestClient, Path, object],
) -> None:
    client, storage, _ = client_and_storage
    (storage / "assets").mkdir(parents=True, exist_ok=True)
    (storage / "assets" / "search-hit.txt").write_text("x", encoding="utf-8")

    books = storage / "books"
    books.mkdir(parents=True, exist_ok=True)
    (books / "Python入门.epub").write_bytes(b"epub")
    (books / "python实践.txt").write_text("txt", encoding="utf-8")
    (books / "other.txt").write_text("txt", encoding="utf-8")

    response = client.get("/api/search?q=python&limit=10")
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "python"
    assert payload["limit"] == 10

    names = {item["name"] for item in payload["items"]}
    paths = {item["path"] for item in payload["items"]}
    assert "Python入门.epub" in names
    assert "python实践.txt" in names
    assert "other.txt" not in names
    assert "assets/search-hit.txt" not in paths


def test_webdav_source_crud_round_trip(
    client_and_storage: tuple[TestClient, Path, object]
) -> None:
    client, _, _ = client_and_storage

    empty_response = client.get("/api/webdav/sources")
    assert empty_response.status_code == 200
    assert empty_response.json()["items"] == []

    create_response = client.post("/api/webdav/sources", json=_create_source_payload())
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "NAS 书库"
    assert created["local_path"] == "imports/webdav"

    list_response = client.get("/api/webdav/sources")
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == created["id"]

    update_response = client.put(
        f"/api/webdav/sources/{created['id']}",
        json=_create_source_payload(name="主书库", local_path="imports/library"),
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "主书库"
    assert updated["local_path"] == "imports/library"

    delete_response = client.delete(f"/api/webdav/sources/{created['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] == created["id"]

    after_delete = client.get("/api/webdav/sources")
    assert after_delete.status_code == 200
    assert after_delete.json()["items"] == []


def test_webdav_source_rejects_overlapping_local_directories(
    client_and_storage: tuple[TestClient, Path, object]
) -> None:
    client, _, _ = client_and_storage

    first = client.post(
        "/api/webdav/sources",
        json=_create_source_payload(local_path="imports/webdav"),
    )
    assert first.status_code == 201

    overlap = client.post(
        "/api/webdav/sources",
        json=_create_source_payload(
            name="子目录",
            remote_path="/other",
            local_path="imports/webdav/nested",
        ),
    )
    assert overlap.status_code == 400
    assert "overlap" in overlap.json()["detail"].lower()


def test_webdav_sync_downloads_files_and_prunes_removed_items(
    client_and_storage: tuple[TestClient, Path, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, storage, main_module = client_and_storage
    fake_client = FakeWebDavClient(
        {
            "/books": {"isdir": True},
            "/books/keep.epub": {"content": b"epub-v1", "etag": "keep-1"},
            "/books/subdir": {"isdir": True},
            "/books/subdir/hello.txt": {
                "content": "hello".encode("utf-8"),
                "etag": "txt-1",
            },
            "/books/ignore.jpg": {"content": b"jpg"},
        }
    )
    monkeypatch.setattr(main_module, "_create_webdav_client", lambda source: fake_client)

    create_response = client.post(
        "/api/webdav/sources",
        json=_create_source_payload(local_path="imports/owned"),
    )
    source_id = create_response.json()["id"]

    sync_response = client.post(f"/api/webdav/sources/{source_id}/sync")
    assert sync_response.status_code == 200
    payload = sync_response.json()
    assert payload["downloaded"] == 2
    assert payload["deleted"] == 0
    assert (storage / "imports" / "owned" / "keep.epub").read_bytes() == b"epub-v1"
    assert (storage / "imports" / "owned" / "subdir" / "hello.txt").read_text(
        encoding="utf-8"
    ) == "hello"
    assert not (storage / "imports" / "owned" / "ignore.jpg").exists()

    fake_client.entries.pop("/books/subdir/hello.txt")
    fake_client.entries["/books/keep.epub"]["content"] = b"epub-v2"
    fake_client.entries["/books/keep.epub"]["etag"] = "keep-2"

    second_sync = client.post(f"/api/webdav/sources/{source_id}/sync")
    assert second_sync.status_code == 200
    second_payload = second_sync.json()
    assert second_payload["downloaded"] == 1
    assert second_payload["deleted"] == 2
    assert (storage / "imports" / "owned" / "keep.epub").read_bytes() == b"epub-v2"
    assert not (storage / "imports" / "owned" / "subdir" / "hello.txt").exists()
    assert not (storage / "imports" / "owned" / "subdir").exists()


def test_webdav_delete_file_removes_local_and_remote(
    client_and_storage: tuple[TestClient, Path, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, storage, main_module = client_and_storage
    fake_client = FakeWebDavClient(
        {
            "/books": {"isdir": True},
            "/books/novel.txt": {"content": b"remote-content"},
        }
    )
    monkeypatch.setattr(main_module, "_create_webdav_client", lambda source: fake_client)

    create_response = client.post(
        "/api/webdav/sources",
        json=_create_source_payload(local_path="imports/owned"),
    )
    source_id = create_response.json()["id"]
    client.post(f"/api/webdav/sources/{source_id}/sync")

    delete_response = client.delete("/api/files/imports/owned/novel.txt")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] == "imports/owned/novel.txt"
    assert not (storage / "imports" / "owned" / "novel.txt").exists()
    assert "/books/novel.txt" in fake_client.removed_paths
    assert not fake_client.exists("/books/novel.txt")


def test_webdav_delete_directory_removes_local_and_remote(
    client_and_storage: tuple[TestClient, Path, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, storage, main_module = client_and_storage
    fake_client = FakeWebDavClient(
        {
            "/books": {"isdir": True},
            "/books/series": {"isdir": True},
            "/books/series/one.txt": {"content": b"1"},
            "/books/series/two.epub": {"content": b"2"},
        }
    )
    monkeypatch.setattr(main_module, "_create_webdav_client", lambda source: fake_client)

    create_response = client.post(
        "/api/webdav/sources",
        json=_create_source_payload(local_path="imports/owned"),
    )
    source_id = create_response.json()["id"]
    client.post(f"/api/webdav/sources/{source_id}/sync")

    delete_response = client.delete("/api/files/imports/owned/series")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] == "imports/owned/series"
    assert not (storage / "imports" / "owned" / "series").exists()
    assert "/books/series" in fake_client.removed_paths
    assert not fake_client.exists("/books/series")
