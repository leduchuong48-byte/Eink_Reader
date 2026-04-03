import hashlib
import json
import os
import posixpath
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from webdav4.client import Client as WebDavClient
from webdav4.http import Client as WebDavHttpClient

ALLOWED_SUFFIXES = {".txt", ".epub", ".pdf"}
CONFIG_DIRECTORY_NAME = ".eink_box"
HIDDEN_DIRECTORY_NAMES = {"assets", "cache", "data", "localStore", CONFIG_DIRECTORY_NAME}
WEB_DAV_SOURCES_FILENAME = "webdav_sources.json"
READING_HISTORY_FILENAME = "reading_history.json"
WEB_DAV_LIST_CACHE_TTL_SECONDS = 8.0
WEB_DAV_FILE_CACHE_TTL_SECONDS = 600.0
ROOT_STORAGE_DIR = Path(os.getenv("STORAGE_PATH", "/storage")).resolve()
ROOT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_webdav_list_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

app = FastAPI(title="E-ink Box 2.0")
app.mount("/static", StaticFiles(directory="static"), name="static")


class WebDavSourcePayload(BaseModel):
    name: str
    base_url: str
    username: str
    password: str
    remote_path: str
    enabled: bool = True


class WebDavSourceTestPayload(BaseModel):
    base_url: str
    username: str
    password: str
    remote_path: str


class ReadingProgressPayload(BaseModel):
    type: str
    page: Optional[int] = None
    offset: Optional[int] = None
    percent: Optional[float] = None
    cfi: Optional[str] = None
    chapter_href: Optional[str] = None


class ReadingHistoryPayload(BaseModel):
    device_id: str
    device_name: Optional[str] = None
    progress: ReadingProgressPayload


def _config_dir() -> Path:
    directory = ROOT_STORAGE_DIR / CONFIG_DIRECTORY_NAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _sources_file() -> Path:
    return _config_dir() / WEB_DAV_SOURCES_FILENAME


def _reading_history_file() -> Path:
    return _config_dir() / READING_HISTORY_FILENAME


def _safe_resolve(filepath: str) -> Path:
    candidate = Path(filepath)
    if candidate.is_absolute():
        raise HTTPException(status_code=400, detail="Absolute path is not allowed.")

    resolved = (ROOT_STORAGE_DIR / candidate).resolve()

    try:
        resolved.relative_to(ROOT_STORAGE_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Path traversal detected.") from exc

    return resolved


def _safe_history_key(filepath: str) -> str:
    if filepath.startswith("webdav://"):
        return filepath
    return _safe_resolve(filepath).relative_to(ROOT_STORAGE_DIR).as_posix()


def _normalize_remote_path(raw_path: str) -> str:
    value = (raw_path or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Remote directory is required.")

    parts = [part for part in value.split("/") if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise HTTPException(status_code=400, detail="Remote directory cannot contain '..'.")

    normalized = "/" + "/".join(parts)
    return normalized or "/"


def _normalize_webdav_source(
    payload: WebDavSourcePayload, source_id: Optional[str] = None
) -> dict[str, Any]:
    return {
        "id": source_id or uuid.uuid4().hex,
        "name": payload.name.strip(),
        "base_url": payload.base_url.strip().rstrip("/"),
        "username": payload.username,
        "password": payload.password,
        "remote_path": _normalize_remote_path(payload.remote_path),
        "enabled": bool(payload.enabled),
    }


def _read_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def _write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=str(path.parent), delete=False
    ) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
        temp_name = handle.name
    os.replace(temp_name, path)


def _load_webdav_sources() -> list[dict[str, Any]]:
    raw = _read_json_file(_sources_file(), [])
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict) and item.get("id")]


def _save_webdav_sources(sources: list[dict[str, Any]]) -> None:
    _write_json_file(_sources_file(), sources)


