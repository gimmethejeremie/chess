/**
 * Chess Playground - Main Application Entrypoint
 * Manages mode routing, top app header, settings modal, and global reactive subscriptions.
 */
import { i18n } from './core/i18n/index.js';
import { store } from './core/store/index.js';
import { icons } from './core/icons/index.js';
import { openSettingsModal } from './core/settings/index.js';
import { router } from './core/router/index.js';
import { initStandardMode } from './modes/standard/index.js';
import { initSandboxMode } from './modes/sandbox/index.js';

// Initialize hash-based routing with browser history support
router.init();

const appRoot = document.getElementById('app');
let currentMountedMode = Symbol('unmounted');
let activeModeInstance = null;

/**
 * Render the entire UI or update in-place based on store and i18n changes
 */
function renderApp() {
  const state = store.getState();
  const currentLocale = i18n.getLocale();
  const currentTheme = state.theme;

  // Ensure DOM attribute data-theme always reflects current store theme
  store.applyTheme(currentTheme);

  const langLabel = currentLocale === 'en' ? 'Tiếng Việt' : 'English';
  const themeLabel = currentTheme === 'dark' ? i18n.t('app.themeLight') : i18n.t('app.themeDark');
  const soundTitle = state.soundMuted ? i18n.t('demo.muted') : i18n.t('demo.unmuted');

  const modeChanged = state.currentMode !== currentMountedMode;

  if (modeChanged) {
    // Mode changed or initial render -> render app shell
    appRoot.innerHTML = `
      <!-- Top Navigation Header -->
      <header class="app-header">
        <div class="brand-wrapper" id="brand-home" title="Chess Playground" tabindex="0" role="button" aria-label="Chess Playground Home">
          <span class="brand-icon">${icons.chessKnight}</span>
          <h1 class="brand-title">${i18n.t('app.title')}</h1>
        </div>
        <div class="header-controls">
          <button class="btn-icon" id="toggle-sound-header" aria-label="${soundTitle}" title="${soundTitle}">
            <span>${state.soundMuted ? icons.volumeMute : icons.volumeOn}</span>
          </button>
          <button class="btn-icon btn-lang" id="toggle-lang" aria-label="${langLabel}" title="${langLabel}">
            <span class="lang-code">${currentLocale.toUpperCase()}</span>
          </button>
          <button class="btn-icon" id="toggle-theme" aria-label="${themeLabel}" title="${themeLabel}">
            <span>${currentTheme === 'dark' ? icons.sun : icons.moon}</span>
          </button>
          <button class="btn-icon" id="btn-settings-header" aria-label="${i18n.t('settings.title')}" title="${i18n.t('settings.title')}">
            <span>${icons.settings}</span>
          </button>
        </div>
      </header>

      <!-- Main View Area -->
      <main class="main-content" id="main-content">
        ${state.currentMode ? renderActiveModeContainer() : renderHomeScreen()}
      </main>

      <!-- Footer -->
      <footer class="app-footer">
        <p><a href="https://github.com/gimmethejeremie/chess" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">GitHub</a></p>
      </footer>
    `;

    attachEventHandlers();

    if (!state.currentMode) {
      if (activeModeInstance) {
        activeModeInstance.destroy();
        activeModeInstance = null;
      }
    } else {
      if (activeModeInstance) {
        activeModeInstance.destroy();
        activeModeInstance = null;
      }
      const modeContainer = document.getElementById('active-mode-mount');
      if (modeContainer) {
        if (state.currentMode === 'standard') activeModeInstance = initStandardMode(modeContainer);
        if (state.currentMode === 'sandbox') activeModeInstance = initSandboxMode(modeContainer);

        const backBtn = document.getElementById('back-to-home');
        if (backBtn) {
          backBtn.addEventListener('click', () => router.navigate(null));
        }
      }
    }

    currentMountedMode = state.currentMode;
  } else {
    // Mode has not changed: update header and in-view labels in-place without destroying active game
    updateHeaderControls(soundTitle, langLabel, themeLabel);

    if (!state.currentMode) {
      updateHomeScreenText();
    }
  }
}

/**
 * Update header buttons in-place
 */
function updateHeaderControls(soundTitle, langLabel, themeLabel) {
  const brandTitle = document.querySelector('.brand-title');
  if (brandTitle) brandTitle.textContent = i18n.t('app.title');

  const state = store.getState();
  const currentLocale = i18n.getLocale();
  const currentTheme = state.theme;

  const soundBtn = document.getElementById('toggle-sound-header');
  if (soundBtn) {
    soundBtn.title = soundTitle;
    soundBtn.setAttribute('aria-label', soundTitle);
    soundBtn.innerHTML = `<span>${state.soundMuted ? icons.volumeMute : icons.volumeOn}</span>`;
  }

  const langBtn = document.getElementById('toggle-lang');
  if (langBtn) {
    langBtn.title = langLabel;
    langBtn.setAttribute('aria-label', langLabel);
    langBtn.innerHTML = `<span class="lang-code">${currentLocale.toUpperCase()}</span>`;
  }

  const themeBtn = document.getElementById('toggle-theme');
  if (themeBtn) {
    themeBtn.title = themeLabel;
    themeBtn.setAttribute('aria-label', themeLabel);
    themeBtn.innerHTML = `<span>${currentTheme === 'dark' ? icons.sun : icons.moon}</span>`;
  }

  const settingsBtn = document.getElementById('btn-settings-header');
  if (settingsBtn) {
    settingsBtn.title = i18n.t('settings.title');
    settingsBtn.setAttribute('aria-label', i18n.t('settings.title'));
    settingsBtn.innerHTML = `<span>${icons.settings}</span>`;
  }
}

