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
const themeModal = document.getElementById("theme-modal");
const themeModalOptions = document.getElementById("theme-modal-options");
const themeModalClose = document.getElementById("theme-modal-close");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-btn");
const searchClearButton = document.getElementById("search-clear-btn");
const recentReadingSection = document.getElementById("recent-reading-section");
const recentReadingList = document.getElementById("recent-reading-list");
const recentReadingClearButton = document.getElementById("recent-reading-clear");
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
  themeToggleButton.textContent = "模式";
  themeToggleButton.setAttribute("aria-label", `当前主题：${THEME_LABELS[normalized]}，点击选择模式`);
  themeToggleButton.title = `当前主题：${THEME_LABELS[normalized]}`;
}

function closeThemeModal() {
  if (!themeModal) {
    return;
  }
  themeModal.classList.add("hidden");
  themeModal.setAttribute("aria-hidden", "true");
}

function openThemeModal() {
  if (!themeModal || !themeModalOptions) {
    return;
  }

  themeModalOptions.replaceChildren();
  const activeTheme = currentTheme();

  THEME_SEQUENCE.forEach((theme) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `settings-btn${theme === activeTheme ? " is-selected" : ""}`;
    btn.textContent = theme === activeTheme ? `${THEME_LABELS[theme]} (当前)` : THEME_LABELS[theme];
    btn.addEventListener("click", () => {
      applyTheme(theme);
      closeThemeModal();
    });
    themeModalOptions.appendChild(btn);
  });

  themeModal.classList.remove("hidden");
  themeModal.setAttribute("aria-hidden", "false");
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  clearThemeClasses();
  document.body.classList.add(normalized);
  localStorage.setItem(THEME_STORAGE_KEY, normalized);
  syncThemeToggleButton(normalized);
}

function toggleTheme() {
  openThemeModal();
}

function initThemeManager() {
  applyTheme(readTheme());

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTheme();
    });
  }

  if (themeModalClose) {
    themeModalClose.addEventListener("click", closeThemeModal);
  }

  if (themeModal) {
    themeModal.addEventListener("click", (event) => {
      if (event.target === themeModal) {
        closeThemeModal();
      }
    });
  }
}