def _load_reading_history() -> dict[str, dict[str, Any]]:
    raw = _read_json_file(_reading_history_file(), {"items": {}})
    if not isinstance(raw, dict):
        return {}
    items = raw.get("items", {})
    if not isinstance(items, dict):
        return {}
    return {key: value for key, value in items.items() if isinstance(value, dict)}


def _save_reading_history(items: dict[str, dict[str, Any]]) -> None:
    _write_json_file(_reading_history_file(), {"items": items})


def _infer_file_type(filepath: str) -> str:
    suffix = Path(filepath).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file type for reading history.")
    return suffix.lstrip(".")


def _infer_source_type(filepath: str) -> str:
    return "webdav" if filepath.startswith("webdav://") else "local"


def _build_history_title(filepath: str) -> str:
    return Path(filepath).name or filepath


def _normalize_history_entry(filepath: str, payload: ReadingHistoryPayload) -> dict[str, Any]:
    safe_filepath = _safe_history_key(filepath)
    progress_type = payload.progress.type.strip().lower()
    if progress_type not in {"txt", "epub", "pdf"}:
        raise HTTPException(status_code=400, detail="Unsupported reading progress type.")

    progress: dict[str, Any] = {"type": progress_type}
    if payload.progress.page is not None:
        progress["page"] = max(0, payload.progress.page)
    if payload.progress.offset is not None:
        progress["offset"] = max(0, payload.progress.offset)
    if payload.progress.percent is not None:
        progress["percent"] = max(0.0, min(1.0, payload.progress.percent))
    if payload.progress.cfi:
        progress["cfi"] = payload.progress.cfi
    if payload.progress.chapter_href:
        progress["chapter_href"] = payload.progress.chapter_href

    return {
        "filepath": safe_filepath,
        "title": _build_history_title(safe_filepath),
        "file_type": _infer_file_type(safe_filepath),
        "source_type": _infer_source_type(safe_filepath),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "device_id": payload.device_id.strip(),
        "device_name": (payload.device_name or "").strip(),
        "progress": progress,
    }


def _get_recent_history(limit: int) -> list[dict[str, Any]]:
    items = list(_load_reading_history().values())
    items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return items[:limit]


def _find_source(source_id: str) -> dict[str, Any]:
    for source in _load_webdav_sources():
        if source["id"] == source_id:
            return source
    raise HTTPException(status_code=404, detail="WebDAV source not found.")


def _create_webdav_client(source: dict[str, Any]) -> WebDavClient:
    http_client = WebDavHttpClient(
        auth=(source["username"], source["password"]),
        timeout=30.0,
        verify=False,
    )
    return WebDavClient(
        source["base_url"],
        http_client=http_client,
    )


def _sanitize_source_for_response(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": source.get("id"),
        "name": source.get("name", ""),
        "base_url": source.get("base_url", ""),
        "username": source.get("username", ""),
        "password": "",
        "remote_path": source.get("remote_path", "/"),
        "enabled": bool(source.get("enabled", True)),
    }


def _webdav_cache_key(source_id: str, remote_path: str) -> str:
    return f"{source_id}::{remote_path}"


def _get_cached_webdav_list(source_id: str, remote_path: str) -> Optional[list[dict[str, Any]]]:
    key = _webdav_cache_key(source_id, remote_path)
    cached = _webdav_list_cache.get(key)
    if not cached:
        return None
    expires_at, payload = cached
    if time.time() > expires_at:
        _webdav_list_cache.pop(key, None)
        return None
    return payload


def _set_cached_webdav_list(source_id: str, remote_path: str, payload: list[dict[str, Any]]) -> None:
    key = _webdav_cache_key(source_id, remote_path)
    _webdav_list_cache[key] = (time.time() + WEB_DAV_LIST_CACHE_TTL_SECONDS, payload)


def _invalidate_webdav_cache(source_id: Optional[str] = None) -> None:
    if source_id is None:
        _webdav_list_cache.clear()
        return
    prefix = f"{source_id}::"
    for key in list(_webdav_list_cache.keys()):
        if key.startswith(prefix):
            _webdav_list_cache.pop(key, None)


