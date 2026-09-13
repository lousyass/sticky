/**
 * lib/storage.js - browser.storage.local wrapper for Sticky
 * Manages items and labels with persistence, search, filtering, and backup/restore.
 */

const STORAGE_KEYS = {
  ITEMS: 'sticky_items',
  LABELS: 'sticky_labels',
  SETTINGS: 'sticky_settings'
};

// Default seed labels for initial setup
const DEFAULT_LABELS = [
  { id: 'label-read-later', name: 'Read Later', color: '#3B82F6' },
  { id: 'label-ideas', name: 'Ideas', color: '#10B981' },
  { id: 'label-inspiration', name: 'Inspiration', color: '#EC4899' },
  { id: 'label-tech', name: 'Tech', color: '#8B5CF6' },
  { id: 'label-research', name: 'Research', color: '#F59E0B' }
];

// Default application settings
const DEFAULT_SETTINGS = {
  captureShortcut: {
    display: 'Ctrl + `',
    key: '`',
    code: 'Backquote',
    shiftKey: false,
    ctrlKey: true,
    altKey: false,
    metaKey: false
  }
};

// Fallback UUID generator if crypto.randomUUID is not in scope
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Get the browser extension API object (Firefox 'browser' or Chrome 'chrome')
function getBrowserStorage() {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    return browser.storage.local;
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return {
      get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
      set: (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve)),
      remove: (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve)),
      clear: () => new Promise((resolve) => chrome.storage.local.clear(resolve))
    };
  }
  // Memory fallback for unit testing in node environments
  if (typeof globalThis !== 'undefined' && globalThis.__sticky_mock_storage) {
    return globalThis.__sticky_mock_storage;
  }
  throw new Error('Browser storage API not available');
}

class StickyStorageService {
  // ==========================================
  // SETTINGS MANAGEMENT
  // ==========================================

