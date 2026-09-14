/**
 * content-scripts/reddit.js
 * Specialized detector for reddit.com feeds.
 * Tracks mouse position and viewport visibility to pinpoint the exact focused post.
 */

(function () {
  if (window.__stickyRedditInitialized) return;
  window.__stickyRedditInitialized = true;

  let lastMouseX = window.innerWidth / 2;
  let lastMouseY = window.innerHeight / 3;

  // Track mouse coordinates
  window.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }, { passive: true });

  /**
   * Helper to turn relative Reddit links into full URLs
   */
  function toRedditUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, 'https://www.reddit.com').href;
    } catch {
      return href;
    }
  }

  /**
   * Extract post info from a Modern Reddit (Shreddit) post element
   */
  function extractFromShredditPost(elem) {
    if (!elem) return null;

    let permalink = elem.getAttribute('permalink');
    let title = elem.getAttribute('post-title');
    const subreddit = elem.getAttribute('subreddit-prefixed-name') || '';

    // If title not in attribute, query inside
    if (!title) {
      const titleEl = elem.querySelector('[slot="title"], a[slot="full-post-link"], h1, h2, h3');
      if (titleEl) {
        title = titleEl.innerText || titleEl.textContent;
      }
    }

    // If permalink not in attribute, query link
    if (!permalink) {
      const linkEl = elem.querySelector('a[slot="full-post-link"], a[href*="/comments/"]');
      if (linkEl && linkEl.getAttribute('href')) {
        permalink = linkEl.getAttribute('href');
      }
    }

    // Thumbnail / Preview image
    let thumbnailUrl = null;
    const mediaEl = elem.querySelector('img[slot="post-media"], img.preview-img, figure img, div[data-testid="post-image"] img, shreddit-player[preview], video[poster], img[src*="preview.redd.it"], img[src*="i.redd.it"], img[src*="external-preview"]');
    if (mediaEl) {
      thumbnailUrl = mediaEl.src || mediaEl.getAttribute('preview') || mediaEl.getAttribute('poster') || null;
    }

    if (permalink && title) {
      return {
        url: toRedditUrl(permalink),
        title: title.trim(),
        thumbnailUrl,
        source: subreddit ? `reddit.com (${subreddit})` : 'reddit.com'
      };
    }

    return null;
  }

  /**
   * Extract post info from Redesign Reddit post element
   */
  function extractFromRedesignPost(elem) {
    if (!elem) return null;

    const titleEl = elem.querySelector('h1, h2, h3, a[data-click-id="body"]');
    const title = titleEl ? (titleEl.innerText || titleEl.textContent).trim() : null;

    let permalink = null;
    const linkEl = elem.querySelector('a[data-click-id="body"], a[data-click-id="comments"], a[href*="/comments/"]');
    if (linkEl && linkEl.getAttribute('href')) {
      permalink = linkEl.getAttribute('href');
    }

    let thumbnailUrl = null;
    const mediaEl = elem.querySelector('img[alt="Post image"], div[data-click-id="media"] img, div[data-click-id="media"] video[poster]');
    if (mediaEl) {
      thumbnailUrl = mediaEl.src || mediaEl.getAttribute('poster') || null;
    }

    const subEl = elem.querySelector('a[data-click-id="subreddit"]');
    const subreddit = subEl ? subEl.innerText.trim() : '';

    if (permalink && title) {
      return {
        url: toRedditUrl(permalink),
        title,
        thumbnailUrl,
        source: subreddit ? `reddit.com (${subreddit})` : 'reddit.com'
      };
    }

    return null;
  }

  /**
   * Extract post info from Old Reddit post element
   */
  function extractFromOldRedditPost(elem) {
    if (!elem) return null;

    const titleEl = elem.querySelector('a.title');
    const title = titleEl ? titleEl.innerText.trim() : null;

    let permalink = elem.getAttribute('data-permalink');
    if (!permalink && titleEl) {
      permalink = titleEl.getAttribute('href');
    }

    let thumbnailUrl = null;
    const thumbImg = elem.querySelector('.thumbnail img');
    if (thumbImg && thumbImg.src && !thumbImg.src.includes('default') && !thumbImg.src.includes('self')) {
      thumbnailUrl = thumbImg.src;
    }

    const subreddit = elem.getAttribute('data-subreddit-prefixed') || '';

    if (permalink && title) {
      return {
        url: toRedditUrl(permalink),
        title,
        thumbnailUrl,
        source: subreddit ? `reddit.com (${subreddit})` : 'reddit.com'
      };
    }

    return null;
  }

  /**
   * Inspect any post element and route to appropriate extractor
   */
  function extractPostData(postElem) {
    if (!postElem) return null;

    const tagName = postElem.tagName.toLowerCase();
    if (tagName === 'shreddit-post') {
      return extractFromShredditPost(postElem);
    }
    if (postElem.matches('div[data-testid="post-container"]') || postElem.hasAttribute('data-testid')) {
      return extractFromRedesignPost(postElem);
    }
    if (postElem.classList.contains('thing')) {
      return extractFromOldRedditPost(postElem);
    }

    // Generic fallback for nested post containers
    const shredditChild = postElem.querySelector('shreddit-post');
    if (shredditChild) return extractFromShredditPost(shredditChild);

    const redesignChild = postElem.querySelector('div[data-testid="post-container"]');
    if (redesignChild) return extractFromRedesignPost(redesignChild);

    return null;
  }

  /**
   * Find candidate post container from an element
   */
  function findPostAncestor(elem) {
    if (!elem) return null;
    return elem.closest('shreddit-post, div[data-testid="post-container"], .thing.link, article');
  }

  /**
   * Detect the focused post using:
   * 1. Mouse coordinates
   * 2. Viewport visibility fallback
   */
  function detectFocusedPost() {
    // 1. Try element under cursor
    let elemUnderCursor = null;
    try {
      elemUnderCursor = document.elementFromPoint(lastMouseX, lastMouseY);
    } catch {
      elemUnderCursor = null;
    }

    if (elemUnderCursor) {
      const postAncestor = findPostAncestor(elemUnderCursor);
      if (postAncestor) {
        const postData = extractPostData(postAncestor);
        if (postData) {
          return postData;
        }
      }
    }

    // 2. Fallback: Find the post most visible in the viewport
    const postCandidates = Array.from(
      document.querySelectorAll('shreddit-post, div[data-testid="post-container"], .thing.link')
    );

    if (postCandidates.length === 0) {
      return null;
    }

    const windowHeight = window.innerHeight;
    const targetY = windowHeight * 0.35; // Target upper-third of viewport

    let bestPost = null;
    let minDistance = Infinity;

    for (const post of postCandidates) {
      const rect = post.getBoundingClientRect();
      // Only consider posts visible in viewport
      if (rect.bottom > 0 && rect.top < windowHeight) {
        const postCenter = rect.top + (rect.height / 2);
        const distance = Math.abs(postCenter - targetY);
        if (distance < minDistance) {
          minDistance = distance;
          bestPost = post;
        }
      }
    }

    if (bestPost) {
      return extractPostData(bestPost);
    }

    return null;
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (selection && selection.toString) {
      const text = selection.toString().trim();
      if (text) return text;
    }
    return null;
  }

  // Listen for background requests
  const runtimeAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime :
                     (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;

  if (runtimeAPI) {
    runtimeAPI.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'DETECT_FOCUSED_REDDIT_POST') {
        const detected = detectFocusedPost();
        const selectedText = getSelectedText();
        if (detected) {
          detected.selectedText = selectedText;
          sendResponse(detected);
        } else {
          sendResponse(selectedText ? { selectedText } : null);
        }
        return false;
      }
    });
  }
})();
