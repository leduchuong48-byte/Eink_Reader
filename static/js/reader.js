const THEME_STORAGE_KEY = "eink-box-theme";
const THEME_LCD_LEGACY = "theme-lcd";
const THEME_EINK = "theme-eink";
const THEME_OLED_NIGHT = "theme-oled-night";
const THEME_OLED_SMOOTH = "theme-oled-smooth";
const THEME_PAPER_DAY = "theme-paper-day";
const THEME_CYCLE = [THEME_EINK, THEME_OLED_NIGHT, THEME_OLED_SMOOTH, THEME_PAPER_DAY];
const THEME_LABELS = {
  [THEME_EINK]: "墨水屏",
  [THEME_OLED_NIGHT]: "OLED黑夜",
  [THEME_OLED_SMOOTH]: "OLED防拖影",
  [THEME_PAPER_DAY]: "纸质白天",
};

const LAYOUT_STORAGE_KEY = "eink-box-layout-settings";
const EPUB_DB_NAME = "eink-box-reader-db";
const EPUB_DB_VERSION = 1;
const EPUB_LOCATION_STORE = "epubLocations";
const EPUB_LOCATION_KEY_PREFIX = "locations:";
const FONT_PRESETS = [
  {
    name: "霞鹜文楷",
    css: '"LXGW WenKai", "Noto Serif SC", "Songti SC", "SimSun", serif',
  },
  {
    name: "宋体",
    css: '"Songti SC", "SimSun", serif',
  },
  {
    name: "黑体",
    css: '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  },
];

const LAYOUT_DEFAULTS = {
  fontIndex: 0,
  fontSize: 1.15,
  lineHeight: 1.75,
  padding: 1,
  textAlign: "justify",
};

const infoBar = document.getElementById("reader-info");
const infoBarText = document.getElementById("reader-info-text");
const progressText = document.getElementById("reader-progress");
const readerRoot = document.getElementById("reader-root");
const readerStage = document.getElementById("reader-stage");
const settingsPanel = document.getElementById("settings-panel");
const tocPanel = document.getElementById("toc-panel");
const tocList = document.getElementById("toc-list");
const txtContent = document.getElementById("txt-content");
const epubViewer = document.getElementById("epub-viewer");
const themeToggleButton = document.getElementById("theme-toggle");
const tocToggleButton = document.getElementById("toc-toggle");
const backToShelfButton = document.getElementById("back-to-shelf-btn");
const einkRefreshButton = document.getElementById("eink-refresh-btn");
const clearCacheButton = document.getElementById("clear-cache-btn");
const deleteBookButton = document.getElementById("delete-book-btn");

const layoutFontPrevBtn = document.getElementById("layout-font-prev");
const layoutFontNextBtn = document.getElementById("layout-font-next");
const layoutFontValue = document.getElementById("layout-font-value");

const layoutFontSizeDecBtn = document.getElementById("layout-font-size-dec");
const layoutFontSizeIncBtn = document.getElementById("layout-font-size-inc");
const layoutFontSizeValue = document.getElementById("layout-font-size-value");

const layoutLineHeightDecBtn = document.getElementById("layout-line-height-dec");
const layoutLineHeightIncBtn = document.getElementById("layout-line-height-inc");
const layoutLineHeightValue = document.getElementById("layout-line-height-value");

const layoutPaddingDecBtn = document.getElementById("layout-padding-dec");
const layoutPaddingIncBtn = document.getElementById("layout-padding-inc");
const layoutPaddingValue = document.getElementById("layout-padding-value");

const layoutAlignJustifyBtn = document.getElementById("layout-align-justify");
const layoutAlignLeftBtn = document.getElementById("layout-align-left");

const params = new URLSearchParams(window.location.search);
const filepath = params.get("file");

let layoutSettings = { ...LAYOUT_DEFAULTS };

let mode = null;
let rendition = null;
let epubBook = null;
let epubLocationsReady = false;
let flipLocked = false;
let touchStartX = null;
let touchStartY = null;
let lastWheelFlipAt = 0;
let ignoreClickUntil = 0;
let resizeDebounceTimer = null;
let dbInitPromise = null;
let einkRefreshTimer = null;
let pageFlipCount = 0;
let currentOffset = 0;
let txtTotalSize = 0;
let txtLoading = false;
let txtLoadMoreBtn = null;

const WHEEL_THROTTLE_MS = 260;
const SWIPE_THRESHOLD = 50;
const RESIZE_DEBOUNCE_MS = 200;
const PROGRESS_PLACEHOLDER = "--";
const PROGRESS_CALCULATING = "计算中...";
const EINK_REFRESH_DURATION_MS = 100;
const EINK_AUTO_REFRESH_EVERY_FLIPS = 15;
const TXT_CHUNK_LIMIT = 200000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return PROGRESS_PLACEHOLDER;
  }
  return `${(clamp(value, 0, 1) * 100).toFixed(1)}%`;
}

