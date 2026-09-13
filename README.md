# Sticky 📌

A friction-free, local-only Firefox browser extension to capture links, social posts, videos, and thoughts with one keystroke or right-click, organized in a clean personal library.

---

## Install

[Install Sticky from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/sticky/)

---

## What Sticky Does

While scrolling feeds (Reddit, YouTube, Instagram, articles, or documentation), you often stumble upon links, discussions, or videos you want to revisit later. Bookmarking them clutters browser bookmarks, and copying links into note apps breaks your flow.

Sticky solves this:
- **Instant Save via Shortcut (Default: `Ctrl + \``, Fully Customizable)**:
  - **On any generic page**: captures URL, page title, Open Graph / Twitter card preview image, or site favicon. If no preview image exists, falls back to a screenshot thumbnail.
  - **On Reddit specifically**: automatically detects which post is currently under your cursor or centered in your viewport and saves *that post's* permalink and title instead of the generic feed URL.
  - **Customizable Keys**: Customize the shortcut directly in **Sticky Settings &rarr; Capture Keyboard Shortcut** with an interactive key recorder, or reset to default <kbd>Ctrl</kbd> + <kbd>`</kbd> anytime.
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

## Using Sticky

### Customizing Keyboard Shortcuts

#### Option 1: In-App Shortcut Customizer (Recommended)
1. Open Sticky Library and click **"Options"** (or right-click extension icon &rarr; **Options**).
2. Under **"Capture Keyboard Shortcut"**, click the shortcut recording box.
3. Press any key combination you prefer (e.g. <kbd>Shift</kbd> + <kbd>E</kbd>, <kbd>Alt</kbd> + <kbd>S</kbd>, <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd>, etc.).
4. Click **"Save Shortcut"**. The new key combination applies immediately across all pages without restarting the browser.

#### Option 2: Firefox Global Browser Shortcuts
Firefox also manages global browser-level extension shortcuts:
1. In Firefox, go to `about:addons`.
2. Click the **gear icon (⚙)** in the top-right corner.
3. Click **"Manage Extension Shortcuts"**.
4. Find **Sticky** and assign your preferred browser command.

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

## Development & Testing

### Testing the AMO Release
Once approved and live on Mozilla Add-ons, install or test directly from:
👉 **[Sticky on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/sticky/)**

### Running Locally from Source
To run Sticky from source for local development or testing:

1. Open **Firefox**.
2. In the address bar, navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Click the **"Load Temporary Add-on..."** button.
4. Browse to this directory (`sticky/`) and select **`manifest.json`**.
5. Sticky is now loaded and active!
   - Press <kbd>Ctrl</kbd> + <kbd>`</kbd> on any tab to save.
   - Click the Sticky icon in your Firefox toolbar or press <kbd>Alt</kbd> + <kbd>L</kbd> to open your **Library**.

---

## License

MIT
