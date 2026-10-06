/**
 * Chess Clock implementation supporting increments, delays, presets, and timeout detection.
 * Uses wall-clock timestamps (Date.now()) to completely eliminate drift from tab throttling
 * and background suspension.
 *
 * Increment Types:
 * - 'fischer': Added to clock upon completing each move.
 * - 'delay': Simple delay - clock does not run down for first D ms of each turn.
 * - 'bronstein': Clock runs down immediately, but elapsed time up to D ms is refunded on turn completion.
 * - 'none': Sudden death with no increment.
 */

export const TIME_PRESETS = [
  // Bullet
  { id: '1+0', name: '1+0 Bullet', category: 'bullet', initialMs: 60000, incrementMs: 0, type: 'fischer' },
  { id: '2+1', name: '2+1 Bullet', category: 'bullet', initialMs: 120000, incrementMs: 1000, type: 'fischer' },
  // Blitz
  { id: '3+0', name: '3+0 Blitz', category: 'blitz', initialMs: 180000, incrementMs: 0, type: 'fischer' },
  { id: '3+2', name: '3+2 Blitz', category: 'blitz', initialMs: 180000, incrementMs: 2000, type: 'fischer' },
  { id: '5+0', name: '5+0 Blitz', category: 'blitz', initialMs: 300000, incrementMs: 0, type: 'fischer' },
  { id: '5+3', name: '5+3 Blitz', category: 'blitz', initialMs: 300000, incrementMs: 3000, type: 'fischer' },
  // Rapid
  { id: '10+0', name: '10+0 Rapid', category: 'rapid', initialMs: 600000, incrementMs: 0, type: 'fischer' },
  { id: '10+5', name: '10+5 Rapid', category: 'rapid', initialMs: 600000, incrementMs: 5000, type: 'fischer' },
  { id: '15+10', name: '15+10 Rapid', category: 'rapid', initialMs: 900000, incrementMs: 10000, type: 'fischer' },
  // Classical
  { id: '30+0', name: '30+0 Classical', category: 'classical', initialMs: 1800000, incrementMs: 0, type: 'fischer' },
  { id: '30+20', name: '30+20 Classical', category: 'classical', initialMs: 1800000, incrementMs: 20000, type: 'fischer' },
  // Armageddon
  { id: 'armageddon', name: 'Armageddon (5m vs 4m)', category: 'armageddon', initialMs: 300000, blackInitialMs: 240000, incrementMs: 0, type: 'fischer' }
];