def _webdav_http_exception(exc: Exception) -> HTTPException:
    message = str(exc)
    message_lower = message.lower()
    if "unauthorized" in message_lower or "forbidden" in message_lower:
        return HTTPException(status_code=401, detail="WebDAV 认证失败，请检查账号密码。")
    if "not found" in message_lower:
        return HTTPException(status_code=404, detail="WebDAV 路径或文件不存在。")
    if "timeout" in message_lower:
        return HTTPException(status_code=504, detail="WebDAV 请求超时，请稍后重试。")
    if "connect" in message_lower:
        return HTTPException(status_code=502, detail="无法连接 WebDAV 服务器，请检查地址或网络。")
    if "ssl" in message_lower or "certificate" in message_lower:
        return HTTPException(status_code=502, detail="WebDAV TLS/证书连接异常。")
    return HTTPException(status_code=502, detail=f"WebDAV 操作失败：{message}")


def _webdav_file_cache_dir() -> Path:
    cache_dir = _config_dir() / "webdav_file_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _webdav_file_cache_path(source_id: str, remote_full_path: str, suffix: str) -> Path:
    digest = hashlib.sha1(f"{source_id}:{remote_full_path}".encode("utf-8")).hexdigest()
    safe_suffix = suffix if suffix.startswith(".") else ""
    return _webdav_file_cache_dir() / f"{digest}{safe_suffix}"


def _prune_webdav_file_cache() -> None:
    now = time.time()
    cache_dir = _webdav_file_cache_dir()
    for entry in cache_dir.iterdir():
        if not entry.is_file():
            continue
        try:
            if now - entry.stat().st_mtime > WEB_DAV_FILE_CACHE_TTL_SECONDS:
                entry.unlink(missing_ok=True)
        except OSError:
            continue


def _ensure_webdav_cached_file(
    source: dict[str, Any],
    source_id: str,
    remote_full_path: str,
    suffix: str,
) -> Path:
    _prune_webdav_file_cache()
    cache_path = _webdav_file_cache_path(source_id, remote_full_path, suffix)

    if cache_path.exists():
        try:
            age = time.time() - cache_path.stat().st_mtime
            if age <= WEB_DAV_FILE_CACHE_TTL_SECONDS:
                return cache_path
        except OSError:
            pass

    client = _create_webdav_client(source)
    temp_path = cache_path.with_suffix(cache_path.suffix + ".tmp")
    try:
        client.download_file(remote_full_path, temp_path)
        os.replace(temp_path, cache_path)
        return cache_path
    except Exception as exc:  # noqa: BLE001
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise _webdav_http_exception(exc) from exc


def _delete_webdav_path_recursive(client: WebDavClient, target_path: str) -> None:
    try:
        client.remove(target_path)
        return
    except Exception as exc:  # noqa: BLE001
        message = str(exc).lower()
        if "directory not empty" not in message and "collection not empty" not in message:
            raise

    entries = client.ls(target_path, detail=True, allow_listing_resource=False)
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        raw_name = str(entry.get("display_name") or entry.get("name") or "").strip()
        child_name = posixpath.basename(raw_name.rstrip("/"))
        if not child_name:
            continue
        child_path = _join_remote_path(target_path, child_name)
        is_dir = bool(entry.get("isdir", False)) or entry.get("type") == "directory"
        if is_dir:
            _delete_webdav_path_recursive(client, child_path)
        else:
            client.remove(child_path)

    client.remove(target_path)


def _invalidate_webdav_file_cache(source_id: Optional[str] = None) -> None:
    cache_dir = _webdav_file_cache_dir()
    if source_id is None:
        for entry in cache_dir.iterdir():
            if entry.is_file():
                entry.unlink(missing_ok=True)
        return
    # source-specific invalidation falls back to full prune due to hashed key storage
    for entry in cache_dir.iterdir():
        if entry.is_file():
            entry.unlink(missing_ok=True)


