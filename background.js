/**
 * background.js - Sticky Firefox Extension Background Event Script
 * Orchestrates keyboard shortcuts, context menus, metadata capture,
 * IndexedDB thumbnails, and storage persistence.
 */

// Cross-browser compatibility wrapper
const ext = typeof browser !== 'undefined' ? browser : chrome;

// ==========================================
// CONTEXT MENUS SETUP
// ==========================================

function setupContextMenus() {
  if (!ext.contextMenus) return;

  ext.contextMenus.removeAll(() => {
    // 1. Save link
    ext.contextMenus.create({
      id: 'sticky-save-link',
      title: 'Save Link to Sticky',
      contexts: ['link']
    });

    // 2. Save image
    ext.contextMenus.create({
      id: 'sticky-save-image',
      title: 'Save Image to Sticky',
      contexts: ['image']
    });

    // 3. Save selection
    ext.contextMenus.create({
      id: 'sticky-save-selection',
      title: 'Save Selection to Sticky',
      contexts: ['selection']
    });

    // 4. Save entire page
    ext.contextMenus.create({
      id: 'sticky-save-page',
      title: 'Save Page to Sticky (Ctrl + `)',
      contexts: ['page']
    });

    // Separator
    ext.contextMenus.create({
      id: 'sticky-separator',
      type: 'separator',
      contexts: ['all']
    });

    // 5. Open Library
    ext.contextMenus.create({
      id: 'sticky-open-library',
      title: 'Open Sticky Library',
      contexts: ['all']
    });
  });
}

// Ensure context menus are created on install and startup
if (ext.runtime.onInstalled) {
  ext.runtime.onInstalled.addListener(() => {
    setupContextMenus();
  });
}
if (ext.runtime.onStartup) {
  ext.runtime.onStartup.addListener(() => {
    setupContextMenus();
  });
}
setupContextMenus();

// ==========================================
// TOOLBAR ACTION & COMMAND LISTENERS
// ==========================================

// Click on the extension toolbar icon opens the Library page
if (ext.action && ext.action.onClicked) {
  ext.action.onClicked.addListener(openLibraryPage);
} else if (ext.browserAction && ext.browserAction.onClicked) {
  ext.browserAction.onClicked.addListener(openLibraryPage);
}

// Keyboard shortcuts (commands API)
if (ext.commands && ext.commands.onCommand) {
  ext.commands.onCommand.addListener(async (command) => {
    if (command === 'save-to-sticky') {
      const [activeTab] = await ext.tabs.query({ active: true, currentWindow: true });
      if (activeTab) {
        await handleSaveCurrentTab(activeTab);
      }
    } else if (command === 'open-library') {
      await openLibraryPage();
    }
  });
}

// Right-click context menu handler
if (ext.contextMenus && ext.contextMenus.onClicked) {
  ext.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'sticky-open-library') {
      await openLibraryPage();
      return;
    }

    if (!tab) {
      const [activeTab] = await ext.tabs.query({ active: true, currentWindow: true });
      tab = activeTab;
    }

    if (info.menuItemId === 'sticky-save-link') {
      await handleSaveLink(info, tab);
    } else if (info.menuItemId === 'sticky-save-image') {
      await handleSaveImage(info, tab);
    } else if (info.menuItemId === 'sticky-save-selection') {
      await handleSaveSelection(info, tab);
    } else if (info.menuItemId === 'sticky-save-page') {
      if (tab) {
        await handleSaveCurrentTab(tab);
      }
    }
  });
}

// ==========================================
// CAPTURE HANDLERS
// ==========================================

/**
 * Capture current active tab with Reddit auto-detection and generic fallback
 */
async function handleSaveCurrentTab(tab, preSelectedText = null) {
  if (!tab || !tab.id || !tab.url) return;

  // Ignore restricted browser URLs
  if (isRestrictedUrl(tab.url)) {
    showBadgeNotification('!', '#EF4444');
    return;
  }

  let itemData = null;
  let candidateThumbnailUrl = null;

  // 1. Check if Reddit URL
  const isReddit = tab.url.includes('reddit.com');
  if (isReddit) {
    try {
      const redditData = await sendMessageToTabWithTimeout(tab.id, { type: 'DETECT_FOCUSED_REDDIT_POST' }, 800);
      if (redditData && redditData.url) {
        const sel = preSelectedText || redditData.selectedText || null;
        itemData = {
          type: 'link',
          url: redditData.url,
          title: redditData.title || tab.title || 'Reddit Post',
          source: redditData.source || 'reddit.com',
          note: sel || null
        };
        candidateThumbnailUrl = redditData.thumbnailUrl;
      }
    } catch (err) {
      console.warn('Reddit post detection skipped, falling back to generic page:', err);
    }
  }

  // 2. Generic metadata extraction
  if (!itemData) {
    try {
      await ensureGenericScriptInjected(tab.id);
      const meta = await sendMessageToTabWithTimeout(tab.id, { type: 'EXTRACT_PAGE_METADATA' }, 1200);
      if (meta) {
        const sel = preSelectedText || meta.selectedText || null;
        itemData = {
          type: 'link',
          url: meta.url || tab.url,
          title: meta.title || tab.title || 'Untitled Page',
          faviconUrl: meta.faviconUrl || tab.favIconUrl || null,
          note: sel || null
        };
        candidateThumbnailUrl = meta.primaryThumbnailUrl || meta.faviconUrl || tab.favIconUrl || null;
      }
    } catch (err) {
      console.warn('Generic metadata extraction error, using tab info:', err);
    }
  }

  // 3. Fallback to basic tab info if all content script messages failed
  if (!itemData) {
    itemData = {
      type: 'link',
      url: tab.url,
      title: tab.title || 'Saved Page',
      faviconUrl: tab.favIconUrl || null,
      note: preSelectedText || null
    };
    candidateThumbnailUrl = tab.favIconUrl || null;
  }

  // 4. Complete save process with thumbnail
  await finalizeSaveItem(tab, itemData, candidateThumbnailUrl);
}

