import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChessClock, TIME_PRESETS } from '../src/core/clock/index.js';

describe('ChessClock Core Timing & Drift-Free Engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly handles Fischer increment on switchTurn', () => {
    // 60s initial, 2s Fischer increment
    const clock = new ChessClock({
      initialTimeMs: 60000,
      incrementMs: 2000,
      incrementType: 'fischer'
    });

    clock.start('w');
    // Simulate 3 seconds spent on the move
    vi.advanceTimersByTime(3000);

    // During the turn, 3 seconds elapsed: 60 - 3 = 57s
    expect(clock.getTime('w')).toBe(57000);

    // Switch turn -> applies 2s Fischer increment: 57 + 2 = 59s
    clock.switchTurn();
    expect(clock.whiteBaseMs).toBe(59000);
    expect(clock.activeColor).toBe('b');
  });

  it('correctly handles Simple Delay (no subtraction if move faster than delay)', () => {
    // 60s initial, 3s simple delay
    const clock = new ChessClock({
      initialTimeMs: 60000,
      incrementMs: 3000,
      incrementType: 'delay'
    });

    clock.start('w');

    // Case 1: Move takes 2s (within 3s delay) -> no time lost
    vi.advanceTimersByTime(2000);
    expect(clock.getTime('w')).toBe(60000);
    clock.switchTurn();
    expect(clock.whiteBaseMs).toBe(60000);

    // Switch back to White
    clock.switchTurn();

    // Case 2: Move takes 5s (2s past delay) -> only 2s lost
    vi.advanceTimersByTime(5000);
    expect(clock.getTime('w')).toBe(58000);
    clock.switchTurn();
    expect(clock.whiteBaseMs).toBe(58000);
  });

  it('correctly handles Bronstein Delay (refunds move duration up to delay)', () => {
    // 60s initial, 2s Bronstein delay
    const clock = new ChessClock({
      initialTimeMs: 60000,
      incrementMs: 2000,
      incrementType: 'bronstein'
    });

    clock.start('w');

    // Case 1: Move takes 1.5s
    // During turn: counts down to 58.5s
    vi.advanceTimersByTime(1500);
    expect(clock.getTime('w')).toBe(58500);

    // On switch: refunds 1.5s -> restores to 60s
    clock.switchTurn();
    expect(clock.whiteBaseMs).toBe(60000);

    // Switch back to White
    clock.switchTurn();

    // Case 2: Move takes 4s
    // During turn: counts down to 56s
    vi.advanceTimersByTime(4000);
    expect(clock.getTime('w')).toBe(56000);

    // On switch: refunds max 2s -> 56 + 2 = 58s
    clock.switchTurn();
    expect(clock.whiteBaseMs).toBe(58000);
  });

  it('triggers timeout when player time runs out', () => {
    // 5s sudden death
    const clock = new ChessClock({
      initialTimeMs: 5000,
      incrementMs: 0,
      incrementType: 'none'
    });

    let timeoutResult = null;
    clock.onTimeout((result) => {
      timeoutResult = result;
    });

    clock.start('w');
    expect(clock.isRunning).toBe(true);

    // Advance 5.5s
    vi.advanceTimersByTime(5500);
    expect(clock.getTime('w')).toBe(0);
    expect(clock.isRunning).toBe(false);
    expect(timeoutResult).toEqual({
      flaggedColor: 'w',
      winnerColor: 'b'
    });
  });

  it('formats time properly for minutes, seconds, and tenths', () => {
    expect(ChessClock.formatTime(125000)).toBe('2:05');
    expect(ChessClock.formatTime(60000)).toBe('1:00');
    expect(ChessClock.formatTime(45000)).toBe('0:45');
    expect(ChessClock.formatTime(9450)).toBe('9.4');
    expect(ChessClock.formatTime(800)).toBe('0.8');
    expect(ChessClock.formatTime(0)).toBe('0.0');
    expect(ChessClock.formatTime(-500)).toBe('0.0');
  });

  it('includes standard time presets', () => {
    expect(TIME_PRESETS.length).toBeGreaterThanOrEqual(10);
    const blitz5_0 = TIME_PRESETS.find((p) => p.id === '5+0');
    expect(blitz5_0).toBeDefined();
    expect(blitz5_0.initialMs).toBe(300000);

    const bullet2_1 = TIME_PRESETS.find((p) => p.id === '2+1');
    expect(bullet2_1).toBeDefined();
    expect(bullet2_1.incrementMs).toBe(1000);
  });
});
