# Sticky 📌

A friction-free, local-only Firefox browser extension to capture links, social posts, videos, and thoughts with one keystroke or right-click, organized in a clean personal library.

---

## What Sticky Does

While scrolling feeds (Reddit, YouTube, Instagram, articles, or documentation), you often stumble upon links, discussions, or videos you want to revisit later. Bookmarking them clutters browser bookmarks, and copying links into note apps breaks your flow.

Sticky solves this:
- **Instant Save via Shortcut (`Alt+S`)**:
  - **On any generic page**: captures URL, page title, Open Graph / Twitter card preview image, or site favicon. If no preview image exists, falls back to a screenshot thumbnail.
  - **On Reddit specifically**: automatically detects which post is currently under your cursor or centered in your viewport and saves *that post's* permalink and title instead of the generic feed URL.
- **Right-Click Context Menu**:
  - Save links, images, selected text quotes, or whole pages via right-click without interrupting your flow.
- **Two Save Types**:
  - **Link items**: URL + title + thumbnail + optional note.
  - **Note items**: Freeform text notes and quick reminders without any URL.
- **Categorization & Multi-Label Filters**:
  - Assign colorful labels at capture time (via floating HUD) or from the library.
  - Filter your library by one or multiple labels simultaneously, combined with instant search.
- **Local-Only & Private**:
  - **Zero cloud servers, zero analytics, zero accounts.**
  - Metadata is stored in `browser.storage.local`.
  - Thumbnail images are cached locally in **IndexedDB**.
  - Includes a full JSON backup export & restore tool.

---

## How to Test in Firefox

1. Open **Firefox**.
2. In the address bar, navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Click the **"Load Temporary Add-on..."** button.
4. Browse to this directory (`sticky/`) and select **`manifest.json`**.
5. Sticky is now loaded and active!
   - Press <kbd>Alt</kbd> + <kbd>S</kbd> on any tab to save.
   - Click the Sticky icon in your Firefox toolbar or press <kbd>Alt</kbd> + <kbd>L</kbd> to open your **Library**.

---

## Customizing Keyboard Shortcuts

Firefox manages extension shortcuts natively:
1. In Firefox, go to `about:addons`.
2. Click the **gear icon (⚙)** in the top-right corner.
3. Click **"Manage Extension Shortcuts"**.
4. Find **Sticky** and assign your preferred key combinations.

---

## Project Structure

```text
sticky/
├── manifest.json              # Firefox Manifest V3 configuration
├── background.js              # Event page: commands, context menus, and capture pipeline
├── content-scripts/
│   ├── generic.js             # Metadata extractor + in-page feedback toast
│   ├── reddit.js              # Focused Reddit post detector
│   └── toast.css              # Styling for in-page capture feedback
├── lib/
│   ├── db.js                  # IndexedDB wrapper for thumbnail blobs
│   └── storage.js             # browser.storage.local wrapper (items, labels, search)
├── pages/
│   ├── library.html           # Full library dashboard
│   ├── library.js             # Library controller (search, multi-label filter, CRUD)
│   ├── library.css            # Clean, modern styling with dark mode support
│   ├── options.html           # Label manager, shortcuts guide, backup & restore
│   ├── options.js             # Options controller
│   └── options.css            # Options styling
└── icons/
    ├── icon.svg               # Vector source icon
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    ├── icon-96.png
    └── icon-128.png
```

---

## License

MIT
