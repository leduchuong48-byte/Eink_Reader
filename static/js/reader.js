const THEME_STORAGE_KEY = "eink-box-theme";
const DEVICE_ID_STORAGE_KEY = "eink-box-device-id";
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
  bottomInset: 0.8,
  textAlign: "justify",
};

const TXT_HEADING_RULES_CORE = [
  {
    id: "chapter-standard",
    kind: "chapter",
    pattern: /^\s*第\s*[0-9０-９零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬]+\s*[章节卷回节篇部幕册集话季]\s*(?:[：:、._·\-— ]?\s*[\S　 ]{0,30})?\s*$/u,
  },
  {
    id: "chapter-numeric",
    kind: "chapter",
    pattern: /^\s*[0-9０-９零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬]+\s*[章节卷回节篇部幕册集话季]\s*(?:[：:、._·\-— ]?\s*[\S　 ]{0,24})?\s*$/u,
  },
  {
    id: "preface",
    kind: "preface",
    pattern: /^\s*(扉页|序|序章|引|引子|前言|楔子)\s*$/u,
  },
  {
    id: "ending",
    kind: "ending",
    pattern: /^\s*(尾声|后记|终章|末章|最终章)\s*$/u,
  },
  {
    id: "chapter-english",
    kind: "chapter",
    pattern: /^\s*chapter\s+[0-9０-９]+\s*(?:[:：.\-— ]\s*[\S ]{0,24})?\s*$/iu,
  },
  {
    id: "chapter-bracketed",
    kind: "chapter",
    pattern: /^\s*[【\[]\s*(第\s*[0-9０-９零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬]+\s*[章节卷回节篇部幕册集话季]|序章|序|引子|前言|楔子|尾声|后记|终章|末章|最终章)\s*[】\]]\s*$/u,
  },
  {
    id: "chapter-numeric-alone",
    kind: "chapter",
    pattern: /^\s*[0-9０-９]{1,4}\s*$/u,
  },
  {
    id: "chapter-numbered-delimiter",
    kind: "chapter",
    pattern: /^\s*(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬]{1,6})\s*[、.．]\s*[\S　 ]{1,24}\s*$/u,
  },
];

const infoBar = document.getElementById("reader-info");
const infoBarText = document.getElementById("reader-info-text");
const progressText = document.getElementById("reader-progress");
const readerRoot = document.getElementById("reader-root");
const readerStage = document.getElementById("reader-stage");
const settingsPanel = document.getElementById("settings-panel");
const tocPanel = document.getElementById("toc-panel");
const tocList = document.getElementById("toc-list");
const txtContent = document.getElementById("txt-content");
const txtMeasure = document.getElementById("txt-measure");
const epubViewer = document.getElementById("epub-viewer");
const pdfViewer = document.getElementById("pdf-viewer");
const themeToggleButton = document.getElementById("theme-toggle");
const tocToggleButton = document.getElementById("toc-toggle");
const backToShelfButton = document.getElementById("back-to-shelf-btn");
const pagePrevButton = document.getElementById("page-prev-btn");
const pageNextButton = document.getElementById("page-next-btn");
const pdfZoomOutButton = document.getElementById("pdf-zoom-out");
const pdfZoomInButton = document.getElementById("pdf-zoom-in");
const pdfZoomValue = document.getElementById("pdf-zoom-value");
const pdfFitWidthButton = document.getElementById("pdf-fit-width");
const pdfFitHeightButton = document.getElementById("pdf-fit-height");
const pdfPageInput = document.getElementById("pdf-page-input");
const pdfPageGoButton = document.getElementById("pdf-page-go");
const settingsToggleButton = document.getElementById("settings-toggle");
const einkRefreshButton = document.getElementById("eink-refresh-btn");
const clearCacheButton = document.getElementById("clear-cache-btn");
const deleteBookButton = document.getElementById("delete-book-btn");
const readerStatusOverlay = document.getElementById("reader-status-overlay");
const readerStatusTitle = document.getElementById("reader-status-title");
const readerStatusDetail = document.getElementById("reader-status-detail");
const readerRetryButton = document.getElementById("reader-retry-btn");
const readerBackButton = document.getElementById("reader-back-btn");
const themeModal = document.getElementById("theme-modal");
const themeModalOptions = document.getElementById("theme-modal-options");
const themeModalClose = document.getElementById("theme-modal-close");

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
const layoutBottomInsetDecBtn = document.getElementById("layout-bottom-inset-dec");
const layoutBottomInsetIncBtn = document.getElementById("layout-bottom-inset-inc");
const layoutBottomInsetValue = document.getElementById("layout-bottom-inset-value");

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
let txtRawContent = "";
let txtBlocks = [];
let txtPages = [];
let txtCurrentPage = 0;
let txtCurrentOffset = 0;
let txtToc = [];
let txtPaginationVersion = 0;
const txtPaginationCache = new Map();
let pdfDoc = null;
let pdfPage = 1;
let pdfPageRendering = false;
let pdfScale = 1;
let pdfFitMode = "width";
let toolbarVisible = true;
let initialProgress = null;

