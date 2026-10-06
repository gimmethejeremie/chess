/**
 * Hash-based Router for Chess Playground
 * Provides full URL pathing, browser history (Back / Forward),
 * and zero-configuration GitHub Pages compatibility without 404 errors.
 */
import { store } from '../store/index.js';

export const ROUTE_PATHS = {
  HOME: '#/',
  STANDARD: '#/standard',
  SANDBOX: '#/sandbox',
  MULTIPLAYER: '#/multiplayer'
};

/**
 * Extract active mode from a URL hash or string
 * @param {string} [hash]
 * @returns {'standard'|'sandbox'|'multiplayer'|null}
 */
export function parseRoute(hash) {
  const raw = typeof hash === 'string'
    ? hash
    : typeof window !== 'undefined'
      ? window.location.hash
      : '';
  const clean = (raw || '').toLowerCase().trim();

  if (clean.includes('standard')) return 'standard';
  if (clean.includes('sandbox')) return 'sandbox';
  if (clean.includes('multiplayer')) return 'multiplayer';
  return null;
}

export const router = {
  isInitialized: false,

  /**
   * Initialize router listeners and sync store with initial URL
   */
  init() {
    if (typeof window === 'undefined') return;
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Read initial hash and apply mode
    const initialMode = parseRoute(window.location.hash);
    if (initialMode) {
      store.setMode(initialMode);
    } else {
      store.setMode(null);
    }

    const onLocationChange = () => {
      const targetMode = parseRoute(window.location.hash);
      const currentMode = store.getState().currentMode;
      if (targetMode !== currentMode) {
        store.setMode(targetMode);
      }
    };

    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
  },

  /**
   * Navigate to a mode or home
   * @param {'standard'|'sandbox'|'multiplayer'|null} mode
   * @param {boolean} [replace=false]
   */
  navigate(mode, replace = false) {
    if (typeof window === 'undefined') {
      store.setMode(mode);
      return;
    }

    const targetHash = mode ? `#/${mode}` : '#/';

    if (window.location.hash !== targetHash) {
      if (replace && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', targetHash);
      } else {
        window.location.hash = targetHash;
      }
    }

    if (store.getState().currentMode !== mode) {
      store.setMode(mode);
    }
  },

  /**
   * Back button behavior: tries browser history first, fallbacks to home
   */
  back() {
    if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
      window.history.back();
    } else {
      this.navigate(null);
    }
  }
};