function setProgress(value) {
  if (!progressText) {
    return;
  }
  progressText.textContent = value;
}

function ensureTxtLoadMoreButton() {
  if (txtLoadMoreBtn) {
    return;
  }

  const controls = document.getElementById("reader-info-controls");
  if (!controls) {
    return;
  }

  const button = document.createElement("button");
  button.id = "load-more-btn";
  button.type = "button";
  button.className = "theme-toggle-btn hidden";
  button.addEventListener("click", () => {
    void loadMoreTxt();
  });

  controls.appendChild(button);
  txtLoadMoreBtn = button;
}

function updateTxtLoadMoreButton() {
  if (!txtLoadMoreBtn) {
    return;
  }

  if (mode !== "txt") {
    txtLoadMoreBtn.classList.add("hidden");
    txtLoadMoreBtn.disabled = true;
    return;
  }

  txtLoadMoreBtn.classList.remove("hidden");

  if (txtLoading) {
    txtLoadMoreBtn.textContent = "加载中...";
    txtLoadMoreBtn.disabled = true;
    return;
  }

  if (txtTotalSize <= 0 || currentOffset >= txtTotalSize) {
    txtLoadMoreBtn.textContent = "已加载完成";
    txtLoadMoreBtn.disabled = true;
    return;
  }

  const percent = ((currentOffset / txtTotalSize) * 100).toFixed(1);
  txtLoadMoreBtn.textContent = `已读 ${percent}% (加载更多)`;
  txtLoadMoreBtn.disabled = false;
}

