const THEME_STORAGE_KEY = "eink-box-theme";
const THEME_LCD_LEGACY = "theme-lcd";
const THEME_EINK = "theme-eink";
const THEME_OLED_NIGHT = "theme-oled-night";
const THEME_OLED_SMOOTH = "theme-oled-smooth";
const THEME_PAPER_DAY = "theme-paper-day";

const THEME_SEQUENCE = [THEME_EINK, THEME_OLED_NIGHT, THEME_OLED_SMOOTH, THEME_PAPER_DAY];
const THEME_LABELS = {
  [THEME_EINK]: "墨水屏",
  [THEME_OLED_NIGHT]: "OLED黑夜",
  [THEME_OLED_SMOOTH]: "OLED防拖影",
  [THEME_PAPER_DAY]: "纸质白天",
};

const treeRoot = document.getElementById("tree-root");
const themeToggleButton = document.getElementById("theme-toggle");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-btn");
const searchClearButton = document.getElementById("search-clear-btn");
const directoryCache = new Map();
const directoryInFlight = new Map();
const DIRECTORY_CACHE_TTL_MS = 10000;
const DIRECTORY_PAGE_SIZE = 200;
const SHELF_STATE_KEY = "eink-box-shelf-state";

let expandedDirectoryPaths = new Set();
let pendingExpandedPaths = new Set();

function normalizeTheme(theme) {
  if (theme === THEME_LCD_LEGACY) {
    return THEME_PAPER_DAY;
  }
  return THEME_SEQUENCE.includes(theme) ? theme : THEME_EINK;
}

function readTheme() {
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

function currentTheme() {
  const matched = THEME_SEQUENCE.find((theme) => document.body.classList.contains(theme));
  return matched || THEME_EINK;
}

function nextTheme(theme) {
  const normalized = normalizeTheme(theme);
  const index = THEME_SEQUENCE.indexOf(normalized);
  return THEME_SEQUENCE[(index + 1) % THEME_SEQUENCE.length];
}

function clearThemeClasses() {
  document.body.classList.remove(THEME_LCD_LEGACY);
  THEME_SEQUENCE.forEach((theme) => {
    document.body.classList.remove(theme);
  });
}

function syncThemeToggleButton(theme) {
  if (!themeToggleButton) {
    return;
  }

  const normalized = normalizeTheme(theme);
  const next = nextTheme(normalized);
  themeToggleButton.textContent = `主题：${THEME_LABELS[normalized]} · 切换到 ${THEME_LABELS[next]}`;
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  clearThemeClasses();
  document.body.classList.add(normalized);
  localStorage.setItem(THEME_STORAGE_KEY, normalized);
  syncThemeToggleButton(normalized);
}

function toggleTheme() {
  applyTheme(nextTheme(currentTheme()));
}

function initThemeManager() {
  applyTheme(readTheme());

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", toggleTheme);
  }
}

function encodePathForApi(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function showMessage(message) {
  if (!treeRoot) {
    return;
  }

  const box = document.createElement("div");
  box.className = "message-box";
  box.textContent = message;
  treeRoot.replaceChildren(box);
}

function readShelfState() {
  try {
    const raw = sessionStorage.getItem(SHELF_STATE_KEY);
    if (!raw) {
      return { expandedPaths: [], scrollY: 0 };
    }

    const parsed = JSON.parse(raw);
    const expandedPaths = Array.isArray(parsed.expandedPaths)
      ? parsed.expandedPaths.filter((item) => typeof item === "string" && item)
      : [];
    const scrollY = Number.isFinite(Number(parsed.scrollY)) ? Number(parsed.scrollY) : 0;
    return { expandedPaths, scrollY };
  } catch (_) {
    return { expandedPaths: [], scrollY: 0 };
  }
}

function writeShelfState() {
  const payload = {
    expandedPaths: Array.from(expandedDirectoryPaths),
    scrollY: window.scrollY,
  };
  sessionStorage.setItem(SHELF_STATE_KEY, JSON.stringify(payload));
}

function setDirectoryExpanded(path, expanded) {
  if (!path) {
    return;
  }

  if (expanded) {
    expandedDirectoryPaths.add(path);
  } else {
    expandedDirectoryPaths.delete(path);
  }
  writeShelfState();
}

function getDirectoryCacheKey(path, page) {
  return `${path}::${page}`;
}

function readDirectoryCache(path, page) {
  const key = getDirectoryCacheKey(path, page);
  const cached = directoryCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    directoryCache.delete(key);
    return null;
  }

  return cached.payload;
}

function writeDirectoryCache(path, page, payload) {
  const key = getDirectoryCacheKey(path, page);
  directoryCache.set(key, {
    expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
    payload,
  });
}