const WHEEL_THROTTLE_MS = 260;
const SWIPE_THRESHOLD = 50;
const RESIZE_DEBOUNCE_MS = 200;
const PROGRESS_PLACEHOLDER = "--";
const PROGRESS_CALCULATING = "计算中...";
const EINK_REFRESH_DURATION_MS = 100;
const EINK_AUTO_REFRESH_EVERY_FLIPS = 15;
const TXT_CHUNK_LIMIT = 80000;
const PDF_SCALE_MIN = 0.7;
const PDF_SCALE_MAX = 2.4;

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

function updateReaderViewportInsets() {
  const root = document.documentElement;
  const toolbarHeight = infoBar ? Math.ceil(infoBar.getBoundingClientRect().height) : 0;
  const vv = window.visualViewport;
  const visualBottomOffset = vv
    ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)))
    : 0;

  root.style.setProperty("--reader-toolbar-height", `${toolbarHeight}px`);
  root.style.setProperty("--reader-visual-offset", `${visualBottomOffset}px`);
  root.style.setProperty("--reader-manual-bottom-inset", `${layoutSettings.bottomInset}rem`);
}

function getTxtPaginationCacheKey() {
  const width = txtContent ? Math.round(txtContent.clientWidth) : 0;
  const height = txtContent ? Math.round(txtContent.clientHeight) : 0;
  return [
    txtRawContent.length,
    width,
    height,
    layoutSettings.fontIndex,
    layoutSettings.fontSize,
    layoutSettings.lineHeight,
    layoutSettings.padding,
    layoutSettings.bottomInset,
    toolbarVisible ? 1 : 0,
  ].join(":");
}

function refreshReaderViewportLayout() {
  updateReaderViewportInsets();
  requestAnimationFrame(() => {
    if (mode === "txt") {
      const currentPage = txtCurrentPage;
      const currentOffset = txtCurrentOffset;
      setTimeout(() => {
        paginateTxtContent();
        const targetIndex = findTxtPageIndexByOffset(currentOffset);
        renderTxtPage(Math.min(targetIndex ?? currentPage, Math.max(0, txtPages.length - 1)));
      }, 0);
      return;
    }

    if (mode === "pdf" && pdfDoc) {
      void renderPdfPage(pdfPage);
      return;
    }

    if (mode === "epub" && rendition) {
      rendition.resize();
      pushThemeAndLayoutToEpubContents();
    }
  });
}

function normalizeTxtHeadingCandidate(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .trim();
}

function matchTxtHeadingRule(text, rules) {
  return rules.find((rule) => rule.pattern.test(text)) || null;
}

function matchLegacySimpleHeadingRule(text) {
  return /^(第.{0,20}[章节回部卷集篇]|【.+】|\d+[、.．]|Chapter\s+\d+)/i.test(text) && text.length <= 40;
}

function isTxtHeading(text) {
  return Boolean(getTxtHeadingKind(text));
}

function getTxtHeadingKind(text) {
  const value = normalizeTxtHeadingCandidate(text);
  if (!value) {
    return null;
  }

  const matched = matchTxtHeadingRule(value, TXT_HEADING_RULES_CORE);
  if (matched) {
    return matched.kind;
  }

  if (matchLegacySimpleHeadingRule(value)) {
    return "chapter";
  }

  return null;
}

function parseTxtBlocks(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const rawBlocks = normalized.match(/[^\n]*\n|[^\n]+$/g)?.filter((item) => item.length > 0) || [normalized];

  return rawBlocks
    .map((raw) => {
      const lineText = raw.replace(/\n$/g, "");
      const trimmed = lineText.trim();
      if (!trimmed) {
        return {
          raw,
          rawLength: raw.length,
          text: "",
          blank: true,
          heading: false,
          headingKind: null,
        };
      }
      const headingKind = getTxtHeadingKind(trimmed);
      return {
        raw,
        rawLength: raw.length,
        text: lineText,
        blank: false,
        heading: Boolean(headingKind),
        headingKind,
      };
    })
    .filter(Boolean);
}

function normalizeTxtChunkText(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

function createTxtParagraphNode(block) {
  if (block.blank) {
    const spacer = document.createElement("div");
    spacer.className = "txt-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  }

  const node = document.createElement(block.heading ? "p" : "div");
  node.className = block.heading
    ? `txt-paragraph txt-heading txt-heading-${block.headingKind || "generic"}`
    : "txt-line";
  node.textContent = block.text;
  return node;
}

function renderTxtBlocks(container, blocks) {
  container.replaceChildren();
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return;
  }

  blocks.forEach((block) => {
    container.appendChild(createTxtParagraphNode(block));
  });
}

function splitTxtBlockForMeasure(block, maxLength) {
  const safeLength = Math.max(1, Math.min(maxLength, block.raw.length));
  const rawPart = block.raw.slice(0, safeLength);
  const textValue = rawPart.replace(/\n$/g, "");
  return {
    raw: rawPart,
    rawLength: rawPart.length,
    text: textValue,
    blank: !textValue.trim(),
    heading: block.heading && safeLength === block.raw.length,
    headingKind: block.heading && safeLength === block.raw.length ? block.headingKind : null,
  };
}

function renderTxtPage(pageIndex) {
  const safeIndex = Math.max(0, Math.min(pageIndex, Math.max(0, txtPages.length - 1)));
  txtCurrentPage = safeIndex;
  const page = txtPages[safeIndex] || { blocks: [], start: 0 };
  renderTxtBlocks(txtContent, page.blocks);
  txtContent.scrollTop = 0;
  txtCurrentOffset = page.start || 0;
  saveProgress({ type: "txt", page: txtCurrentPage, offset: txtCurrentOffset });
  scheduleRemoteProgressSave();
  updateTxtLoadMoreButton();
  if (tocPanel && !tocPanel.classList.contains("hidden")) {
    renderToc(txtToc, txtToc.length ? "" : "TXT 未识别到目录");
  }
}

function findTxtPageIndexByOffset(offset) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const index = txtPages.findIndex((page) => safeOffset >= page.start && safeOffset < page.end);
  if (index >= 0) {
    return index;
  }
  return Math.max(0, txtPages.length - 1);
}

