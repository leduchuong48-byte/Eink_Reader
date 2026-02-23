import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ALLOWED_SUFFIXES = {".txt", ".epub"}
HIDDEN_DIRECTORY_NAMES = {"assets", "cache", "data", "localStore"}
ROOT_STORAGE_DIR = Path(os.getenv("STORAGE_PATH", "/storage")).resolve()
ROOT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="E-ink Box")
app.mount("/static", StaticFiles(directory="static"), name="static")


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


def _list_directory(directory: Path) -> list[dict[str, Any]]:
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


def _search_files(directory: Path, keyword: str, limit: int) -> list[dict[str, Any]]:
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


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/read")
def serve_reader() -> FileResponse:
    return FileResponse("static/read.html")


@app.get("/api/files")
def list_files(
    path: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=200, ge=1, le=500),
) -> dict[str, Any]:
    if not ROOT_STORAGE_DIR.exists():
        return {
            "root": str(ROOT_STORAGE_DIR),
            "path": "",
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "has_more": False,
            "next_page": None,
        }

    base = ROOT_STORAGE_DIR if not path else _safe_resolve(path)
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found.")

    all_items = _list_directory(base)
    total = len(all_items)
    start = (page - 1) * page_size
    end = start + page_size
    paged_items = all_items[start:end]
    has_more = end < total

    return {
        "root": str(ROOT_STORAGE_DIR),
        "path": ""
        if base == ROOT_STORAGE_DIR
        else base.relative_to(ROOT_STORAGE_DIR).as_posix(),
        "items": paged_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
        "next_page": page + 1 if has_more else None,
    }


@app.get("/api/content/{filepath:path}")
def get_content(
    filepath: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200_000, ge=1, le=2_000_000),
):
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
        return JSONResponse(
            {
                "type": "txt",
                "filepath": target.relative_to(ROOT_STORAGE_DIR).as_posix(),
                "content": text,
                "next_offset": next_offset,
                "total_size": total_size,
            }
        )

    raise HTTPException(status_code=400, detail="Unsupported file type.")


@app.get("/api/search")
def search_files(
    q: str = Query(min_length=1),
    path: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    if not ROOT_STORAGE_DIR.exists():
        return {"root": str(ROOT_STORAGE_DIR), "path": "", "query": q, "items": []}

    base = ROOT_STORAGE_DIR if not path else _safe_resolve(path)
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found.")

    items = _search_files(base, q, limit)
    return {
        "root": str(ROOT_STORAGE_DIR),
        "path": ""
        if base == ROOT_STORAGE_DIR
        else base.relative_to(ROOT_STORAGE_DIR).as_posix(),
        "query": q,
        "items": items,
        "count": len(items),
        "limit": limit,
    }


@app.delete("/api/files/{filepath:path}")
def delete_file(filepath: str) -> dict[str, str]:
    target = _safe_resolve(filepath)

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    if target.suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    os.remove(target)
    return {"deleted": target.relative_to(ROOT_STORAGE_DIR).as_posix()}