/**
 * Capture a right-clicked link
 */
async function handleSaveLink(info, tab) {
  const linkUrl = info.linkUrl;
  if (!linkUrl) return;

  const itemData = {
    type: 'link',
    url: linkUrl,
    title: (info.linkText && info.linkText.trim()) ? info.linkText.trim() : linkUrl,
    faviconUrl: tab ? tab.favIconUrl : null,
    source: StickyStorage._extractSource(linkUrl)
  };

  let candidateThumbnailUrl = null;
  const ytId = extractYouTubeVideoId(linkUrl);
  if (ytId) {
    candidateThumbnailUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }

  await finalizeSaveItem(tab, itemData, candidateThumbnailUrl);
}

/**
 * Capture a right-clicked image
 */
async function handleSaveImage(info, tab) {
  const imageUrl = info.srcUrl;
  const pageUrl = info.pageUrl || tab?.url || imageUrl;

  const itemData = {
    type: 'link',
    url: pageUrl,
    title: (tab && tab.title) ? `Image from ${tab.title}` : `Image from ${new URL(pageUrl).hostname}`,
    faviconUrl: tab ? tab.favIconUrl : null
  };

  await finalizeSaveItem(tab, itemData, imageUrl);
}

/**
 * Capture selected text as a note item
 */
async function handleSaveSelection(info, tab) {
  const selection = info.selectionText ? info.selectionText.trim() : '';
  if (!selection) return;

  const pageUrl = info.pageUrl || tab?.url || null;
  const pageTitle = (tab && tab.title) ? tab.title : 'Selected Note';

  const itemData = {
    type: 'note',
    url: pageUrl,
    title: selection.length > 50 ? `${selection.slice(0, 50)}...` : selection,
    note: selection,
    faviconUrl: tab ? tab.favIconUrl : null
  };

  await finalizeSaveItem(tab, itemData, null);
}

// ==========================================
// THUMBNAIL & STORAGE PIPELINE
// ==========================================

/**
 * Finalize saving an item:
 * - Fetches or captures thumbnail
 * - Stores thumbnail in IndexedDB
 * - Stores item in browser.storage.local
 * - Triggers visual feedback toast
 */
async function finalizeSaveItem(tab, itemData, candidateThumbnailUrl) {
  const itemId = crypto.randomUUID();
  itemData.id = itemId;

  let thumbnailData = null;

  // Step A: Attempt to fetch image candidate
  if (candidateThumbnailUrl && !isGenericSiteLogo(candidateThumbnailUrl) && isValidHttpUrl(candidateThumbnailUrl)) {
    try {
      thumbnailData = await fetchImageAsDataUrl(candidateThumbnailUrl);
    } catch (err) {
      console.warn('Could not fetch candidate thumbnail:', candidateThumbnailUrl, err);
    }
  }

  // Step B: Fallback to tab screenshot via captureVisibleTab if link item has no thumbnail
  if (!thumbnailData && tab && tab.id && tab.windowId && !isRestrictedUrl(tab.url)) {
    try {
      if (ext.tabs.captureVisibleTab) {
        thumbnailData = await ext.tabs.captureVisibleTab(tab.windowId, {
          format: 'jpeg',
          quality: 75
        });
      }
    } catch (err) {
      console.warn('captureVisibleTab fallback failed:', err);
    }
  }

  // Step C: Fallback to favicon if still nothing (and not a generic site logo)
  if (!thumbnailData && itemData.faviconUrl && !isGenericSiteLogo(itemData.faviconUrl) && isValidHttpUrl(itemData.faviconUrl)) {
    try {
      thumbnailData = await fetchImageAsDataUrl(itemData.faviconUrl);
    } catch (err) {
      // ignore
    }
  }

  // Step D: Store thumbnail blob/data in IndexedDB
  if (thumbnailData) {
    try {
      await ThumbnailDB.saveThumbnail(itemId, thumbnailData);
      itemData.thumbnailKey = itemId;
    } catch (err) {
      console.error('Failed to store thumbnail in IndexedDB:', err);
    }
  }

  // Step E: Save item in browser.storage.local
  const savedItem = await StickyStorage.saveItem(itemData);

  // Step F: Visual feedback
  showBadgeNotification('✓', '#10B981');

  if (tab && tab.id && !isRestrictedUrl(tab.url)) {
    try {
      await ensureGenericScriptInjected(tab.id);
      const labels = await StickyStorage.getLabels();
      await ext.tabs.sendMessage(tab.id, {
        type: 'SHOW_SAVED_TOAST',
        item: savedItem,
        availableLabels: labels,
        previewThumbnail: thumbnailData
      });
    } catch (err) {
      console.log('Toast feedback could not be rendered in tab:', err);
    }
  }
}

