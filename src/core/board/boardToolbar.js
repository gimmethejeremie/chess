/**
 * Anti-Slop Board Control Bar Component
 * Reusable, reactive toolbar attached to chess boards across Home, Standard, Sandbox, and Multiplayer.
 * Provides instant 1-click controls:
 * - Flip Perspective (White <-> Black)
 * - Board Theme Swatches (Classic, Wood, Ocean, Tournament Slate)
 * - Coordinates Toggle
 * - Focus / Zen Mode Toggle
 * - Optional Board Reset
 * Zero emoji slop, pure SVG iconography and tactile micro-interactions.
 */

import { store } from '../store/index.js';
import { i18n } from '../i18n/index.js';
import { icons } from '../icons/index.js';

export class BoardToolbar {
  /**
   * @param {HTMLElement} container Parent DOM element
   * @param {Object} options
   * @param {import('./index.js').BoardRenderer} options.board BoardRenderer instance
   * @param {boolean} [options.showFlip=true]
   * @param {boolean} [options.showThemes=true]
   * @param {boolean} [options.showCoords=true]
   * @param {boolean} [options.showZen=true]
   * @param {boolean} [options.showReset=false]
   * @param {Function} [options.onFlip]
   * @param {Function} [options.onReset]
   * @param {Function} [options.onZenToggle]
   */
  constructor(container, options = {}) {
    if (!container) {
      throw new Error('[BoardToolbar] container is required');
    }

    this.container = container;
    this.board = options.board || null;
    this.showFlip = options.showFlip !== undefined ? options.showFlip : true;
    this.showThemes = options.showThemes !== undefined ? options.showThemes : true;
    this.showCoords = options.showCoords !== undefined ? options.showCoords : true;
    this.showReset = Boolean(options.showReset);
    this.showClearArrows = Boolean(options.showClearArrows);
    this.showEvalBar = Boolean(options.showEvalBar);
    this.showZen = options.showZen !== undefined ? options.showZen : true;

    this.onFlip = options.onFlip || null;
    this.onReset = options.onReset || null;
    this.onZenToggle = options.onZenToggle || null;
    this.onClearArrows = options.onClearArrows || null;
    this.onEvalToggle = options.onEvalToggle || null;

    this.isZen = false;
    this.isEvalVisible = options.isEvalVisible !== undefined ? options.isEvalVisible : true;
    this.storeUnsub = null;
    this.i18nUnsub = null;

    this.mount();
  }

  setZen(isZen) {
    this.isZen = Boolean(isZen);
    const zenBtn = this.container.querySelector('[data-action="zen"]');
    if (zenBtn) {
      zenBtn.classList.toggle('active', this.isZen);
      zenBtn.setAttribute('aria-pressed', String(this.isZen));
      const iconSpan = zenBtn.querySelector('.ctrl-icon');
      if (iconSpan) {
        iconSpan.innerHTML = this.isZen ? icons.focusExit : icons.focusZen;
      }
    }
  }

  setBoard(board) {
    this.board = board;
  }

  mount() {
    this.render();

    // Subscribe to store updates (so changes from Settings modal reflect here immediately)
    this.storeUnsub = store.subscribe(() => {
      this.updateState();
    });

    // Subscribe to language changes
    this.i18nUnsub = i18n.subscribe(() => {
      this.render();
    });
  }

  destroy() {
    if (this.storeUnsub) {
      this.storeUnsub();
      this.storeUnsub = null;
    }
    if (this.i18nUnsub) {
      this.i18nUnsub();
      this.i18nUnsub = null;
    }
    this.container.innerHTML = '';
  }

