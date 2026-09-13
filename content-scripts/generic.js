/**
 * content-scripts/generic.js
 * Extracts page metadata (Open Graph image, Twitter image, favicon, title, URL, selection)
 * and displays an interactive floating capture feedback toast on save.
 */

(function () {
  // Prevent duplicate execution
  if (window.__stickyGenericInitialized) return;
  window.__stickyGenericInitialized = true;

  /**
   * Resolve relative URLs to absolute URLs based on document.baseURI
   */
  function toAbsoluteUrl(url) {
    if (!url) return null;
    try {
      return new URL(url, document.baseURI || window.location.href).href;
    } catch {
      return url;
    }
  }

  /**
   * Extract thumbnail candidates in priority order:
   * 1. og:image
   * 2. twitter:image
   * 3. favicon
   */
  function extractThumbnailAndFavicon() {
    let ogImage = null;
    let twitterImage = null;
    let faviconUrl = null;

    // 1. Open Graph image
    const ogElem = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    if (ogElem && ogElem.content) {
      ogImage = toAbsoluteUrl(ogElem.content);
    }

    // 2. Twitter Card image
    const twElem = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"], meta[name="twitter:image:src"]');
    if (twElem && twElem.content) {
      twitterImage = toAbsoluteUrl(twElem.content);
    }

    // 3. Favicon / Apple touch icon
    const iconCandidates = [
      document.querySelector('link[rel="apple-touch-icon"]'),
      document.querySelector('link[rel="icon"][sizes="192x192"], link[rel="icon"][sizes="128x128"], link[rel="icon"][sizes="96x96"], link[rel="icon"][sizes="48x48"], link[rel="icon"][sizes="32x32"]'),
      document.querySelector('link[rel~="icon"]'),
      document.querySelector('link[rel="shortcut icon"]')
    ];

    for (const cand of iconCandidates) {
      if (cand && cand.href) {
        faviconUrl = toAbsoluteUrl(cand.href);
        break;
      }
    }

    // Default fallback favicon
    if (!faviconUrl) {
      try {
        faviconUrl = new URL('/favicon.ico', window.location.origin).href;
      } catch {
        faviconUrl = null;
      }
    }

    // Primary thumbnail URL recommendation
    const primaryThumbnailUrl = ogImage || twitterImage || faviconUrl || null;

    return {
      ogImage,
      twitterImage,
      faviconUrl,
      primaryThumbnailUrl
    };
  }

  /**
   * Extract full page metadata
   */
  function getPageMetadata() {
    const images = extractThumbnailAndFavicon();

    // Canonical URL or window URL
    let url = window.location.href;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      url = canonical.href;
    }

    // Title
    let title = document.title || '';
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      title = ogTitle.content;
    } else if (!title) {
      const h1 = document.querySelector('h1');
      if (h1 && h1.innerText) {
        title = h1.innerText.trim();
      }
    }

    // Selected text (if user selected something on the page)
    let selectedText = '';
    const selection = window.getSelection();
    if (selection && selection.toString) {
      selectedText = selection.toString().trim();
    }

    return {
      url,
      title: title.trim(),
      primaryThumbnailUrl: images.primaryThumbnailUrl,
      faviconUrl: images.faviconUrl,
      selectedText: selectedText || null
    };
  }

  // ==========================================
  // IN-PAGE CAPTURE TOAST / HUD
  // ==========================================

  let toastContainer = null;
  let dismissTimeout = null;

  function ensureToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'sticky-hud-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showSavedToast(data) {
    const container = ensureToastContainer();
    container.innerHTML = '';

    const { item, availableLabels = [], previewThumbnail } = data;
    const title = item.title || 'Saved Item';
    const source = item.source || window.location.hostname;
    const thumbnailSrc = previewThumbnail || item.faviconUrl || '';

    const card = document.createElement('div');
    card.className = 'sticky-toast-card';

    // Header
    const header = document.createElement('div');
    header.className = 'sticky-toast-header';
    header.innerHTML = `
      <div class="sticky-toast-brand">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
        </svg>
        <span>Sticky</span>
      </div>
      <span class="sticky-toast-badge">&#10003; Saved</span>
      <button class="sticky-toast-close" title="Close">&times;</button>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'sticky-toast-body';

    const thumbImg = document.createElement('img');
    thumbImg.className = 'sticky-toast-thumb';
    thumbImg.src = thumbnailSrc;
    thumbImg.alt = 'Thumbnail';
    thumbImg.onerror = () => {
      thumbImg.style.display = 'none';
    };

    const info = document.createElement('div');
    info.className = 'sticky-toast-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'sticky-toast-title';
    titleEl.textContent = title;
    titleEl.title = title;

    const sourceEl = document.createElement('div');
    sourceEl.className = 'sticky-toast-source';
    sourceEl.textContent = source;

    info.appendChild(titleEl);
    info.appendChild(sourceEl);
    if (thumbnailSrc) {
      body.appendChild(thumbImg);
    }
    body.appendChild(info);

    // Labels quick pick
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'sticky-toast-labels';

    let currentItemLabels = [...(item.labels || [])];

    if (availableLabels.length > 0) {
      availableLabels.forEach(lbl => {
        const pill = document.createElement('span');
        pill.className = 'sticky-toast-label-pill';
        pill.textContent = lbl.name;
        pill.style.setProperty('--label-color', lbl.color || '#F59E0B');

        if (currentItemLabels.includes(lbl.id)) {
          pill.classList.add('sticky-active');
        }

        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          resetDismissTimer();
          if (currentItemLabels.includes(lbl.id)) {
            currentItemLabels = currentItemLabels.filter(id => id !== lbl.id);
            pill.classList.remove('sticky-active');
          } else {
            currentItemLabels.push(lbl.id);
            pill.classList.add('sticky-active');
          }

          // Send message to update item in storage
          if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.sendMessage({
              type: 'UPDATE_SAVED_ITEM',
              itemId: item.id,
              updates: { labels: currentItemLabels }
            }).catch(() => {});
          }
        });

        labelsContainer.appendChild(pill);
      });
    }

    // Quick Note input
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'sticky-toast-note-input';
    noteInput.placeholder = 'Add a quick note...';
    if (item.note) {
      noteInput.value = item.note;
    }

    const saveNote = () => {
      const val = noteInput.value.trim();
      if (val !== (item.note || '')) {
        item.note = val;
        if (typeof browser !== 'undefined' && browser.runtime) {
          browser.runtime.sendMessage({
            type: 'UPDATE_SAVED_ITEM',
            itemId: item.id,
            updates: { note: val }
          }).catch(() => {});
        }
      }
    };

    noteInput.addEventListener('keydown', (e) => {
      resetDismissTimer();
      if (e.key === 'Enter') {
        saveNote();
        noteInput.blur();
      }
    });

    noteInput.addEventListener('blur', saveNote);

    // Assemble Card
    card.appendChild(header);
    card.appendChild(body);
    if (availableLabels.length > 0) {
      card.appendChild(labelsContainer);
    }
    card.appendChild(noteInput);
    container.appendChild(card);

    // Animate In
    requestAnimationFrame(() => {
      card.classList.add('sticky-visible');
    });

    // Auto dismiss logic
    function dismissToast() {
      card.classList.remove('sticky-visible');
      setTimeout(() => {
        if (container.contains(card)) {
          container.removeChild(card);
        }
      }, 300);
    }

    function resetDismissTimer() {
      if (dismissTimeout) clearTimeout(dismissTimeout);
      dismissTimeout = setTimeout(dismissToast, 4000);
    }

    header.querySelector('.sticky-toast-close').addEventListener('click', dismissToast);

    card.addEventListener('mouseenter', () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
    });

    card.addEventListener('mouseleave', () => {
      resetDismissTimer();
    });

    resetDismissTimer();
  }

  // ==========================================
  // MESSAGE LISTENER
  // ==========================================

  const runtimeAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime :
                     (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;

  if (runtimeAPI) {
    runtimeAPI.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'EXTRACT_PAGE_METADATA') {
        const data = getPageMetadata();
        sendResponse(data);
        return false;
      }

      if (message.type === 'SHOW_SAVED_TOAST') {
        showSavedToast(message);
        sendResponse({ success: true });
        return false;
      }
    });
  }

  // ==========================================
  // IN-PAGE KEYBOARD SHORTCUT LISTENER
  // ==========================================

  let activeShortcut = {
    key: '`',
    code: 'Backquote',
    shiftKey: false,
    ctrlKey: true,
    altKey: false,
    metaKey: false
  };

  async function loadShortcutConfig() {
    try {
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const result = await browser.storage.local.get('sticky_settings');
        if (result && result.sticky_settings && result.sticky_settings.captureShortcut) {
          activeShortcut = result.sticky_settings.captureShortcut;
        }
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('sticky_settings', (result) => {
          if (result && result.sticky_settings && result.sticky_settings.captureShortcut) {
            activeShortcut = result.sticky_settings.captureShortcut;
          }
        });
      }
    } catch (err) {
      // Use default Shift+E
    }
  }

  const storageOnChanged = (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) ? browser.storage.onChanged :
                           (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) ? chrome.storage.onChanged : null;
  if (storageOnChanged) {
    storageOnChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sticky_settings) {
        if (changes.sticky_settings.newValue && changes.sticky_settings.newValue.captureShortcut) {
          activeShortcut = changes.sticky_settings.newValue.captureShortcut;
        }
      }
    });
  }

  function isEditableElement(elem) {
    if (!elem) return false;
    const tagName = elem.tagName ? elem.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
    if (elem.isContentEditable) return true;
    if (elem.getAttribute && elem.getAttribute('role') === 'textbox') return true;
    return false;
  }

  function handleKeydown(e) {
    if (!activeShortcut) return;
    if (isEditableElement(e.target)) return;

    // Normalize keys
    const pressedKey = (e.key || '').toLowerCase();
    const targetKey = (activeShortcut.key || '').toLowerCase();
    const pressedCode = e.code || '';
    const targetCode = activeShortcut.code || '';

    const keyMatches = (pressedKey === targetKey) || (targetCode && pressedCode === targetCode);
    const shiftMatches = Boolean(e.shiftKey) === Boolean(activeShortcut.shiftKey);
    const ctrlMatches = Boolean(e.ctrlKey) === Boolean(activeShortcut.ctrlKey);
    const altMatches = Boolean(e.altKey) === Boolean(activeShortcut.altKey);
    const metaMatches = Boolean(e.metaKey) === Boolean(activeShortcut.metaKey);

    if (keyMatches && shiftMatches && ctrlMatches && altMatches && metaMatches) {
      e.preventDefault();
      e.stopPropagation();

      if (runtimeAPI && runtimeAPI.sendMessage) {
        runtimeAPI.sendMessage({ type: 'TRIGGER_CAPTURE_FROM_PAGE' }).catch(() => {});
      }
    }
  }

  window.addEventListener('keydown', handleKeydown, true);
  loadShortcutConfig();
})();
