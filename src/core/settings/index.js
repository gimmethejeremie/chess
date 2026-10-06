/**
 * Settings Modal Component
 * Comprehensive settings dialog for Theme, Piece Set, Board Theme, Sound, Language, and Coordinates.
 * All settings are reactive and persisted in localStorage.
 * Fully keyboard accessible (Escape key, ARIA roles, focus management).
 */

import { store } from '../store/index.js';
import { i18n } from '../i18n/index.js';
import { icons } from '../icons/index.js';
import './settings.css';

const BASE_URL = import.meta.env?.BASE_URL || '/';

let activeBackdrop = null;
let previousActiveElement = null;

/**
 * Open the Settings Modal Dialog
 */
export function openSettingsModal() {
  if (activeBackdrop) {
    closeSettingsModal();
  }

  previousActiveElement = document.activeElement;

  activeBackdrop = document.createElement('div');
  activeBackdrop.className = 'settings-modal-backdrop';
  activeBackdrop.id = 'settings-modal-backdrop';

  document.body.appendChild(activeBackdrop);
  renderModalContent();

  // Handle escape key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  activeBackdrop._handleKeyDown = handleKeyDown;

  // Close on backdrop click outside dialog
  activeBackdrop.addEventListener('click', (e) => {
    if (e.target === activeBackdrop) {
      closeSettingsModal();
    }
  });

  // Focus close button
  setTimeout(() => {
    document.getElementById('settings-close-x')?.focus();
  }, 50);
}

/**
 * Close the Settings Modal Dialog
 */
export function closeSettingsModal() {
  if (!activeBackdrop) return;

  if (activeBackdrop._handleKeyDown) {
    document.removeEventListener('keydown', activeBackdrop._handleKeyDown);
  }

  activeBackdrop.remove();
  activeBackdrop = null;

  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    previousActiveElement.focus();
    previousActiveElement = null;
  }
}

/**
 * Render or re-render modal content (e.g. on language change)
 */