def _parse_webdav_path(path: str) -> tuple[str, str]:
    """Parse webdav://source_id/remote/path -> (source_id, /remote/path)"""
    if not path.startswith("webdav://"):
        raise HTTPException(status_code=400, detail="Invalid WebDAV path format.")
    
    path_without_prefix = path[9:]  # Remove "webdav://"
    parts = path_without_prefix.split("/", 1)
    source_id = parts[0]
    remote_path = "/" + parts[1] if len(parts) > 1 else "/"
    return source_id, remote_path


def _join_remote_path(base_path: str, child_name: str) -> str:
    base = base_path if base_path.startswith("/") else f"/{base_path}"
    joined = posixpath.join(base, child_name)
    return joined if joined.startswith("/") else f"/{joined}"


def _list_local_directory(directory: Path) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    for entry in sorted(
        directory.iterdir(), key=lambda path: (not path.is_dir(), path.name.lower())
    ):
        if entry.is_dir() and entry.name in HIDDEN_DIRECTORY_NAMES:
            continue

        relative_path = entry.relative_to(ROOT_STORAGE_DIR).as_posix()

        if entry.is_dir():
            nodes.append(
                {
                    "type": "directory",
                    "name": entry.name,
                    "path": relative_path,
                }
            )
            continue

        if entry.is_file() and entry.suffix.lower() in ALLOWED_SUFFIXES:
            nodes.append(
                {
                    "type": "file",
                    "name": entry.name,
                    "path": relative_path,
                    "ext": entry.suffix.lower(),
                }
            )

    return nodes


def _list_webdav_directory(source: dict[str, Any], remote_path: str) -> list[dict[str, Any]]:
    source_id = source["id"]
    cached = _get_cached_webdav_list(source_id, remote_path)
    if cached is not None:
        return cached

    client = _create_webdav_client(source)
    nodes: list[dict[str, Any]] = []

    full_remote_path = _join_remote_path(source["remote_path"], remote_path.lstrip("/"))
    try:
        for entry in client.ls(full_remote_path, detail=True, allow_listing_resource=False):
            if not isinstance(entry, dict):
                continue

            raw_name = str(entry.get("display_name") or entry.get("name") or "").strip()
            if not raw_name:
                continue

            child_name = posixpath.basename(raw_name.rstrip("/"))
            if not child_name:
                continue
            if child_name in HIDDEN_DIRECTORY_NAMES:
                continue

            is_dir = bool(entry.get("isdir", False)) or entry.get("type") == "directory"
            relative_path = posixpath.join(remote_path, child_name).lstrip("/")
            webdav_path = f"webdav://{source_id}/{relative_path}"

            if is_dir:
                nodes.append({
                    "type": "directory",
                    "name": child_name,
                    "path": webdav_path,
                })
            else:
                suffix = Path(child_name).suffix.lower()
                if suffix in ALLOWED_SUFFIXES:
                    nodes.append({
                        "type": "file",
                        "name": child_name,
                        "path": webdav_path,
                        "ext": suffix,
                    })
    except Exception as exc:  # noqa: BLE001
        raise _webdav_http_exception(exc) from exc

    sorted_nodes = sorted(nodes, key=lambda n: (n["type"] != "directory", n["name"].lower()))
    _set_cached_webdav_list(source_id, remote_path, sorted_nodes)
    return sorted_nodes


def _search_local_files(directory: Path, keyword: str, limit: int) -> list[dict[str, Any]]:
    keyword_lower = keyword.casefold()
    results: list[dict[str, Any]] = []

    def walk(current: Path) -> None:
        if len(results) >= limit:
            return

        for entry in sorted(
            current.iterdir(), key=lambda path: (not path.is_dir(), path.name.lower())
        ):
            if len(results) >= limit:
                return

            if entry.is_dir():
                if entry.name in HIDDEN_DIRECTORY_NAMES:
                    continue
                walk(entry)
                continue

            if not entry.is_file() or entry.suffix.lower() not in ALLOWED_SUFFIXES:
                continue

            if keyword_lower not in entry.name.casefold():
                continue

            relative_path = entry.relative_to(ROOT_STORAGE_DIR).as_posix()
            results.append(
                {
                    "type": "file",
                    "name": entry.name,
                    "path": relative_path,
                    "ext": entry.suffix.lower(),
                }
            )

    walk(directory)
    return results


