# AGENTS.md

Repository playbook for autonomous coding agents working in this project.

## 1) Project Snapshot

- Name: **E-ink Box**
- Stack:
  - Backend: Python 3.12, FastAPI, Uvicorn
  - Frontend: Vanilla HTML/CSS/JavaScript
  - EPUB rendering: epub.js (downloaded at image build time)
- Deployment: Docker / Docker Compose
- App shape:
  - `/` shelf page
  - `/read?file=...` reader page

## 2) Source of Truth Files

- Backend: `app/main.py`
- Frontend app shell: `static/index.html`, `static/read.html`
- Frontend logic: `static/js/main.js`, `static/js/reader.js`
- Styles: `static/css/eink.css`
- Runtime/deploy docs: `README.md`, `README_en.md`
- Container setup: `Dockerfile`, `docker-compose.yml`

## 3) Build / Run / Test Commands

### Docker (primary runtime)

```bash
docker compose up -d --build
```

Service mapping in compose:
- Container port `8000` -> host port `2004`

### Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
STORAGE_PATH=/storage uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Available verification commands in current repo

- There is **no configured lint command** (no ruff/flake8/black config detected).
- There is **no configured test suite** (no `tests/`, `pytest.ini`, `pyproject.toml`, `tox.ini`).
- There is **no configured JS package toolchain** (`package.json` absent).

### Single-test execution (important)

Currently **not applicable** because no test framework is defined in-repo.

If tests are later added with pytest, preferred single-test pattern:

```bash
pytest path/to/test_file.py::test_case_name -q
```

## 4) Coding Conventions (Observed)

Follow existing style unless user requests otherwise.

### Python / FastAPI (`app/main.py`)

- Import order pattern:
  1. stdlib (`os`, `pathlib`, `typing`)
  2. third-party (`charset_normalizer`, `fastapi`)
- Type hints are used for public helpers/handlers.
  - Example: `def _safe_resolve(filepath: str) -> Path`
  - Example: `def _build_tree(...) -> list[dict[str, Any]]`
- Constants are UPPER_SNAKE_CASE.
- Internal helper names are snake_case with leading underscore for private helpers.
- Route handlers are synchronous `def` (not `async`) in current code.
- Errors are raised via `HTTPException` with explicit status and detail.
- Path safety uses `Path.resolve()` + `relative_to(ROOT_STORAGE_DIR)`.
- API responses return dicts or FastAPI response classes (`FileResponse`, `JSONResponse`).

### JavaScript (`static/js/*.js`)

- Prefer `const`, use `let` only for mutable state.
- Naming:
  - constants: UPPER_SNAKE_CASE
  - functions/variables: camelCase
- Style uses semicolons and 2-space indentation.
- Function declarations are preferred over inline function expressions.
- Guard-clause style is common (`if (!x) return;`).
- Async flows use `try/catch`; many recoverable failures intentionally degrade gracefully.
- DOM access is top-level cached references via `document.getElementById(...)`.
- Event handlers are explicit and readable; do not over-abstract.
- Persistent client state keys are centralized constants:
  - theme key
  - layout key
  - progress key prefix
  - IndexedDB db/store/key prefix

### CSS (`static/css/eink.css`)

- Root-level CSS variables define theme and dynamic typography tokens.
- E-ink and LCD theming is class-based (`body.theme-lcd`).
- Prefer explicit border/contrast styles for readability on E-ink screens.
- Keep animation/transition minimal (E-ink friendliness).

## 5) API Contract Rules

- Keep backend and frontend endpoint strings in sync.
- Existing backend routes:
  - `GET /api/files`
  - `GET /api/content/{filepath:path}`
  - `DELETE /api/files/{filepath:path}`
- When adding/changing routes, update:
  - frontend callers in both JS files
  - README docs (CN + EN)

## 6) Error Handling Rules

- Backend:
  - Use specific HTTP status codes (400/404 etc.).
  - Reject unsupported file types explicitly.
  - Maintain path traversal safeguards.
- Frontend:
  - Preserve user-visible failure feedback for destructive actions.
  - Do not remove confirmation dialogs for deletion without replacement.
  - If swallowing non-critical exceptions, keep comments explaining why.

## 7) Security & Data Safety Constraints

- Never allow absolute paths or traversal outside `STORAGE_PATH`.
- Keep extension allowlist enforcement for file operations.
- Treat delete operations as high-risk UX; require clear confirmation.

## 8) Known Repository Gaps (Do Not Assume Missing Tooling Exists)

- No CI pipeline config found.
- No test harness found.
- No lint/typecheck scripts found.
- Manifest icon files declared but not present.
- CSS font file declared but not present.

## 9) Cursor / Copilot Rules Check

No repository-level agent instruction files were found:

- `.cursorrules`: not found
- `.cursor/rules/`: not found
- `.github/copilot-instructions.md`: not found

So this `AGENTS.md` is the canonical guidance for agent behavior in this repo.

## 10) Change Checklist for Agents

Before finishing a task:

1. Verify API path consistency across backend + frontend.
2. Keep changes minimal and localized.
3. Update README sections when behavior changes.
4. If adding tests, document exact run commands (including single-test pattern).
5. Do not introduce new framework/tooling unless explicitly requested.
