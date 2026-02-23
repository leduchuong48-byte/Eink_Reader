import importlib
from pathlib import Path

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
) -> tuple[TestClient, Path]:
    monkeypatch.setenv("STORAGE_PATH", str(tmp_path))
    import app.main as main_module

    importlib.reload(main_module)
    client = TestClient(main_module.app)
    return client, tmp_path


def test_list_files_root_lazy_and_hidden_directory_filter(
    client_and_storage: tuple[TestClient, Path],
) -> None:
    client, storage = client_and_storage
    nested = storage / "books"
    nested.mkdir(parents=True, exist_ok=True)
    (storage / "assets").mkdir(parents=True, exist_ok=True)
    (storage / "cache").mkdir(parents=True, exist_ok=True)

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
    client_and_storage: tuple[TestClient, Path],
) -> None:
    client, storage = client_and_storage
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
    client_and_storage: tuple[TestClient, Path],
) -> None:
    client, storage = client_and_storage
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


def test_path_traversal_is_blocked(client_and_storage: tuple[TestClient, Path]) -> None:
    client, _ = client_and_storage
    response = client.get("/api/content/%2E%2E/%2E%2E/etc/passwd")
    assert response.status_code == 400
    assert "Path traversal" in response.json()["detail"]


def test_txt_chunking_and_encoding_safety(
    client_and_storage: tuple[TestClient, Path],
) -> None:
    client, storage = client_and_storage
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


def test_list_files_pagination(client_and_storage: tuple[TestClient, Path]) -> None:
    client, storage = client_and_storage

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
    client_and_storage: tuple[TestClient, Path],
) -> None:
    client, storage = client_and_storage
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