function buildTxtToc() {
  const normalizeLabel = (text, kind) => {
    const value = String(text || "").trim();
    if (!value) {
      return "未命名章节";
    }
    if (kind === "chapter" && /^\d+$/.test(value)) {
      return `第${value}章`;
    }
    if (kind === "preface" && value === "序") {
      return "序章";
    }
    return value;
  };

  const kindPrefix = (kind) => {
    if (kind === "preface") return "前置";
    if (kind === "ending") return "终章";
    return "章节";
  };

  const items = [];
  txtPages.forEach((page, pageIndex) => {
    page.blocks.forEach((block) => {
      if (!block.heading || !block.headingKind) {
        return;
      }
      items.push({
        label: `${kindPrefix(block.headingKind)} · ${normalizeLabel(block.text, block.headingKind)}`,
        pageText: `第 ${pageIndex + 1} 页`,
        kind: block.headingKind,
        page: pageIndex,
        offset: page.start,
      });
    });
  });
  txtToc = items;
}

function getActiveTxtTocIndex() {
  if (!Array.isArray(txtToc) || !txtToc.length) {
    return -1;
  }

  let activeIndex = -1;
  txtToc.forEach((item, index) => {
    if (Number.isInteger(item.page) && item.page <= txtCurrentPage) {
      activeIndex = index;
    }
  });
  return activeIndex;
}

async function ensureTxtPageAvailable(targetPage) {
  while (targetPage >= txtPages.length && currentOffset < txtTotalSize) {
    await loadMoreTxt();
  }
}

function ensureTxtLoadMoreButton() {
  // Deprecated in paged TXT mode. Kept as no-op for compatibility.
}

function paginateTxtContent() {
  const content = txtRawContent || "";
  if (!content) {
    txtPages = [{ start: 0, end: 0, blocks: [] }];
    return;
  }

  const cacheKey = getTxtPaginationCacheKey();
  const cachedPages = txtPaginationCache.get(cacheKey);
  if (cachedPages) {
    txtPages = cachedPages;
    return;
  }

  const pages = [];
  const blocks = txtBlocks.length ? txtBlocks : parseTxtBlocks(content);
  const target = txtMeasure || txtContent;
  let currentBlocks = [];
  let pageStart = 0;
  let consumedOffset = 0;

  const measureFits = (candidateBlocks) => {
    renderTxtBlocks(target, candidateBlocks);
    return target.scrollHeight <= target.clientHeight;
  };

  const flushPage = (endOffset) => {
    pages.push({
      start: pageStart,
      end: endOffset,
      blocks: currentBlocks,
    });
    pageStart = endOffset;
    currentBlocks = [];
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const blockLength = block.rawLength;

    if (block.heading && currentBlocks.length) {
      flushPage(consumedOffset);
    }

    const candidate = currentBlocks.concat(block);

    if (candidate.length && measureFits(candidate)) {
      currentBlocks = candidate;
      consumedOffset += blockLength;

      const nextBlock = blocks[index + 1];
      if (block.heading && currentBlocks.length === 1 && nextBlock) {
        const headingWithNext = currentBlocks.concat(nextBlock);
        if (measureFits(headingWithNext)) {
          currentBlocks = headingWithNext;
          consumedOffset += nextBlock.rawLength;
          index += 1;
        }
      }
      continue;
    }

    if (currentBlocks.length) {
      flushPage(consumedOffset);
    }

    if (measureFits([block])) {
      currentBlocks = [block];
      consumedOffset += blockLength;
      continue;
    }

    let remaining = block.text;
    let remainingBlock = block;
    while (remainingBlock.rawLength > 0) {
      let low = 1;
      let high = remainingBlock.rawLength;
      let best = 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const piece = splitTxtBlockForMeasure(remainingBlock, mid);
        if (measureFits([piece])) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const piece = splitTxtBlockForMeasure(remainingBlock, best);
      currentBlocks = [piece];
      consumedOffset += piece.rawLength;
      flushPage(consumedOffset);
      const rawRemainder = remainingBlock.raw.slice(best);
      if (!rawRemainder.length) {
        remainingBlock = { ...remainingBlock, raw: "", rawLength: 0, text: "" };
      } else {
        const remainderText = rawRemainder.replace(/\n+$/g, "").trim();
        remainingBlock = {
          ...remainingBlock,
          raw: rawRemainder,
          rawLength: rawRemainder.length,
          text: remainderText || rawRemainder.trim() || rawRemainder,
          heading: false,
        };
      }
    }
  }

  if (currentBlocks.length) {
    flushPage(consumedOffset);
  }

  const reconstructedLength = pages.reduce((sum, page) => sum + Math.max(0, page.end - page.start), 0);
  if (reconstructedLength !== content.length) {
    console.warn("TXT pagination length mismatch", {
      contentLength: content.length,
      reconstructedLength,
    });
  }

  txtPages = pages.length ? pages : [{ start: 0, end: content.length, blocks }];
  buildTxtToc();
  txtPaginationCache.set(cacheKey, txtPages);
}