function renderModalContent() {
  if (!activeBackdrop) return;

  const state = store.getState();
  const currentLocale = i18n.getLocale();

  activeBackdrop.innerHTML = `
    <div
      class="settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <!-- Header -->
      <div class="settings-header">
        <h3 class="settings-title" id="settings-dialog-title">
          <span class="settings-title-icon">${icons.settings}</span>
          <span>${i18n.t('settings.title')}</span>
        </h3>
        <button
          class="settings-close-btn"
          id="settings-close-x"
          aria-label="${i18n.t('settings.close')}"
          title="${i18n.t('settings.close')}"
        >
          ${icons.close}
        </button>
      </div>

      <!-- Body -->
      <div class="settings-body">
        <!-- 1. Language -->
        <section class="settings-section">
          <h4 class="settings-section-title">${i18n.t('settings.language')}</h4>
          <div class="settings-options-grid">
            <button
              class="settings-option-btn ${currentLocale === 'en' ? 'active' : ''}"
              data-set-locale="en"
              aria-pressed="${currentLocale === 'en'}"
            >
              <span class="settings-lang-badge">EN</span>
              <span>English</span>
            </button>
            <button
              class="settings-option-btn ${currentLocale === 'vi' ? 'active' : ''}"
              data-set-locale="vi"
              aria-pressed="${currentLocale === 'vi'}"
            >
              <span class="settings-lang-badge">VI</span>
              <span>Tiếng Việt</span>
            </button>
          </div>
        </section>

        <!-- 2. Theme (Light / Dark) -->
        <section class="settings-section">
          <h4 class="settings-section-title">${i18n.t('settings.theme')}</h4>
          <div class="settings-options-grid">
            <button
              class="settings-option-btn ${state.theme === 'light' ? 'active' : ''}"
              data-set-theme="light"
              aria-pressed="${state.theme === 'light'}"
            >
              <span class="settings-icon-wrap">${icons.sun}</span>
              <span>${i18n.t('settings.themeLight')}</span>
            </button>
            <button
              class="settings-option-btn ${state.theme === 'dark' ? 'active' : ''}"
              data-set-theme="dark"
              aria-pressed="${state.theme === 'dark'}"
            >
              <span class="settings-icon-wrap">${icons.moon}</span>
              <span>${i18n.t('settings.themeDark')}</span>
            </button>
          </div>
        </section>

        <!-- 3. Piece Set Style -->
        <section class="settings-section">
          <h4 class="settings-section-title">${i18n.t('settings.pieceSet')}</h4>
          <div class="settings-options-grid">
            <button
              class="settings-option-btn ${state.pieceSet === 'cburnett' ? 'active' : ''}"
              data-set-pieces="cburnett"
              aria-pressed="${state.pieceSet === 'cburnett'}"
            >
              <div class="settings-piece-preview">
                <img src="${BASE_URL}assets/pieces/cburnett/wN.svg" alt="White Knight" />
                <img src="${BASE_URL}assets/pieces/cburnett/bN.svg" alt="Black Knight" />
              </div>
              <span>cburnett</span>
            </button>
            <button
              class="settings-option-btn ${state.pieceSet === 'merida' ? 'active' : ''}"
              data-set-pieces="merida"
              aria-pressed="${state.pieceSet === 'merida'}"
            >
              <div class="settings-piece-preview">
                <img src="${BASE_URL}assets/pieces/merida/wN.svg" alt="White Knight" />
                <img src="${BASE_URL}assets/pieces/merida/bN.svg" alt="Black Knight" />
              </div>
              <span>merida</span>
            </button>
            <button
              class="settings-option-btn ${state.pieceSet === 'alpha' ? 'active' : ''}"
              data-set-pieces="alpha"
              aria-pressed="${state.pieceSet === 'alpha'}"
            >
              <div class="settings-piece-preview">
                <img src="${BASE_URL}assets/pieces/alpha/wN.svg" alt="White Knight" />
                <img src="${BASE_URL}assets/pieces/alpha/bN.svg" alt="Black Knight" />
              </div>
              <span>alpha</span>
            </button>
          </div>
        </section>

        <!-- 4. Board Palette Theme -->
        <section class="settings-section">
          <h4 class="settings-section-title">${i18n.t('settings.boardTheme')}</h4>
          <div class="settings-options-grid">
            <button
              class="settings-option-btn ${state.boardTheme === 'classic' ? 'active' : ''}"
              data-set-board="classic"
              aria-pressed="${state.boardTheme === 'classic'}"
            >
              <div class="settings-palette-swatch palette-classic">
                <span class="swatch-light"></span>
                <span class="swatch-dark"></span>
              </div>
              <span>${i18n.t('themes.classic')}</span>
            </button>
            <button
              class="settings-option-btn ${state.boardTheme === 'wood' ? 'active' : ''}"
              data-set-board="wood"
              aria-pressed="${state.boardTheme === 'wood'}"
            >
              <div class="settings-palette-swatch palette-wood">
                <span class="swatch-light"></span>
                <span class="swatch-dark"></span>
              </div>
              <span>${i18n.t('themes.wood')}</span>
            </button>
            <button
              class="settings-option-btn ${state.boardTheme === 'ocean' ? 'active' : ''}"
              data-set-board="ocean"
              aria-pressed="${state.boardTheme === 'ocean'}"
            >
              <div class="settings-palette-swatch palette-ocean">
                <span class="swatch-light"></span>
                <span class="swatch-dark"></span>
              </div>
              <span>${i18n.t('themes.ocean')}</span>
            </button>
            <button
              class="settings-option-btn ${state.boardTheme === 'slate' ? 'active' : ''}"
              data-set-board="slate"
              aria-pressed="${state.boardTheme === 'slate'}"
            >
              <div class="settings-palette-swatch palette-slate">
                <span class="swatch-light"></span>
                <span class="swatch-dark"></span>
              </div>
              <span>${i18n.t('themes.slate')}</span>
            </button>
          </div>
        </section>

        <!-- 5. Sound Effects -->
        <section class="settings-section">
          <h4 class="settings-section-title">${i18n.t('settings.sound')}</h4>
          <div class="settings-options-grid">
            <button
              class="settings-option-btn ${!state.soundMuted ? 'active' : ''}"
              data-set-sound="on"
              aria-pressed="${!state.soundMuted}"
            >
              <span class="settings-icon-wrap">${icons.volumeOn}</span>
              <span>${i18n.t('settings.soundOn')}</span>
            </button>
            <button
              class="settings-option-btn ${state.soundMuted ? 'active' : ''}"
              data-set-sound="off"
              aria-pressed="${state.soundMuted}"
            >
              <span class="settings-icon-wrap">${icons.volumeMute}</span>
              <span>${i18n.t('settings.soundOff')}</span>
            </button>
          </div>
        </section>

        <!-- 6. Board Coordinates Toggle -->
        <section class="settings-section">
          <div class="settings-toggle-row" id="row-toggle-coords">
            <div class="settings-toggle-label">
              <span class="settings-toggle-title">${i18n.t('settings.coordinates')}</span>
              <span class="settings-toggle-desc">${i18n.t('settings.showCoords')}</span>
            </div>
            <label class="settings-switch" aria-label="${i18n.t('settings.coordinates')}">
              <input type="checkbox" id="input-toggle-coords" ${state.showCoordinates ? 'checked' : ''} />
              <span class="settings-slider"></span>
            </label>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <div class="settings-footer">
        <button class="btn btn-primary" id="settings-btn-done">
          ${i18n.t('settings.close')}
        </button>
      </div>
    </div>
  `;

  attachModalEvents();
}

/**
 * Attach event listeners to modal elements
 */
function attachModalEvents() {
  document.getElementById('settings-close-x')?.addEventListener('click', closeSettingsModal);
  document.getElementById('settings-btn-done')?.addEventListener('click', closeSettingsModal);

  // Language buttons
  document.querySelectorAll('[data-set-locale]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loc = btn.getAttribute('data-set-locale');
      if (loc) {
        i18n.setLocale(loc);
        renderModalContent();
      }
    });
  });

  // Theme buttons
  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-set-theme');
      if (theme) {
        store.setTheme(theme);
        renderModalContent();
      }
    });
  });

  // Piece style buttons
  document.querySelectorAll('[data-set-pieces]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pieces = btn.getAttribute('data-set-pieces');
      if (pieces) {
        store.setPieceSet(pieces);
        renderModalContent();
      }
    });
  });

  // Board palette buttons
  document.querySelectorAll('[data-set-board]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const board = btn.getAttribute('data-set-board');
      if (board) {
        store.setBoardTheme(board);
        renderModalContent();
      }
    });
  });

  // Sound buttons
  document.querySelectorAll('[data-set-sound]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-set-sound');
      store.setSoundMuted(mode === 'off');
      renderModalContent();
    });
  });

  // Coordinates toggle (clean handler avoiding double-toggle)
  const coordsInput = document.getElementById('input-toggle-coords');
  const coordsRow = document.getElementById('row-toggle-coords');

  coordsInput?.addEventListener('change', () => {
    store.setCoordinates(coordsInput.checked);
    renderModalContent();
  });

  coordsRow?.addEventListener('click', (e) => {
    if (e.target.closest('.settings-switch')) return;
    if (coordsInput) {
      coordsInput.checked = !coordsInput.checked;
      store.setCoordinates(coordsInput.checked);
      renderModalContent();
    }
  });
}