function prefetchDirectoryPage(path, page) {
  if (!page) {
    return;
  }

  void fetchDirectoryPage(path, page).catch(() => {});
}

function createLoadMoreRow(label, onClick) {
  const li = document.createElement("li");
  li.className = "file-node";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle-btn";
  button.textContent = label;
  button.addEventListener("click", onClick);

  li.appendChild(button);
  return li;
}

function createDirectoryNode(node) {
  const li = document.createElement("li");
  li.className = "file-node";

  const details = document.createElement("details");
  details.className = "file-directory";
  details.dataset.path = node.path || "";

  const summary = document.createElement("summary");
  summary.className = "file-row dir-summary";

  const icon = document.createElement("span");
  icon.className = "node-icon dir-icon";
  icon.textContent = "📂";

  const label = document.createElement("span");
  label.className = "dir-label";
  label.textContent = node.name;

  const count = document.createElement("span");
  count.className = "dir-count";
  count.textContent = "(...)";

  summary.append(icon, label, count);

  const childList = document.createElement("ul");
  childList.className = "file-tree file-children";
  let nextPage = 1;
  let loadingPage = false;

  const renderPage = async (page, replaceList) => {
    if (loadingPage) {
      return;
    }

    loadingPage = true;
    if (replaceList) {
      childList.replaceChildren();
      const loading = document.createElement("li");
      loading.className = "file-node";
      loading.textContent = "加载中...";
      childList.appendChild(loading);
    }

    try {
      const payload = await fetchDirectoryPage(node.path, page);
      const children = Array.isArray(payload.items) ? payload.items : [];

      if (replaceList) {
        childList.replaceChildren();
      } else {
        const existingLoadMore = childList.querySelector("button");
        if (existingLoadMore && existingLoadMore.parentElement) {
          existingLoadMore.parentElement.remove();
        }
      }

      const fragment = document.createDocumentFragment();
      children.forEach((child) => {
        fragment.appendChild(renderFileTreeNode(child));
      });
      childList.appendChild(fragment);

      if (payload.has_more && payload.next_page) {
        childList.appendChild(
          createLoadMoreRow("加载更多", () => {
            void renderPage(payload.next_page, false);
          })
        );
        prefetchDirectoryPage(node.path, payload.next_page);
      }

      nextPage = payload.next_page || null;
      count.textContent = `(${payload.total})`;
      details.dataset.loaded = "1";
    } catch (error) {
      if (replaceList) {
        childList.replaceChildren();
      }
      const failed = document.createElement("li");
      failed.className = "file-node";
      failed.textContent = `加载失败：${error.message}`;
      childList.appendChild(failed);
      details.dataset.loaded = "0";
      count.textContent = "(!)";
    } finally {
      loadingPage = false;
    }
  };

  const renderChildrenOnce = async () => {
    if (details.dataset.loaded === "1" || details.dataset.loaded === "loading") {
      return;
    }

    details.dataset.loaded = "loading";
    nextPage = 1;
    await renderPage(nextPage, true);
  };

  details.addEventListener("toggle", () => {
    setDirectoryExpanded(node.path, details.open);
    if (details.open) {
      void renderChildrenOnce();
    }
  });

  if (pendingExpandedPaths.has(node.path)) {
    details.open = true;
    pendingExpandedPaths.delete(node.path);
  }

  details.append(summary, childList);
  li.appendChild(details);
  return li;
}

function createFileNode(node) {
  const li = document.createElement("li");
  li.className = "file-node file-leaf";

  const row = document.createElement("div");
  row.className = "file-row";

  const icon = document.createElement("span");
  icon.className = "node-icon file-icon";
  icon.textContent = "📄";
  row.appendChild(icon);

  const fileLink = document.createElement("a");
  fileLink.className = "file-link";
  fileLink.href = `/read?file=${encodeURIComponent(node.path)}`;
  fileLink.textContent = node.name;
  fileLink.addEventListener("click", () => {
    writeShelfState();
  });
  row.appendChild(fileLink);

  const pathLabel = document.createElement("span");
  pathLabel.className = "file-path";
  pathLabel.textContent = node.path;
  row.appendChild(pathLabel);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-button";
  deleteBtn.textContent = "[删除]";
  deleteBtn.addEventListener("click", async () => {
    const confirmed = window.confirm(`确认删除文件：${node.path} ？`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/files/${encodePathForApi(node.path)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let message = "删除失败";
        try {
          const payload = await response.json();
          message = payload.detail || message;
        } catch (_) {
          // ignore parsing failure
        }
        throw new Error(message);
      }

      li.remove();
      if (treeRoot && !treeRoot.querySelector(".file-node")) {
        showMessage("未找到 .txt 或 .epub 文件");
      }
    } catch (error) {
      showMessage(`删除失败：${error.message}`);
    }
  });
  row.appendChild(deleteBtn);

  li.appendChild(row);
  return li;
}