def _trim_to_utf8_boundary(raw_chunk: bytes) -> bytes:
    if not raw_chunk:
        return b""

    rollback_max = min(3, len(raw_chunk) - 1)
    for rollback in range(0, rollback_max + 1):
        candidate = raw_chunk[: len(raw_chunk) - rollback]
        try:
            candidate.decode("utf-8")
            return candidate
        except UnicodeDecodeError:
            continue

    return raw_chunk


def _delete_local_path(target: Path) -> None:
    if target.is_dir():
        import shutil
        shutil.rmtree(target)
        return
    target.unlink()


# ============================================================================
# API Routes
# ============================================================================

@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.get("/read")
def read():
    return FileResponse("static/read.html")


@app.get("/favicon.ico")
def favicon():
    return FileResponse("static/favicon.ico", media_type="image/x-icon")


@app.get("/api/files")
def list_files(path: str = Query(""), page: int = Query(1), page_size: int = Query(200)):
    # WebDAV virtual mount
    if path.startswith("webdav://"):
        source_id, remote_path = _parse_webdav_path(path)
        source = _find_source(source_id)
        if not source.get("enabled", True):
            raise HTTPException(status_code=403, detail="WebDAV source is disabled.")
        
        items = _list_webdav_directory(source, remote_path)
        return {
            "items": items,
            "total": len(items),
            "page": 1,
            "page_size": len(items),
            "has_more": False,
            "next_page": None,
        }
    
    # Local files
    target = _safe_resolve(path) if path else ROOT_STORAGE_DIR
    if not target.exists():
        raise HTTPException(status_code=404, detail="Directory not found.")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory.")

    items = _list_local_directory(target)
    
    # Add WebDAV virtual folders at root
    if not path:
        for source in _load_webdav_sources():
            if source.get("enabled", True):
                items.append({
                    "type": "directory",
                    "name": f"☁️ {source['name']}",
                    "path": f"webdav://{source['id']}",
                })
    
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]
    has_more = end < len(items)
    next_page = page + 1 if has_more else None

    return {
        "items": page_items,
        "total": len(items),
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
        "next_page": next_page,
    }


