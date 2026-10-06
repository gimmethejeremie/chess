/**
 * LocalStorage wrapper with safe JSON serialization and fallback.
 */

const STORAGE_PREFIX = 'chess_playground_';

const memoryFallback = new Map();

function isStorageAvailable() {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch (e) {
    return false;
  }
}

export const storage = {
  /**
   * Get an item from localStorage (or memory fallback)
   * @template T
   * @param {string} key
   * @param {T} [defaultValue=null]
   * @returns {T|null}
   */
  get(key, defaultValue = null) {
    if (!isStorageAvailable()) {
      return memoryFallback.has(key) ? memoryFallback.get(key) : defaultValue;
    }
    try {
      const item = window.localStorage.getItem(STORAGE_PREFIX + key);
      return item !== null ? JSON.parse(item) : defaultValue;
    } catch (e) {
      return memoryFallback.has(key) ? memoryFallback.get(key) : defaultValue;
    }
  },

  /**
   * Save an item to localStorage (or memory fallback)
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    memoryFallback.set(key, value);
    if (!isStorageAvailable()) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[Storage] Failed to write key "${key}":`, e);
    }
  },

  /**
   * Remove an item from localStorage (or memory fallback)
   * @param {string} key
   */
  remove(key) {
    memoryFallback.delete(key);
    if (!isStorageAvailable()) {
      return;
    }
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch (e) {
      console.warn(`[Storage] Failed to remove key "${key}":`, e);
    }
  }
};