function updateTxtLoadMoreButton() {
  if (mode !== "txt") {
    return;
  }
  pagePrevButton?.classList.remove("hidden");
  pageNextButton?.classList.remove("hidden");
  setProgress(`第 ${txtCurrentPage + 1}/${Math.max(1, txtPages.length)} 页`);
  if (pdfPageInput) {
    pdfPageInput.classList.remove("hidden");
    pdfPageInput.max = String(Math.max(1, txtPages.length));
    pdfPageInput.value = String(txtCurrentPage + 1);
  }
  if (pdfPageGoButton) {
    pdfPageGoButton.classList.remove("hidden");
  }
}

async function fetchTxtChunk(offset) {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(TXT_CHUNK_LIMIT),
  });
  const response = await fetch(`/api/content/${encodePathForApi(filepath)}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(await extractApiError(response));
  }

  return response.json();
}

function appendTxtChunk(content) {
  const normalized = normalizeTxtChunkText(content);
  txtRawContent += normalized;
  txtBlocks = txtBlocks.concat(parseTxtBlocks(normalized));
  txtPaginationCache.clear();
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
    paginateTxtContent();
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

function isWebDavPath(path) {
  return typeof path === "string" && path.startsWith("webdav://");
}

function encodeWebDavPathForApi(path) {
  const prefix = "webdav://";
  if (!isWebDavPath(path)) {
    return encodePathForApi(path);
  }

  const withoutPrefix = path.slice(prefix.length);
  const slashIndex = withoutPrefix.indexOf("/");
  if (slashIndex === -1) {
    return `${prefix}${encodeURIComponent(withoutPrefix)}`;
  }

  const sourceId = withoutPrefix.slice(0, slashIndex);
  const remaining = withoutPrefix.slice(slashIndex + 1);
  const encodedRemaining = remaining
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${prefix}${sourceId}/${encodedRemaining}`;
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
  themeToggleButton.textContent = "模式";
  themeToggleButton.setAttribute("aria-label", `当前模式：${THEME_LABELS[normalized]}，点击选择模式`);
  themeToggleButton.title = `当前模式：${THEME_LABELS[normalized]}`;
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

  THEME_CYCLE.forEach((theme) => {
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

  const bottomInset = Number(raw.bottomInset);
  if (Number.isFinite(bottomInset)) {
    sanitized.bottomInset = round(clamp(bottomInset, 0, 3.2));
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

  if (layoutBottomInsetValue) {
    layoutBottomInsetValue.textContent = `${layoutSettings.bottomInset.toFixed(2)}rem`;
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
  if (visible) {
    setSettingsVisible(false);
    setToolbarVisible(true);
  }
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

  const activeTxtTocIndex = mode === "txt" ? getActiveTxtTocIndex() : -1;
  let activeButton = null;

  const appendNodes = (items, depth) => {
    items.forEach((item, currentIndex) => {
      const li = document.createElement("li");
      li.className = "toc-item";

      const button = document.createElement("button");
      button.type = "button";
      const isActiveTxtItem = mode === "txt" && currentIndex === activeTxtTocIndex;
      button.className = `toc-link${item.kind ? ` toc-link-${item.kind}` : ""}${isActiveTxtItem ? " is-active" : ""}`;
      if (isActiveTxtItem) {
        button.setAttribute("aria-current", "true");
        activeButton = button;
      }
      button.textContent = item.pageText ? `${item.label || item.href || "未命名章节"} · ${item.pageText}` : (item.label || item.href || "未命名章节");
      button.style.paddingLeft = `${0.45 + depth * 0.9}rem`;

      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (mode === "txt" && Number.isInteger(item.page)) {
          renderTxtPage(item.page);
          closeTocPanel();
          return;
        }

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

  if (activeButton) {
    requestAnimationFrame(() => {
      activeButton.scrollIntoView({ block: "nearest" });
    });
  }
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
  rootStyle.setProperty("--reader-content-bottom-space", getComputedStyle(document.body).getPropertyValue("--reader-content-bottom-space").trim() || "8rem");

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
  setProgress(`第 ${txtCurrentPage + 1}/${Math.max(1, txtPages.length)} 页`);
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

function updatePdfProgress() {
  if (mode !== "pdf" || !pdfDoc) {
    pagePrevButton?.classList.add("hidden");
    pageNextButton?.classList.add("hidden");
    pdfZoomOutButton?.classList.add("hidden");
    pdfZoomInButton?.classList.add("hidden");
    pdfZoomValue?.classList.add("hidden");
    pdfFitWidthButton?.classList.add("hidden");
    pdfFitHeightButton?.classList.add("hidden");
    pdfPageInput?.classList.add("hidden");
    pdfPageGoButton?.classList.add("hidden");
    return;
  }

  pagePrevButton?.classList.remove("hidden");
  pageNextButton?.classList.remove("hidden");
  pdfZoomOutButton?.classList.remove("hidden");
  pdfZoomInButton?.classList.remove("hidden");
  pdfZoomValue?.classList.remove("hidden");
  pdfFitWidthButton?.classList.remove("hidden");
  pdfFitHeightButton?.classList.remove("hidden");
  pdfPageInput?.classList.remove("hidden");
  pdfPageGoButton?.classList.remove("hidden");

  if (pdfFitWidthButton) {
    pdfFitWidthButton.textContent = pdfFitMode === "width" ? "适配宽*" : "适配宽";
  }
  if (pdfFitHeightButton) {
    pdfFitHeightButton.textContent = pdfFitMode === "height" ? "适配高*" : "适配高";
  }

  if (pdfZoomValue) {
    pdfZoomValue.textContent = `${Math.round(pdfScale * 100)}%`;
  }
  if (pdfPageInput) {
    pdfPageInput.max = String(pdfDoc.numPages);
    pdfPageInput.value = String(pdfPage);
  }
  setProgress(`第 ${pdfPage}/${pdfDoc.numPages} 页`);
}

async function renderPdfPage(pageNumber) {
  if (!pdfViewer || !pdfDoc) {
    return;
  }
  if (pdfPageRendering) {
    return;
  }
  pdfPageRendering = true;

  try {
    const page = await pdfDoc.getPage(pageNumber);
    const existingCanvas = pdfViewer.querySelector("canvas");
    const canvas = existingCanvas || document.createElement("canvas");
    if (!existingCanvas) {
      canvas.className = "pdf-canvas";
      pdfViewer.replaceChildren(canvas);
    }

    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = Math.max(320, pdfViewer.clientWidth - 24);
    const maxHeight = Math.max(320, pdfViewer.clientHeight - 24);
    const fitScale = pdfFitMode === "height"
      ? (maxHeight / baseViewport.height)
      : (maxWidth / baseViewport.width);
    const viewport = page.getViewport({ scale: fitScale * pdfScale });
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("无法初始化 PDF 画布");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${Math.ceil(viewport.width)}px`;
    canvas.style.height = `${Math.ceil(viewport.height)}px`;

    await page.render({ canvasContext: context, viewport }).promise;
    pdfPage = pageNumber;
    saveProgress({ type: "pdf", page: pdfPage });
    scheduleRemoteProgressSave();
    updatePdfProgress();
  } finally {
    pdfPageRendering = false;
  }
}

function changePdfScale(delta) {
  if (!pdfDoc || mode !== "pdf") {
    return;
  }
  pdfScale = round(clamp(pdfScale + delta, PDF_SCALE_MIN, PDF_SCALE_MAX), 2);
  void renderPdfPage(pdfPage);
}

async function jumpPdfPage() {
  if (!pdfPageInput) {
    return;
  }
  const value = Number(pdfPageInput.value);
  if (!Number.isFinite(value)) {
    return;
  }

  if (mode === "txt") {
    const target = Math.max(1, Math.floor(value));
    await ensureTxtPageAvailable(target - 1);
    renderTxtPage(Math.max(0, Math.min(target - 1, Math.max(0, txtPages.length - 1))));
    return;
  }

  if (!pdfDoc || mode !== "pdf") {
    return;
  }
  const target = Math.max(1, Math.min(pdfDoc.numPages, Math.floor(value)));
  await renderPdfPage(target);
}

function setPdfFitMode(modeName) {
  if (mode !== "pdf" || !pdfDoc) {
    return;
  }
  if (modeName !== "width" && modeName !== "height") {
    return;
  }
  pdfFitMode = modeName;
  void renderPdfPage(pdfPage);
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
  let txtPage = txtCurrentPage;

  if (mode === "txt" && syncTxtPosition) {
    txtPage = txtCurrentPage;
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
      paginateTxtContent();
      const saved = readProgress();
      const targetIndex = saved && saved.type === "txt"
        ? findTxtPageIndexByOffset(saved.offset ?? txtCurrentOffset)
        : Math.min(txtPage, Math.max(0, txtPages.length - 1));
      applyTxtPosition(targetIndex);
      saveProgress({ type: "txt", page: txtCurrentPage, offset: txtCurrentOffset });
      scheduleRemoteProgressSave();
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

function adjustBottomInset(step) {
  layoutSettings.bottomInset = round(clamp(layoutSettings.bottomInset + step, 0, 3.2));
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

  if (layoutBottomInsetDecBtn) {
    layoutBottomInsetDecBtn.addEventListener("click", () => adjustBottomInset(-0.1));
  }
  if (layoutBottomInsetIncBtn) {
    layoutBottomInsetIncBtn.addEventListener("click", () => adjustBottomInset(0.1));
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
        const apiPath = isWebDavPath(filepath)
          ? encodeWebDavPathForApi(filepath)
          : encodePathForApi(filepath);
        const response = await fetch(`/api/files/${apiPath}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const message = `删除失败：${await extractApiError(response)}`;
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
  if (readerRetryButton) {
    readerRetryButton.addEventListener("click", () => {
      void initializeReader();
    });
  }

  if (readerBackButton) {
    readerBackButton.addEventListener("click", () => {
      window.location.assign("/");
    });
  }

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

  if (settingsToggleButton) {
    settingsToggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSettingsPanel();
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

function showReaderStatus(title, detail = "", { retry = false, back = true } = {}) {
  if (!readerStatusOverlay) {
    return;
  }
  if (readerStatusTitle) {
    readerStatusTitle.textContent = title || "加载中";
  }
  if (readerStatusDetail) {
    readerStatusDetail.textContent = detail || "";
  }
  readerStatusOverlay.classList.remove("hidden");
  if (readerRetryButton) {
    readerRetryButton.classList.toggle("hidden", !retry);
  }
  if (readerBackButton) {
    readerBackButton.classList.toggle("hidden", !back);
  }
}

function hideReaderStatus() {
  readerStatusOverlay?.classList.add("hidden");
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
      updated_at: new Date().toISOString(),
      ...payload,
    })
  );
}

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = (crypto && typeof crypto.randomUUID === "function") ? crypto.randomUUID() : `device-${Date.now()}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

function getDeviceName() {
  return `${navigator.userAgent.includes("Android") ? "Android" : "Browser"} · ${navigator.userAgent.includes("Chrome") ? "Chrome" : "WebView"}`;
}

async function fetchRemoteProgress() {
  const response = await fetch(`/api/reading-history/${encodePathForApi(filepath)}`);
  if (!response.ok) {
    throw new Error(await extractApiError(response));
  }
  const payload = await response.json();
  return payload.item || null;
}

function mergeProgress(localProgress, remoteProgress) {
  if (!localProgress) return remoteProgress;
  if (!remoteProgress) return localProgress;
  const localTs = Date.parse(localProgress.updated_at || 0) || 0;
  const remoteTs = Date.parse(remoteProgress.updated_at || 0) || 0;
  return remoteTs > localTs ? remoteProgress.progress : localProgress;
}

function buildReadingProgressPayload() {
  if (mode === "txt") {
    return { type: "txt", page: txtCurrentPage + 1, offset: txtCurrentOffset, percent: txtPages.length ? txtCurrentPage / txtPages.length : 0 };
  }
  if (mode === "pdf") {
    return { type: "pdf", page: pdfPage, percent: pdfDoc ? pdfPage / pdfDoc.numPages : 0 };
  }
  if (mode === "epub") {
    const saved = readProgress();
    return { type: "epub", cfi: saved?.cfi || null, percent: null, chapter_href: saved?.chapter_href || null };
  }
  return null;
}

let saveRemoteProgressTimer = null;
function scheduleRemoteProgressSave() {
  const progress = buildReadingProgressPayload();
  if (!progress) return;
  if (saveRemoteProgressTimer) clearTimeout(saveRemoteProgressTimer);
  saveRemoteProgressTimer = setTimeout(async () => {
    try {
      await fetch(`/api/reading-history/${encodePathForApi(filepath)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: getDeviceId(),
          device_name: getDeviceName(),
          progress,
        }),
      });
    } catch (_) {
      // ignore sync failures
    }
  }, 500);
}

function isControlTarget(target) {
  return Boolean(
    target &&
      typeof target.closest === "function" &&
      (target.closest("#settings-panel") || target.closest("#reader-info") || target.closest("#toc-panel"))
  );
}

function applyTxtPosition(position) {
  const pageIndex = Math.max(0, Math.min(Number(position) || 0, Math.max(0, txtPages.length - 1)));
  renderTxtPage(pageIndex);
}

async function turnTxtPage(direction) {
  const target = txtCurrentPage + direction;
  if (target < 0) {
    return;
  }
  await ensureTxtPageAvailable(target);
  const clamped = Math.max(0, Math.min(target, Math.max(0, txtPages.length - 1)));
  if (clamped === txtCurrentPage) {
    return;
  }
  renderTxtPage(clamped);
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
    void turnTxtPage(-1);
    return;
  }

  if (mode === "pdf") {
    if (!pdfDoc || pdfPage <= 1) {
      return;
    }
    void renderPdfPage(pdfPage - 1);
    onPageFlipped();
    return;
  }

  if (mode === "epub") {
    void turnEpubPage(-1);
  }
}

