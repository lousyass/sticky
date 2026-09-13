/**
 * lib/db.js - IndexedDB wrapper for Sticky thumbnail storage
 * Stores and retrieves image blobs / base64 data for saved items.
 */

const DB_NAME = 'sticky_thumbnails_db';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

class ThumbnailDB {
  constructor() {
    this._dbPromise = null;
  }

  /**
   * Opens or returns the cached IndexedDB instance
   * @returns {Promise<IDBDatabase>}
   */
  async getDB() {
    if (this._dbPromise) {
      return this._dbPromise;
    }

    this._dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        this._dbPromise = null;
        reject(event.target.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this._dbPromise;
  }

  /**
   * Save a thumbnail image for a given item ID.
   * Accepts Blob, File, or Data URL string.
   * @param {string} id
   * @param {Blob|string} data
   * @returns {Promise<string>} returns the id
   */
  async saveThumbnail(id, data) {
    if (!id || !data) return null;
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = {
        id,
        data,
        updatedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(id);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retrieve thumbnail data for an item.
   * Returns a usable URL (data URL or object URL) or null if not found.
   * @param {string} id
   * @returns {Promise<string|null>}
   */
  async getThumbnail(id) {
    if (!id) return null;
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (!result || !result.data) {
          return resolve(null);
        }

        if (typeof result.data === 'string') {
          // Data URL or regular URL
          return resolve(result.data);
        } else if (result.data instanceof Blob) {
          try {
            const url = URL.createObjectURL(result.data);
            return resolve(url);
          } catch (err) {
            console.error('Error creating object URL for thumbnail blob:', err);
            return resolve(null);
          }
        }
        resolve(null);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retrieve raw thumbnail record for export.
   * Converts Blobs to Data URLs for clean JSON export.
   * @param {string} id
   * @returns {Promise<{id: string, dataUrl: string}|null>}
   */
  async getThumbnailForExport(id) {
    if (!id) return null;
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = async () => {
        const result = request.result;
        if (!result || !result.data) return resolve(null);

        if (typeof result.data === 'string') {
          return resolve({ id: result.id, data: result.data });
        } else if (result.data instanceof Blob) {
          const reader = new FileReader();
          reader.onloadend = () => resolve({ id: result.id, data: reader.result });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(result.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get all thumbnails as an array of { id, data } for full backup export.
   * @returns {Promise<Array<{id: string, data: string}>>}
   */
  async getAllForExport() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = async () => {
        const records = request.result || [];
        const exportable = [];

        for (const record of records) {
          if (!record || !record.data) continue;
          if (typeof record.data === 'string') {
            exportable.push({ id: record.id, data: record.data });
          } else if (record.data instanceof Blob) {
            try {
              const dataUrl = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onloadend = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(record.data);
              });
              exportable.push({ id: record.id, data: dataUrl });
            } catch (err) {
              console.warn(`Could not export thumbnail for ${record.id}:`, err);
            }
          }
        }
        resolve(exportable);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Import multiple thumbnails from export data.
   * @param {Array<{id: string, data: string}>} items
   */
  async importThumbnails(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const item of items) {
        if (item && item.id && item.data) {
          store.put({
            id: item.id,
            data: item.data,
            updatedAt: Date.now()
          });
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Delete a thumbnail
   * @param {string} id
   */
  async deleteThumbnail(id) {
    if (!id) return;
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Clear all thumbnails in the database
   */
  async clearAll() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

// Export singleton instance for both ES modules and browser scripts
const thumbnailDB = new ThumbnailDB();
if (typeof window !== 'undefined') {
  window.ThumbnailDB = thumbnailDB;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ThumbnailDB = thumbnailDB;
}