@app.get("/api/content/{filepath:path}")
def get_content(
    filepath: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200_000, ge=1, le=2_000_000),
):
    # WebDAV file
    if filepath.startswith("webdav://"):
        source_id, remote_path = _parse_webdav_path(filepath)
        source = _find_source(source_id)
        if not source.get("enabled", True):
            raise HTTPException(status_code=403, detail="WebDAV source is disabled.")

        full_remote_path = _join_remote_path(source["remote_path"], remote_path.lstrip("/"))

        suffix = Path(remote_path).suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        cached_path = _ensure_webdav_cached_file(source, source_id, full_remote_path, suffix)

        if suffix == ".epub":
            return FileResponse(
                path=cached_path,
                media_type="application/epub+zip",
                filename=Path(remote_path).name,
                headers={"Cache-Control": "public, max-age=60"},
            )

        if suffix == ".pdf":
            return FileResponse(
                path=cached_path,
                media_type="application/pdf",
                filename=Path(remote_path).name,
                content_disposition_type="inline",
                headers={
                    "Cache-Control": "public, max-age=60",
                },
            )

        # TXT: read from cached file in chunks
        total_size = cached_path.stat().st_size

        if offset > total_size:
            raise HTTPException(status_code=416, detail="Offset exceeds file size.")

        with cached_path.open("rb") as handle:
            handle.seek(offset)
            raw_chunk = handle.read(limit)
        safe_chunk = _trim_to_utf8_boundary(raw_chunk)
        try:
            text = safe_chunk.decode("utf-8")
            consumed = len(safe_chunk)
        except UnicodeDecodeError:
            text = raw_chunk.decode("utf-8", errors="ignore")
            consumed = len(raw_chunk)

        next_offset = min(offset + consumed, total_size)
        return JSONResponse({
            "type": "txt",
            "filepath": filepath,
            "content": text,
            "next_offset": next_offset,
            "total_size": total_size,
        })

    # Local file
    target = _safe_resolve(filepath)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    suffix = target.suffix.lower()
    if suffix == ".epub":
        return FileResponse(
            path=target,
            media_type="application/epub+zip",
            filename=target.name,
        )

    if suffix == ".pdf":
        return FileResponse(
            path=target,
            media_type="application/pdf",
            filename=target.name,
            content_disposition_type="inline",
        )

    if suffix == ".txt":
        total_size = target.stat().st_size
        if offset > total_size:
            raise HTTPException(status_code=416, detail="Offset exceeds file size.")

        with target.open("rb") as handle:
            handle.seek(offset)
            raw_chunk = handle.read(limit)

        safe_chunk = _trim_to_utf8_boundary(raw_chunk)
        try:
            text = safe_chunk.decode("utf-8")
            consumed = len(safe_chunk)
        except UnicodeDecodeError:
            text = raw_chunk.decode("utf-8", errors="ignore")
            consumed = len(raw_chunk)

        next_offset = min(offset + consumed, total_size)
        return JSONResponse({
            "type": "txt",
            "filepath": target.relative_to(ROOT_STORAGE_DIR).as_posix(),
            "content": text,
            "next_offset": next_offset,
            "total_size": total_size,
        })

    raise HTTPException(status_code=400, detail="Unsupported file type.")


@app.post("/api/preload/{filepath:path}")
def preload_file(filepath: str):
    if filepath.startswith("webdav://"):
        source_id, remote_path = _parse_webdav_path(filepath)
        source = _find_source(source_id)
        if not source.get("enabled", True):
            raise HTTPException(status_code=403, detail="WebDAV source is disabled.")

        suffix = Path(remote_path).suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        full_remote_path = _join_remote_path(source["remote_path"], remote_path.lstrip("/"))
        cache_path = _ensure_webdav_cached_file(source, source_id, full_remote_path, suffix)
        return {
            "ok": True,
            "cached": True,
            "filepath": filepath,
            "size": cache_path.stat().st_size,
        }

    target = _safe_resolve(filepath)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    if target.suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    return {
        "ok": True,
        "cached": False,
        "filepath": filepath,
        "size": target.stat().st_size,
    }


@app.get("/api/search")
def search_files(q: str = Query(""), limit: int = Query(50)):
    keyword = q.strip()
    if not keyword:
        return {"items": []}

    results = _search_local_files(ROOT_STORAGE_DIR, keyword, limit)
    return {"items": results}


@app.delete("/api/files/{filepath:path}")
def delete_file(filepath: str):
    # WebDAV file
    if filepath.startswith("webdav://"):
        source_id, remote_path = _parse_webdav_path(filepath)
        source = _find_source(source_id)
        if not source.get("enabled", True):
            raise HTTPException(status_code=403, detail="WebDAV source is disabled.")
        
        client = _create_webdav_client(source)
        full_remote_path = _join_remote_path(source["remote_path"], remote_path.lstrip("/"))

        try:
            if not client.exists(full_remote_path):
                raise HTTPException(status_code=404, detail="File not found on WebDAV server.")
            _delete_webdav_path_recursive(client, full_remote_path)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise _webdav_http_exception(exc) from exc
        _invalidate_webdav_cache(source_id)
        _invalidate_webdav_file_cache(source_id)
        return {"deleted": filepath}
    
    # Local file
    target = _safe_resolve(filepath)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File or directory not found.")

    if target.is_file() and target.suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    _delete_local_path(target)
    return {"deleted": filepath}


