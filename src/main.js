/**
 * Chess Playground - Main Application Entrypoint
 * Manages mode routing, top app header, settings modal, and global reactive subscriptions.
 */
import { Chess } from 'chess.js';
import { i18n } from './core/i18n/index.js';
import { store } from './core/store/index.js';
import { soundManager } from './core/sounds/index.js';
import { BoardRenderer } from './core/board/index.js';
import { BoardToolbar } from './core/board/boardToolbar.js';
import { icons } from './core/icons/index.js';
import { openSettingsModal } from './core/settings/index.js';
import { initStandardMode } from './modes/standard/index.js';
import { initSandboxMode } from './modes/sandbox/index.js';

// Apply initial saved/preferred theme to document element
store.applyTheme();

const appRoot = document.getElementById('app');
let demoChessInstance = null;
let demoBoardRenderer = null;
let demoBoardToolbar = null;
let currentMountedMode = Symbol('unmounted');
let activeModeInstance = null;

/**
 * Locate the king square for the given color in a chess.js instance
 */
function findKingSquare(chess, color) {
  const board = chess.board();
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'k' && piece.color === color) {
        return `${files[c]}${8 - r}`;
      }
    }
  }
  return null;
}

/**
 * Render the entire UI or update in-place based on store and i18n changes
 */