export class ChessClock {
  /**
   * @param {Object} [config]
   * @param {number} [config.initialTimeMs=300000] Initial time for white in ms (default 5m)
   * @param {number} [config.blackInitialTimeMs] Initial time for black in ms (defaults to initialTimeMs)
   * @param {number} [config.incrementMs=0] Increment or delay in ms
   * @param {'fischer'|'delay'|'bronstein'|'none'} [config.incrementType='fischer']
   */
  constructor({
    initialTimeMs = 300000,
    blackInitialTimeMs,
    incrementMs = 0,
    incrementType = 'fischer'
  } = {}) {
    this.initialTimeMs = initialTimeMs;
    this.blackInitialTimeMs = blackInitialTimeMs !== undefined ? blackInitialTimeMs : initialTimeMs;
    this.incrementMs = incrementMs;
    this.incrementType = incrementType;

    // Banked time for each color before active turn
    this.whiteBaseMs = this.initialTimeMs;
    this.blackBaseMs = this.blackInitialTimeMs;

    this.activeColor = null; // 'w' | 'b' | null
    this.turnStartTime = null; // timestamp ms
    this.isRunning = false;

    // Listeners
    this.tickListeners = new Set();
    this.timeoutListeners = new Set();
    this.hasFlagged = false;

    this.timerId = null;

    // Visibility change handler for tab wakeups
    this.boundOnVisibilityChange = this.handleVisibilityChange.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    }
  }

  get whiteTimeMs() {
    return this.getTime('w');
  }

  get blackTimeMs() {
    return this.getTime('b');
  }

  /**
   * Start clock for specified color
   * @param {'w'|'b'} [color='w']
   */
  start(color = 'w') {
    if (this.hasFlagged) return;

    this.activeColor = color;
    this.turnStartTime = Date.now();
    this.isRunning = true;
    this.startLoop();
    this.notifyTick();
  }

  /**
   * Pause the clock
   */
  pause() {
    if (!this.isRunning) return;

    this.settleActiveTurn();
    this.isRunning = false;
    this.stopLoop();
    this.notifyTick();
  }

  /**
   * Resume clock
   */
  resume() {
    if (this.isRunning || !this.activeColor || this.hasFlagged) return;

    this.turnStartTime = Date.now();
    this.isRunning = true;
    this.startLoop();
    this.notifyTick();
  }

  /**
   * Switch turns between White and Black, applying increments / delays
   */
  switchTurn() {
    if (this.hasFlagged) return;

    // If clock wasn't running, start it for the opposite player
    if (!this.isRunning || !this.activeColor) {
      this.start(this.activeColor === 'w' ? 'b' : 'w');
      return;
    }

    // Settle elapsed time and apply increment
    this.settleActiveTurn(true);

    // Switch active player
    this.activeColor = this.activeColor === 'w' ? 'b' : 'w';
    this.turnStartTime = Date.now();

    this.notifyTick();
  }

  /**
   * Settle current active turn duration and apply increment/delay to base bank
   * @param {boolean} [applyIncrement=false] True when turn completes normally (switchTurn)
   */
  settleActiveTurn(applyIncrement = false) {
    if (!this.activeColor || !this.turnStartTime) return;

    const now = Date.now();
    const elapsed = Math.max(0, now - this.turnStartTime);
    const isWhite = this.activeColor === 'w';
    let base = isWhite ? this.whiteBaseMs : this.blackBaseMs;

    switch (this.incrementType) {
      case 'delay':
        // Simple Delay: Clock only runs down after incrementMs
        if (elapsed > this.incrementMs) {
          base = Math.max(0, base - (elapsed - this.incrementMs));
        }
        break;

      case 'bronstein':
        // Bronstein: Clock runs down, but elapsed time up to incrementMs is refunded on move completion
        if (applyIncrement) {
          const refund = Math.min(elapsed, this.incrementMs);
          base = Math.max(0, base - elapsed) + refund;
        } else {
          base = Math.max(0, base - elapsed);
        }
        break;

      case 'fischer':
        // Fischer: Subtract elapsed and add full increment upon completion
        if (applyIncrement) {
          base = Math.max(0, base - elapsed) + this.incrementMs;
        } else {
          base = Math.max(0, base - elapsed);
        }
        break;

      case 'none':
      default:
        base = Math.max(0, base - elapsed);
        break;
    }

    if (isWhite) {
      this.whiteBaseMs = base;
    } else {
      this.blackBaseMs = base;
    }

    this.turnStartTime = now;
  }

  /**
   * Get current remaining time in ms for given color
   * @param {'w'|'b'} color
   * @returns {number}
   */
  getTime(color) {
    const isWhite = color === 'w';
    const base = isWhite ? this.whiteBaseMs : this.blackBaseMs;

    // If not currently running or not this player's turn, return stored bank
    if (!this.isRunning || this.activeColor !== color || !this.turnStartTime) {
      return Math.max(0, base);
    }

    const now = Date.now();
    const elapsed = Math.max(0, now - this.turnStartTime);
    let remaining = base;

    switch (this.incrementType) {
      case 'delay':
        if (elapsed > this.incrementMs) {
          remaining = base - (elapsed - this.incrementMs);
        }
        break;

      case 'bronstein':
      case 'fischer':
      case 'none':
      default:
        remaining = base - elapsed;
        break;
    }

    if (remaining <= 0 && !this.hasFlagged) {
      this.triggerTimeout(color);
      return 0;
    }

    return Math.max(0, remaining);
  }

  triggerTimeout(flaggedColor) {
    this.hasFlagged = true;
    this.isRunning = false;
    this.stopLoop();

    if (flaggedColor === 'w') {
      this.whiteBaseMs = 0;
    } else {
      this.blackBaseMs = 0;
    }

    for (const listener of this.timeoutListeners) {
      listener({
        flaggedColor,
        winnerColor: flaggedColor === 'w' ? 'b' : 'w'
      });
    }
  }

  /**
   * Reset clock to initial settings
   */
  reset() {
    this.stopLoop();
    this.whiteBaseMs = this.initialTimeMs;
    this.blackBaseMs = this.blackInitialTimeMs;
    this.activeColor = null;
    this.turnStartTime = null;
    this.isRunning = false;
    this.hasFlagged = false;
    this.notifyTick();
  }

  /**
   * Configure clock from a preset or custom object
   */
  configure({
    initialTimeMs,
    blackInitialTimeMs,
    incrementMs = 0,
    incrementType = 'fischer'
  }) {
    this.initialTimeMs = initialTimeMs;
    this.blackInitialTimeMs = blackInitialTimeMs !== undefined ? blackInitialTimeMs : initialTimeMs;
    this.incrementMs = incrementMs;
    this.incrementType = incrementType;
    this.reset();
  }

  /* ========================================================================
     Loop & Event Listeners
     ======================================================================== */

  startLoop() {
    if (this.timerId) return;

    this.timerId = setInterval(() => {
      if (this.isRunning && this.activeColor) {
        // Checking getTime will automatically trigger timeout if <= 0
        this.getTime(this.activeColor);
        this.notifyTick();
      }
    }, 50);
  }

  stopLoop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  handleVisibilityChange() {
    // When tab becomes visible again, trigger immediate check to sync elapsed time
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (this.isRunning && this.activeColor) {
        this.getTime(this.activeColor);
        this.notifyTick();
      }
    }
  }

  onTick(listener) {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onTimeout(listener) {
    this.timeoutListeners.add(listener);
    return () => this.timeoutListeners.delete(listener);
  }

  notifyTick() {
    const whiteMs = this.getTime('w');
    const blackMs = this.getTime('b');

    for (const listener of this.tickListeners) {
      listener({
        whiteMs,
        blackMs,
        activeColor: this.activeColor,
        isRunning: this.isRunning
      });
    }
  }

  destroy() {
    this.stopLoop();
    this.tickListeners.clear();
    this.timeoutListeners.clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);
    }
  }

  /**
   * Format milliseconds into human readable display string:
   * - >= 1 minute: "M:SS"
   * - < 1 minute and >= 10s: "0:SS"
   * - < 10 seconds: "S.T" (with tenths of a second)
   * @param {number} ms
   * @returns {string}
   */
  static formatTime(ms) {
    if (ms <= 0) return '0.0';

    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    // If under 10 seconds, show tenths of a second: e.g. "9.4", "0.8"
    if (totalSeconds < 10) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${Math.floor(totalSeconds)}.${tenths}`;
    }

    const secStr = seconds < 10 ? `0${seconds}` : `${seconds}`;
    return `${minutes}:${secStr}`;
  }
}