  render() {
    const state = store.getState();

    const themes = [
      { id: 'classic', label: i18n.t('themes.classic'), light: '#f0d9b5', dark: '#b58863' },
      { id: 'wood', label: i18n.t('themes.wood'), light: '#eedab6', dark: '#a26c48' },
      { id: 'slate', label: i18n.t('themes.slate'), light: '#eeeed2', dark: '#769656' },
      { id: 'ocean', label: i18n.t('themes.ocean'), light: '#dbe4eb', dark: '#507b9e' }
    ];

    this.container.innerHTML = `
      <div class="board-control-bar" role="toolbar" aria-label="${i18n.t('demo.boardTheme')}">
        <div class="board-control-group board-ctrl-actions">
          ${
            this.showFlip
              ? `
            <button
              type="button"
              class="board-ctrl-btn"
              data-action="flip"
              title="${i18n.t('standard.flip')}"
              aria-label="${i18n.t('standard.flip')}"
            >
              <span class="ctrl-icon">${icons.flip}</span>
            </button>
          `
              : ''
          }

          ${
            this.showCoords
              ? `
            <button
              type="button"
              class="board-ctrl-btn ${state.showCoordinates ? 'active' : ''}"
              data-action="coords"
              title="${i18n.t('settings.coordinates')}"
              aria-label="${i18n.t('settings.coordinates')}"
              aria-pressed="${state.showCoordinates}"
            >
              <span class="ctrl-icon">${icons.coords}</span>
            </button>
          `
              : ''
          }

          ${
            this.showReset
              ? `
            <button
              type="button"
              class="board-ctrl-btn"
              data-action="reset"
              title="${i18n.t('demo.reset')}"
              aria-label="${i18n.t('demo.reset')}"
            >
              <span class="ctrl-icon">${icons.reset}</span>
            </button>
          `
              : ''
          }

          ${
            this.showClearArrows
              ? `
            <button
              type="button"
              class="board-ctrl-btn"
              data-action="clear-arrows"
              title="${i18n.t('sandbox.clearAnnotations')}"
              aria-label="${i18n.t('sandbox.clearAnnotations')}"
            >
              <span class="ctrl-icon">${icons.clearTrash}</span>
            </button>
          `
              : ''
          }

          ${
            this.showEvalBar
              ? `
            <button
              type="button"
              class="board-ctrl-btn ${this.isEvalVisible ? 'active' : ''}"
              data-action="eval"
              title="${i18n.t('standard.toggleEval') || 'Thanh đánh giá thế trận'}"
              aria-label="${i18n.t('standard.toggleEval') || 'Thanh đánh giá thế trận'}"
              aria-pressed="${this.isEvalVisible}"
            >
              <span class="ctrl-icon">${icons.evalMeter}</span>
            </button>
          `
              : ''
          }

          ${
            this.showZen
              ? `
            <button
              type="button"
              class="board-ctrl-btn ${this.isZen ? 'active' : ''}"
              data-action="zen"
              title="${i18n.t('demo.focus') || 'Focus / Zen Mode'}"
              aria-label="${i18n.t('demo.focus') || 'Focus / Zen Mode'}"
              aria-pressed="${this.isZen}"
            >
              <span class="ctrl-icon">${this.isZen ? icons.focusExit : icons.focusZen}</span>
            </button>
          `
              : ''
          }
        </div>

        ${
          this.showThemes
            ? `
          <div class="board-theme-swatches" role="radiogroup" aria-label="${i18n.t('settings.boardTheme')}">
            ${themes
              .map(
                (t) => `
              <button
                type="button"
                class="board-swatch-btn ${state.boardTheme === t.id ? 'active' : ''}"
                data-theme-id="${t.id}"
                title="${t.label}"
                aria-label="${t.label}"
                role="radio"
                aria-checked="${state.boardTheme === t.id}"
              >
                <span class="swatch-split" style="background: linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%);"></span>
              </button>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }
      </div>
    `;

    this.attachEvents();
  }

  updateState() {
    const state = store.getState();

    // Update active swatch
    const swatches = this.container.querySelectorAll('[data-theme-id]');
    swatches.forEach((sw) => {
      const id = sw.getAttribute('data-theme-id');
      const isActive = id === state.boardTheme;
      sw.classList.toggle('active', isActive);
      sw.setAttribute('aria-checked', String(isActive));
    });

    // Update coordinates button
    const coordsBtn = this.container.querySelector('[data-action="coords"]');
    if (coordsBtn) {
      coordsBtn.classList.toggle('active', state.showCoordinates);
      coordsBtn.setAttribute('aria-pressed', String(state.showCoordinates));
    }

    // Sync board renderer if connected
    if (this.board) {
      this.board.setBoardTheme(state.boardTheme);
      this.board.setPieceSet(state.pieceSet);
      this.board.setShowCoordinates(state.showCoordinates);
    }
  }

  attachEvents() {
    // Flip
    const flipBtn = this.container.querySelector('[data-action="flip"]');
    if (flipBtn) {
      flipBtn.addEventListener('click', () => {
        if (this.onFlip) {
          this.onFlip();
        } else if (this.board) {
          this.board.flip();
        }
      });
    }

    // Coordinates toggle
    const coordsBtn = this.container.querySelector('[data-action="coords"]');
    if (coordsBtn) {
      coordsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const next = store.toggleCoordinates();
        if (this.board) {
          this.board.setShowCoordinates(next);
        }
        this.updateState();
      });
    }

    // Reset
    const resetBtn = this.container.querySelector('[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.onReset) {
          this.onReset();
        }
      });
    }

    // Clear arrows & marked annotations
    const clearArrowsBtn = this.container.querySelector('[data-action="clear-arrows"]');
    if (clearArrowsBtn) {
      clearArrowsBtn.addEventListener('click', () => {
        if (this.board) {
          this.board.clearArrows();
          this.board.clearMarkedSquares();
        }
        if (this.onClearArrows) {
          this.onClearArrows();
        }
      });
    }

    // Theme swatches
    const swatches = this.container.querySelectorAll('[data-theme-id]');
    swatches.forEach((btn) => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme-id');
        if (themeId) {
          store.setBoardTheme(themeId);
          if (this.board) {
            this.board.setBoardTheme(themeId);
          }
          this.updateState();
        }
      });
    });

    // Focus / Zen mode
    const zenBtn = this.container.querySelector('[data-action="zen"]');
    if (zenBtn) {
      zenBtn.addEventListener('click', () => {
        this.isZen = !this.isZen;
        zenBtn.classList.toggle('active', this.isZen);
        zenBtn.setAttribute('aria-pressed', String(this.isZen));
        const iconSpan = zenBtn.querySelector('.ctrl-icon');
        if (iconSpan) {
          iconSpan.innerHTML = this.isZen ? icons.focusExit : icons.focusZen;
        }

        const appLayout = document.querySelector('.standard-game-layout, .sandbox-layout');
        if (appLayout) {
          appLayout.classList.toggle('zen-mode-active', this.isZen);
        }

        if (this.onZenToggle) {
          this.onZenToggle(this.isZen);
        }
      });
    }

    // Evaluation Bar toggle
    const evalBtn = this.container.querySelector('[data-action="eval"]');
    if (evalBtn) {
      evalBtn.addEventListener('click', () => {
        this.isEvalVisible = !this.isEvalVisible;
        evalBtn.classList.toggle('active', this.isEvalVisible);
        evalBtn.setAttribute('aria-pressed', String(this.isEvalVisible));
        if (this.onEvalToggle) {
          this.onEvalToggle(this.isEvalVisible);
        }
      });
    }
  }
}
