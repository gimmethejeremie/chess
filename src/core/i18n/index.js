/**
 * Simple i18n manager for English and Vietnamese.
 */
import en from './en.json';
import vi from './vi.json';
import { storage } from '../storage/index.js';

const translations = { en, vi };
const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'locale';

class I18nManager {
  constructor() {
    this.currentLocale = storage.get(STORAGE_KEY, DEFAULT_LOCALE);
    if (!translations[this.currentLocale]) {
      this.currentLocale = DEFAULT_LOCALE;
    }
    this.listeners = new Set();
  }

  getLocale() {
    return this.currentLocale;
  }

  setLocale(locale) {
    if (translations[locale] && this.currentLocale !== locale) {
      this.currentLocale = locale;
      storage.set(STORAGE_KEY, locale);
      this.notify();
    }
  }

  toggleLocale() {
    const nextLocale = this.currentLocale === 'en' ? 'vi' : 'en';
    this.setLocale(nextLocale);
    return nextLocale;
  }

  t(keyPath) {
    const keys = keyPath.split('.');
    let val = translations[this.currentLocale];

    for (const key of keys) {
      if (val && typeof val === 'object' && key in val) {
        val = val[key];
      } else {
        // Fallback to english if not found
        let fallbackVal = translations[DEFAULT_LOCALE];
        for (const fbKey of keys) {
          if (fallbackVal && typeof fallbackVal === 'object' && fbKey in fallbackVal) {
            fallbackVal = fallbackVal[fbKey];
          } else {
            return keyPath;
          }
        }
        return fallbackVal || keyPath;
      }
    }

    return typeof val === 'string' ? val : keyPath;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.currentLocale);
    }
  }
}

export const i18n = new I18nManager();