function goNextPage() {
  if (mode === "txt") {
    void turnTxtPage(1);
    return;
  }

  if (mode === "pdf") {
    if (!pdfDoc || pdfPage >= pdfDoc.numPages) {
      return;
    }
    void renderPdfPage(pdfPage + 1);
    onPageFlipped();
    return;
  }

  if (mode === "epub") {
    void turnEpubPage(1);
  }
}

function setToolbarVisible(visible) {
  toolbarVisible = Boolean(visible);
  if (infoBar) {
    infoBar.classList.toggle("hidden", !toolbarVisible);
  }
  document.body.classList.toggle("toolbar-visible", toolbarVisible);
  document.body.classList.toggle("toolbar-hidden", !toolbarVisible);

  if (!toolbarVisible) {
    setSettingsVisible(false);
    closeTocPanel();
  }

  refreshReaderViewportLayout();
}

function toggleToolbar() {
  setToolbarVisible(!toolbarVisible);
}

function setSettingsVisible(visible) {
  if (!settingsPanel) {
    return;
  }
  const shouldShow = Boolean(visible);
  settingsPanel.classList.toggle("hidden", !shouldShow);
  settingsPanel.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  if (shouldShow) {
    closeTocPanel();
    setToolbarVisible(true);
  }
  refreshReaderViewportLayout();
}

