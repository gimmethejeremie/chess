import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { router, parseRoute, ROUTE_PATHS } from '../src/core/router/index.js';
import { store } from '../src/core/store/index.js';

describe('Hash Router and Navigation Verification', () => {
  let originalWindow;

  beforeEach(() => {
    store.setMode(null);
  });

  it('parseRoute accurately identifies routes from hashes and path strings', () => {
    expect(parseRoute('')).toBe(null);
    expect(parseRoute('#')).toBe(null);
    expect(parseRoute('#/')).toBe(null);
    expect(parseRoute('#/standard')).toBe('standard');
    expect(parseRoute('#standard')).toBe('standard');
    expect(parseRoute('#/sandbox')).toBe('sandbox');
    expect(parseRoute('#sandbox')).toBe('sandbox');
    expect(parseRoute('#/multiplayer')).toBe('multiplayer');
    expect(parseRoute('#/unknown')).toBe(null);
  });

  it('router.navigate switches store mode and supports home return', () => {
    router.navigate('standard');
    expect(store.getState().currentMode).toBe('standard');

    router.navigate('sandbox');
    expect(store.getState().currentMode).toBe('sandbox');

    router.navigate(null);
    expect(store.getState().currentMode).toBe(null);
  });

  it('ROUTE_PATHS contains all core app routes', () => {
    expect(ROUTE_PATHS.HOME).toBe('#/');
    expect(ROUTE_PATHS.STANDARD).toBe('#/standard');
    expect(ROUTE_PATHS.SANDBOX).toBe('#/sandbox');
  });
});