@app.get("/api/webdav/sources")
def get_webdav_sources():
    sources = _load_webdav_sources()
    return {"items": [_sanitize_source_for_response(source) for source in sources]}


@app.post("/api/webdav/sources")
def create_webdav_source(payload: WebDavSourcePayload):
    normalized = _normalize_webdav_source(payload)
    sources = _load_webdav_sources()
    sources.append(normalized)
    _save_webdav_sources(sources)
    _invalidate_webdav_cache()
    _invalidate_webdav_file_cache()
    return _sanitize_source_for_response(normalized)


@app.put("/api/webdav/sources/{source_id}")
def update_webdav_source(source_id: str, payload: WebDavSourcePayload):
    sources = _load_webdav_sources()
    existing = next((s for s in sources if s["id"] == source_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="WebDAV source not found.")
    normalized = _normalize_webdav_source(payload, source_id)
    if not normalized.get("password"):
        normalized["password"] = existing.get("password", "")
    updated_sources = [normalized if s["id"] == source_id else s for s in sources]
    _save_webdav_sources(updated_sources)
    _invalidate_webdav_cache(source_id)
    _invalidate_webdav_file_cache(source_id)
    return _sanitize_source_for_response(normalized)


@app.delete("/api/webdav/sources/{source_id}")
def delete_webdav_source(source_id: str):
    sources = _load_webdav_sources()
    updated_sources = [s for s in sources if s["id"] != source_id]
    
    if len(updated_sources) == len(sources):
        raise HTTPException(status_code=404, detail="WebDAV source not found.")
    
    _save_webdav_sources(updated_sources)
    _invalidate_webdav_cache(source_id)
    _invalidate_webdav_file_cache(source_id)
    return {"deleted": source_id}


@app.post("/api/webdav/sources/test")
def test_webdav_source(payload: WebDavSourceTestPayload):
    source = {
        "base_url": payload.base_url.strip().rstrip("/"),
        "username": payload.username,
        "password": payload.password,
        "remote_path": _normalize_remote_path(payload.remote_path),
    }
    client = _create_webdav_client(source)
    try:
        entries = client.ls(source["remote_path"], detail=False, allow_listing_resource=False)
    except Exception as exc:  # noqa: BLE001
        raise _webdav_http_exception(exc) from exc
    return {
        "ok": True,
        "entry_count": len(entries),
        "detail": "连接成功，目录可访问。",
    }


@app.get("/api/reading-history/recent")
def get_recent_reading_history(limit: int = Query(default=8, ge=1, le=50)):
    return {"items": _get_recent_history(limit)}


@app.get("/api/reading-history/{filepath:path}")
def get_reading_history(filepath: str):
    safe_filepath = _safe_history_key(filepath)
    item = _load_reading_history().get(safe_filepath)
    if not item:
        return {"item": None}
    return {"item": item}


@app.put("/api/reading-history/{filepath:path}")
def put_reading_history(filepath: str, payload: ReadingHistoryPayload):
    safe_filepath = _safe_history_key(filepath)
    items = _load_reading_history()
    item = _normalize_history_entry(safe_filepath, payload)
    items[safe_filepath] = item
    _save_reading_history(items)
    return {"item": item}


@app.delete("/api/reading-history/{filepath:path}")
def delete_reading_history(filepath: str):
    safe_filepath = _safe_history_key(filepath)
    items = _load_reading_history()
    if safe_filepath not in items:
        raise HTTPException(status_code=404, detail="Reading history not found.")
    items.pop(safe_filepath, None)
    _save_reading_history(items)
    return {"deleted": safe_filepath}


@app.delete("/api/reading-history")
def clear_reading_history():
    _save_reading_history({})
    return {"deleted": "all"}