// ==========================================
// HELPERS
// ==========================================

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('about:') ||
    url.startsWith('chrome:') ||
    url.startsWith('moz-extension:') ||
    url.startsWith('chrome-extension:') ||
    url.startsWith('view-source:') ||
    url.startsWith('https://addons.mozilla.org')
  );
}

function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:';
  } catch (_) {
    return false;
  }
}

/**
 * Check if a URL points to a generic site branding logo/banner
 */
function isGenericSiteLogo(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    // YouTube generic branding
    if (host.includes('youtube.com') && (path.includes('yt_1200.png') || path.includes('/img/desktop/'))) {
      return true;
    }

    // X / Twitter generic branding
    if (host.includes('twimg.com')) {
      if (path.includes('/responsive-web/') || path.includes('/errors/')) {
        return true;
      }
    }

    // Google generic branding
    if (host.includes('google.com') && path.includes('/images/branding/')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract YouTube video ID from a URL
 */
function extractYouTubeVideoId(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1).split('/')[0].split('?')[0];
    }
    if (u.pathname.startsWith('/shorts/')) {
      return u.pathname.split('/shorts/')[1].split('/')[0].split('?')[0];
    }
    if (u.pathname.startsWith('/embed/')) {
      return u.pathname.split('/embed/')[1].split('/')[0].split('?')[0];
    }
    if (u.searchParams.has('v')) {
      return u.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch image and convert to Data URL
 */
async function fetchImageAsDataUrl(url) {
  if (url.startsWith('data:')) return url;

  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Send message to tab with timeout
 */
function sendMessageToTabWithTimeout(tabId, message, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    let responded = false;
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        reject(new Error('Tab message timed out'));
      }
    }, timeoutMs);

    ext.tabs.sendMessage(tabId, message).then((res) => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        resolve(res);
      }
    }).catch((err) => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/**
 * Ensure generic script & CSS are injected on demand for activeTab
 */
async function ensureGenericScriptInjected(tabId) {
  try {
    if (ext.scripting && ext.scripting.executeScript) {
      await ext.scripting.insertCSS({
        target: { tabId },
        files: ['content-scripts/toast.css']
      }).catch(() => {});

      await ext.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/generic.js']
      }).catch(() => {});
    } else if (ext.tabs.insertCSS && ext.tabs.executeScript) {
      await ext.tabs.insertCSS(tabId, { file: 'content-scripts/toast.css' }).catch(() => {});
      await ext.tabs.executeScript(tabId, { file: 'content-scripts/generic.js' }).catch(() => {});
    }
  } catch (err) {
    // Already injected or not permitted
  }
}

/**
 * Show temporary badge notification on the extension toolbar icon
 */
function showBadgeNotification(text, color = '#10B981') {
  const actionAPI = ext.action || ext.browserAction;
  if (!actionAPI || !actionAPI.setBadgeText) return;

  actionAPI.setBadgeText({ text });
  if (actionAPI.setBadgeBackgroundColor) {
    actionAPI.setBadgeBackgroundColor({ color });
  }

  setTimeout(() => {
    actionAPI.setBadgeText({ text: '' });
  }, 2000);
}

/**
 * Opens or focuses the library page
 */
async function openLibraryPage() {
  const libraryUrl = ext.runtime.getURL('pages/library.html');
  const tabs = await ext.tabs.query({});
  const existingTab = tabs.find(t => t.url && t.url.startsWith(libraryUrl));

  if (existingTab && existingTab.id) {
    await ext.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId) {
      await ext.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    await ext.tabs.create({ url: libraryUrl });
  }
}

// ==========================================
// RUNTIME MESSAGES (FROM TOAST / POPUPS)
// ==========================================

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRIGGER_CAPTURE_FROM_PAGE') {
    const targetTab = sender.tab;
    const selectedText = message.selectedText || null;
    if (targetTab) {
      handleSaveCurrentTab(targetTab, selectedText)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    } else {
      ext.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
        if (activeTab) {
          handleSaveCurrentTab(activeTab, selectedText)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        }
      });
    }
    return true;
  }

  if (message.type === 'UPDATE_SAVED_ITEM') {
    StickyStorage.updateItem(message.itemId, message.updates)
      .then(res => sendResponse({ success: true, item: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async response
  }

  if (message.type === 'CREATE_LABEL') {
    StickyStorage.saveLabel({ name: message.name, color: message.color })
      .then(newLabel => sendResponse({ success: true, label: newLabel }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Async response
  }

  if (message.type === 'OPEN_LIBRARY') {
    openLibraryPage().then(() => sendResponse({ success: true }));
    return true;
  }
});
