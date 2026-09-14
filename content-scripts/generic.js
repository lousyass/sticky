/**
 * content-scripts/generic.js
 * Extracts page metadata (Open Graph image, Twitter image, favicon, title, URL, selection)
 * and displays an interactive floating capture feedback toast on save.
 */

(function () {
  // Prevent duplicate execution on repeated on-demand injections
  if (window.__stickyGenericInjected || window.__stickyGenericInitialized) return;
  window.__stickyGenericInjected = true;
  window.__stickyGenericInitialized = true;

  const runtimeAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime :
                     (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;

  /**
   * Helper to retrieve currently selected text anywhere on the page
   */
  function getSelectedText() {
    let selected = '';
    const selection = window.getSelection();
    if (selection && selection.toString) {
      selected = selection.toString();
    }
    if (!selected && document.activeElement) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        if (start !== undefined && end !== undefined && start !== end) {
          selected = el.value.substring(start, end);
        }
      }
    }
    return selected ? selected.trim() : null;
  }

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

  // Mouse tracking to identify user-hovered items on feeds (YouTube, X, etc.)
  let lastHoveredElement = null;
  document.addEventListener('mouseover', (e) => {
    lastHoveredElement = e.target;
  }, { passive: true });

  /**
   * Check if a URL points to a known generic site branding logo/banner
   * rather than content-specific imagery.
   */
  function isGenericSiteLogo(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const path = u.pathname.toLowerCase();

      // YouTube generic desktop/app branding
      if (host.includes('youtube.com') && (path.includes('yt_1200.png') || path.includes('/img/desktop/'))) {
        return true;
      }

      // X / Twitter generic app shell branding & error placeholders
      if (host.includes('twimg.com')) {
        if (path.includes('/responsive-web/') || path.includes('/errors/')) {
          return true;
        }
      }

      // Google generic search logo
      if (host.includes('google.com') && path.includes('/images/branding/')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract video ID from a YouTube URL
   */
  function extractYouTubeVideoId(urlStr) {
    try {
      const u = new URL(urlStr || window.location.href);
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
   * YouTube specialized content extractor
   */
  function extractYouTubeContent() {
    const host = window.location.hostname.toLowerCase();
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
      return null;
    }

    // 1. If on video watch page or shorts
    const videoId = extractYouTubeVideoId(window.location.href);
    if (videoId) {
      const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      
      let title = '';
      const metaTitle = document.querySelector('meta[name="title"], meta[property="og:title"], meta[name="twitter:title"]');
      if (metaTitle && metaTitle.content && metaTitle.content.trim() && metaTitle.content.trim().toLowerCase() !== 'youtube') {
        title = metaTitle.content.trim();
      }
      if (!title) {
        const titleElem = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, ytd-watch-flexy h1.title, h1.title, #above-the-fold #title');
        if (titleElem && titleElem.textContent) {
          title = titleElem.textContent.trim();
        }
      }
      if (!title) {
        title = (document.title || '').replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim();
      }
      if (!title || title.toLowerCase() === 'youtube') {
        title = 'YouTube Video';
      }

      return {
        url: window.location.href,
        title: title,
        thumbnailUrl
      };
    }

    // 2. If browsing YouTube feed / search / channel, check for hovered or focused video card
    if (lastHoveredElement) {
      const card = lastHoveredElement.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer');
      if (card) {
        const linkEl = card.querySelector('a#thumbnail, a[href*="/watch?v="], a[href*="/shorts/"]');
        const href = linkEl ? toAbsoluteUrl(linkEl.getAttribute('href')) : null;
        const cardVideoId = href ? extractYouTubeVideoId(href) : null;
        const imgEl = card.querySelector('img#img, ytd-thumbnail img');
        let thumb = cardVideoId ? `https://i.ytimg.com/vi/${cardVideoId}/hqdefault.jpg` : (imgEl?.src || null);
        if (thumb && isGenericSiteLogo(thumb)) thumb = null;

        const titleEl = card.querySelector('#video-title, #title, h3');
        const title = titleEl ? (titleEl.textContent || titleEl.innerText).trim() : '';

        if (href && (thumb || title)) {
          return {
            url: href,
            title: title || 'YouTube Video',
            thumbnailUrl: thumb
          };
        }
      }
    }

    return null;
  }

  /**
   * X / Twitter specialized content extractor
   */
  function extractXTwitterContent() {
    const host = window.location.hostname.toLowerCase();
    if (!host.includes('x.com') && !host.includes('twitter.com')) {
      return null;
    }

    // 1. Locate tweet: hovered element first, or closest to viewport center, or first tweet
    let tweet = null;
    if (lastHoveredElement) {
      tweet = lastHoveredElement.closest('article[data-testid="tweet"]');
    }

    if (!tweet) {
      const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      if (tweets.length > 0) {
        if (window.location.pathname.includes('/status/')) {
          const statusMatch = window.location.pathname.match(/\/status\/(\d+)/);
          if (statusMatch) {
            const statusId = statusMatch[1];
            tweet = tweets.find(t => t.querySelector(`a[href*="/status/${statusId}"]`)) || tweets[0];
          } else {
            tweet = tweets[0];
          }
        } else {
          const centerY = window.innerHeight / 2;
          let minDiff = Infinity;
          for (const t of tweets) {
            const rect = t.getBoundingClientRect();
            if (rect.bottom > 0 && rect.top < window.innerHeight) {
              const diff = Math.abs(rect.top + rect.height / 2 - centerY);
              if (diff < minDiff) {
                minDiff = diff;
                tweet = t;
              }
            }
          }
          if (!tweet) tweet = tweets[0];
        }
      }
    }

    if (tweet) {
      const linkEl = tweet.querySelector('a[href*="/status/"]');
      const tweetUrl = linkEl ? toAbsoluteUrl(linkEl.getAttribute('href')) : window.location.href;

      let mediaUrl = null;
      const imgEl = tweet.querySelector([
        'div[data-testid="tweetPhoto"] img',
        'div[data-testid="videoPlayer"] video[poster]',
        'div[data-testid="card.layoutLarge.media"] img',
        'div[data-testid="card.layoutSmall.media"] img',
        'img[src*="pbs.twimg.com/media/"]',
        'img[src*="pbs.twimg.com/card_img/"]'
      ].join(', '));

      if (imgEl) {
        if (imgEl.tagName.toLowerCase() === 'video') {
          mediaUrl = imgEl.poster;
        } else {
          mediaUrl = imgEl.src;
        }
      }

      if (mediaUrl && mediaUrl.includes('pbs.twimg.com/media/')) {
        try {
          const u = new URL(mediaUrl);
          u.searchParams.set('name', 'medium');
          mediaUrl = u.href;
        } catch {}
      }

      if (mediaUrl && isGenericSiteLogo(mediaUrl)) {
        mediaUrl = null;
      }

      const textEl = tweet.querySelector('div[data-testid="tweetText"]');
      let title = textEl ? textEl.innerText.trim() : '';
      if (title.length > 80) {
        title = title.slice(0, 80) + '...';
      }
      if (!title) {
        title = document.title || 'Post on X';
      }

      return {
        url: tweetUrl,
        title: title,
        thumbnailUrl: mediaUrl
      };
    }

    return null;
  }

  /**
   * Extract thumbnail candidates in priority order:
   * 1. Specialized site extractors (YouTube video thumbnail, Twitter photo/media)
   * 2. og:image (filtered to reject generic site logos)
   * 3. twitter:image (filtered)
   * 4. In-page video poster
   * 5. favicon
   */
  function extractThumbnailAndFavicon() {
    let ogImage = null;
    let twitterImage = null;
    let videoPoster = null;
    let faviconUrl = null;

    // 1. Open Graph image
    const ogElem = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    if (ogElem && ogElem.content) {
      const resolved = toAbsoluteUrl(ogElem.content);
      if (!isGenericSiteLogo(resolved)) {
        ogImage = resolved;
      }
    }

    // 2. Twitter Card image
    const twElem = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"], meta[name="twitter:image:src"]');
    if (twElem && twElem.content) {
      const resolved = toAbsoluteUrl(twElem.content);
      if (!isGenericSiteLogo(resolved)) {
        twitterImage = resolved;
      }
    }

    // 3. In-page video poster
    const videoEl = document.querySelector('video[poster]');
    if (videoEl && videoEl.poster) {
      const resolved = toAbsoluteUrl(videoEl.poster);
      if (!isGenericSiteLogo(resolved)) {
        videoPoster = resolved;
      }
    }

    // 4. Favicon / Apple touch icon
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
    const primaryThumbnailUrl = ogImage || twitterImage || videoPoster || null;

    return {
      ogImage,
      twitterImage,
      videoPoster,
      faviconUrl,
      primaryThumbnailUrl
    };
  }

  /**
   * Extract full page metadata
   */
  function getPageMetadata() {
    const selectedText = getSelectedText();

    // Check specialized site handlers first
    const ytData = extractYouTubeContent();
    if (ytData) {
      const images = extractThumbnailAndFavicon();
      return {
        url: ytData.url,
        title: ytData.title,
        primaryThumbnailUrl: ytData.thumbnailUrl || images.primaryThumbnailUrl,
        faviconUrl: images.faviconUrl,
        selectedText: selectedText || null
      };
    }

    const xData = extractXTwitterContent();
    if (xData) {
      const images = extractThumbnailAndFavicon();
      return {
        url: xData.url,
        title: xData.title,
        primaryThumbnailUrl: xData.thumbnailUrl, // if null, background will take tab screenshot!
        faviconUrl: images.faviconUrl,
        selectedText: selectedText || null
      };
    }

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
    const existing = document.getElementById('sticky-hud-toast-container');
    if (existing && document.body && document.body.contains(existing)) {
      toastContainer = existing;
      return toastContainer;
    }
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'sticky-hud-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  /**
   * Determine whether the current webpage or browser is in dark mode
   */
  function isPageDark() {
    // 1. Check HTML/Body theme attributes and class names
    const html = document.documentElement;
    const body = document.body;
    const darkKeywords = ['dark', 'night', 'black', 'dark-theme'];

    for (const el of [html, body]) {
      if (!el) continue;
      const themeAttr = (
        el.getAttribute('data-theme') ||
        el.getAttribute('theme') ||
        el.getAttribute('data-color-mode') ||
        el.getAttribute('data-bs-theme') ||
        (el.getAttribute('dark') !== null ? 'dark' : '')
      ).toLowerCase();
      if (darkKeywords.some(kw => themeAttr.includes(kw))) return true;

      for (const cls of Array.from(el.classList)) {
        if (darkKeywords.some(kw => cls.toLowerCase().includes(kw))) return true;
      }
    }

    // 2. Check computed background color luminance
    try {
      const getBg = (el) => el ? window.getComputedStyle(el).backgroundColor : null;
      let bg = getBg(body);
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
        bg = getBg(html);
      }
      if (bg && bg.startsWith('rgb')) {
        const nums = bg.match(/\d+/g);
        if (nums && nums.length >= 3) {
          const [r, g, b] = nums.map(Number);
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          return brightness < 128;
        }
      }
    } catch {}

    // 3. Fall back to browser / OS color scheme preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }

    return false;
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
    if (isPageDark()) {
      card.classList.add('sticky-theme-dark');
    } else {
      card.classList.add('sticky-theme-light');
    }

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

    function createLabelPill(lbl) {
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
        if (runtimeAPI && runtimeAPI.sendMessage) {
          runtimeAPI.sendMessage({
            type: 'UPDATE_SAVED_ITEM',
            itemId: item.id,
            updates: { labels: currentItemLabels }
          }).catch(() => {});
        }
      });

      return pill;
    }

    if (Array.isArray(availableLabels) && availableLabels.length > 0) {
      availableLabels.forEach(lbl => {
        labelsContainer.appendChild(createLabelPill(lbl));
      });
    }

    // "+ Label" button and inline input to create a new label on the fly
    const addLabelBtn = document.createElement('button');
    addLabelBtn.className = 'sticky-toast-add-label-btn';
    addLabelBtn.type = 'button';
    addLabelBtn.textContent = '+ Label';

    const newLabelWrapper = document.createElement('span');
    newLabelWrapper.className = 'sticky-toast-new-label-wrapper';
    newLabelWrapper.style.display = 'none';

    const newLabelInput = document.createElement('input');
    newLabelInput.type = 'text';
    newLabelInput.className = 'sticky-toast-new-label-input';
    newLabelInput.placeholder = 'New label...';
    newLabelInput.maxLength = 20;

    const newLabelConfirm = document.createElement('button');
    newLabelConfirm.className = 'sticky-toast-new-label-confirm';
    newLabelConfirm.type = 'button';
    newLabelConfirm.textContent = '✓';

    newLabelWrapper.appendChild(newLabelInput);
    newLabelWrapper.appendChild(newLabelConfirm);

    addLabelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dismissTimeout) clearTimeout(dismissTimeout);
      addLabelBtn.style.display = 'none';
      newLabelWrapper.style.display = 'inline-flex';
      newLabelInput.value = '';
      newLabelInput.focus();
    });

    const labelPalette = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#06B6D4', '#6366F1'];

    const commitNewLabel = () => {
      const name = newLabelInput.value.trim();
      if (!name) {
        newLabelWrapper.style.display = 'none';
        addLabelBtn.style.display = 'inline-flex';
        resetDismissTimer();
        return;
      }

      const randomColor = labelPalette[Math.floor(Math.random() * labelPalette.length)];

      if (runtimeAPI && runtimeAPI.sendMessage) {
        runtimeAPI.sendMessage({
          type: 'CREATE_LABEL',
          name: name,
          color: randomColor
        }).then(res => {
          if (res && res.label) {
            const created = res.label;
            currentItemLabels.push(created.id);
            const pill = createLabelPill(created);
            labelsContainer.insertBefore(pill, addLabelBtn);

            runtimeAPI.sendMessage({
              type: 'UPDATE_SAVED_ITEM',
              itemId: item.id,
              updates: { labels: currentItemLabels }
            }).catch(() => {});
          }
        }).catch(err => {
          console.error('Failed to create label:', err);
        }).finally(() => {
          newLabelWrapper.style.display = 'none';
          addLabelBtn.style.display = 'inline-flex';
          resetDismissTimer();
        });
      } else {
        newLabelWrapper.style.display = 'none';
        addLabelBtn.style.display = 'inline-flex';
        resetDismissTimer();
      }
    };

    newLabelInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (dismissTimeout) clearTimeout(dismissTimeout);
      if (e.key === 'Enter') {
        commitNewLabel();
      } else if (e.key === 'Escape') {
        newLabelWrapper.style.display = 'none';
        addLabelBtn.style.display = 'inline-flex';
        resetDismissTimer();
      }
    });

    newLabelConfirm.addEventListener('click', (e) => {
      e.stopPropagation();
      commitNewLabel();
    });

    labelsContainer.appendChild(addLabelBtn);
    labelsContainer.appendChild(newLabelWrapper);

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
        if (runtimeAPI && runtimeAPI.sendMessage) {
          runtimeAPI.sendMessage({
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
    card.appendChild(labelsContainer);
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

      const selText = getSelectedText();

      if (runtimeAPI && runtimeAPI.sendMessage) {
        runtimeAPI.sendMessage({
          type: 'TRIGGER_CAPTURE_FROM_PAGE',
          selectedText: selText
        }).catch(() => {});
      }
    }
  }

  window.addEventListener('keydown', handleKeydown, true);
  loadShortcutConfig();
})();