function toggleSettingsPanel() {
  if (!settingsPanel) {
    return;
  }
  const shouldShow = settingsPanel.classList.contains("hidden");
  setSettingsVisible(shouldShow);
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

  toggleToolbar();
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
  updateReaderViewportInsets();

  if (mode === "txt") {
    const currentPage = txtCurrentPage;
    paginateTxtContent();
    renderTxtPage(Math.min(currentPage, Math.max(0, txtPages.length - 1)));
    return;
  }

  if (mode === "pdf") {
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null;
      if (mode !== "pdf" || !pdfDoc) {
        return;
      }
      void renderPdfPage(pdfPage);
    }, RESIZE_DEBOUNCE_MS);
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
  if (txtContent) {
    txtContent.addEventListener("scroll", onTxtScroll, { passive: true });
  }

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

  if (pagePrevButton) {
    pagePrevButton.addEventListener("click", goPrevPage);
  }
  if (pageNextButton) {
    pageNextButton.addEventListener("click", goNextPage);
  }

  if (pdfZoomOutButton) {
    pdfZoomOutButton.addEventListener("click", () => changePdfScale(-0.1));
  }
  if (pdfZoomInButton) {
    pdfZoomInButton.addEventListener("click", () => changePdfScale(0.1));
  }
  if (pdfPageGoButton) {
    pdfPageGoButton.addEventListener("click", jumpPdfPage);
  }
  if (pdfFitWidthButton) {
    pdfFitWidthButton.addEventListener("click", () => setPdfFitMode("width"));
  }
  if (pdfFitHeightButton) {
    pdfFitHeightButton.addEventListener("click", () => setPdfFitMode("height"));
  }
  if (pdfPageInput) {
    pdfPageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        jumpPdfPage();
      }
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
  showReaderStatus("TXT 加载中", "正在加载首屏内容...", { retry: false, back: true });
  updateReaderViewportInsets();
  ensureTxtLoadMoreButton();
  txtContent.replaceChildren();
  txtContent.classList.remove("hidden");
  epubViewer.classList.add("hidden");
  if (pdfViewer) {
    pdfViewer.classList.add("hidden");
  }

  mode = "txt";
  rendition = null;
  epubBook = null;
  epubLocationsReady = false;
  pdfDoc = null;
  pdfPage = 1;
  pdfScale = 1;
  currentOffset = 0;
  txtTotalSize = 0;
  txtLoading = false;
  txtRawContent = "";
  txtBlocks = [];
  txtPages = [];
  txtCurrentPage = 0;
  txtCurrentOffset = 0;
  txtToc = [];
  txtPaginationCache.clear();
  closeTocPanel();
  renderToc([], "TXT 文件不支持目录");

  await loadMoreTxt();

  const saved = initialProgress || readProgress();
  if (saved && saved.type === "txt") {
    await ensureTxtPageAvailable(saved.page ?? 0);
    applyTxtPosition(findTxtPageIndexByOffset(saved.offset ?? 0));
  } else {
    applyTxtPosition(0);
  }

  applyLayoutSettings({ persist: false, syncTxtPosition: false });
  paginateTxtContent();
  renderTxtPage(txtCurrentPage);
  renderToc(txtToc, txtToc.length ? "" : "TXT 未识别到目录");
  updateTxtProgress();
  setInfo(`TXT：${filepath}`);
  updateTxtLoadMoreButton();
  updatePdfProgress();
  updateReaderViewportInsets();
  hideReaderStatus();
}