/**
 * Update home screen text labels in-place on language change
 */
function updateHomeScreenText() {
  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle) heroTitle.textContent = i18n.t('app.heroHeadline');

  // Update mode cards
  const cardStandard = document.querySelector('[data-mode="standard"]');
  if (cardStandard) {
    const title = cardStandard.querySelector('.mode-card-title');
    const desc = cardStandard.querySelector('.mode-card-desc');
    const linkText = cardStandard.querySelector('.mode-action-link span');
    if (title) title.textContent = i18n.t('modes.standard.title');
    if (desc) desc.textContent = i18n.t('modes.standard.description');
    if (linkText) linkText.textContent = i18n.t('modes.standard.action');
  }

  const cardSandbox = document.querySelector('[data-mode="sandbox"]');
  if (cardSandbox) {
    const title = cardSandbox.querySelector('.mode-card-title');
    const desc = cardSandbox.querySelector('.mode-card-desc');
    const linkText = cardSandbox.querySelector('.mode-action-link span');
    if (title) title.textContent = i18n.t('modes.sandbox.title');
    if (desc) desc.textContent = i18n.t('modes.sandbox.description');
    if (linkText) linkText.textContent = i18n.t('modes.sandbox.action');
  }
}

/**
 * Render Home Screen with Hero and 2 Anti-Slop Crafted Mode Cards
 */
function renderHomeScreen() {
  return `
    <section class="hero-section">
      <h2 class="hero-title">${i18n.t('app.heroHeadline')}</h2>
    </section>

    <!-- 2 Primary Modes Navigation Grid (Crafted Anti-Slop Cards) -->
    <div class="modes-grid">
      <!-- Card 1: Standard -->
      <article
        class="mode-card"
        data-mode="standard"
        tabindex="0"
        role="button"
        aria-label="${i18n.t('modes.standard.title')}: ${i18n.t('modes.standard.description')}"
      >
        <div class="mode-card-top">
          <div class="mode-icon-box">${icons.modeStandard}</div>
          <span class="mode-card-arrow">${icons.arrowRight}</span>
        </div>
        <div class="mode-card-body">
          <h3 class="mode-card-title">${i18n.t('modes.standard.title')}</h3>
          <p class="mode-card-desc">${i18n.t('modes.standard.description')}</p>
        </div>
        <div class="mode-card-footer">
          <span class="mode-action-link">
            <span>${i18n.t('modes.standard.action')}</span>
            ${icons.arrowRight}
          </span>
        </div>
      </article>

      <!-- Card 2: Sandbox -->
      <article
        class="mode-card"
        data-mode="sandbox"
        tabindex="0"
        role="button"
        aria-label="${i18n.t('modes.sandbox.title')}: ${i18n.t('modes.sandbox.description')}"
      >
        <div class="mode-card-top">
          <div class="mode-icon-box">${icons.modeSandbox}</div>
          <span class="mode-card-arrow">${icons.arrowRight}</span>
        </div>
        <div class="mode-card-body">
          <h3 class="mode-card-title">${i18n.t('modes.sandbox.title')}</h3>
          <p class="mode-card-desc">${i18n.t('modes.sandbox.description')}</p>
        </div>
        <div class="mode-card-footer">
          <span class="mode-action-link">
            <span>${i18n.t('modes.sandbox.action')}</span>
            ${icons.arrowRight}
          </span>
        </div>
      </article>
    </div>
  `;
}

/**
 * Render container for active mode view
 */
function renderActiveModeContainer() {
  return `<div id="active-mode-mount"></div>`;
}

/**
 * Attach interaction events to App Shell
 */
function attachEventHandlers() {
  const brandHome = document.getElementById('brand-home');
  if (brandHome) {
    const goHome = () => router.navigate(null);
    brandHome.addEventListener('click', goHome);
    brandHome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goHome();
      }
    });
  }

  const langToggleBtn = document.getElementById('toggle-lang');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      i18n.toggleLocale();
    });
  }

  const themeToggleBtn = document.getElementById('toggle-theme');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      store.toggleTheme();
    });
  }

  const soundToggleHeaderBtn = document.getElementById('toggle-sound-header');
  if (soundToggleHeaderBtn) {
    soundToggleHeaderBtn.addEventListener('click', () => {
      store.toggleSound();
    });
  }

  const settingsBtn = document.getElementById('btn-settings-header');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openSettingsModal();
    });
  }

  const modeCards = document.querySelectorAll('.mode-card');
  modeCards.forEach((card) => {
    const activateMode = () => {
      const mode = card.getAttribute('data-mode');
      if (mode) {
        router.navigate(mode);
      }
    };

    card.addEventListener('click', activateMode);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateMode();
      }
    });
  });
}

// Subscribe to state updates
store.subscribe(() => renderApp());
i18n.subscribe(() => renderApp());

// Initial render
renderApp();