function encodePathForApi(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isWebDavPath(path) {
  return typeof path === "string" && path.startsWith("webdav://");
}

function isWebDavSourceRoot(path) {
  if (!isWebDavPath(path)) {
    return false;
  }
  const withoutPrefix = path.slice("webdav://".length);
  return !withoutPrefix.includes("/");
}

function encodeWebDavPathForApi(path) {
  const prefix = "webdav://";
  if (!isWebDavPath(path)) {
    return encodePathForApi(path);
  }

  const withoutPrefix = path.slice(prefix.length);
  const slashIndex = withoutPrefix.indexOf("/");
  if (slashIndex === -1) {
    return prefix + encodeURIComponent(withoutPrefix);
  }
  const sourceId = withoutPrefix.slice(0, slashIndex);
  const remaining = withoutPrefix.slice(slashIndex + 1);
  const encodedRemaining = remaining
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${prefix}${sourceId}/${encodedRemaining}`;
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

function formatRecentReadingMeta(item) {
  const progress = item.progress || {};
  if (progress.type === "txt" && Number.isFinite(progress.page)) {
    return `TXT · 第 ${progress.page} 页`;
  }
  if (progress.type === "pdf" && Number.isFinite(progress.page)) {
    return `PDF · 第 ${progress.page} 页`;
  }
  if (progress.type === "epub") {
    return "EPUB · 继续阅读";
  }
  return item.file_type ? item.file_type.toUpperCase() : "继续阅读";
}

async function loadRecentHistory() {
  if (!recentReadingSection || !recentReadingList) {
    return;
  }

  try {
    const response = await fetch("/api/reading-history/recent?limit=6");
    if (!response.ok) {
      throw new Error(await extractApiError(response));
    }
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    recentReadingList.replaceChildren();
    if (!items.length) {
      recentReadingSection.classList.add("hidden");
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "recent-reading-card";

      const row = document.createElement("div");
      row.className = "recent-reading-card-row";

      const link = document.createElement("a");
      link.href = `/read?file=${encodeURIComponent(item.filepath)}`;
      link.className = "recent-reading-title";

      const title = document.createElement("div");
      title.textContent = item.title || item.filepath;
      link.appendChild(title);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "recent-reading-remove";
      removeButton.textContent = "×";
      removeButton.title = `清除此书阅读记录：${item.title || item.filepath}`;
      removeButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(`确认清除此书的阅读记录：${item.title || item.filepath}？`)) {
          return;
        }
        try {
          const apiPath = isWebDavPath(item.filepath)
            ? encodeWebDavPathForApi(item.filepath)
            : encodePathForApi(item.filepath);
          const response = await fetch(`/api/reading-history/${apiPath}`, { method: "DELETE" });
          if (!response.ok) {
            throw new Error(await extractApiError(response));
          }
          void loadRecentHistory();
        } catch (error) {
          showMessage(`清除阅读记录失败：${error.message}`);
        }
      });

      row.append(link, removeButton);

      const meta = document.createElement("div");
      meta.className = "recent-reading-meta";
      meta.textContent = formatRecentReadingMeta(item);

      card.append(row, meta);
      recentReadingList.appendChild(card);
    });

    recentReadingSection.classList.remove("hidden");
  } catch (_) {
    recentReadingSection.classList.add("hidden");
  }
}

async function extractApiError(response) {
  let detail = "";
  try {
    const payload = await response.json();
    if (payload && typeof payload.detail === "string") {
      detail = payload.detail.trim();
    }
  } catch (_) {
    // ignore parse failures
  }
  return detail || `HTTP ${response.status}`;
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
  icon.textContent = isWebDavPath(node.path) ? "☁️" : "📂";

  const label = document.createElement("span");
  label.className = "dir-label";
  label.textContent = node.name;

  const count = document.createElement("span");
  count.className = "dir-count";
  count.textContent = "(...)";

  summary.append(icon, label, count);
  addDirectoryDeleteButton(summary, node);

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
  icon.textContent = isWebDavPath(node.path) ? "☁️" : "📄";
  row.appendChild(icon);

  const fileLink = document.createElement("a");
  fileLink.className = "file-link";
  fileLink.href = `/read?file=${encodeURIComponent(node.path)}`;
  fileLink.textContent = node.name;

  let preloadStarted = false;
  const triggerPreload = async () => {
    if (preloadStarted) {
      return;
    }
    preloadStarted = true;
    try {
      const apiPath = isWebDavPath(node.path)
        ? encodeWebDavPathForApi(node.path)
        : encodePathForApi(node.path);
      await fetch(`/api/preload/${apiPath}`, { method: "POST" });
    } catch (_) {
      // ignore preload failures
    }
  };

  fileLink.addEventListener("mouseenter", () => {
    void triggerPreload();
  });
  fileLink.addEventListener(
    "touchstart",
    () => {
      void triggerPreload();
    },
    { passive: true }
  );
  fileLink.addEventListener("click", () => {
    writeShelfState();
    void triggerPreload();
  });
  row.appendChild(fileLink);

  const pathLabel = document.createElement("span");
  pathLabel.className = "file-path";
  pathLabel.textContent = node.path;
  row.appendChild(pathLabel);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-button";
  deleteBtn.textContent = "×";
  deleteBtn.setAttribute("aria-label", `删除文件 ${node.name}`);
  deleteBtn.title = `删除文件：${node.name}`;
  deleteBtn.addEventListener("click", async () => {
    const isWebdav = isWebDavPath(node.path);
    const confirmMsg = isWebdav
      ? `确认从 WebDAV 服务器删除文件：${node.name} ？`
      : `确认删除文件：${node.path} ？`;
    if (!window.confirm(confirmMsg)) return;

    const apiPath = isWebdav
      ? encodeWebDavPathForApi(node.path)
      : encodePathForApi(node.path);

    try {
      const response = await fetch(`/api/files/${apiPath}`, { method: "DELETE" });

      if (!response.ok) {
        let message = "删除失败";
        try {
          const payload = await response.json();
          message = payload.detail || message;
        } catch (_) {}
        throw new Error(message);
      }

      li.remove();
      if (treeRoot && !treeRoot.querySelector(".file-node")) {
        showMessage("未找到 .txt / .epub / .pdf 文件");
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
    showMessage("未找到 .txt / .epub / .pdf 文件");
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
    throw new Error(await extractApiError(response));
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
      throw new Error(await extractApiError(response));
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

// ---------------------------------------------------------------------------
// Settings panel & WebDAV source management
// ---------------------------------------------------------------------------

const settingsToggle = document.getElementById("settings-toggle");
const settingsCloseBtn = document.getElementById("settings-close");
const settingsPanel = document.getElementById("shelf-settings-panel");
const settingsBackdrop = document.getElementById("shelf-settings-backdrop");

const webdavSourceIdInput = document.getElementById("webdav-source-id");
const webdavNameInput = document.getElementById("webdav-name");
const webdavBaseUrlInput = document.getElementById("webdav-base-url");
const webdavUsernameInput = document.getElementById("webdav-username");
const webdavPasswordInput = document.getElementById("webdav-password");
const webdavRemotePathInput = document.getElementById("webdav-remote-path");
const webdavEnabledInput = document.getElementById("webdav-enabled");
const webdavSaveBtn = document.getElementById("webdav-save-btn");
const webdavResetBtn = document.getElementById("webdav-reset-btn");
const webdavTestBtn = document.getElementById("webdav-test-btn");
const webdavStatus = document.getElementById("webdav-status");
const webdavSourcesList = document.getElementById("webdav-sources-list");
const webdavSourcesEmpty = document.getElementById("webdav-sources-empty");

function openSettingsPanel() {
  if (!settingsPanel || !settingsBackdrop) return;
  settingsPanel.classList.remove("hidden");
  settingsPanel.setAttribute("aria-hidden", "false");
  settingsBackdrop.classList.remove("hidden");
  settingsToggle?.setAttribute("aria-expanded", "true");
  void loadWebDavSources();
}

function closeSettingsPanel() {
  if (!settingsPanel || !settingsBackdrop) return;
  settingsPanel.classList.add("hidden");
  settingsPanel.setAttribute("aria-hidden", "true");
  settingsBackdrop.classList.add("hidden");
  settingsToggle?.setAttribute("aria-expanded", "false");
}

function resetWebDavForm() {
  webdavSourceIdInput && (webdavSourceIdInput.value = "");
  webdavNameInput && (webdavNameInput.value = "");
  webdavBaseUrlInput && (webdavBaseUrlInput.value = "");
  webdavUsernameInput && (webdavUsernameInput.value = "");
  webdavPasswordInput && (webdavPasswordInput.value = "");
  webdavRemotePathInput && (webdavRemotePathInput.value = "");
  if (webdavEnabledInput) {
    webdavEnabledInput.checked = true;
  }
}

function fillWebDavForm(source) {
  webdavSourceIdInput && (webdavSourceIdInput.value = source.id || "");
  webdavNameInput && (webdavNameInput.value = source.name || "");
  webdavBaseUrlInput && (webdavBaseUrlInput.value = source.base_url || "");
  webdavUsernameInput && (webdavUsernameInput.value = source.username || "");
  webdavPasswordInput && (webdavPasswordInput.value = source.password || "");
  webdavRemotePathInput && (webdavRemotePathInput.value = source.remote_path || "");
  if (webdavEnabledInput) {
    webdavEnabledInput.checked = source.enabled !== false;
  }
}

function collectWebDavForm() {
  return {
    name: (webdavNameInput?.value || "").trim(),
    base_url: (webdavBaseUrlInput?.value || "").trim(),
    username: (webdavUsernameInput?.value || "").trim(),
    password: webdavPasswordInput?.value || "",
    remote_path: (webdavRemotePathInput?.value || "").trim(),
    enabled: webdavEnabledInput?.checked !== false,
  };
}

function setWebDavStatus(text) {
  if (webdavStatus) {
    webdavStatus.textContent = text;
  }
}

async function loadWebDavSources() {
  try {
    const response = await fetch("/api/webdav/sources");
    if (!response.ok) throw new Error(await extractApiError(response));
    const payload = await response.json();
    renderWebDavSourcesList(Array.isArray(payload.items) ? payload.items : []);
  } catch (error) {
    setWebDavStatus(`加载来源失败: ${error.message}`);
  }
}

function renderWebDavSourcesList(items) {
  if (!webdavSourcesList) return;
  webdavSourcesList.replaceChildren();

  if (!items.length) {
    webdavSourcesEmpty?.classList.remove("hidden");
    return;
  }

  webdavSourcesEmpty?.classList.add("hidden");

  items.forEach((source) => {
    const card = document.createElement("div");
    card.className = "source-card" + (source.enabled === false ? " is-disabled" : "");

    const header = document.createElement("div");
    header.className = "source-card-header";

    const title = document.createElement("span");
    title.className = "source-title";
    title.textContent = source.name || "(未命名)";
    header.appendChild(title);

    const statusTag = document.createElement("span");
    statusTag.className = "source-meta";
    statusTag.textContent = source.enabled === false ? "[已禁用]" : "[启用]";
    header.appendChild(statusTag);
    card.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = `${source.base_url}${source.remote_path}`;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "source-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "settings-btn";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => {
      fillWebDavForm(source);
      settingsPanel?.scrollTo({ top: 0 });
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "settings-btn";
    deleteBtn.textContent = "删除来源";
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm(`确认删除来源: ${source.name}？\n（仅删除配置，不影响 WebDAV 服务器）`)) {
        return;
      }
      try {
        const resp = await fetch(`/api/webdav/sources/${source.id}`, { method: "DELETE" });
        if (!resp.ok) {
          throw new Error(await extractApiError(resp));
        }
        setWebDavStatus(`已删除来源: ${source.name}`);
        if (webdavSourceIdInput?.value === source.id) {
          resetWebDavForm();
        }
        directoryCache.clear();
        void loadWebDavSources();
        void loadFiles();
      } catch (error) {
        setWebDavStatus(`删除失败: ${error.message}`);
      }
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    webdavSourcesList.appendChild(card);
  });
}

async function saveWebDavSource() {
  const form = collectWebDavForm();
  if (!form.name || !form.base_url || !form.remote_path) {
    setWebDavStatus("请填写名称、服务器地址和远端目录");
    return;
  }

  const sourceId = webdavSourceIdInput?.value || "";
  const isEdit = !!sourceId;
  const url = isEdit ? `/api/webdav/sources/${sourceId}` : "/api/webdav/sources";
  const method = isEdit ? "PUT" : "POST";

  setWebDavStatus(isEdit ? "正在更新来源..." : "正在创建来源...");
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      throw new Error(await extractApiError(response));
    }

    setWebDavStatus(isEdit ? "来源已更新" : "来源已创建");
    resetWebDavForm();
    directoryCache.clear();
    void loadWebDavSources();
    void loadFiles();
  } catch (error) {
    setWebDavStatus(`保存失败: ${error.message}`);
  }
}

async function testWebDavSource() {
  const form = collectWebDavForm();
  if (!form.base_url || !form.username || !form.password || !form.remote_path) {
    setWebDavStatus("测试连接前请填写服务器地址、用户名、密码和远端目录");
    return;
  }

  setWebDavStatus("正在测试连接...");
  try {
    const response = await fetch("/api/webdav/sources/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_url: form.base_url,
        username: form.username,
        password: form.password,
        remote_path: form.remote_path,
      }),
    });

    if (!response.ok) {
      throw new Error(await extractApiError(response));
    }

    const payload = await response.json();
    const count = Number(payload.entry_count) || 0;
    setWebDavStatus(`连接成功，目录可访问（检测到 ${count} 项）`);
  } catch (error) {
    setWebDavStatus(`连接失败：${error.message}`);
  }
}

function bindSettingsControls() {
  if (settingsToggle) {
    settingsToggle.addEventListener("click", openSettingsPanel);
  }
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener("click", closeSettingsPanel);
  }
  if (settingsBackdrop) {
    settingsBackdrop.addEventListener("click", closeSettingsPanel);
  }
  if (webdavSaveBtn) {
    webdavSaveBtn.addEventListener("click", () => void saveWebDavSource());
  }
  if (webdavResetBtn) {
    webdavResetBtn.addEventListener("click", resetWebDavForm);
  }
}


function closeSettingsPanel() {
  if (!settingsPanel || !settingsBackdrop) return;
  settingsPanel.classList.add("hidden");
  settingsPanel.setAttribute("aria-hidden", "true");
  settingsBackdrop.classList.add("hidden");
  if (settingsToggle) settingsToggle.setAttribute("aria-expanded", "false");
}

function resetWebDavForm() {
  if (webdavSourceIdInput) webdavSourceIdInput.value = "";
  if (webdavNameInput) webdavNameInput.value = "";
  if (webdavBaseUrlInput) webdavBaseUrlInput.value = "";
  if (webdavUsernameInput) webdavUsernameInput.value = "";
  if (webdavPasswordInput) webdavPasswordInput.value = "";
  if (webdavRemotePathInput) webdavRemotePathInput.value = "";
  if (webdavEnabledInput) webdavEnabledInput.checked = true;
}

function fillWebDavForm(source) {
  if (webdavSourceIdInput) webdavSourceIdInput.value = source.id || "";
  if (webdavNameInput) webdavNameInput.value = source.name || "";
  if (webdavBaseUrlInput) webdavBaseUrlInput.value = source.base_url || "";
  if (webdavUsernameInput) webdavUsernameInput.value = source.username || "";
  if (webdavPasswordInput) webdavPasswordInput.value = source.password || "";
  if (webdavRemotePathInput) webdavRemotePathInput.value = source.remote_path || "";
  if (webdavEnabledInput) webdavEnabledInput.checked = source.enabled !== false;
}

function collectWebDavForm() {
  return {
    name: (webdavNameInput?.value || "").trim(),
    base_url: (webdavBaseUrlInput?.value || "").trim(),
    username: (webdavUsernameInput?.value || "").trim(),
    password: webdavPasswordInput?.value || "",
    remote_path: (webdavRemotePathInput?.value || "").trim(),
    enabled: webdavEnabledInput?.checked !== false,
  };
}

function setWebDavStatus(text) {
  if (webdavStatus) webdavStatus.textContent = text;
}

async function loadWebDavSources() {
  try {
    const response = await fetch("/api/webdav/sources");
    if (!response.ok) throw new Error(await extractApiError(response));
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    renderWebDavSourcesList(items);
  } catch (error) {
    setWebDavStatus(`加载来源失败: ${error.message}`);
  }
}

function renderWebDavSourcesList(items) {
  if (!webdavSourcesList) return;
  webdavSourcesList.replaceChildren();

  if (!items.length) {
    if (webdavSourcesEmpty) webdavSourcesEmpty.classList.remove("hidden");
    return;
  }

  if (webdavSourcesEmpty) webdavSourcesEmpty.classList.add("hidden");

  items.forEach((source) => {
    const card = document.createElement("div");
    card.className = "source-card" + (source.enabled === false ? " is-disabled" : "");

    const header = document.createElement("div");
    header.className = "source-card-header";

    const title = document.createElement("span");
    title.className = "source-title";
    title.textContent = source.name || "(未命名)";
    header.appendChild(title);

    const statusTag = document.createElement("span");
    statusTag.className = "source-meta";
    statusTag.textContent = source.enabled === false ? "[已禁用]" : "[启用]";
    header.appendChild(statusTag);
    card.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = `${source.base_url}${source.remote_path}`;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "source-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "settings-btn";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => {
      fillWebDavForm(source);
      settingsPanel?.scrollTo({ top: 0 });
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "settings-btn";
    deleteBtn.textContent = "删除来源";
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm(`确认删除来源: ${source.name}？\n（仅删除配置，不影响 WebDAV 服务器上的文件）`)) return;
      try {
        const resp = await fetch(`/api/webdav/sources/${source.id}`, { method: "DELETE" });
        if (!resp.ok) {
          throw new Error(await extractApiError(resp));
        }
        setWebDavStatus(`已删除来源: ${source.name}`);
        if (webdavSourceIdInput?.value === source.id) resetWebDavForm();
        directoryCache.clear();
        void loadWebDavSources();
        void loadFiles();
      } catch (error) {
        setWebDavStatus(`删除失败: ${error.message}`);
      }
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    webdavSourcesList.appendChild(card);
  });
}

async function saveWebDavSource() {
  const form = collectWebDavForm();
  if (!form.name || !form.base_url || !form.remote_path) {
    setWebDavStatus("请填写名称、服务器地址和远端目录");
    return;
  }

  const sourceId = webdavSourceIdInput?.value || "";
  const isEdit = !!sourceId;
  const url = isEdit ? `/api/webdav/sources/${sourceId}` : "/api/webdav/sources";
  const method = isEdit ? "PUT" : "POST";

  setWebDavStatus(isEdit ? "正在更新来源..." : "正在创建来源...");
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      throw new Error(await extractApiError(response));
    }

    setWebDavStatus(isEdit ? "来源已更新" : "来源已创建");
    resetWebDavForm();
    directoryCache.clear();
    void loadWebDavSources();
    void loadFiles();
  } catch (error) {
    setWebDavStatus(`保存失败: ${error.message}`);
  }
}

function bindSettingsControls() {
  if (settingsToggle) settingsToggle.addEventListener("click", openSettingsPanel);
  if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettingsPanel);
  if (settingsBackdrop) settingsBackdrop.addEventListener("click", closeSettingsPanel);
  if (webdavSaveBtn) webdavSaveBtn.addEventListener("click", () => void saveWebDavSource());
  if (webdavResetBtn) webdavResetBtn.addEventListener("click", resetWebDavForm);
  if (webdavTestBtn) webdavTestBtn.addEventListener("click", () => void testWebDavSource());
}

// ---------------------------------------------------------------------------
// Directory delete support
// ---------------------------------------------------------------------------

function addDirectoryDeleteButton(summary, node) {
  if (isWebDavSourceRoot(node.path)) return; // no delete button on WebDAV source root

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-button dir-delete-button";
  deleteBtn.textContent = "×";
  deleteBtn.setAttribute("aria-label", `删除目录 ${node.name}`);
  deleteBtn.title = `删除目录：${node.name}`;
  deleteBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const confirmed = window.confirm(
      `确认删除文件夹: ${node.path} ？\n注意：将递归删除所有子文件和子目录。`
    );
    if (!confirmed) return;

    try {
      const apiPath = isWebDavPath(node.path)
        ? encodeWebDavPathForApi(node.path)
        : encodePathForApi(node.path);
      const response = await fetch(`/api/files/${apiPath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let message = "删除失败";
        try {
          const payload = await response.json();
          message = payload.detail || message;
        } catch (_) {}
        throw new Error(message);
      }

      const li = summary.closest(".file-node");
      if (li) li.remove();
      if (treeRoot && !treeRoot.querySelector(".file-node")) {
        showMessage("未找到 .txt / .epub / .pdf 文件");
      }
    } catch (error) {
      showMessage(`删除失败: ${error.message}`);
    }
  });

  summary.appendChild(deleteBtn);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initThemeManager();
  bindSearchControls();
  bindSettingsControls();
  if (recentReadingClearButton) {
    recentReadingClearButton.addEventListener("click", async () => {
      if (!window.confirm("确认清除全部阅读记录？")) {
        return;
      }
      try {
        const response = await fetch("/api/reading-history", { method: "DELETE" });
        if (!response.ok) {
          throw new Error(await extractApiError(response));
        }
        void loadRecentHistory();
      } catch (error) {
        showMessage(`清除全部阅读记录失败：${error.message}`);
      }
    });
  }
  window.addEventListener("beforeunload", writeShelfState);
  void loadFiles();
  void loadRecentHistory();
});
