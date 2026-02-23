# Eink Reader

[中文](README.md)

Eink Reader is a **WebUI-first** LAN ebook reader designed for E-ink and distraction-free reading scenarios. It provides shelf browsing, TXT/EPUB reading, progress persistence, and typography/theme controls in one lightweight web app.

## Why This Project Is Useful (Pain Points)

Common problems in local ebook workflows:

- Books are scattered across NAS folders and hard to browse quickly
- Generic readers are not optimized for E-ink interaction patterns
- Reading progress and layout preferences are hard to keep consistently

Eink Reader turns discovery, reading, progress tracking, and resume into one continuous web workflow.

## What the Project Does (Features)

- Shelf browsing with lazy directory loading, pagination, and keyword search
- TXT chunked reading and EPUB rendering
- Progress persistence (TXT offset / EPUB CFI)
- Reader UX controls: themes, typography, touch/keyboard/tap page turns
- File management: delete `.txt` / `.epub` from shelf or reader flow

## WebUI Highlights (Code-Verified)

Based on `app/main.py` and `static/*`:

- Routes: `/` (shelf), `/read?file=...` (reader)
- File APIs: `GET /api/files`, `GET /api/search`
- Content API: `GET /api/content/{filepath}` (TXT chunk + EPUB stream)
- Management API: `DELETE /api/files/{filepath}`

Reader page includes:

- TOC navigation
- Font size/line height/padding/alignment controls
- Theme cycling (E-ink / OLED Night / OLED Smooth / Paper Day)
- Clear-reading-cache and back-to-shelf actions

## Getting Started

### Requirements

- Docker / Docker Compose (recommended)
- Or Python 3.12+

### Run with Docker

1. Create a local `books/` folder in the project directory and put `.txt` / `.epub` files in it.
2. Start the app:

```bash
docker compose up -d --build
```

3. Open: `http://<your-host-ip>:2004/`

### Run Locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
STORAGE_PATH=/path/to/your/books uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open: `http://127.0.0.1:8000/`

### Run Tests

```bash
pytest -q
```

## Configuration

- `STORAGE_PATH`: ebook root directory (default: `/storage`)
- Default compose mount: `./books:/storage`

## Where to Get Help

- Issues: `https://github.com/leduchuong48-byte/Eink_Reader/issues`
- Please include repro steps, screenshots, logs, and environment details

## Maintainers and Contributors

- Maintainer: `@leduchuong48-byte`

## License

No `LICENSE` file is currently included. Add one before public open-source distribution.

## Disclaimer

By using this project, you acknowledge and agree to the [Disclaimer](DISCLAIMER.md).
