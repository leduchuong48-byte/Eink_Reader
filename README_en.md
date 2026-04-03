# E-ink Box 2.0

![E-ink Box Cover](docs/cover.svg)

[![Docker Pulls](https://img.shields.io/badge/Docker%20Pulls-check%20registry-blue.svg)](#)
[![GitHub Stars](https://img.shields.io/github/stars/leduchuong/eink_reader?style=flat-square)](https://github.com/leduchuong/eink_reader/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/leduchuong/eink_reader?style=flat-square)](https://github.com/leduchuong/eink_reader/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/leduchuong/eink_reader?style=flat-square)](https://github.com/leduchuong/eink_reader/issues)
[![License](https://img.shields.io/github/license/leduchuong/eink_reader?style=flat-square)](https://github.com/leduchuong/eink_reader/blob/main/LICENSE)
[![Build: Passing](https://img.shields.io/badge/Build-Passing-brightgreen.svg)](#)
[![Platform: ARM64/AMD64](https://img.shields.io/badge/Platform-ARM64%2FAMD64-blue.svg)](#)

[中文](README.md)

> Better alternative to EinkBro for E-ink devices.

A lightweight self-hosted reader for NAS libraries, LAN reading workflows, and E-ink devices, with in-browser TXT, EPUB, PDF reading and server-side reading progress sync.

## Why this tool?

If your books live on a NAS and your actual reading happens across phones, tablets, and E-ink browsers, the experience usually breaks down fast: TXT becomes endless scrolling, PDF opens in a separate viewer, EPUB stalls, and progress is lost when you switch devices. E-ink Box 2.0 brings those fragmented reading steps into one lightweight browser-based system that is easy to self-host and comfortable to use for long-form reading.

## Why This Project Is Useful (Pain Points)

- E-ink browsers and mobile webviews often handle reader interactions poorly, especially around bottom bars, overlays, and safe areas.
- TXT reading is usually treated as raw scrolling text instead of proper paged reading with jumps and chapter structure.
- Reading progress is easy to lose across devices, and WebDAV libraries often stop at file browsing instead of offering a full reading workflow.

## What the Project Does (Features)

- Supports TXT / EPUB / PDF reading in the browser, with PDF rendered through PDF.js and EPUB loaded through a more reliable binary flow.
- Upgrades TXT reading with real pagination, previous/next page, jump-to-page, heading detection, TOC generation, and heading-aware page protection.
- Adds recent reading, server-side reading history, cross-device progress persistence, WebDAV source management, delete actions, and cache warm-up improvements.

## ⚡️ Quick Start (Run in 3 seconds)

```bash
docker run -d --name eink-reader --restart unless-stopped -p 2004:8000 -e STORAGE_PATH=/storage -v /path/to/your/books:/storage ghcr.io/leduchuong/eink_reader:latest
```

> The web UI is exposed on host port `2004`, while the app listens on container port `8000`.

## Docker Compose (Portainer / NAS ready)

```yaml
services:
  app:
    image: ghcr.io/leduchuong/eink_reader:latest
    container_name: eink-reader
    restart: unless-stopped
    environment:
      - TZ=UTC
      - STORAGE_PATH=/storage
    ports:
      - "2004:8000"
    volumes:
      - /path/to/your/books:/storage
```

You can paste this block directly into Portainer or a NAS compose UI.

## GitHub Topics (pick at least 5)

`#nas` `#homelab` `#selfhosted` `#synology` `#unraid` `#eink` `#automation`

## 📈 Visual Add-ons (Profile Style)

<p align="left"> <img src="https://komarev.com/ghpvc/?username=leduchuong&label=Repo%20views&color=0e75b6&style=flat" alt="leduchuong" /> </p>

<p>
  <img align="left" src="https://github-readme-stats-sigma-five.vercel.app/api/top-langs?username=leduchuong&show_icons=true&locale=en&layout=compact" alt="top-langs" />
  <img align="center" src="https://github-readme-stats-sigma-five.vercel.app/api?username=leduchuong&show_icons=true&locale=en" alt="stats" />
</p>

<p><img align="center" src="https://github-readme-streak-stats.herokuapp.com/?user=leduchuong" alt="streak" /></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=leduchuong/eink_reader&type=Date&theme=dark" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=leduchuong/eink_reader&type=Date" />
  <img alt="Star History" src="https://api.star-history.com/svg?repos=leduchuong/eink_reader&type=Date" />
</picture>

## 🧰 Languages and Tools

<p align="left"><img src="https://skillicons.dev/icons?i=python,docker" alt="tech stack"/></p>

## Getting Started

### Prerequisites

- Docker / Docker Compose, or a local Python 3.12 environment.
- A readable and writable bookshelf directory mounted into the container through `STORAGE_PATH`.

### Installation

```bash
git clone https://github.com/leduchuong/eink_reader.git
cd eink_reader
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run

```bash
STORAGE_PATH=/storage uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Usage Example

```bash
docker compose up -d --build
```

Open `http://localhost:2004` to browse your local library, connect WebDAV sources, and continue recent reading sessions.

## Where to Get Help

- Issues: https://github.com/leduchuong/eink_reader/issues
- Discussions: https://github.com/leduchuong/eink_reader/discussions
- For device-specific issues, include the E-ink model, browser shell, and reproduction steps in the report.

## Maintainers and Contributors

- Maintainer: @leduchuong
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## What's New in 2.0

- Better format support with TXT / EPUB / PDF in-browser reading, PDF.js rendering, and a more stable EPUB binary loading flow.
- A much stronger TXT reader with real pagination, page jump, heading detection, heading-aware page splitting, and TOC generation.
- Cleaner reader interactions with modal-based mode switching, unified shelf/reader behavior, and reduced panel conflicts.
- Server-side reading history and recent-reading support with cross-device progress sync for TXT, EPUB, and PDF.
- Better library management with WebDAV connection testing, direct delete actions, and cache warm-up improvements.

## Project Structure

- Backend: `app/main.py`
- Shelf page: `static/index.html`
- Reader page: `static/read.html`
- Shelf logic: `static/js/main.js`
- Reader logic: `static/js/reader.js`
- Styles: `static/css/eink.css`

## 🤝 Connect

- GitHub: https://github.com/leduchuong
- Repository: https://github.com/leduchuong/eink_reader

## Disclaimer

By using this project, you acknowledge and agree to the [Disclaimer](DISCLAIMER.md).

## License

MIT, see [LICENSE](LICENSE)
