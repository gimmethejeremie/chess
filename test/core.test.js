import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { i18n } from '../src/core/i18n/index.js';
import { ChessClock } from '../src/core/clock/index.js';

describe('Project Skeleton - Core Integrity', () => {
  it('chess.js initializes properly and generates legal starting moves', () => {
    const chess = new Chess();
    expect(chess.moves().length).toBe(20);
    expect(chess.turn()).toBe('w');
  });

  it('i18n provides expected translations for English and Vietnamese', () => {
    i18n.setLocale('en');
    expect(i18n.t('app.title')).toBe('Chess Playground');
    expect(i18n.t('modes.standard.title')).toBe('Standard');

    i18n.setLocale('vi');
    expect(i18n.t('app.title')).toBe('Chess Playground');
    expect(i18n.t('modes.standard.title')).toBe('Tiêu chuẩn');

    // Switch back to default
    i18n.setLocale('en');
  });

  it('ChessClock initializes with default configuration', () => {
    const clock = new ChessClock({ initialTimeMs: 180000, incrementMs: 2000 });
    expect(clock.whiteTimeMs).toBe(180000);
    expect(clock.blackTimeMs).toBe(180000);
    expect(clock.incrementMs).toBe(2000);
    expect(clock.isRunning).toBe(false);
  });
});