async function fetchTxtChunk(offset) {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(TXT_CHUNK_LIMIT),
  });
  const response = await fetch(`/api/content/${encodePathForApi(filepath)}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function appendTxtChunk(content) {
  const chunk = document.createElement("div");
  chunk.className = "text-chunk";
  chunk.textContent = content || "";
  txtContent.appendChild(chunk);
}

async function loadMoreTxt() {
  if (txtLoading || mode !== "txt") {
    return;
  }

  txtLoading = true;
  updateTxtLoadMoreButton();

  try {
    const payload = await fetchTxtChunk(currentOffset);
    const nextOffset = Number(payload.next_offset);
    const totalSize = Number(payload.total_size);

    if (!Number.isFinite(nextOffset) || !Number.isFinite(totalSize)) {
      throw new Error("响应缺少有效偏移信息");
    }

    if (nextOffset < currentOffset) {
      throw new Error("服务端返回了无效偏移量");
    }

    appendTxtChunk(payload.content || "");
    currentOffset = nextOffset;
    txtTotalSize = totalSize;
    updateTxtProgress();
  } finally {
    txtLoading = false;
    updateTxtLoadMoreButton();
  }
}

function getEpubLocationCacheKey(filePath) {
  return `${EPUB_LOCATION_KEY_PREFIX}${filePath}`;
}

function initDB() {
  if (!("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve) => {
    const request = indexedDB.open(EPUB_DB_NAME, EPUB_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EPUB_LOCATION_STORE)) {
        db.createObjectStore(EPUB_LOCATION_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      resolve(null);
    };

    request.onblocked = () => {
      resolve(null);
    };
  });

  return dbInitPromise;
}

async function getEpubLocations(key) {
  if (!key) {
    return null;
  }

  const db = await initDB();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(EPUB_LOCATION_STORE, "readonly");
    const store = tx.objectStore(EPUB_LOCATION_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };

    request.onerror = () => {
      resolve(null);
    };

    tx.onabort = () => {
      resolve(null);
    };
  });
}

async function setEpubLocations(key, data) {
  if (!key || !data) {
    return;
  }

  const db = await initDB();
  if (!db) {
    return;
  }

  await new Promise((resolve) => {
    const tx = db.transaction(EPUB_LOCATION_STORE, "readwrite");
    const store = tx.objectStore(EPUB_LOCATION_STORE);
    const request = store.put(data, key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      resolve();
    };

    tx.onabort = () => {
      resolve();
    };
  });
}

async function clearEpubLocations() {
  const db = await initDB();
  if (!db) {
    return false;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(EPUB_LOCATION_STORE, "readwrite");
    const store = tx.objectStore(EPUB_LOCATION_STORE);
    const request = store.clear();

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      resolve(false);
    };

    tx.onabort = () => {
      resolve(false);
    };
  });
}

function encodePathForApi(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeTheme(theme) {
  if (theme === THEME_LCD_LEGACY) {
    return THEME_PAPER_DAY;
  }
  return THEME_CYCLE.includes(theme) ? theme : THEME_EINK;
}

function readTheme() {
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

function currentTheme() {
  const matched = THEME_CYCLE.find((theme) => document.body.classList.contains(theme));
  return matched || THEME_EINK;
}

function nextTheme(theme) {
  const normalized = normalizeTheme(theme);
  const index = THEME_CYCLE.indexOf(normalized);
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
}

function clearThemeClasses() {
  document.body.classList.remove(THEME_LCD_LEGACY);
  THEME_CYCLE.forEach((theme) => {
    document.body.classList.remove(theme);
  });
}

function syncThemeToggleButton(theme) {
  if (!themeToggleButton) {
    return;
  }

  const normalized = normalizeTheme(theme);
  const next = nextTheme(normalized);
  themeToggleButton.textContent = `模式：${THEME_LABELS[normalized]} · 切换到${THEME_LABELS[next]}`;
}

function readBodyThemeVars() {
  const styles = getComputedStyle(document.body);
  return {
    bg: styles.getPropertyValue("--bg-color").trim(),
    text: styles.getPropertyValue("--text-color").trim(),
    border: styles.getPropertyValue("--border-color").trim(),
    accent: styles.getPropertyValue("--accent-color").trim(),
  };
}

function getCurrentFontPreset() {
  return FONT_PRESETS[layoutSettings.fontIndex] || FONT_PRESETS[0];
}

function getLayoutCssVars() {
  const preset = getCurrentFontPreset();
  return {
    dynFontFamily: preset.css,
    dynFontSize: `${layoutSettings.fontSize}rem`,
    dynLineHeight: String(layoutSettings.lineHeight),
    dynPadding: `${layoutSettings.padding}rem`,
    dynTextAlign: layoutSettings.textAlign,
  };
}

function sanitizeLayoutSettings(raw) {
  const sanitized = { ...LAYOUT_DEFAULTS };

  if (!raw || typeof raw !== "object") {
    return sanitized;
  }

  const fontIndex = Number(raw.fontIndex);
  if (Number.isInteger(fontIndex) && fontIndex >= 0 && fontIndex < FONT_PRESETS.length) {
    sanitized.fontIndex = fontIndex;
  }

  const fontSize = Number(raw.fontSize);
  if (Number.isFinite(fontSize)) {
    sanitized.fontSize = round(clamp(fontSize, 0.9, 2.2));
  }

  const lineHeight = Number(raw.lineHeight);
  if (Number.isFinite(lineHeight)) {
    sanitized.lineHeight = round(clamp(lineHeight, 1.2, 2.6));
  }

  const padding = Number(raw.padding);
  if (Number.isFinite(padding)) {
    sanitized.padding = round(clamp(padding, 0.4, 4));
  }

  sanitized.textAlign = raw.textAlign === "left" ? "left" : "justify";

  return sanitized;
}

function readLayoutSettings() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return { ...LAYOUT_DEFAULTS };
    }
    return sanitizeLayoutSettings(JSON.parse(raw));
  } catch (_) {
    return { ...LAYOUT_DEFAULTS };
  }
}

function persistLayoutSettings() {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutSettings));
}

function syncLayoutPanelValues() {
  const preset = getCurrentFontPreset();

  if (layoutFontValue) {
    layoutFontValue.textContent = preset.name;
  }

  if (layoutFontSizeValue) {
    layoutFontSizeValue.textContent = `${layoutSettings.fontSize.toFixed(2)}rem`;
  }

  if (layoutLineHeightValue) {
    layoutLineHeightValue.textContent = layoutSettings.lineHeight.toFixed(2);
  }

  if (layoutPaddingValue) {
    layoutPaddingValue.textContent = `${layoutSettings.padding.toFixed(2)}rem`;
  }

  if (layoutAlignJustifyBtn) {
    layoutAlignJustifyBtn.classList.toggle("is-active", layoutSettings.textAlign === "justify");
  }

  if (layoutAlignLeftBtn) {
    layoutAlignLeftBtn.classList.toggle("is-active", layoutSettings.textAlign === "left");
  }
}

function setTocPanelVisible(visible) {
  if (!tocPanel) {
    return;
  }

  tocPanel.classList.toggle("hidden", !visible);
  tocPanel.setAttribute("aria-hidden", visible ? "false" : "true");
}

function closeTocPanel() {
  setTocPanelVisible(false);
}

function toggleTocPanel() {
  if (!tocPanel) {
    return;
  }

  const shouldShow = tocPanel.classList.contains("hidden");
  setTocPanelVisible(shouldShow);
}

function renderToc(toc = [], emptyMessage = "暂无目录") {
  if (!tocList) {
    return;
  }

  tocList.replaceChildren();

  const appendNodes = (items, depth) => {
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "toc-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "toc-link";
      button.textContent = item.label || item.href || "未命名章节";
      button.style.paddingLeft = `${0.45 + depth * 0.9}rem`;

      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!rendition || !item.href) {
          return;
        }

        try {
          await rendition.display(item.href);
          closeTocPanel();
        } catch (_) {
          // ignore toc jump errors
        }
      });

      li.appendChild(button);
      tocList.appendChild(li);

      if (Array.isArray(item.subitems) && item.subitems.length > 0) {
        appendNodes(item.subitems, depth + 1);
      }
    });
  };

  if (!Array.isArray(toc) || toc.length === 0) {
    const li = document.createElement("li");
    li.className = "toc-item";

    const placeholder = document.createElement("div");
    placeholder.className = "settings-value";
    placeholder.textContent = emptyMessage;

    li.appendChild(placeholder);
    tocList.appendChild(li);
    return;
  }

  appendNodes(toc, 0);
}

function applyThemeVarsToEpubContent(content) {
  if (!content || !content.document || !content.document.documentElement) {
    return;
  }

  const themeVars = readBodyThemeVars();
  const layoutVars = getLayoutCssVars();
  const rootStyle = content.document.documentElement.style;

  if (themeVars.bg) {
    rootStyle.setProperty("--bg-color", themeVars.bg);
  }
  if (themeVars.text) {
    rootStyle.setProperty("--text-color", themeVars.text);
  }
  if (themeVars.border) {
    rootStyle.setProperty("--border-color", themeVars.border);
  }
  if (themeVars.accent) {
    rootStyle.setProperty("--accent-color", themeVars.accent);
  }

  rootStyle.setProperty("--dyn-font-family", layoutVars.dynFontFamily);
  rootStyle.setProperty("--dyn-font-size", layoutVars.dynFontSize);
  rootStyle.setProperty("--dyn-line-height", layoutVars.dynLineHeight);
  rootStyle.setProperty("--dyn-padding", layoutVars.dynPadding);
  rootStyle.setProperty("--dyn-text-align", layoutVars.dynTextAlign);

  if (content.document.body) {
    content.document.body.style.overscrollBehavior = "none";
  }
}

function pushThemeAndLayoutToEpubContents() {
  if (!rendition || mode !== "epub") {
    return;
  }

  const contents = rendition.getContents();
  contents.forEach((content) => {
    applyThemeVarsToEpubContent(content);
  });
}

function updateTxtProgress() {
  if (mode !== "txt") {
    return;
  }

  const max = Math.max(0, txtContent.scrollWidth - window.innerWidth);
  if (max <= 0) {
    setProgress("100.0%");
    return;
  }

  setProgress(formatPercent(txtContent.scrollLeft / max));
}

function updateEpubProgressFromLocation(location) {
  const cfi = location?.start?.cfi;
  if (!epubBook || !epubLocationsReady || !cfi) {
    setProgress(PROGRESS_CALCULATING);
    return;
  }

  try {
    const percentage = epubBook.locations.percentageFromCfi(cfi);
    setProgress(formatPercent(percentage));
  } catch (_) {
    setProgress(PROGRESS_PLACEHOLDER);
  }
}

function forceEinkRefresh() {
  const overlay = document.getElementById("eink-flash-overlay");
  if (!overlay) {
    return;
  }

  overlay.classList.remove("hidden");

  if (einkRefreshTimer) {
    clearTimeout(einkRefreshTimer);
  }

  einkRefreshTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    einkRefreshTimer = null;
  }, EINK_REFRESH_DURATION_MS);
}

function onPageFlipped() {
  if (currentTheme() !== THEME_EINK) {
    return;
  }

  pageFlipCount += 1;
  if (pageFlipCount < EINK_AUTO_REFRESH_EVERY_FLIPS) {
    return;
  }

  pageFlipCount = 0;
  forceEinkRefresh();
}

function applyLayoutSettings(options = {}) {
  const { persist = true, syncTxtPosition = true } = options;
  let txtPercent = 0;

  if (mode === "txt" && syncTxtPosition) {
    const maxScroll = Math.max(0, txtContent.scrollWidth - window.innerWidth);
    txtPercent = maxScroll > 0 ? txtContent.scrollLeft / maxScroll : 0;
  }

  const vars = getLayoutCssVars();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--dyn-font-family", vars.dynFontFamily);
  rootStyle.setProperty("--dyn-font-size", vars.dynFontSize);
  rootStyle.setProperty("--dyn-line-height", vars.dynLineHeight);
  rootStyle.setProperty("--dyn-padding", vars.dynPadding);
  rootStyle.setProperty("--dyn-text-align", vars.dynTextAlign);

  syncLayoutPanelValues();

  if (persist) {
    persistLayoutSettings();
  }

  if (mode === "txt" && syncTxtPosition) {
    requestAnimationFrame(() => {
      if (mode !== "txt") {
        return;
      }

      const newMaxScroll = Math.max(0, txtContent.scrollWidth - window.innerWidth);
      const safePercent = Number.isFinite(txtPercent) ? txtPercent : 0;
      const target = newMaxScroll > 0
        ? Math.round((newMaxScroll * safePercent) / window.innerWidth) * window.innerWidth
        : 0;
      const clamped = Math.max(0, Math.min(target, newMaxScroll));

      applyTxtPosition(clamped);
      saveProgress({ type: "txt", scrollLeft: txtContent.scrollLeft });
      updateTxtProgress();
    });
  }

  if (mode === "epub" && rendition) {
    if (rendition.themes && typeof rendition.themes.fontSize === "function") {
      rendition.themes.fontSize(vars.dynFontSize);
    }
    pushThemeAndLayoutToEpubContents();
  }
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  clearThemeClasses();
  document.body.classList.add(normalized);
  localStorage.setItem(THEME_STORAGE_KEY, normalized);
  syncThemeToggleButton(normalized);
  pushThemeAndLayoutToEpubContents();
}

function toggleTheme() {
  applyTheme(nextTheme(currentTheme()));
}

function initThemeManager() {
  applyTheme(readTheme());

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTheme();
    });
  }
}

function shiftFont(step) {
  const length = FONT_PRESETS.length;
  const next = (layoutSettings.fontIndex + step + length) % length;
  layoutSettings.fontIndex = next;
  applyLayoutSettings();
}

function adjustFontSize(step) {
  layoutSettings.fontSize = round(clamp(layoutSettings.fontSize + step, 0.9, 2.2));
  applyLayoutSettings();
}

function adjustLineHeight(step) {
  layoutSettings.lineHeight = round(clamp(layoutSettings.lineHeight + step, 1.2, 2.6));
  applyLayoutSettings();
}

function adjustPadding(step) {
  layoutSettings.padding = round(clamp(layoutSettings.padding + step, 0.4, 4));
  applyLayoutSettings();
}

function setTextAlign(align) {
  layoutSettings.textAlign = align === "left" ? "left" : "justify";
  applyLayoutSettings();
}

function bindLayoutControls() {
  if (!settingsPanel) {
    return;
  }

  settingsPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  settingsPanel.addEventListener(
    "wheel",
    (event) => {
      event.stopPropagation();
    },
    { passive: false }
  );

  if (layoutFontPrevBtn) {
    layoutFontPrevBtn.addEventListener("click", () => shiftFont(-1));
  }
  if (layoutFontNextBtn) {
    layoutFontNextBtn.addEventListener("click", () => shiftFont(1));
  }

  if (layoutFontSizeDecBtn) {
    layoutFontSizeDecBtn.addEventListener("click", () => adjustFontSize(-0.05));
  }
  if (layoutFontSizeIncBtn) {
    layoutFontSizeIncBtn.addEventListener("click", () => adjustFontSize(0.05));
  }

  if (layoutLineHeightDecBtn) {
    layoutLineHeightDecBtn.addEventListener("click", () => adjustLineHeight(-0.05));
  }
  if (layoutLineHeightIncBtn) {
    layoutLineHeightIncBtn.addEventListener("click", () => adjustLineHeight(0.05));
  }

  if (layoutPaddingDecBtn) {
    layoutPaddingDecBtn.addEventListener("click", () => adjustPadding(-0.1));
  }
  if (layoutPaddingIncBtn) {
    layoutPaddingIncBtn.addEventListener("click", () => adjustPadding(0.1));
  }

  if (layoutAlignJustifyBtn) {
    layoutAlignJustifyBtn.addEventListener("click", () => setTextAlign("justify"));
  }
  if (layoutAlignLeftBtn) {
    layoutAlignLeftBtn.addEventListener("click", () => setTextAlign("left"));
  }

  if (einkRefreshButton) {
    einkRefreshButton.addEventListener("click", () => {
      pageFlipCount = 0;
      forceEinkRefresh();
    });
  }

  if (clearCacheButton) {
    clearCacheButton.addEventListener("click", async () => {
      const shouldClear = window.confirm("确认清除阅读缓存？");
      if (!shouldClear) {
        return;
      }

      try {
        await clearEpubLocations();
      } catch (_) {
        // ignore clear failures and continue reset flow
      }

      localStorage.removeItem(progressKey());
      window.location.reload();
    });
  }

  if (deleteBookButton) {
    deleteBookButton.addEventListener("click", async () => {
      if (!filepath) {
        window.alert("缺少文件路径，无法删除。");
        return;
      }

      const confirmed = window.confirm("警告：此操作将从 NAS 中彻底删除该文件，且不可恢复。是否继续？");
      if (!confirmed) {
        return;
      }

      try {
        const response = await fetch(`/api/files/${encodePathForApi(filepath)}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          let message = `删除失败（HTTP ${response.status}）`;
          try {
            const payload = await response.json();
            if (payload && typeof payload.detail === "string" && payload.detail.trim()) {
              message = `删除失败：${payload.detail}`;
            }
          } catch (_) {
            // ignore parse failures
          }
          throw new Error(message);
        }

        try {
          await clearEpubLocations();
        } catch (_) {
          // ignore cache clear failures
        }

        localStorage.removeItem(progressKey());
        window.location.replace("/");
      } catch (error) {
        const message = error instanceof Error ? error.message : "删除失败，请稍后重试。";
        window.alert(message);
      }
    });
  }
}