function onTxtScroll() {
  // TXT now uses paged mode instead of scroll-driven reading.
}

async function loadEpub() {
  if (typeof window.ePub !== "function") {
    throw new Error("epub.js 未加载");
  }

  showReaderStatus("EPUB 加载中", "正在连接书籍资源...", { retry: false, back: true });

  txtContent.classList.add("hidden");
  epubViewer.classList.remove("hidden");
  if (pdfViewer) {
    pdfViewer.classList.add("hidden");
  }
  mode = "epub";
  updateTxtLoadMoreButton();
  pdfDoc = null;
  pdfPage = 1;
  pdfScale = 1;
  setProgress(PROGRESS_PLACEHOLDER);
  setInfo("EPUB 加载中...");
  closeTocPanel();
  renderToc([], "目录加载中...");

  const response = await fetch(`/api/content/${encodePathForApi(filepath)}`);
  if (!response.ok) {
    throw new Error(await extractApiError(response));
  }
  const bytes = await response.arrayBuffer();
  if (!bytes || bytes.byteLength < 256) {
    throw new Error("EPUB 文件内容异常或过小");
  }

  epubBook = window.ePub();
  await epubBook.open(bytes, "binary");
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
        padding-bottom: var(--reader-content-bottom-space) !important;
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
      scheduleRemoteProgressSave();
    }

    updateEpubProgressFromLocation(location);
  });

  const saved = initialProgress || readProgress();
  if (saved && saved.type === "epub" && saved.cfi) {
    await rendition.display(saved.cfi);
  } else {
    await rendition.display();
  }
  hideReaderStatus();

  applyLayoutSettings({ persist: false, syncTxtPosition: false });
  pushThemeAndLayoutToEpubContents();

  try {
    const nav = await epubBook.loaded.navigation;
    renderToc(nav?.toc || [], "此书无目录");
  } catch (_) {
    renderToc([], "目录加载失败");
  }

  setInfo(`EPUB：${filepath}`);
  updatePdfProgress();
  updateReaderViewportInsets();

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