function renderApp() {
  const state = store.getState();
  const currentLocale = i18n.getLocale();
  const currentTheme = state.theme;

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
        <p>Chess Playground &bull; Personal &amp; Non-commercial &bull; Mobile-First &bull; <a href="https://github.com/gimmethejeremie/chess" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">GitHub</a></p>
      </footer>
    `;

    attachEventHandlers();

    if (!state.currentMode) {
      if (activeModeInstance) {
        activeModeInstance.destroy();
        activeModeInstance = null;
      }
      mountDemoBoard();
    } else {
      if (demoBoardRenderer) {
        demoBoardRenderer.destroy();
        demoBoardRenderer = null;
      }
      if (demoBoardToolbar) {
        demoBoardToolbar.destroy();
        demoBoardToolbar = null;
      }
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
          backBtn.addEventListener('click', () => store.setMode(null));
        }
      }
    }

    currentMountedMode = state.currentMode;
  } else {
    // Mode has not changed: update header and in-view labels in-place without destroying active game
    updateHeaderControls(soundTitle, soundIcon, langLabel, themeLabel, themeIcon);

    if (!state.currentMode) {
      updateHomeScreenText();
    }
  }
}

/**
 * Update header buttons in-place
 */
function updateHeaderControls(soundTitle, soundIcon, langLabel, themeLabel, themeIcon) {
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
  if (heroTitle) heroTitle.textContent = i18n.t('app.title');

  const heroSubtitle = document.querySelector('.hero-subtitle');
  if (heroSubtitle) heroSubtitle.textContent = i18n.t('app.subtitle');

  const demoTitle = document.querySelector('.demo-title');
  if (demoTitle) demoTitle.textContent = i18n.t('demo.title');

  const demoSubtitle = document.querySelector('.demo-subtitle');
  if (demoSubtitle) demoSubtitle.textContent = i18n.t('demo.subtitle');

  // Synchronize demo board with store in case settings or theme changed
  const state = store.getState();
  if (demoBoardRenderer) {
    demoBoardRenderer.setBoardTheme(state.boardTheme);
    demoBoardRenderer.setPieceSet(state.pieceSet);
    demoBoardRenderer.setShowCoordinates(state.showCoordinates);
  }
  if (demoBoardToolbar) {
    demoBoardToolbar.updateState();
  }

  // Update mode cards
  const cardStandard = document.querySelector('[data-mode="standard"]');
  if (cardStandard) {
    const badge = cardStandard.querySelector('.mode-badge');
    const title = cardStandard.querySelector('.mode-card-title');
    const desc = cardStandard.querySelector('.mode-card-desc');
    const btn = cardStandard.querySelector('[data-mode-btn="standard"]');
    if (badge) badge.textContent = i18n.t('modes.standard.badge');
    if (title) title.textContent = i18n.t('modes.standard.title');
    if (desc) desc.textContent = i18n.t('modes.standard.description');
    if (btn) btn.innerHTML = `<span>${i18n.t('modes.standard.action')}</span> ${icons.playArrow}`;
  }

  const cardSandbox = document.querySelector('[data-mode="sandbox"]');
  if (cardSandbox) {
    const badge = cardSandbox.querySelector('.mode-badge');
    const title = cardSandbox.querySelector('.mode-card-title');
    const desc = cardSandbox.querySelector('.mode-card-desc');
    const btn = cardSandbox.querySelector('[data-mode-btn="sandbox"]');
    if (badge) badge.textContent = i18n.t('modes.sandbox.badge');
    if (title) title.textContent = i18n.t('modes.sandbox.title');
    if (desc) desc.textContent = i18n.t('modes.sandbox.description');
    if (btn) btn.innerHTML = `<span>${i18n.t('modes.sandbox.action')}</span> ${icons.playArrow}`;
  }

  updateDemoStatus();
}

/**
 * Render Home Screen with Demo Board and 3 Mode Cards
 */
function renderHomeScreen() {
  const state = store.getState();

  return `
    <section class="hero-section">
      <h2 class="hero-title">${i18n.t('app.title')}</h2>
      <p class="hero-subtitle">${i18n.t('app.subtitle')}</p>
    </section>

    <!-- Interactive Demo Board Section -->
    <section class="demo-board-section">
      <div class="demo-header">
        <h3 class="demo-title">${i18n.t('demo.title')}</h3>
        <p class="demo-subtitle">${i18n.t('demo.subtitle')}</p>
      </div>

      <div class="demo-board-mount" id="demo-board-mount"></div>

      <div class="demo-status" id="demo-status">
        White to move
      </div>

      <!-- Board Toolbar Controls (Reusable Anti-Slop Component) -->
      <div class="demo-toolbar-container" id="demo-board-toolbar"></div>
    </section>

    <!-- 3 Modes Navigation Grid -->
    <div class="modes-grid">
      <!-- Card 1: Standard -->
      <article
        class="mode-card"
        data-mode="standard"
        tabindex="0"
        role="button"
        aria-label="${i18n.t('modes.standard.title')}: ${i18n.t('modes.standard.description')}"
      >
        <div class="mode-card-header">
          <div class="mode-icon-box">${icons.modeStandard}</div>
          <span class="mode-badge">${i18n.t('modes.standard.badge')}</span>
        </div>
        <div class="mode-card-body">
          <h3 class="mode-card-title">${i18n.t('modes.standard.title')}</h3>
          <p class="mode-card-desc">${i18n.t('modes.standard.description')}</p>
        </div>
        <div class="mode-card-footer">
          <button class="btn btn-primary" data-mode-btn="standard">
            <span>${i18n.t('modes.standard.action')}</span>
            ${icons.playArrow}
          </button>
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
        <div class="mode-card-header">
          <div class="mode-icon-box">${icons.modeSandbox}</div>
          <span class="mode-badge">${i18n.t('modes.sandbox.badge')}</span>
        </div>
        <div class="mode-card-body">
          <h3 class="mode-card-title">${i18n.t('modes.sandbox.title')}</h3>
          <p class="mode-card-desc">${i18n.t('modes.sandbox.description')}</p>
        </div>
        <div class="mode-card-footer">
          <button class="btn btn-primary" data-mode-btn="sandbox">
            <span>${i18n.t('modes.sandbox.action')}</span>
            ${icons.playArrow}
          </button>
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
 * Initialize and mount the demo board using BoardRenderer + chess.js
 */
function mountDemoBoard() {
  const mountEl = document.getElementById('demo-board-mount');
  if (!mountEl) return;

  const state = store.getState();
  if (!demoChessInstance) {
    demoChessInstance = new Chess();
  }

  if (demoBoardRenderer) {
    demoBoardRenderer.destroy();
    demoBoardRenderer = null;
  }
  if (demoBoardToolbar) {
    demoBoardToolbar.destroy();
    demoBoardToolbar = null;
  }

  demoBoardRenderer = new BoardRenderer(mountEl, {
    position: demoChessInstance.board(),
    orientation: 'white',
    pieceSet: state.pieceSet,
    boardTheme: state.boardTheme,
    showCoordinates: state.showCoordinates,
    interactive: true,

    onSquareClick: ({ square, piece }) => {
      handleSquareSelection(square, piece);
    },
    onDragStart: ({ square, piece }) => {
      handleSquareSelection(square, piece);
    },
    onDrop: ({ fromSquare, toSquare }) => {
      handleBoardMove(fromSquare, toSquare);
    }
  });

  const toolbarMount = document.getElementById('demo-board-toolbar');
  if (toolbarMount) {
    demoBoardToolbar = new BoardToolbar(toolbarMount, {
      board: demoBoardRenderer,
      showFlip: true,
      showThemes: true,
      showCoords: true,
      showReset: true,
      showZen: false,
      onReset: () => {
        demoChessInstance.reset();
        demoBoardRenderer.setPosition(demoChessInstance.board());
        demoBoardRenderer.clearHighlights();
        demoBoardRenderer.clearMarkedSquares();
        updateDemoStatus();
      }
    });
  }

  updateDemoStatus();
}

/**
 * Handle square click or drag start selection & legal move calculation
 */
function handleSquareSelection(square, piece) {
  if (!demoChessInstance || !demoBoardRenderer) return;

  const currentTurn = demoChessInstance.turn();
  const pieceColor = piece ? piece.charAt(0) : null;

  if (pieceColor === currentTurn) {
    const legalMoves = demoChessInstance.moves({ square, verbose: true }).map((m) => ({
      square: m.to,
      isCapture: Boolean(m.captured)
    }));

    const checkSquare = demoChessInstance.isCheck()
      ? findKingSquare(demoChessInstance, currentTurn)
      : null;

    demoBoardRenderer.setHighlights({
      selected: square,
      legalMoves,
      check: checkSquare
    });
  } else if (demoBoardRenderer.highlights.selected) {
    const fromSquare = demoBoardRenderer.highlights.selected;
    handleBoardMove(fromSquare, square);
  }
}

/**
 * Handle move execution on the demo board
 */
function handleBoardMove(fromSquare, toSquare) {
  if (!demoChessInstance || !demoBoardRenderer) return;

  try {
    const move = demoChessInstance.move({
      from: fromSquare,
      to: toSquare,
      promotion: 'q'
    });

    if (move) {
      if (demoChessInstance.isCheck()) {
        soundManager.play('check');
      } else if (move.captured) {
        soundManager.play('capture');
      } else if (move.flags.includes('k') || move.flags.includes('q')) {
        soundManager.play('castle');
      } else if (demoChessInstance.isGameOver()) {
        soundManager.play('game-end');
      } else {
        soundManager.play('move');
      }

      demoBoardRenderer.setPosition(demoChessInstance.board());

      const activeColor = demoChessInstance.turn();
      const checkSquare = demoChessInstance.isCheck()
        ? findKingSquare(demoChessInstance, activeColor)
        : null;

      demoBoardRenderer.setHighlights({
        selected: null,
        legalMoves: [],
        lastMove: { from: move.from, to: move.to },
        check: checkSquare
      });

      updateDemoStatus();
    } else {
      demoBoardRenderer.clearHighlights();
    }
  } catch (err) {
    demoBoardRenderer.clearHighlights();
  }
}

/**
 * Update the text banner displaying turn or check/gameover status
 */
function updateDemoStatus() {
  const statusEl = document.getElementById('demo-status');
  if (!statusEl || !demoChessInstance) return;

  const isCheck = demoChessInstance.isCheck();
  const turn = demoChessInstance.turn() === 'w' ? i18n.t('sandbox.white') : i18n.t('sandbox.black');

  statusEl.classList.remove('in-check');

  if (demoChessInstance.isCheckmate()) {
    statusEl.classList.add('in-check');
    statusEl.textContent = `${i18n.t('standard.checkmate')}!`;
  } else if (demoChessInstance.isDraw()) {
    statusEl.textContent = `${i18n.t('standard.draw')}!`;
  } else if (isCheck) {
    statusEl.classList.add('in-check');
    statusEl.textContent = `${i18n.t('standard.check')} ${turn} ${i18n.t('sandbox.sideToMove').toLowerCase()}`;
  } else {
    statusEl.textContent = demoChessInstance.turn() === 'w' ? i18n.t('standard.whiteTurn') : i18n.t('standard.blackTurn');
  }
}

/**
 * Attach interaction events to App Shell
 */
function attachEventHandlers() {
  const brandHome = document.getElementById('brand-home');
  if (brandHome) {
    const goHome = () => store.setMode(null);
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
        store.setMode(mode);
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