function bindTocControls() {
  if (tocPanel) {
    tocPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (tocToggleButton) {
    tocToggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTocPanel();
    });
  }

  if (backToShelfButton) {
    backToShelfButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const hasHistory = window.history.length > 1;
      const sameOriginReferrer =
        typeof document.referrer === "string" && document.referrer.startsWith(window.location.origin);
      if (hasHistory && sameOriginReferrer) {
        window.history.back();
        return;
      }
      window.location.assign("/");
    });
  }
}

function initLayoutManager() {
  layoutSettings = readLayoutSettings();
  applyLayoutSettings({ persist: false, syncTxtPosition: false });
  bindLayoutControls();
}

function progressKey() {
  return `eink-box-progress:${filepath}`;
}

function setInfo(message) {
  infoBarText.textContent = message;
}

function readProgress() {
  try {
    const raw = localStorage.getItem(progressKey());
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveProgress(payload) {
  localStorage.setItem(
    progressKey(),
    JSON.stringify({
      filepath,
      ...payload,
    })
  );
}

function isControlTarget(target) {
  return Boolean(
    target &&
      typeof target.closest === "function" &&
      (target.closest("#settings-panel") || target.closest("#reader-info") || target.closest("#toc-panel"))
  );
}

function applyTxtPosition(position) {
  const max = Math.max(0, txtContent.scrollWidth - window.innerWidth);
  txtContent.scrollLeft = Math.max(0, Math.min(Number(position) || 0, max));
  updateTxtProgress();
}

function turnTxtPage(direction) {
  const current = txtContent.scrollLeft;
  const max = Math.max(0, txtContent.scrollWidth - window.innerWidth);
  const target = current + direction * window.innerWidth;
  const clamped = Math.max(0, Math.min(target, max));

  if (clamped === current) {
    return;
  }

  applyTxtPosition(clamped);
  saveProgress({ type: "txt", scrollLeft: clamped });
  onPageFlipped();
}

async function turnEpubPage(direction) {
  if (!rendition || flipLocked) {
    return;
  }

  if (!epubLocationsReady) {
    setProgress(PROGRESS_CALCULATING);
  }

  const beforeCfi = rendition.currentLocation()?.start?.cfi || null;

  flipLocked = true;
  try {
    if (direction > 0) {
      await rendition.next();
    } else {
      await rendition.prev();
    }

    const afterCfi = rendition.currentLocation()?.start?.cfi || null;
    if (afterCfi && afterCfi !== beforeCfi) {
      onPageFlipped();
    }
  } finally {
    flipLocked = false;
  }
}

function goPrevPage() {
  if (mode === "txt") {
    turnTxtPage(-1);
    return;
  }

  if (mode === "epub") {
    void turnEpubPage(-1);
  }
}

function goNextPage() {
  if (mode === "txt") {
    turnTxtPage(1);
    return;
  }

  if (mode === "epub") {
    void turnEpubPage(1);
  }
}

function setReaderChromeVisible(visible) {
  if (infoBar) {
    infoBar.classList.toggle("hidden", !visible);
  }
  if (settingsPanel) {
    settingsPanel.classList.toggle("hidden", !visible);
    settingsPanel.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  if (!visible) {
    closeTocPanel();
  }
}

function toggleReaderChrome() {
  const shouldShow =
    (infoBar && infoBar.classList.contains("hidden")) ||
    (settingsPanel && settingsPanel.classList.contains("hidden"));
  setReaderChromeVisible(Boolean(shouldShow));
}

function handleRegionTap(clientX) {
  const ratio = clientX / window.innerWidth;

  if (ratio < 0.3) {
    goPrevPage();
    return;
  }

  if (ratio > 0.7) {
    goNextPage();
    return;
  }

  toggleReaderChrome();
}

function handleStageClick(event) {
  if (Date.now() < ignoreClickUntil) {
    return;
  }

  if (isControlTarget(event.target)) {
    return;
  }

  handleRegionTap(event.clientX);
}

function handleWheelNavigation(event) {
  if (isControlTarget(event.target)) {
    return;
  }

  if (event.cancelable) {
    event.preventDefault();
  }

  const now = Date.now();
  if (now - lastWheelFlipAt < WHEEL_THROTTLE_MS) {
    return;
  }

  if (Math.abs(event.deltaY) < 1) {
    return;
  }

  lastWheelFlipAt = now;

  if (event.deltaY < 0) {
    goPrevPage();
  } else {
    goNextPage();
  }
}

function handleTouchStart(event) {
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  if (!touch) {
    return;
  }

  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function handleTouchEnd(event) {
  const touch = event.changedTouches?.[0];
  if (!touch || touchStartX === null || touchStartY === null) {
    touchStartX = null;
    touchStartY = null;
    return;
  }

  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;

  touchStartX = null;
  touchStartY = null;

  const isHorizontalSwipe =
    Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY);

  if (!isHorizontalSwipe) {
    return;
  }

  ignoreClickUntil = Date.now() + 320;

  if (deltaX > 0) {
    goPrevPage();
  } else {
    goNextPage();
  }
}

function isTypingTarget(target) {
  if (!target || !target.tagName) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function handleKeyNavigation(event) {
  if (isTypingTarget(event.target)) {
    return;
  }

  const key = event.key;

  if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp") {
    event.preventDefault();
    goPrevPage();
    return;
  }

  if (
    key === "ArrowRight" ||
    key === "ArrowDown" ||
    key === "PageDown" ||
    key === " " ||
    key === "Spacebar"
  ) {
    event.preventDefault();
    goNextPage();
  }
}

function handleWindowResize() {
  if (mode === "txt") {
    const snapped = Math.round(txtContent.scrollLeft / window.innerWidth) * window.innerWidth;
    applyTxtPosition(snapped);
    saveProgress({ type: "txt", scrollLeft: txtContent.scrollLeft });
    return;
  }

  if (mode === "epub" && rendition) {
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }

    resizeDebounceTimer = setTimeout(() => {
      if (mode === "epub" && rendition) {
        rendition.resize();
        pushThemeAndLayoutToEpubContents();
      }
    }, RESIZE_DEBOUNCE_MS);
  }
}

function bindReaderInteractions() {
  if (readerStage) {
    readerStage.addEventListener("click", handleStageClick);
    readerStage.addEventListener("touchstart", handleTouchStart, { passive: true });
    readerStage.addEventListener("touchend", handleTouchEnd, { passive: true });
  }

  if (readerRoot) {
    readerRoot.addEventListener("wheel", handleWheelNavigation, { passive: false });
    readerRoot.addEventListener(
      "touchmove",
      (event) => {
        if (isControlTarget(event.target)) {
          return;
        }

        if (event.cancelable) {
          event.preventDefault();
        }
      },
      { passive: false }
    );
  }

  if (infoBar) {
    infoBar.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  window.addEventListener("keydown", handleKeyNavigation);
  window.addEventListener("resize", handleWindowResize);
}

function bindEpubInteractionListeners(contents) {
  const doc = contents?.document;
  if (!doc || !doc.documentElement) {
    return;
  }

  if (doc.documentElement.dataset.einkInteractionBound === "1") {
    return;
  }
  doc.documentElement.dataset.einkInteractionBound = "1";

  doc.addEventListener(
    "click",
    (event) => {
      if (Date.now() < ignoreClickUntil) {
        return;
      }

      const target = event.target;
      if (target && typeof target.closest === "function" && target.closest("a[href]")) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      handleRegionTap(event.clientX);
    },
    { passive: false }
  );

  doc.addEventListener("wheel", handleWheelNavigation, { passive: false });
  doc.addEventListener("touchstart", handleTouchStart, { passive: true });
  doc.addEventListener("touchend", handleTouchEnd, { passive: true });
  doc.addEventListener("keydown", handleKeyNavigation);
}

async function loadTxtFile() {
  ensureTxtLoadMoreButton();
  txtContent.replaceChildren();
  txtContent.classList.remove("hidden");
  epubViewer.classList.add("hidden");

  mode = "txt";
  rendition = null;
  epubBook = null;
  epubLocationsReady = false;
  currentOffset = 0;
  txtTotalSize = 0;
  txtLoading = false;
  closeTocPanel();
  renderToc([], "TXT 文件不支持目录");

  await loadMoreTxt();

  const saved = readProgress();
  if (saved && saved.type === "txt") {
    applyTxtPosition(saved.scrollLeft);
  } else {
    applyTxtPosition(0);
  }

  applyLayoutSettings({ persist: false, syncTxtPosition: false });
  updateTxtProgress();
  setInfo(`TXT：${filepath}`);
  updateTxtLoadMoreButton();
}

async function loadEpub() {
  if (typeof window.ePub !== "function") {
    throw new Error("epub.js 未加载");
  }

  txtContent.classList.add("hidden");
  epubViewer.classList.remove("hidden");
  mode = "epub";
  updateTxtLoadMoreButton();
  setProgress(PROGRESS_PLACEHOLDER);
  closeTocPanel();
  renderToc([], "目录加载中...");

  epubBook = window.ePub(`/api/content/${encodePathForApi(filepath)}`);
  epubLocationsReady = false;

  rendition = epubBook.renderTo("epub-viewer", {
    width: "100%",
    height: "100%",
    spread: "none",
  });

  rendition.hooks.content.register((contents) => {
    const style = contents.document.createElement("style");
    style.textContent = `
      html,
      body {
        background: var(--bg-color) !important;
        color: var(--text-color) !important;
        margin: 0 !important;
        padding-top: 0.4rem !important;
        padding-right: var(--dyn-padding) !important;
        padding-bottom: 2rem !important;
        padding-left: var(--dyn-padding) !important;
        font-family: var(--dyn-font-family) !important;
        font-size: var(--dyn-font-size) !important;
        line-height: var(--dyn-line-height) !important;
        text-align: var(--dyn-text-align) !important;
      }
      a,
      a:visited {
        color: var(--accent-color) !important;
      }
      body,
      body * {
        color: var(--text-color) !important;
        border-color: var(--border-color) !important;
        box-shadow: none !important;
        text-shadow: none !important;
        transition: none !important;
        animation: none !important;
        scroll-behavior: auto !important;
        filter: none !important;
        font-family: var(--dyn-font-family) !important;
        line-height: var(--dyn-line-height) !important;
        text-align: var(--dyn-text-align) !important;
      }
      body,
      body *:not(img):not(svg):not(video):not(canvas) {
        background: var(--bg-color) !important;
      }
    `;
    contents.document.head.appendChild(style);

    applyThemeVarsToEpubContent(contents);
    bindEpubInteractionListeners(contents);
  });

  rendition.on("relocated", (location) => {
    const cfi = location?.start?.cfi;
    if (cfi) {
      saveProgress({ type: "epub", cfi });
    }

    updateEpubProgressFromLocation(location);
  });

  const saved = readProgress();
  if (saved && saved.type === "epub" && saved.cfi) {
    await rendition.display(saved.cfi);
  } else {
    await rendition.display();
  }

  applyLayoutSettings({ persist: false, syncTxtPosition: false });
  pushThemeAndLayoutToEpubContents();

  try {
    const nav = await epubBook.loaded.navigation;
    renderToc(nav?.toc || [], "此书无目录");
  } catch (_) {
    renderToc([], "目录加载失败");
  }

  setInfo(`EPUB：${filepath}`);

  void (async () => {
    try {
      await epubBook.ready;

      const locationCacheKey = getEpubLocationCacheKey(filepath);
      const cachedLocations = await getEpubLocations(locationCacheKey);

      if (cachedLocations) {
        try {
          epubBook.locations.load(cachedLocations);
        } catch (_) {
          setProgress(PROGRESS_CALCULATING);
          await epubBook.locations.generate(1600);
          const generatedLocations = epubBook.locations.save();
          void setEpubLocations(locationCacheKey, generatedLocations);
        }
      } else {
        setProgress(PROGRESS_CALCULATING);
        await epubBook.locations.generate(1600);
        const generatedLocations = epubBook.locations.save();
        void setEpubLocations(locationCacheKey, generatedLocations);
      }

      epubLocationsReady = true;
      updateEpubProgressFromLocation(rendition.currentLocation());
    } catch (_) {
      epubLocationsReady = false;
      setProgress(PROGRESS_PLACEHOLDER);
    }
  })();
}

async function initializeReader() {
  if (!filepath) {
    setInfo("缺少参数：file");
    setProgress(PROGRESS_PLACEHOLDER);
    return;
  }

  const normalized = filepath.toLowerCase();
  try {
    if (normalized.endsWith(".txt")) {
      await loadTxtFile();
      return;
    }

    if (normalized.endsWith(".epub")) {
      await loadEpub();
      return;
    }

    throw new Error("不支持的文件类型");
  } catch (error) {
    setInfo(`加载失败：${error.message}`);
    setProgress(PROGRESS_PLACEHOLDER);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeManager();
  initLayoutManager();
  bindTocControls();
  bindReaderInteractions();
  void initDB();
  void initializeReader();
});
