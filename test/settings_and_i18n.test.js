import { describe, it, expect } from 'vitest';
import { i18n } from '../src/core/i18n/index.js';
import { store } from '../src/core/store/index.js';
import { storage } from '../src/core/storage/index.js';
import en from '../src/core/i18n/en.json';
import vi from '../src/core/i18n/vi.json';

describe('Settings and i18n Internationalization', () => {
  it('en.json and vi.json have symmetric top-level translation sections', () => {
    const enSections = Object.keys(en);
    const viSections = Object.keys(vi);

    for (const section of enSections) {
      expect(viSections).toContain(section);
      const enKeys = Object.keys(en[section]);
      const viKeys = Object.keys(vi[section]);

      for (const k of enKeys) {
        expect(viKeys, `Missing key "${section}.${k}" in vi.json`).toContain(k);
      }
    }
  });

  it('i18n switches language and persists to storage', () => {
    i18n.setLocale('vi');
    expect(i18n.getLocale()).toBe('vi');
    expect(storage.get('locale')).toBe('vi');
    expect(i18n.t('app.title')).toBe('Chess Playground');
    expect(i18n.t('settings.title')).toBe('Cài Đặt');

    i18n.setLocale('en');
    expect(i18n.getLocale()).toBe('en');
    expect(storage.get('locale')).toBe('en');
    expect(i18n.t('settings.title')).toBe('Settings');
  });

  it('store updates theme and persists to storage', () => {
    store.setTheme('dark');
    expect(store.getState().theme).toBe('dark');
    expect(storage.get('theme')).toBe('dark');

    store.setTheme('light');
    expect(store.getState().theme).toBe('light');
    expect(storage.get('theme')).toBe('light');
  });

  it('store updates pieceSet and persists to storage', () => {
    store.setPieceSet('merida');
    expect(store.getState().pieceSet).toBe('merida');
    expect(storage.get('piece_set')).toBe('merida');

    store.setPieceSet('alpha');
    expect(store.getState().pieceSet).toBe('alpha');
    expect(storage.get('piece_set')).toBe('alpha');

    store.setPieceSet('cburnett');
    expect(store.getState().pieceSet).toBe('cburnett');
    expect(storage.get('piece_set')).toBe('cburnett');
  });

  it('store updates boardTheme and persists to storage', () => {
    store.setBoardTheme('ocean');
    expect(store.getState().boardTheme).toBe('ocean');
    expect(storage.get('board_theme')).toBe('ocean');

    store.setBoardTheme('wood');
    expect(store.getState().boardTheme).toBe('wood');
    expect(storage.get('board_theme')).toBe('wood');

    store.setBoardTheme('classic');
    expect(store.getState().boardTheme).toBe('classic');
  });

  it('store updates coordinates and sound', () => {
    store.setCoordinates(false);
    expect(store.getState().showCoordinates).toBe(false);
    expect(storage.get('show_coordinates')).toBe(false);

    store.setCoordinates(true);
    expect(store.getState().showCoordinates).toBe(true);

    store.setSoundMuted(true);
    expect(store.getState().soundMuted).toBe(true);

    store.setSoundMuted(false);
    expect(store.getState().soundMuted).toBe(false);
  });
});