  /**
   * Get application settings with defaults
   * @returns {Promise<{captureShortcut: object}>}
   */
  async getSettings() {
    const storage = getBrowserStorage();
    const result = await storage.get(STORAGE_KEYS.SETTINGS);
    const saved = result[STORAGE_KEYS.SETTINGS] || {};
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      captureShortcut: {
        ...DEFAULT_SETTINGS.captureShortcut,
        ...(saved.captureShortcut || {})
      }
    };
  }

  /**
   * Save partial or full settings updates
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async saveSettings(updates) {
    const current = await this.getSettings();
    const updated = {
      ...current,
      ...updates
    };
    const storage = getBrowserStorage();
    await storage.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return updated;
  }

  // ==========================================
  // LABELS MANAGEMENT
  // ==========================================

  /**
   * Get all user labels. Seeds defaults if none exist.
   * @returns {Promise<Array<{id: string, name: string, color: string}>>}
   */
  async getLabels() {
    const storage = getBrowserStorage();
    const result = await storage.get(STORAGE_KEYS.LABELS);
    let labels = result[STORAGE_KEYS.LABELS];

    if (!Array.isArray(labels) || labels.length === 0) {
      labels = [...DEFAULT_LABELS];
      await storage.set({ [STORAGE_KEYS.LABELS]: labels });
    }
    return labels;
  }

  /**
   * Create or update a label
   * @param {{id?: string, name: string, color: string}} labelData
   * @returns {Promise<{id: string, name: string, color: string}>}
   */
  async saveLabel(labelData) {
    if (!labelData || !labelData.name) {
      throw new Error('Label name is required');
    }

    const labels = await this.getLabels();
    const id = labelData.id || generateUUID();
    const existingIndex = labels.findIndex(l => l.id === id);

    const updatedLabel = {
      id,
      name: labelData.name.trim(),
      color: labelData.color || '#F77F00'
    };

    if (existingIndex >= 0) {
      labels[existingIndex] = updatedLabel;
    } else {
      labels.push(updatedLabel);
    }

    const storage = getBrowserStorage();
    await storage.set({ [STORAGE_KEYS.LABELS]: labels });
    return updatedLabel;
  }

  /**
   * Delete a label and remove it from any items referencing it.
   * @param {string} labelId
   */
  async deleteLabel(labelId) {
    if (!labelId) return;
    const labels = await this.getLabels();
    const filteredLabels = labels.filter(l => l.id !== labelId);

    const storage = getBrowserStorage();
    await storage.set({ [STORAGE_KEYS.LABELS]: filteredLabels });

    // Clean up label reference in items
    const items = await this.getItems();
    let itemsChanged = false;

    const cleanedItems = items.map(item => {
      if (Array.isArray(item.labels) && item.labels.includes(labelId)) {
        itemsChanged = true;
        return {
          ...item,
          labels: item.labels.filter(id => id !== labelId)
        };
      }
      return item;
    });

    if (itemsChanged) {
      await storage.set({ [STORAGE_KEYS.ITEMS]: cleanedItems });
    }
  }

  // ==========================================
  // ITEMS MANAGEMENT
  // ==========================================

  /**
   * Retrieve all saved items
   * @returns {Promise<Array<object>>}
   */
  async getItems() {
    console.log('[Sticky DEBUG] StickyStorage.getItems(): calling getBrowserStorage()...');
    const storage = getBrowserStorage();
    console.log('[Sticky DEBUG] StickyStorage.getItems(): calling storage.get("' + STORAGE_KEYS.ITEMS + '")...');
    const result = await storage.get(STORAGE_KEYS.ITEMS);
    console.log('[Sticky DEBUG] StickyStorage.getItems(): raw storage result:', result);
    const items = Array.isArray(result[STORAGE_KEYS.ITEMS]) ? result[STORAGE_KEYS.ITEMS] : [];
    console.log('[Sticky DEBUG] StickyStorage.getItems(): returning items array with length:', items.length);
    return items;
  }

  /**
   * Retrieve a single item by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getItem(id) {
    if (!id) return null;
    const items = await this.getItems();
    return items.find(item => item.id === id) || null;
  }

  /**
   * Save a new item or update an existing item
   * @param {object} itemData
   * @returns {Promise<object>}
   */
  async saveItem(itemData) {
    if (!itemData) throw new Error('Item data is required');

    const items = await this.getItems();
    const id = itemData.id || generateUUID();
    const existingIndex = items.findIndex(item => item.id === id);

    const item = {
      id,
      type: itemData.type || (itemData.url ? 'link' : 'note'),
      url: itemData.url || null,
      title: (itemData.title || (itemData.url ? 'Untitled' : 'Quick Note')).trim(),
      note: itemData.note !== undefined ? itemData.note : null,
      labels: Array.isArray(itemData.labels) ? itemData.labels : [],
      thumbnailKey: itemData.thumbnailKey || null,
      faviconUrl: itemData.faviconUrl || null,
      source: itemData.source || this._extractSource(itemData.url),
      createdAt: itemData.createdAt || new Date().toISOString(),
      read: itemData.read !== undefined ? Boolean(itemData.read) : false
    };

    if (existingIndex >= 0) {
      items[existingIndex] = { ...items[existingIndex], ...item };
    } else {
      // Prepend so newest is first by default
      items.unshift(item);
    }

    const storage = getBrowserStorage();
    await storage.set({ [STORAGE_KEYS.ITEMS]: items });
    return item;
  }

  /**
   * Partially update an existing item
   * @param {string} id
   * @param {object} updates
   * @returns {Promise<object|null>}
   */
  async updateItem(id, updates) {
    if (!id) return null;
    const items = await this.getItems();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;

    items[index] = { ...items[index], ...updates };

    const storage = getBrowserStorage();
    await storage.set({ [STORAGE_KEYS.ITEMS]: items });
    return items[index];
  }

  /**
   * Toggle the read/unread status of an item
   * @param {string} id
   * @returns {Promise<boolean>} new read state
   */
  async toggleRead(id) {
    const item = await this.getItem(id);
    if (!item) return false;
    const newRead = !item.read;
    await this.updateItem(id, { read: newRead });
    return newRead;
  }

  /**
   * Delete an item and its associated thumbnail from IndexedDB
   * @param {string} id
   */
  async deleteItem(id) {
    if (!id) return;
    const items = await this.getItems();
    const itemToDelete = items.find(i => i.id === id);
    const filteredItems = items.filter(item => item.id !== id);

    const storage = getBrowserStorage();
    await storage.set({ [STORAGE_KEYS.ITEMS]: filteredItems });

    // If item had a thumbnail in IndexedDB, delete it
    if (itemToDelete && itemToDelete.thumbnailKey) {
      try {
        if (typeof globalThis.ThumbnailDB !== 'undefined') {
          await globalThis.ThumbnailDB.deleteThumbnail(itemToDelete.thumbnailKey);
        }
      } catch (err) {
        console.warn('Failed to delete thumbnail from IndexedDB:', err);
      }
    }
  }

  /**
   * Helper to extract friendly source domain
   * @private
   */
  _extractSource(url) {
    if (!url) return 'generic';
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('reddit.com')) return 'reddit.com';
      if (host.includes('instagram.com')) return 'instagram.com';
      if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube.com';
      if (host.includes('twitter.com') || host.includes('x.com')) return 'x.com';
      if (host.includes('github.com')) return 'github.com';
      return host.replace(/^www\./, '');
    } catch {
      return 'generic';
    }
  }

  // ==========================================
  // SEARCH & FILTER
  // ==========================================

  /**
   * Filter and sort items based on criteria
   * @param {object} options
   * @param {string} [options.query] Search string
   * @param {Array<string>} [options.labelIds] Filter by one or more labels
   * @param {'all'|'link'|'note'} [options.type] Filter by type
   * @param {'all'|'read'|'unread'} [options.readState] Filter by read status
   * @param {'newest'|'oldest'|'title'} [options.sortBy] Sorting order
   * @returns {Promise<Array<object>>}
   */
  async queryItems({ query = '', labelIds = [], type = 'all', readState = 'all', sortBy = 'newest' } = {}) {
    let items = await this.getItems();

    // Type filter
    if (type === 'link' || type === 'note') {
      items = items.filter(i => i.type === type);
    }

    // Read state filter
    if (readState === 'read') {
      items = items.filter(i => i.read === true);
    } else if (readState === 'unread') {
      items = items.filter(i => i.read === false);
    }

    // Label filter (must match at least one selected label if labels selected)
    if (Array.isArray(labelIds) && labelIds.length > 0) {
      items = items.filter(item => {
        if (!Array.isArray(item.labels)) return false;
        return labelIds.some(lid => item.labels.includes(lid));
      });
    }

    // Search query filter (matches title, note text, and url)
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(item => {
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const noteMatch = (item.note || '').toLowerCase().includes(q);
        const urlMatch = (item.url || '').toLowerCase().includes(q);
        const sourceMatch = (item.source || '').toLowerCase().includes(q);
        return titleMatch || noteMatch || urlMatch || sourceMatch;
      });
    }

    // Sorting
    items.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      // default: newest
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return items;
  }

  // ==========================================
  // BACKUP & RESTORE
  // ==========================================

  /**
   * Export all items, labels, and thumbnails into a single JSON serializable object
   * @returns {Promise<object>}
   */
  async exportBackup() {
    const items = await this.getItems();
    const labels = await this.getLabels();
    let thumbnails = [];

    if (typeof globalThis.ThumbnailDB !== 'undefined') {
      try {
        thumbnails = await globalThis.ThumbnailDB.getAllForExport();
      } catch (err) {
        console.warn('Could not export thumbnails:', err);
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      extension: 'Sticky',
      items,
      labels,
      thumbnails
    };
  }

  /**
   * Restore from backup JSON
   * @param {object} backupData
   * @param {'merge'|'replace'} mode
   */
  async importBackup(backupData, mode = 'merge') {
    if (!backupData || !Array.isArray(backupData.items)) {
      throw new Error('Invalid backup file format: missing items array');
    }

    const storage = getBrowserStorage();

    if (mode === 'replace') {
      // Clear and set items
      await storage.set({ [STORAGE_KEYS.ITEMS]: backupData.items });

      if (Array.isArray(backupData.labels) && backupData.labels.length > 0) {
        await storage.set({ [STORAGE_KEYS.LABELS]: backupData.labels });
      }

      if (typeof globalThis.ThumbnailDB !== 'undefined') {
        await globalThis.ThumbnailDB.clearAll();
        if (Array.isArray(backupData.thumbnails)) {
          await globalThis.ThumbnailDB.importThumbnails(backupData.thumbnails);
        }
      }
    } else {
      // Merge mode
      const existingItems = await this.getItems();
      const existingLabels = await this.getLabels();

      // Merge items by ID
      const itemMap = new Map(existingItems.map(i => [i.id, i]));
      for (const item of backupData.items) {
        itemMap.set(item.id, item);
      }
      await storage.set({ [STORAGE_KEYS.ITEMS]: Array.from(itemMap.values()) });

      // Merge labels by ID or name
      if (Array.isArray(backupData.labels)) {
        const labelMap = new Map(existingLabels.map(l => [l.id, l]));
        for (const label of backupData.labels) {
          labelMap.set(label.id, label);
        }
        await storage.set({ [STORAGE_KEYS.LABELS]: Array.from(labelMap.values()) });
      }

      // Import thumbnails
      if (typeof globalThis.ThumbnailDB !== 'undefined' && Array.isArray(backupData.thumbnails)) {
        await globalThis.ThumbnailDB.importThumbnails(backupData.thumbnails);
      }
    }

    return {
      importedItemsCount: backupData.items.length,
      importedLabelsCount: Array.isArray(backupData.labels) ? backupData.labels.length : 0
    };
  }
}

// Export singleton instance as StickyStorage
const StickyStorage = new StickyStorageService();
if (typeof window !== 'undefined') {
  window.StickyStorage = StickyStorage;
}
if (typeof globalThis !== 'undefined') {
  globalThis.StickyStorage = StickyStorage;
}