async function loadPdf() {
  if (!pdfViewer) {
    throw new Error("PDF 阅读容器缺失");
  }
  if (!window.pdfjsLib) {
    throw new Error("pdf.js 未加载");
  }

  showReaderStatus("PDF 加载中", "正在下载并解析文档...", { retry: false, back: true });
  txtContent.classList.add("hidden");
  epubViewer.classList.add("hidden");
  pdfViewer.classList.remove("hidden");
  pdfViewer.replaceChildren();

  mode = "pdf";
  rendition = null;
  epubBook = null;
  epubLocationsReady = false;
  updateTxtLoadMoreButton();
  closeTocPanel();
  renderToc([], "PDF 文件不支持目录面板");

  const response = await fetch(`/api/content/${encodePathForApi(filepath)}`);
  if (!response.ok) {
    throw new Error(await extractApiError(response));
  }

  const bytes = await response.arrayBuffer();
  pdfScale = 1;
  pdfFitMode = "width";
  const loadingTask = window.pdfjsLib.getDocument({
    data: bytes,
    cMapUrl: "/static/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/static/pdfjs/standard_fonts/",
    useSystemFonts: false,
  });
  pdfDoc = await loadingTask.promise;

  const saved = initialProgress || readProgress();
  const targetPage = saved && saved.type === "pdf" && Number.isFinite(saved.page)
    ? Math.max(1, Math.min(saved.page, pdfDoc.numPages))
    : 1;

  await renderPdfPage(targetPage);
  setInfo(`PDF：${filepath}`);
  updateReaderViewportInsets();
  hideReaderStatus();
}

async function initializeReader() {
  showReaderStatus("准备阅读器", "正在初始化阅读环境...", { retry: false, back: true });
  updatePdfProgress();
  if (!filepath) {
    setInfo("缺少参数：file");
    setProgress(PROGRESS_PLACEHOLDER);
    showReaderStatus("无法打开书籍", "缺少 file 参数。", { retry: true, back: true });
    return;
  }

  const normalized = filepath.toLowerCase();
  try {
    const localProgress = readProgress();
    let mergedProgress = localProgress;
    try {
      const remoteItem = await fetchRemoteProgress();
      mergedProgress = mergeProgress(localProgress, remoteItem);
      if (mergedProgress) {
        localStorage.setItem(
          progressKey(),
          JSON.stringify({
            filepath,
            updated_at: remoteItem?.updated_at || localProgress?.updated_at || new Date().toISOString(),
            ...mergedProgress,
          })
        );
      }
    } catch (_) {
      mergedProgress = localProgress;
    }
    initialProgress = mergedProgress;

    if (normalized.endsWith(".txt")) {
      await loadTxtFile();
      return;
    }

    if (normalized.endsWith(".epub")) {
      await loadEpub();
      return;
    }

    if (normalized.endsWith(".pdf")) {
      await loadPdf();
      return;
    }

    throw new Error("不支持的文件类型");
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    setInfo(`加载失败：${message}`);
    setProgress(PROGRESS_PLACEHOLDER);
    showReaderStatus("加载失败", message, { retry: true, back: true });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/js/pdf.worker.min.js";
  }
  initThemeManager();
  initLayoutManager();
  bindTocControls();
  bindReaderInteractions();
  setToolbarVisible(true);
  updateReaderViewportInsets();
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateReaderViewportInsets);
    window.visualViewport.addEventListener("scroll", updateReaderViewportInsets);
  }
  void initDB();
  void initializeReader();
});
