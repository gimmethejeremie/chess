/**
 * Global reactive state store for settings and active mode.
 * Persists theme, pieceSet, boardTheme, coordinates, and sound in localStorage.
 */
import { storage } from '../storage/index.js';
import { soundManager } from '../sounds/index.js';

const STORAGE_KEYS = {
  THEME: 'theme',
  PIECE_SET: 'piece_set',
  BOARD_THEME: 'board_theme',
  COORDINATES: 'show_coordinates'
};

const prefersDark =
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

const state = {
  currentMode: null, // null (home) | 'standard' | 'sandbox' | 'multiplayer'
  theme: storage.get(STORAGE_KEYS.THEME, prefersDark ? 'dark' : 'light'),
  pieceSet: storage.get(STORAGE_KEYS.PIECE_SET, 'cburnett'), // 'cburnett' | 'merida' | 'alpha'
  boardTheme: storage.get(STORAGE_KEYS.BOARD_THEME, 'classic'), // 'classic' | 'wood' | 'ocean' | 'slate'
  showCoordinates: storage.get(STORAGE_KEYS.COORDINATES, true),
  soundMuted: soundManager.isMuted(),
  listeners: new Set()
};

export const store = {
  getState() {
    return { ...state };
  },

  setMode(mode) {
    state.currentMode = mode;
    this.notify();
  },

  setTheme(theme) {
    if (state.theme !== theme) {
      state.theme = theme;
      storage.set(STORAGE_KEYS.THEME, theme);
      this.applyTheme(theme);
      this.notify();
    }
  },

  toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
    return nextTheme;
  },

  applyTheme(theme = state.theme) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },

  setPieceSet(pieceSet) {
    if (['cburnett', 'merida', 'alpha'].includes(pieceSet) && state.pieceSet !== pieceSet) {
      state.pieceSet = pieceSet;
      storage.set(STORAGE_KEYS.PIECE_SET, pieceSet);
      this.notify();
    }
  },

  setBoardTheme(boardTheme) {
    if (['classic', 'wood', 'ocean', 'slate'].includes(boardTheme) && state.boardTheme !== boardTheme) {
      state.boardTheme = boardTheme;
      storage.set(STORAGE_KEYS.BOARD_THEME, boardTheme);
      this.notify();
    }
  },

  toggleCoordinates() {
    state.showCoordinates = !state.showCoordinates;
    storage.set(STORAGE_KEYS.COORDINATES, state.showCoordinates);
    this.notify();
    return state.showCoordinates;
  },

  setCoordinates(show) {
    state.showCoordinates = Boolean(show);
    storage.set(STORAGE_KEYS.COORDINATES, state.showCoordinates);
    this.notify();
  },

  toggleSound() {
    const muted = soundManager.toggleMute();
    state.soundMuted = muted;
    this.notify();
    return !muted;
  },

  setSoundMuted(muted) {
    soundManager.setMuted(muted);
    state.soundMuted = Boolean(muted);
    this.notify();
  },

  subscribe(listener) {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },

  notify() {
    for (const listener of state.listeners) {
      listener(this.getState());
    }
  }
};