function renderFileTreeNode(node) {
  if (node.type === "directory") {
    return createDirectoryNode(node);
  }
  return createFileNode(node);
}

function renderRootLoadMore(container, nextPage) {
  if (!nextPage) {
    return;
  }

  const row = createLoadMoreRow("加载更多", async () => {
    try {
      row.remove();
      const payload = await fetchDirectoryPage("", nextPage);
      const ul = container.querySelector(".file-tree");
      if (!ul) {
        return;
      }

      const fragment = document.createDocumentFragment();
      payload.items.forEach((item) => {
        fragment.appendChild(renderFileTreeNode(item));
      });
      ul.appendChild(fragment);

      if (payload.has_more && payload.next_page) {
        renderRootLoadMore(container, payload.next_page);
        prefetchDirectoryPage("", payload.next_page);
      }
    } catch (error) {
      showMessage(`加载失败：${error.message}`);
    }
  });
  container.appendChild(row);
}

function renderFileTree(payload) {
  if (!treeRoot) {
    return;
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!Array.isArray(items) || items.length === 0) {
    showMessage("未找到 .txt 或 .epub 文件");
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "file-tree";

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(renderFileTreeNode(item));
  });
  ul.appendChild(fragment);

  treeRoot.replaceChildren(ul);
  if (payload.has_more && payload.next_page) {
    renderRootLoadMore(treeRoot, payload.next_page);
  }

  requestAnimationFrame(() => {
    const state = readShelfState();
    window.scrollTo(0, Math.max(0, state.scrollY));
  });
}

function renderSearchResults(query, items) {
  if (!treeRoot) {
    return;
  }

  const container = document.createElement("div");
  const title = document.createElement("div");
  title.className = "message-box";
  title.textContent = `搜索 “${query}” ：${items.length} 条结果`;
  container.appendChild(title);

  if (!Array.isArray(items) || items.length === 0) {
    treeRoot.replaceChildren(container);
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "file-tree";
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(createFileNode(item));
  });
  ul.appendChild(fragment);
  container.appendChild(ul);
  treeRoot.replaceChildren(container);
}

async function fetchSearchResults(query) {
  const params = new URLSearchParams({
    q: query,
    limit: "200",
  });
  const response = await fetch(`/api/search?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function runSearch() {
  const query = (searchInput?.value || "").trim();
  if (!query) {
    await loadFiles();
    return;
  }

  showMessage("搜索中...");
  try {
    const items = await fetchSearchResults(query);
    renderSearchResults(query, items);
  } catch (error) {
    showMessage(`搜索失败：${error.message}`);
  }
}

async function clearSearch() {
  if (searchInput) {
    searchInput.value = "";
  }
  await loadFiles();
}

function bindSearchControls() {
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      void runSearch();
    });
  }

  if (searchClearButton) {
    searchClearButton.addEventListener("click", () => {
      void clearSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      void runSearch();
    });
  }
}

async function fetchDirectoryPage(path = "", page = 1) {
  const key = getDirectoryCacheKey(path, page);
  const cached = readDirectoryCache(path, page);
  if (cached) {
    return cached;
  }

  if (directoryInFlight.has(key)) {
    return directoryInFlight.get(key);
  }

  const fetchPromise = (async () => {
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(DIRECTORY_PAGE_SIZE),
    });
    if (path) {
      query.set("path", path);
    }

    const endpoint = `/api/files?${query.toString()}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const normalized = {
      items: Array.isArray(payload.items) ? payload.items : [],
      total: Number(payload.total) || 0,
      page: Number(payload.page) || page,
      page_size: Number(payload.page_size) || DIRECTORY_PAGE_SIZE,
      has_more: Boolean(payload.has_more),
      next_page: payload.next_page ? Number(payload.next_page) : null,
    };
    writeDirectoryCache(path, page, normalized);
    return normalized;
  })();

  directoryInFlight.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    directoryInFlight.delete(key);
  }
}

async function loadFiles() {
  showMessage("加载中...");
  try {
    const state = readShelfState();
    expandedDirectoryPaths = new Set(state.expandedPaths);
    pendingExpandedPaths = new Set(state.expandedPaths);
    directoryCache.clear();
    directoryInFlight.clear();
    const payload = await fetchDirectoryPage("", 1);
    renderFileTree(payload);
    prefetchDirectoryPage("", payload.next_page);
  } catch (error) {
    showMessage(`加载失败：${error.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeManager();
  bindSearchControls();
  window.addEventListener("beforeunload", writeShelfState);
  void loadFiles();
});
