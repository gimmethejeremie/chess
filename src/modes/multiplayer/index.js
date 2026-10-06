/**
 * Mode 3: Multiplayer (Local Hot-Seat + Online Realtime Database via Firebase)
 * Features:
 * - Local Hot-Seat: Dual chess clocks, Fischer/Delay/Bronstein/Sudden death, Pause, Resign, Draw, Rematch
 * - Online Firebase:
 *   - Room creation with 6-char code + shareable link (?room=CODE)
 *   - Anonymous Auth with session recovery on page refresh
 *   - 2-player match with White/Black/Random selection + 3rd+ person Spectator role
 *   - Drift-free local clock computation using Firebase .info/serverTimeOffset (no streaming ticks)
 *   - Atomic timeout claiming via runTransaction()
 *   - Realtime presence tracking (.info/connected + onDisconnect)
 *   - Resign, Draw offer/accept/decline, Rematch with swapped colors, PGN download
 */

import { Chess } from 'chess.js';
import { BoardRenderer } from '../../core/board/index.js';
import { BoardToolbar } from '../../core/board/boardToolbar.js';
import { icons } from '../../core/icons/index.js';
import { ChessClock, TIME_PRESETS } from '../../core/clock/index.js';
import { soundManager } from '../../core/sounds/index.js';
import { store } from '../../core/store/index.js';
import { i18n } from '../../core/i18n/index.js';
import { firebaseAdapter } from '../../net/firebase.js';
import './multiplayer.css';

const BASE_URL = import.meta.env?.BASE_URL || '/';

export class MultiplayerGame {
  /**
   * @param {HTMLElement} container Mount container
   */
  constructor(container) {
    this.container = container;
    this.chess = new Chess();
    this.board = null;
    this.boardToolbar = null;

    // Detect initial submode from URL (?room=) or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const initialRoomParam = urlParams.get('room');
    const savedRoomId = localStorage.getItem('chess_online_room_id');
    this.subMode = initialRoomParam || savedRoomId ? 'online' : 'hotseat';

    /* ========================================================================
       Hot-Seat State
       ======================================================================== */
    this.selectedPresetId = '5+0';
    const defaultPreset = TIME_PRESETS.find((p) => p.id === '5+0') || TIME_PRESETS[4];
    this.clock = new ChessClock({
      initialTimeMs: defaultPreset.initialMs,
      blackInitialTimeMs: defaultPreset.blackInitialMs,
      incrementMs: defaultPreset.incrementMs,
      incrementType: defaultPreset.type
    });
    this.isPaused = false;
    this.isGameOver = false;
    this.gameOverResult = '';
    this.gameOverReason = '';
    this.hasGameStarted = false;
    this.orientation = 'white';
    this.lowTimeWarned = { w: false, b: false };
    this.pendingPromotion = null;

    /* ========================================================================
       Online Firebase State
       ======================================================================== */
    this.onlineRoomId = null;
    this.onlineRole = null; // 'white' | 'black' | 'spectator'
    this.onlineRoomState = null;
    this.onlinePresence = {};
    this.onlineUnsubState = null;
    this.onlineUnsubPresence = null;
    this.onlineClockInterval = null;
    this.onlineHostColor = 'random'; // 'random' | 'white' | 'black'
    this.onlineSelectedPresetId = '5+0';
    this.onlineCustomTime = null;
    this.timeoutClaimed = false;
    this.onlineError = null;
    this.isConnecting = false;
    this.onlineLowTimeWarned = { w: false, b: false };
    this.lastProcessedMovesCount = 0;

    // Global store unsubscribe listener
    this.storeUnsub = null;
  }

  mount() {
    this.renderLayout();
    this.attachCommonEvents();

    if (this.subMode === 'hotseat') {
      this.initHotseat();
    } else {
      this.initOnline();
    }

    // Subscribe to global store updates
    this.storeUnsub = store.subscribe((state) => {
      if (this.board) {
        this.board.setPieceSet(state.pieceSet);
        this.board.setBoardTheme(state.boardTheme);
        this.board.setShowCoordinates(state.showCoordinates);
      }
      if (this.boardToolbar) {
        this.boardToolbar.updateState();
      }
    });

    // Subscribe to language changes
    this.i18nUnsub = i18n.subscribe(() => {
      this.updateI18n();
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
    if (this.clock) {
      this.clock.destroy();
    }
    this.stopOnlineClock();
    if (this.onlineUnsubState) {
      this.onlineUnsubState();
      this.onlineUnsubState = null;
    }
    if (this.onlineUnsubPresence) {
      this.onlineUnsubPresence();
      this.onlineUnsubPresence = null;
    }
    if (this.boardToolbar) {
      this.boardToolbar.destroy();
      this.boardToolbar = null;
    }
    if (this.board) {
      this.board.destroy();
      this.board = null;
    }
    this.container.innerHTML = '';
  }

  updateI18n() {
    const backBtn = document.getElementById('mp-back-home');
    if (backBtn) {
      backBtn.title = i18n.t('multiplayer.back');
      backBtn.innerHTML = `${icons.back}<span>${i18n.t('multiplayer.back')}</span>`;
    }
    const titleEl = document.querySelector('.multiplayer-title');
    if (titleEl) titleEl.textContent = i18n.t('multiplayer.title');

    const tabHotseat = document.getElementById('tab-hotseat');
    if (tabHotseat) tabHotseat.innerHTML = `${icons.modeMultiplayer}<span>${i18n.t('multiplayer.hotseatTab')}</span>`;

    const tabOnline = document.getElementById('tab-online');
    if (tabOnline) tabOnline.innerHTML = `${icons.globe}<span>${i18n.t('multiplayer.onlineTab')}</span>`;

    const flipBtn = document.getElementById('mp-btn-flip');
    if (flipBtn) {
      flipBtn.title = i18n.t('multiplayer.flip');
      flipBtn.innerHTML = `${icons.flip}<span>${i18n.t('multiplayer.flip')}</span>`;
    }

    if (this.subMode === 'hotseat') {
      const tcTitle = document.querySelector('.mp-card-title');
      if (tcTitle) tcTitle.innerHTML = `${icons.clock}<span>${i18n.t('multiplayer.timeControl')}</span>`;

      const pauseBtn = document.getElementById('mp-btn-pause');
      if (pauseBtn) {
        pauseBtn.innerHTML = this.isPaused
          ? `${icons.playArrow}<span>${i18n.t('multiplayer.resume')}</span>`
          : `${icons.pause}<span>${i18n.t('multiplayer.pause')}</span>`;
      }

      const newMatchBtn = document.getElementById('mp-btn-new-match');
      if (newMatchBtn) newMatchBtn.innerHTML = `${icons.reset}<span>${i18n.t('multiplayer.newGame')}</span>`;

      const drawBtn = document.getElementById('mp-btn-offer-draw');
      if (drawBtn) drawBtn.innerHTML = `${icons.handshake}<span>${i18n.t('multiplayer.offerDraw')}</span>`;

      const resignBtn = document.getElementById('mp-btn-resign');
      if (resignBtn) resignBtn.innerHTML = `${icons.flag}<span>${i18n.t('multiplayer.resign')}</span>`;

      const rematchBtn = document.getElementById('mp-btn-rematch');
      if (rematchBtn) rematchBtn.innerHTML = `${icons.reset}<span>${i18n.t('multiplayer.rematch')}</span>`;
    } else {
      if (this.onlineRoomId) {
        this.updateOnlineMatchUI();
      } else {
        this.renderOnlineLobby();
      }
    }
  }

  /* ========================================================================
     Sub-Mode Switching & Shared Header
     ======================================================================== */

  renderLayout() {
    this.container.innerHTML = `
      <div class="multiplayer-container">
        <!-- Header -->
        <header class="multiplayer-header">
          <div class="multiplayer-header-left">
            <button class="mode-back-btn" id="mp-back-home" title="${i18n.t('multiplayer.back')}">
              ${icons.back}
              <span>${i18n.t('multiplayer.back')}</span>
            </button>
            <h2 class="multiplayer-title">${i18n.t('multiplayer.title')}</h2>
            <span class="multiplayer-badge">${this.subMode === 'hotseat' ? 'Hot-Seat' : 'Online'}</span>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-secondary" id="mp-btn-flip" title="${i18n.t('multiplayer.flip')}">
              ${icons.flip}
              <span>${i18n.t('multiplayer.flip')}</span>
            </button>
          </div>
        </header>

        <!-- Sub-Mode Selection Tabs -->
        <div class="mp-mode-tabs" role="tablist">
          <button class="mp-mode-tab ${this.subMode === 'hotseat' ? 'active' : ''}" id="tab-hotseat" role="tab" aria-selected="${this.subMode === 'hotseat'}">
            ${icons.modeMultiplayer}
            <span>${i18n.t('multiplayer.hotseatTab')}</span>
          </button>
          <button class="mp-mode-tab ${this.subMode === 'online' ? 'active' : ''}" id="tab-online" role="tab" aria-selected="${this.subMode === 'online'}">
            ${icons.globe}
            <span>${i18n.t('multiplayer.onlineTab')}</span>
          </button>
        </div>

        <!-- Mode Content Mount -->
        <div id="mp-submode-content" style="width: 100%;"></div>
      </div>

      <!-- Modals mount target -->
      <div id="mp-modals-mount"></div>
    `;
  }

  attachCommonEvents() {
    // Back to home
    document.getElementById('mp-back-home')?.addEventListener('click', () => {
      this.clock?.pause();
      this.stopOnlineClock();
      store.setMode(null);
    });

    // Sub-mode tabs
    document.getElementById('tab-hotseat')?.addEventListener('click', () => {
      this.switchSubMode('hotseat');
    });
    document.getElementById('tab-online')?.addEventListener('click', () => {
      this.switchSubMode('online');
    });

    // Flip board
    document.getElementById('mp-btn-flip')?.addEventListener('click', () => {
      this.orientation = this.orientation === 'white' ? 'black' : 'white';
      this.board?.setOrientation(this.orientation);
      if (this.subMode === 'hotseat') {
        this.updateClockLabels();
        this.updateClockDisplay(this.clock.getTime('w'), this.clock.getTime('b'));
      }
    });
  }

  switchSubMode(newMode) {
    if (this.subMode === newMode) return;

    if (this.subMode === 'hotseat') {
      this.clock.pause();
    } else if (this.subMode === 'online' && this.onlineRoomId) {
      if (this.onlineRoomState?.status === 'playing') {
        if (!window.confirm(i18n.t('multiplayer.confirmLeave'))) return;
      }
      this.leaveOnlineRoom(false);
    }

    if (this.board) {
      this.board.destroy();
      this.board = null;
    }

    this.subMode = newMode;
    this.renderLayout();
    this.attachCommonEvents();

    if (newMode === 'hotseat') {
      this.initHotseat();
    } else {
      this.initOnline();
    }
  }

  /* ========================================================================
     Sub-Mode 1: Local Hot-Seat Multiplayer
     ======================================================================== */

  initHotseat() {
    const contentEl = document.getElementById('mp-submode-content');
    if (!contentEl) return;

    this.chess.reset();
    this.hasGameStarted = false;
    this.isPaused = false;
    this.isGameOver = false;
    this.orientation = 'white';

    contentEl.innerHTML = `
      <div class="multiplayer-layout">
        <!-- Left Column: Top Clock + Board + Bottom Clock -->
        <div class="multiplayer-board-column">
          <!-- Top Clock (Black by default) -->
          <div class="chess-clock-box top" id="clock-top">
            <div class="clock-player-info">
              <span class="clock-indicator black" id="indicator-top"></span>
              <span class="clock-player-label" id="label-top">Black</span>
            </div>
            <div class="clock-time-display" id="time-top">5:00</div>
          </div>

          <!-- Board Mount Area with optional Pause Overlay -->
          <div style="position: relative; width: 100%;">
            <div id="mp-board-mount" style="width: 100%;"></div>

            <!-- Pause Overlay -->
            <div class="board-pause-overlay" id="mp-pause-overlay" style="display: none;">
              <span class="pause-icon">${icons.pause}</span>
              <span class="pause-text">${i18n.t('multiplayer.gamePaused')}</span>
              <button class="btn btn-primary" id="mp-btn-resume-overlay" style="width: auto; padding: 0.5rem 1.25rem;">
                ${icons.playArrow}
                <span>${i18n.t('multiplayer.resumeBtn')}</span>
              </button>
            </div>
          </div>

          <!-- Live Board Toolbar Component Mount -->
          <div id="mp-hotseat-board-toolbar" class="mp-board-toolbar-wrap"></div>

          <!-- Bottom Clock (White by default) -->
          <div class="chess-clock-box bottom active" id="clock-bottom">
            <div class="clock-player-info">
              <span class="clock-indicator white" id="indicator-bottom"></span>
              <span class="clock-player-label" id="label-bottom">White</span>
            </div>
            <div class="clock-time-display" id="time-bottom">5:00</div>
          </div>
        </div>

        <!-- Right Column: Time Controls, Hot-seat Actions -->
        <aside class="multiplayer-side-panel">
          <!-- Time Control Selector Card -->
          <div class="mp-card">
            <h3 class="mp-card-title">${icons.clock} <span>${i18n.t('multiplayer.timeControl')}</span></h3>

            <div class="preset-pills-grid">
              ${TIME_PRESETS.slice(0, 9)
                .map(
                  (p) => `
                <button class="preset-pill ${p.id === this.selectedPresetId ? 'active' : ''}" data-preset-id="${p.id}">
                  ${p.id}
                </button>
              `
                )
                .join('')}
            </div>

            <details style="margin-top: 0.5rem; font-size: 0.85rem;">
              <summary style="cursor: pointer; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 0.35rem;">
                ${icons.settings}
                <span>${i18n.t('multiplayer.custom')} / Delay options</span>
              </summary>
              <div class="custom-time-form">
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 700;">${i18n.t('multiplayer.initialMinutes')}</label>
                  <input type="number" id="mp-custom-min" class="toolbar-select" value="5" min="1" max="180" style="width: 100%; box-sizing: border-box;" />
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; font-weight: 700;">${i18n.t('multiplayer.incrementSeconds')}</label>
                  <input type="number" id="mp-custom-inc" class="toolbar-select" value="3" min="0" max="60" style="width: 100%; box-sizing: border-box;" />
                </div>
                <div style="grid-column: span 2;">
                  <label style="display: block; font-size: 0.75rem; font-weight: 700;">${i18n.t('multiplayer.incrementType')}</label>
                  <select id="mp-custom-type" class="toolbar-select" style="width: 100%; box-sizing: border-box;">
                    <option value="fischer">Fischer Increment</option>
                    <option value="delay">Simple Delay (USCF)</option>
                    <option value="bronstein">Bronstein Delay</option>
                    <option value="none">Sudden Death (No Increment)</option>
                  </select>
                </div>
                <button class="btn btn-primary" id="mp-btn-apply-custom" style="grid-column: span 2; margin-top: 0.4rem;">
                  ${i18n.t('multiplayer.applyTime')}
                </button>
              </div>
            </details>
          </div>

          <!-- Hot-Seat Game Controls -->
          <div class="mp-card">
            <h3 class="mp-card-title">${icons.modeMultiplayer} <span>Match Controls</span></h3>
            <div class="hotseat-actions-grid">
              <button class="mp-action-btn" id="mp-btn-pause">
                ${icons.pause}
                <span>${i18n.t('multiplayer.pause')}</span>
              </button>
              <button class="mp-action-btn" id="mp-btn-new-match">
                ${icons.reset}
                <span>${i18n.t('multiplayer.newGame')}</span>
              </button>
              <button class="mp-action-btn" id="mp-btn-offer-draw">
                ${icons.handshake}
                <span>${i18n.t('multiplayer.offerDraw')}</span>
              </button>
              <button class="mp-action-btn danger" id="mp-btn-resign">
                ${icons.flag}
                <span>${i18n.t('multiplayer.resign')}</span>
              </button>
              <button class="mp-action-btn" id="mp-btn-rematch" style="grid-column: span 2;">
                ${icons.reset}
                <span>${i18n.t('multiplayer.rematch')}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    `;

    this.initBoardHotseat();
    this.attachHotseatEvents();
    this.setupClockListeners();
    this.updateClockDisplay(this.clock.getTime('w'), this.clock.getTime('b'));
  }

  initBoardHotseat() {
    const mountEl = document.getElementById('mp-board-mount');
    if (!mountEl) return;

    const state = store.getState();
    this.board = new BoardRenderer(mountEl, {
      position: this.chess.board(),
      orientation: this.orientation,
      pieceSet: state.pieceSet,
      boardTheme: state.boardTheme,
      showCoordinates: state.showCoordinates,
      interactive: true,

      onSquareClick: ({ square, piece }) => {
        this.handleSquareClickHotseat(square, piece);
      },
      onDragStart: ({ square, piece }) => {
        this.handleDragStartHotseat(square, piece);
      },
      onDrop: ({ fromSquare, toSquare }) => {
        this.handleDropHotseat(fromSquare, toSquare);
      }
    });

    const toolbarMount = document.getElementById('mp-hotseat-board-toolbar');
    if (toolbarMount) {
      if (this.boardToolbar) this.boardToolbar.destroy();
      this.boardToolbar = new BoardToolbar(toolbarMount, {
        board: this.board,
        showFlip: true,
        showThemes: true,
        showCoords: true,
        showZen: true,
        onFlip: () => {
          this.orientation = this.board.orientation;
          this.updateClockLabels();
          this.updateClockDisplay(this.clock.getTime('w'), this.clock.getTime('b'));
        }
      });
    }
  }

  setupClockListeners() {
    this.clock.onTick(({ whiteMs, blackMs, activeColor }) => {
      this.updateClockDisplay(whiteMs, blackMs, activeColor);
    });

    this.clock.onTimeout(({ flaggedColor }) => {
      this.handleTimeoutHotseat(flaggedColor);
    });
  }

  attachHotseatEvents() {
    // Preset pills click
    document.querySelectorAll('.preset-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetId = btn.getAttribute('data-preset-id');
        this.selectPreset(presetId);
      });
    });

    // Custom time form apply
    document.getElementById('mp-btn-apply-custom')?.addEventListener('click', () => {
      const min = parseInt(document.getElementById('mp-custom-min')?.value, 10) || 5;
      const inc = parseInt(document.getElementById('mp-custom-inc')?.value, 10) || 0;
      const type = document.getElementById('mp-custom-type')?.value || 'fischer';
      this.applyCustomTime(min, inc, type);
    });

    // Pause / Resume
    document.getElementById('mp-btn-pause')?.addEventListener('click', () => this.togglePause());
    document.getElementById('mp-btn-resume-overlay')?.addEventListener('click', () => this.togglePause());

    // Resign
    document.getElementById('mp-btn-resign')?.addEventListener('click', () => this.promptResignHotseat());

    // Offer Draw
    document.getElementById('mp-btn-offer-draw')?.addEventListener('click', () => this.promptDrawHotseat());

    // New Match
    document.getElementById('mp-btn-new-match')?.addEventListener('click', () => this.resetMatchHotseat());

    // Rematch with swapped colors
    document.getElementById('mp-btn-rematch')?.addEventListener('click', () => this.rematchSwapColorsHotseat());
  }

  handleSquareClickHotseat(square, piece) {
    if (this.isGameOver || this.isPaused) return;

    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;

    if (pieceColor === currentTurn) {
      this.selectSquareHotseat(square);
    } else if (this.board.highlights.selected) {
      const fromSquare = this.board.highlights.selected;
      this.attemptMoveHotseat(fromSquare, square);
    }
  }

  handleDragStartHotseat(square, piece) {
    if (this.isGameOver || this.isPaused) return;
    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;
    if (pieceColor === currentTurn) {
      this.selectSquareHotseat(square);
    }
  }

  handleDropHotseat(fromSquare, toSquare) {
    if (this.isGameOver || this.isPaused) return;
    this.attemptMoveHotseat(fromSquare, toSquare);
  }

  selectSquareHotseat(square) {
    const legalMoves = this.chess.moves({ square, verbose: true }).map((m) => ({
      square: m.to,
      isCapture: Boolean(m.captured)
    }));

    const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;

    this.board.setHighlights({
      selected: square,
      legalMoves,
      check: checkSquare
    });
  }

  attemptMoveHotseat(fromSquare, toSquare) {
    const moves = this.chess.moves({ square: fromSquare, verbose: true });
    const targetMoves = moves.filter((m) => m.to === toSquare);

    if (targetMoves.length === 0) {
      this.board.clearHighlights();
      return;
    }

    if (targetMoves.some((m) => m.promotion)) {
      this.openPromotionDialogHotseat(fromSquare, toSquare, this.chess.turn());
      return;
    }

    this.executeMoveHotseat({ from: fromSquare, to: toSquare });
  }

  executeMoveHotseat(moveObj) {
    try {
      const move = this.chess.move(moveObj);
      if (!move) return;

      if (!this.hasGameStarted) {
        this.hasGameStarted = true;
        this.clock.start('b');
      } else {
        this.clock.switchTurn();
      }

      // Audio feedback
      if (this.chess.isCheck()) {
        soundManager.play('check');
      } else if (move.captured) {
        soundManager.play('capture');
      } else if (move.flags.includes('k') || move.flags.includes('q')) {
        soundManager.play('castle');
      } else if (this.chess.isGameOver()) {
        soundManager.play('game-end');
      } else {
        soundManager.play('move');
      }

      this.board.setPosition(this.chess.board());
      const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;
      this.board.setHighlights({
        selected: null,
        legalMoves: [],
        lastMove: { from: move.from, to: move.to },
        check: checkSquare
      });

      this.checkStandardGameEndHotseat();
    } catch (err) {
      console.warn('[Multiplayer] Move error:', err);
      this.board.clearHighlights();
    }
  }

  openPromotionDialogHotseat(fromSquare, toSquare, color) {
    this.pendingPromotion = { from: fromSquare, to: toSquare };
    const mountEl = document.getElementById('mp-modals-mount');
    if (!mountEl) return;

    const pieceSet = store.getState().pieceSet;
    const pieces = [
      { type: 'q', label: i18n.t('standard.queen'), code: `${color}Q` },
      { type: 'r', label: i18n.t('standard.rook'), code: `${color}R` },
      { type: 'b', label: i18n.t('standard.bishop'), code: `${color}B` },
      { type: 'n', label: i18n.t('standard.knight'), code: `${color}N` }
    ];

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="mp-promotion-backdrop">
        <div class="chess-dialog-box" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <h3 class="dialog-title">👑 ${i18n.t('standard.promoteTitle')}</h3>
            <p class="dialog-subtitle">${i18n.t('standard.promoteDesc')}</p>
          </div>
          <div class="dialog-body">
            <div class="promotion-pieces-grid">
              ${pieces
                .map(
                  (p) => `
                <button class="promotion-piece-btn" data-promo="${p.type}">
                  <img src="${BASE_URL}assets/pieces/${pieceSet}/${p.code}.svg" alt="${p.label}" class="promotion-piece-img" />
                  <span class="promotion-piece-label">${p.label}</span>
                </button>
              `
                )
                .join('')}
            </div>
            <button class="btn btn-secondary" id="mp-cancel-promo" style="width: 100%;">
              ${i18n.t('standard.cancel')}
            </button>
          </div>
        </div>
      </div>
    `;

    mountEl.querySelectorAll('[data-promo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const promotion = btn.getAttribute('data-promo');
        mountEl.innerHTML = '';
        if (this.pendingPromotion) {
          const { from, to } = this.pendingPromotion;
          this.pendingPromotion = null;
          this.executeMoveHotseat({ from, to, promotion });
        }
      });
    });

    document.getElementById('mp-cancel-promo')?.addEventListener('click', () => {
      mountEl.innerHTML = '';
      this.pendingPromotion = null;
      this.board.clearHighlights();
    });
  }

  handleTimeoutHotseat(flaggedColor) {
    this.isGameOver = true;
    this.clock.pause();

    const isInsufficient = this.chess.isInsufficientMaterial();
    if (isInsufficient) {
      this.endGameHotseat({
        result: '½ - ½',
        title: i18n.t('multiplayer.draw'),
        reason: i18n.t('multiplayer.drawTimeoutInsufficient')
      });
    } else {
      const winner = flaggedColor === 'w' ? 'Black' : 'White';
      const winnerText = winner === 'White' ? i18n.t('multiplayer.whiteWon') : i18n.t('multiplayer.blackWon');
      const flaggedText = flaggedColor === 'w' ? i18n.t('multiplayer.whiteFlagged') : i18n.t('multiplayer.blackFlagged');

      this.endGameHotseat({
        result: winner === 'White' ? '1 - 0' : '0 - 1',
        title: winnerText,
        reason: flaggedText
      });
    }
  }

  checkStandardGameEndHotseat() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
      this.endGameHotseat({
        result: winner === 'White' ? '1 - 0' : '0 - 1',
        title: winner === 'White' ? i18n.t('multiplayer.whiteWon') : i18n.t('multiplayer.blackWon'),
        reason: i18n.t('standard.checkmate')
      });
    } else if (this.chess.isStalemate()) {
      this.endGameHotseat({
        result: '½ - ½',
        title: i18n.t('multiplayer.draw'),
        reason: i18n.t('standard.stalemate')
      });
    } else if (this.chess.isThreefoldRepetition()) {
      this.endGameHotseat({
        result: '½ - ½',
        title: i18n.t('multiplayer.draw'),
        reason: i18n.t('standard.threefold')
      });
    } else if (this.chess.isDrawByFiftyMoves()) {
      this.endGameHotseat({
        result: '½ - ½',
        title: i18n.t('multiplayer.draw'),
        reason: i18n.t('standard.fiftyMoves')
      });
    } else if (this.chess.isInsufficientMaterial()) {
      this.endGameHotseat({
        result: '½ - ½',
        title: i18n.t('multiplayer.draw'),
        reason: i18n.t('standard.insufficient')
      });
    }
  }

  endGameHotseat({ result, title, reason }) {
    this.isGameOver = true;
    this.gameOverResult = result;
    this.gameOverReason = `${title} (${reason})`;
    this.clock.pause();

    soundManager.play('game-end');
    this.openGameOverDialog({ result, title, reason, isOnline: false });
  }

  togglePause() {
    if (this.isGameOver || !this.hasGameStarted) return;
    this.isPaused = !this.isPaused;
    const overlay = document.getElementById('mp-pause-overlay');
    const pauseBtn = document.getElementById('mp-btn-pause');

    if (this.isPaused) {
      this.clock.pause();
      if (overlay) overlay.style.display = 'flex';
      if (pauseBtn) pauseBtn.innerHTML = `${icons.playArrow}<span>${i18n.t('multiplayer.resume')}</span>`;
      if (this.board) this.board.interactive = false;
    } else {
      this.clock.resume();
      if (overlay) overlay.style.display = 'none';
      if (pauseBtn) pauseBtn.innerHTML = `${icons.pause}<span>${i18n.t('multiplayer.pause')}</span>`;
      if (this.board) this.board.interactive = true;
    }
  }

  promptResignHotseat() {
    if (this.isGameOver) return;
    if (!window.confirm(i18n.t('standard.confirmResign'))) return;

    const resigning = this.chess.turn();
    const winner = resigning === 'w' ? 'Black' : 'White';
    const loserText = resigning === 'w' ? 'White' : 'Black';

    this.endGameHotseat({
      result: winner === 'White' ? '1 - 0' : '0 - 1',
      title: winner === 'White' ? i18n.t('multiplayer.whiteWon') : i18n.t('multiplayer.blackWon'),
      reason: `${loserText} ${i18n.t('standard.resigned')}`
    });
  }

  promptDrawHotseat() {
    if (this.isGameOver) return;
    if (!window.confirm(i18n.t('standard.confirmDraw'))) return;

    this.endGameHotseat({
      result: '½ - ½',
      title: i18n.t('multiplayer.draw'),
      reason: i18n.t('standard.drawAgreed')
    });
  }

  resetMatchHotseat() {
    this.chess.reset();
    this.clock.reset();
    this.hasGameStarted = false;
    this.isPaused = false;
    this.isGameOver = false;
    this.lowTimeWarned = { w: false, b: false };

    const overlay = document.getElementById('mp-pause-overlay');
    if (overlay) overlay.style.display = 'none';
    const pauseBtn = document.getElementById('mp-btn-pause');
    if (pauseBtn) pauseBtn.innerHTML = `⏸️ ${i18n.t('multiplayer.pause')}`;

    this.board?.setPosition(this.chess.board());
    this.board?.clearHighlights();
    if (this.board) this.board.interactive = true;

    this.updateClockLabels();
    this.updateClockDisplay(this.clock.getTime('w'), this.clock.getTime('b'));
  }

  rematchSwapColorsHotseat() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.board?.setOrientation(this.orientation);
    this.resetMatchHotseat();
  }

  selectPreset(presetId) {
    const preset = TIME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    this.selectedPresetId = presetId;
    document.querySelectorAll('.preset-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-preset-id') === presetId);
    });

    this.clock.configure({
      initialTimeMs: preset.initialMs,
      blackInitialTimeMs: preset.blackInitialMs,
      incrementMs: preset.incrementMs,
      incrementType: preset.type
    });

    this.resetMatchHotseat();
  }

  applyCustomTime(minutes, incSeconds, type) {
    const ms = minutes * 60000;
    const incMs = incSeconds * 1000;

    this.selectedPresetId = 'custom';
    document.querySelectorAll('.preset-pill').forEach((btn) => btn.classList.remove('active'));

    this.clock.configure({
      initialTimeMs: ms,
      incrementMs: incMs,
      incrementType: type
    });

    this.resetMatchHotseat();
  }

  updateClockLabels() {
    const isWhiteBottom = this.orientation === 'white';
    const labelTop = document.getElementById('label-top');
    const labelBottom = document.getElementById('label-bottom');
    const indTop = document.getElementById('indicator-top');
    const indBottom = document.getElementById('indicator-bottom');

    if (labelTop) labelTop.textContent = isWhiteBottom ? 'Black' : 'White';
    if (labelBottom) labelBottom.textContent = isWhiteBottom ? 'White' : 'Black';

    if (indTop) indTop.className = `clock-indicator ${isWhiteBottom ? 'black' : 'white'}`;
    if (indBottom) indBottom.className = `clock-indicator ${isWhiteBottom ? 'white' : 'black'}`;
  }

  updateClockDisplay(whiteMs, blackMs, activeColor = this.clock.activeColor) {
    const isWhiteBottom = this.orientation === 'white';
    const topMs = isWhiteBottom ? blackMs : whiteMs;
    const bottomMs = isWhiteBottom ? whiteMs : blackMs;
    const topColor = isWhiteBottom ? 'b' : 'w';
    const bottomColor = isWhiteBottom ? 'w' : 'b';

    const timeTopEl = document.getElementById('time-top');
    const timeBottomEl = document.getElementById('time-bottom');
    const clockTopBox = document.getElementById('clock-top');
    const clockBottomBox = document.getElementById('clock-bottom');

    if (timeTopEl) timeTopEl.textContent = ChessClock.formatTime(topMs);
    if (timeBottomEl) timeBottomEl.textContent = ChessClock.formatTime(bottomMs);

    if (clockTopBox) {
      clockTopBox.classList.toggle('active', activeColor === topColor && this.clock.isRunning);
      clockTopBox.classList.toggle('low-time', topMs < 15000 && this.clock.isRunning && activeColor === topColor);
    }
    if (clockBottomBox) {
      clockBottomBox.classList.toggle('active', activeColor === bottomColor && this.clock.isRunning);
      clockBottomBox.classList.toggle('low-time', bottomMs < 15000 && this.clock.isRunning && activeColor === bottomColor);
    }

    if (this.clock.isRunning && activeColor) {
      const activeMs = activeColor === 'w' ? whiteMs : blackMs;
      if (activeMs < 15000 && !this.lowTimeWarned[activeColor]) {
        this.lowTimeWarned[activeColor] = true;
        soundManager.play('low-time');
      }
    }
  }

  /* ========================================================================
     Sub-Mode 2: Online Multiplayer via Firebase
     ======================================================================== */

  initOnline() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const savedRoomId = localStorage.getItem('chess_online_room_id');
    const targetRoomId = roomParam || savedRoomId;

    if (targetRoomId) {
      this.joinOnlineRoom(targetRoomId);
    } else {
      this.renderOnlineLobby();
    }
  }

  renderOnlineLobby() {
    const contentEl = document.getElementById('mp-submode-content');
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="online-lobby-wrapper">
        ${
          this.onlineError
            ? `
          <div class="online-error-banner">
            <span>⚠️</span>
            <span>${this.onlineError}</span>
          </div>
        `
            : ''
        }

        <div class="online-lobby-grid">
          <!-- Card 1: Create Room -->
          <div class="mp-card">
            <h3 class="mp-card-title">➕ ${i18n.t('multiplayer.createRoom')}</h3>

            <div>
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">
                ${i18n.t('multiplayer.colorPreference')}
              </label>
              <div class="color-choice-group">
                <button class="color-choice-btn ${this.onlineHostColor === 'random' ? 'active' : ''}" data-host-color="random">
                  🎲 ${i18n.t('multiplayer.randomColor')}
                </button>
                <button class="color-choice-btn ${this.onlineHostColor === 'white' ? 'active' : ''}" data-host-color="white">
                  ⚪ ${i18n.t('multiplayer.whiteColor')}
                </button>
                <button class="color-choice-btn ${this.onlineHostColor === 'black' ? 'active' : ''}" data-host-color="black">
                  ⚫ ${i18n.t('multiplayer.blackColor')}
                </button>
              </div>
            </div>

            <div style="margin-top: 0.5rem;">
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.4rem;">
                ⏱️ ${i18n.t('multiplayer.timeControl')}
              </label>
              <div class="preset-pills-grid">
                ${TIME_PRESETS.slice(0, 9)
                  .map(
                    (p) => `
                  <button class="preset-pill online-preset ${p.id === this.onlineSelectedPresetId ? 'active' : ''}" data-online-preset="${p.id}">
                    ${p.id}
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>

            <button class="btn btn-primary" id="mp-btn-create-room" style="width: 100%; margin-top: 0.75rem;" ${this.isConnecting ? 'disabled' : ''}>
              ${this.isConnecting ? 'Connecting...' : `🚀 ${i18n.t('multiplayer.createRoom')}`}
            </button>
          </div>

          <!-- Card 2: Join Room -->
          <div class="mp-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <h3 class="mp-card-title">🔑 ${i18n.t('multiplayer.joinRoom')}</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                Enter a 6-character room code from your friend:
              </p>

              <div class="room-input-group">
                <input
                  type="text"
                  id="mp-join-code-input"
                  class="room-code-input"
                  placeholder="ABC123"
                  maxlength="6"
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>

            <button class="btn btn-primary" id="mp-btn-join-room" style="width: 100%; margin-top: 1rem;" ${this.isConnecting ? 'disabled' : ''}>
              ${this.isConnecting ? 'Connecting...' : `➡️ ${i18n.t('multiplayer.joinBtn')}`}
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachLobbyEvents();
  }

  attachLobbyEvents() {
    // Color choice selection
    document.querySelectorAll('[data-host-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.onlineHostColor = btn.getAttribute('data-host-color');
        document.querySelectorAll('[data-host-color]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Preset pills selection
    document.querySelectorAll('[data-online-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.onlineSelectedPresetId = btn.getAttribute('data-online-preset');
        document.querySelectorAll('[data-online-preset]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Create room button
    document.getElementById('mp-btn-create-room')?.addEventListener('click', () => {
      this.createOnlineRoom();
    });

    // Join room button & Enter key
    const joinInput = document.getElementById('mp-join-code-input');
    const joinBtn = document.getElementById('mp-btn-join-room');

    const handleJoin = () => {
      const code = joinInput?.value?.trim().toUpperCase();
      if (code) {
        this.joinOnlineRoom(code);
      }
    };

    joinBtn?.addEventListener('click', handleJoin);
    joinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoin();
    });
  }

  async createOnlineRoom() {
    this.onlineError = null;
    this.isConnecting = true;
    this.renderOnlineLobby();

    try {
      const customTime = this.onlineSelectedPresetId === 'custom' ? this.onlineCustomTime : null;
      const { roomId, role, roomState } = await firebaseAdapter.createRoom({
        hostColor: this.onlineHostColor,
        timeControl: this.onlineSelectedPresetId,
        customTime
      });

      this.onlineRoomId = roomId;
      this.onlineRole = role;
      this.onlineRoomState = roomState;
      this.timeoutClaimed = false;
      this.isConnecting = false;

      localStorage.setItem('chess_online_room_id', roomId);
      this.updateUrlRoomParam(roomId);

      this.enterOnlineRoom();
    } catch (err) {
      console.error('[Multiplayer] Create room failed:', err);
      this.onlineError = err.message || 'Failed to create room';
      this.isConnecting = false;
      this.renderOnlineLobby();
    }
  }

  async joinOnlineRoom(roomId) {
    if (!roomId) return;
    this.onlineError = null;
    this.isConnecting = true;
    this.renderOnlineLobby();

    try {
      const { role, roomState } = await firebaseAdapter.joinRoom(roomId);

      this.onlineRoomId = roomId.trim().toUpperCase();
      this.onlineRole = role;
      this.onlineRoomState = roomState;
      this.timeoutClaimed = false;
      this.isConnecting = false;

      localStorage.setItem('chess_online_room_id', this.onlineRoomId);
      this.updateUrlRoomParam(this.onlineRoomId);

      this.enterOnlineRoom();
    } catch (err) {
      console.error('[Multiplayer] Join room failed:', err);
      this.onlineError = err.message || i18n.t('multiplayer.roomNotFound');
      this.isConnecting = false;
      this.onlineRoomId = null;
      localStorage.removeItem('chess_online_room_id');
      this.clearUrlRoomParam();
      this.renderOnlineLobby();
    }
  }

  enterOnlineRoom() {
    const contentEl = document.getElementById('mp-submode-content');
    if (!contentEl) return;

    this.chess.load(this.onlineRoomState.fen);
    this.orientation = this.onlineRole === 'black' ? 'black' : 'white';
    this.lastProcessedMovesCount = this.onlineRoomState.moves?.length || 0;

    contentEl.innerHTML = `
      <!-- Online Status / Room Banner -->
      <div class="online-room-banner">
        <div class="room-code-tag">
          <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary);">${i18n.t('multiplayer.roomCode')}:</span>
          <span class="room-code-display">${this.onlineRoomId}</span>
          <button class="btn btn-secondary" id="mp-btn-copy-link" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
            📋 ${i18n.t('multiplayer.copyLink')}
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
          <span class="role-badge" id="online-role-badge">
            ${this.getRoleBadgeText()}
          </span>

          <span class="presence-badge" id="online-presence-badge">
            <span class="presence-dot offline" id="presence-dot"></span>
            <span id="presence-label">${i18n.t('multiplayer.waitingOpponent')}</span>
          </span>

          <button class="btn btn-secondary" id="mp-btn-leave-room" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; color: #ef4444; gap: 0.35rem;">
            ${icons.close}
            <span>${i18n.t('multiplayer.leaveRoom')}</span>
          </button>
        </div>
      </div>

      <!-- Match Layout -->
      <div class="multiplayer-layout" style="margin-top: 1rem;">
        <!-- Left Column: Clocks + Board -->
        <div class="multiplayer-board-column">
          <!-- Top Clock (Opponent or Black) -->
          <div class="chess-clock-box top" id="online-clock-top">
            <div class="clock-player-info">
              <span class="clock-indicator ${this.onlineRole === 'black' ? 'white' : 'black'}" id="online-indicator-top"></span>
              <span class="clock-player-label" id="online-label-top">
                ${this.onlineRole === 'black' ? 'White (Opponent)' : 'Black (Opponent)'}
              </span>
            </div>
            <div class="clock-time-display" id="online-time-top">5:00</div>
          </div>

          <!-- Board Mount -->
          <div id="mp-online-board-mount" style="width: 100%;"></div>

          <!-- Live Board Toolbar Component Mount -->
          <div id="mp-online-board-toolbar" class="mp-board-toolbar-wrap"></div>

          <!-- Bottom Clock (You or White) -->
          <div class="chess-clock-box bottom" id="online-clock-bottom">
            <div class="clock-player-info">
              <span class="clock-indicator ${this.onlineRole === 'black' ? 'black' : 'white'}" id="online-indicator-bottom"></span>
              <span class="clock-player-label" id="online-label-bottom">
                ${this.onlineRole === 'black' ? 'Black (You)' : 'White (You)'}
              </span>
            </div>
            <div class="clock-time-display" id="online-time-bottom">5:00</div>
          </div>
        </div>

        <!-- Right Column: Match Status & Actions -->
        <aside class="multiplayer-side-panel">
          <!-- Match Status Card -->
          <div class="mp-card">
            <h3 class="mp-card-title">${icons.modeStandard} <span>Match Status</span></h3>
            <div id="online-match-status-text" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem;">
              ${this.getOnlineStatusText()}
            </div>

            <!-- Draw offer prompt container -->
            <div id="online-draw-offer-mount"></div>

            <div class="hotseat-actions-grid" style="margin-top: 0.75rem;">
              <button class="mp-action-btn" id="mp-online-offer-draw" ${this.onlineRole === 'spectator' ? 'disabled' : ''}>
                ${icons.handshake}
                <span>${i18n.t('multiplayer.offerDraw')}</span>
              </button>
              <button class="mp-action-btn danger" id="mp-online-resign" ${this.onlineRole === 'spectator' ? 'disabled' : ''}>
                ${icons.flag}
                <span>${i18n.t('multiplayer.resign')}</span>
              </button>
              <button class="mp-action-btn" id="mp-online-rematch" style="grid-column: span 2;" disabled>
                ${icons.reset}
                <span>${i18n.t('multiplayer.rematch')}</span>
              </button>
              <button class="mp-action-btn" id="mp-online-download-pgn" style="grid-column: span 2;">
                ${icons.pgn}
                <span>${i18n.t('multiplayer.downloadPgn')}</span>
              </button>
            </div>
          </div>

          <!-- Move History Card -->
          <div class="mp-card">
            <h3 class="mp-card-title">${icons.pgn} <span>Move History</span></h3>
            <div class="online-moves-list" id="online-moves-list">
              <span style="color: var(--text-secondary); font-size: 0.8rem;">No moves yet</span>
            </div>
          </div>
        </aside>
      </div>
    `;

    this.initBoardOnline();
    this.attachOnlineRoomEvents();
    this.subscribeOnlineEvents();
    this.startOnlineClock();
    this.updateOnlineMatchUI();
  }

  initBoardOnline() {
    const mountEl = document.getElementById('mp-online-board-mount');
    if (!mountEl) return;

    const state = store.getState();
    const isPlaying = this.onlineRoomState?.status === 'playing';
    const isMyTurn = this.isMyOnlineTurn();

    this.board = new BoardRenderer(mountEl, {
      position: this.chess.board(),
      orientation: this.orientation,
      pieceSet: state.pieceSet,
      boardTheme: state.boardTheme,
      showCoordinates: state.showCoordinates,
      interactive: isPlaying && isMyTurn,

      onSquareClick: ({ square, piece }) => {
        this.handleSquareClickOnline(square, piece);
      },
      onDragStart: ({ square, piece }) => {
        this.handleDragStartOnline(square, piece);
      },
      onDrop: ({ fromSquare, toSquare }) => {
        this.handleDropOnline(fromSquare, toSquare);
      }
    });

    const toolbarMount = document.getElementById('mp-online-board-toolbar');
    if (toolbarMount) {
      if (this.boardToolbar) this.boardToolbar.destroy();
      this.boardToolbar = new BoardToolbar(toolbarMount, {
        board: this.board,
        showFlip: true,
        showThemes: true,
        showCoords: true,
        showZen: true
      });
    }
  }

  attachOnlineRoomEvents() {
    // Copy link
    document.getElementById('mp-btn-copy-link')?.addEventListener('click', (e) => {
      const url = `${window.location.origin}${window.location.pathname}?room=${this.onlineRoomId}`;
      navigator.clipboard.writeText(url).then(() => {
        const btn = e.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = `✓ ${i18n.t('multiplayer.linkCopied')}`;
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      });
    });

    // Leave room
    document.getElementById('mp-btn-leave-room')?.addEventListener('click', () => {
      if (this.onlineRoomState?.status === 'playing') {
        if (!window.confirm(i18n.t('multiplayer.confirmLeave'))) return;
      }
      this.leaveOnlineRoom(true);
    });

    // Offer draw
    document.getElementById('mp-online-offer-draw')?.addEventListener('click', () => {
      if (this.onlineRole === 'spectator' || this.onlineRoomState?.status !== 'playing') return;
      firebaseAdapter.offerDraw(this.onlineRoomId, this.onlineRole);
    });

    // Resign
    document.getElementById('mp-online-resign')?.addEventListener('click', () => {
      if (this.onlineRole === 'spectator' || this.onlineRoomState?.status !== 'playing') return;
      if (!window.confirm(i18n.t('standard.confirmResign'))) return;
      firebaseAdapter.resign(this.onlineRoomId, this.onlineRole);
    });

    // Rematch
    document.getElementById('mp-online-rematch')?.addEventListener('click', () => {
      if (this.onlineRole === 'spectator') return;
      firebaseAdapter.rematch(this.onlineRoomId);
    });

    // Download PGN
    document.getElementById('mp-online-download-pgn')?.addEventListener('click', () => {
      this.downloadPgn();
    });
  }

  subscribeOnlineEvents() {
    // Subscribe to room state updates
    this.onlineUnsubState = firebaseAdapter.onState(this.onlineRoomId, (newState) => {
      this.handleOnlineStateUpdate(newState);
    });

    // Subscribe to presence updates
    this.onlineUnsubPresence = firebaseAdapter.onPresence(this.onlineRoomId, (presence) => {
      this.onlinePresence = presence;
      this.updateOnlinePresenceBadge();
    });
  }

  handleOnlineStateUpdate(newState) {
    if (!newState) return;
    this.onlineRoomState = newState;

    const myUid = firebaseAdapter.getUserId();
    if (newState.players?.white === myUid) {
      this.onlineRole = 'white';
    } else if (newState.players?.black === myUid) {
      this.onlineRole = 'black';
    } else {
      this.onlineRole = 'spectator';
    }

    this.orientation = this.onlineRole === 'black' ? 'black' : 'white';
    this.chess.load(newState.fen);

    // Audio on new move
    const newMovesCount = newState.moves?.length || 0;
    if (newMovesCount > this.lastProcessedMovesCount) {
      const lastMove = newState.moves[newMovesCount - 1];
      if (this.chess.isCheck()) {
        soundManager.play('check');
      } else if (lastMove?.san?.includes('x')) {
        soundManager.play('capture');
      } else if (lastMove?.san?.includes('O-O')) {
        soundManager.play('castle');
      } else if (newState.status === 'ended') {
        soundManager.play('game-end');
      } else {
        soundManager.play('move');
      }
      this.lastProcessedMovesCount = newMovesCount;
    }

    // Update board position, orientation and interactivity
    if (this.board) {
      this.board.setPosition(this.chess.board());
      this.board.setOrientation(this.orientation);
      this.board.interactive = newState.status === 'playing' && this.isMyOnlineTurn();

      const lastMoveObj =
        newState.moves && newState.moves.length > 0 ? newState.moves[newState.moves.length - 1] : null;
      const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;

      this.board.setHighlights({
        selected: null,
        legalMoves: [],
        lastMove: lastMoveObj ? { from: lastMoveObj.from, to: lastMoveObj.to } : null,
        check: checkSquare
      });
    }

    this.updateOnlineMatchUI();

    // Game over dialog
    if (newState.status === 'ended' && !this.isGameOver) {
      this.isGameOver = true;
      this.openGameOverDialog({
        result: newState.result || '*',
        title: i18n.t('standard.gameOver'),
        reason: newState.reason || 'Match Concluded',
        isOnline: true
      });
    } else if (newState.status === 'playing') {
      this.isGameOver = false;
    }
  }

  isMyOnlineTurn() {
    if (!this.onlineRoomState || this.onlineRoomState.status !== 'playing') return false;
    if (this.onlineRole === 'spectator') return false;
    const currentTurn = this.chess.turn();
    const myTurnColor = this.onlineRole === 'white' ? 'w' : 'b';
    return currentTurn === myTurnColor;
  }

  handleSquareClickOnline(square, piece) {
    if (!this.isMyOnlineTurn()) return;

    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;

    if (pieceColor === currentTurn) {
      this.selectSquareOnline(square);
    } else if (this.board.highlights.selected) {
      const fromSquare = this.board.highlights.selected;
      this.attemptMoveOnline(fromSquare, square);
    }
  }

  handleDragStartOnline(square, piece) {
    if (!this.isMyOnlineTurn()) return;
    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;
    if (pieceColor === currentTurn) {
      this.selectSquareOnline(square);
    }
  }

  handleDropOnline(fromSquare, toSquare) {
    if (!this.isMyOnlineTurn()) return;
    this.attemptMoveOnline(fromSquare, toSquare);
  }

  selectSquareOnline(square) {
    const legalMoves = this.chess.moves({ square, verbose: true }).map((m) => ({
      square: m.to,
      isCapture: Boolean(m.captured)
    }));

    const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;

    this.board.setHighlights({
      selected: square,
      legalMoves,
      check: checkSquare
    });
  }

  attemptMoveOnline(fromSquare, toSquare) {
    const moves = this.chess.moves({ square: fromSquare, verbose: true });
    const targetMoves = moves.filter((m) => m.to === toSquare);

    if (targetMoves.length === 0) {
      this.board.clearHighlights();
      return;
    }

    if (targetMoves.some((m) => m.promotion)) {
      this.openPromotionDialogOnline(fromSquare, toSquare, this.chess.turn());
      return;
    }

    this.executeMoveOnline({ from: fromSquare, to: toSquare });
  }

  async executeMoveOnline(moveObj) {
    try {
      const move = this.chess.move(moveObj);
      if (!move) return;

      const currentTimes = this.calculateOnlineClocks();
      const incMs = this.onlineRoomState.timeControl?.incrementMs || 0;

      let whiteRemainingMs = currentTimes.whiteMs;
      let blackRemainingMs = currentTimes.blackMs;

      if (this.onlineRole === 'white') {
        whiteRemainingMs += incMs;
      } else if (this.onlineRole === 'black') {
        blackRemainingMs += incMs;
      }

      let status = 'playing';
      let result = null;
      let reason = null;

      if (this.chess.isCheckmate()) {
        status = 'ended';
        result = this.onlineRole === 'white' ? '1-0' : '0-1';
        reason = i18n.t('standard.checkmate');
      } else if (this.chess.isStalemate()) {
        status = 'ended';
        result = '1/2-1/2';
        reason = i18n.t('standard.stalemate');
      } else if (this.chess.isThreefoldRepetition()) {
        status = 'ended';
        result = '1/2-1/2';
        reason = i18n.t('standard.threefold');
      } else if (this.chess.isDrawByFiftyMoves()) {
        status = 'ended';
        result = '1/2-1/2';
        reason = i18n.t('standard.fiftyMoves');
      } else if (this.chess.isInsufficientMaterial()) {
        status = 'ended';
        result = '1/2-1/2';
        reason = i18n.t('standard.insufficient');
      }

      await firebaseAdapter.sendMove(this.onlineRoomId, {
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        fen: this.chess.fen(),
        whiteRemainingMs,
        blackRemainingMs,
        status,
        result,
        reason
      });
    } catch (err) {
      console.error('[Multiplayer] Execute online move error:', err);
      this.board?.clearHighlights();
    }
  }

  openPromotionDialogOnline(fromSquare, toSquare, color) {
    this.pendingPromotion = { from: fromSquare, to: toSquare };
    const mountEl = document.getElementById('mp-modals-mount');
    if (!mountEl) return;

    const pieceSet = store.getState().pieceSet;
    const pieces = [
      { type: 'q', label: i18n.t('standard.queen'), code: `${color}Q` },
      { type: 'r', label: i18n.t('standard.rook'), code: `${color}R` },
      { type: 'b', label: i18n.t('standard.bishop'), code: `${color}B` },
      { type: 'n', label: i18n.t('standard.knight'), code: `${color}N` }
    ];

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="mp-promotion-backdrop">
        <div class="chess-dialog-box" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <h3 class="dialog-title">👑 ${i18n.t('standard.promoteTitle')}</h3>
            <p class="dialog-subtitle">${i18n.t('standard.promoteDesc')}</p>
          </div>
          <div class="dialog-body">
            <div class="promotion-pieces-grid">
              ${pieces
                .map(
                  (p) => `
                <button class="promotion-piece-btn" data-promo="${p.type}">
                  <img src="${BASE_URL}assets/pieces/${pieceSet}/${p.code}.svg" alt="${p.label}" class="promotion-piece-img" />
                  <span class="promotion-piece-label">${p.label}</span>
                </button>
              `
                )
                .join('')}
            </div>
            <button class="btn btn-secondary" id="mp-cancel-promo" style="width: 100%;">
              ${i18n.t('standard.cancel')}
            </button>
          </div>
        </div>
      </div>
    `;

    mountEl.querySelectorAll('[data-promo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const promotion = btn.getAttribute('data-promo');
        mountEl.innerHTML = '';
        if (this.pendingPromotion) {
          const { from, to } = this.pendingPromotion;
          this.pendingPromotion = null;
          this.executeMoveOnline({ from, to, promotion });
        }
      });
    });

    document.getElementById('mp-cancel-promo')?.addEventListener('click', () => {
      mountEl.innerHTML = '';
      this.pendingPromotion = null;
      this.board?.clearHighlights();
    });
  }

  /* ========================================================================
     Online Clocks: Drift-Free Local Computation via serverTimeOffset
     ======================================================================== */

  startOnlineClock() {
    this.stopOnlineClock();
    this.onlineClockInterval = setInterval(() => {
      this.tickOnlineClock();
    }, 100);
  }

  stopOnlineClock() {
    if (this.onlineClockInterval) {
      clearInterval(this.onlineClockInterval);
      this.onlineClockInterval = null;
    }
  }

  calculateOnlineClocks() {
    if (!this.onlineRoomState?.clocks) {
      return { whiteMs: 300000, blackMs: 300000 };
    }

    const { status, turn, clocks } = this.onlineRoomState;
    let whiteMs = clocks.whiteRemainingMs ?? 300000;
    let blackMs = clocks.blackRemainingMs ?? 300000;

    if (status === 'playing' && clocks.lastMoveServerTime) {
      const serverTimeEst = firebaseAdapter.getServerTime();
      const elapsed = Math.max(0, serverTimeEst - clocks.lastMoveServerTime);

      if (turn === 'w') {
        whiteMs = Math.max(0, whiteMs - elapsed);
      } else if (turn === 'b') {
        blackMs = Math.max(0, blackMs - elapsed);
      }
    }

    return { whiteMs, blackMs };
  }

  tickOnlineClock() {
    if (!this.onlineRoomState) return;

    const { status, turn } = this.onlineRoomState;
    const { whiteMs, blackMs } = this.calculateOnlineClocks();

    this.updateOnlineClockDisplay(whiteMs, blackMs, status === 'playing' ? turn : null);

    // Timeout detection and atomic claim
    if (status === 'playing' && (whiteMs <= 0 || blackMs <= 0) && !this.timeoutClaimed) {
      this.timeoutClaimed = true;
      const flaggedColor = whiteMs <= 0 ? 'w' : 'b';
      const isInsufficient = this.chess.isInsufficientMaterial();
      const result = isInsufficient ? '1/2-1/2' : flaggedColor === 'w' ? '0-1' : '1-0';
      const reason = isInsufficient
        ? i18n.t('multiplayer.drawTimeoutInsufficient')
        : flaggedColor === 'w'
          ? i18n.t('multiplayer.whiteFlagged')
          : i18n.t('multiplayer.blackFlagged');

      firebaseAdapter
        .claimTimeout(this.onlineRoomId, {
          flaggedColor,
          reason,
          result
        })
        .catch((err) => console.error('[Multiplayer] Timeout claim error:', err));
    }
  }

  updateOnlineClockDisplay(whiteMs, blackMs, activeTurn) {
    const isBlackBottom = this.onlineRole === 'black';
    const topMs = isBlackBottom ? whiteMs : blackMs;
    const bottomMs = isBlackBottom ? blackMs : whiteMs;
    const topTurnColor = isBlackBottom ? 'w' : 'b';
    const bottomTurnColor = isBlackBottom ? 'b' : 'w';

    const timeTopEl = document.getElementById('online-time-top');
    const timeBottomEl = document.getElementById('online-time-bottom');
    const clockTopBox = document.getElementById('online-clock-top');
    const clockBottomBox = document.getElementById('online-clock-bottom');

    if (timeTopEl) timeTopEl.textContent = ChessClock.formatTime(topMs);
    if (timeBottomEl) timeBottomEl.textContent = ChessClock.formatTime(bottomMs);

    const isPlaying = this.onlineRoomState?.status === 'playing';

    if (clockTopBox) {
      clockTopBox.classList.toggle('active', isPlaying && activeTurn === topTurnColor);
      clockTopBox.classList.toggle('low-time', isPlaying && topMs < 15000 && activeTurn === topTurnColor);
    }
    if (clockBottomBox) {
      clockBottomBox.classList.toggle('active', isPlaying && activeTurn === bottomTurnColor);
      clockBottomBox.classList.toggle('low-time', isPlaying && bottomMs < 15000 && activeTurn === bottomTurnColor);
    }

    // Audio cue for active turn low time
    if (isPlaying && activeTurn) {
      const activeMs = activeTurn === 'w' ? whiteMs : blackMs;
      if (activeMs < 15000 && !this.onlineLowTimeWarned[activeTurn]) {
        this.onlineLowTimeWarned[activeTurn] = true;
        soundManager.play('low-time');
      }
    }
  }

  /* ========================================================================
     Online Match UI Updates & Presence
     ======================================================================== */

  updateOnlineMatchUI() {
    if (!this.onlineRoomState) return;

    // Update status text
    const statusTextEl = document.getElementById('online-match-status-text');
    if (statusTextEl) {
      statusTextEl.textContent = this.getOnlineStatusText();
    }

    // Update role badge
    const roleBadge = document.getElementById('online-role-badge');
    if (roleBadge) {
      roleBadge.textContent = this.getRoleBadgeText();
    }

    // Draw offer mount
    const drawMount = document.getElementById('online-draw-offer-mount');
    if (drawMount) {
      const drawOffer = this.onlineRoomState.drawOffer;
      if (drawOffer && drawOffer !== this.onlineRole && this.onlineRole !== 'spectator') {
        drawMount.innerHTML = `
          <div class="draw-offer-alert">
            <span>🤝 ${i18n.t('multiplayer.drawOffered')}</span>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
              <button class="btn btn-primary" id="mp-btn-accept-draw" style="flex: 1; padding: 0.35rem 0.5rem; font-size: 0.8rem;">
                ✓ ${i18n.t('multiplayer.acceptDraw')}
              </button>
              <button class="btn btn-secondary" id="mp-btn-decline-draw" style="flex: 1; padding: 0.35rem 0.5rem; font-size: 0.8rem;">
                ✕ ${i18n.t('multiplayer.declineDraw')}
              </button>
            </div>
          </div>
        `;

        document.getElementById('mp-btn-accept-draw')?.addEventListener('click', () => {
          firebaseAdapter.acceptDraw(this.onlineRoomId);
        });
        document.getElementById('mp-btn-decline-draw')?.addEventListener('click', () => {
          firebaseAdapter.declineDraw(this.onlineRoomId);
        });
      } else if (drawOffer === this.onlineRole) {
        drawMount.innerHTML = `
          <div style="font-size: 0.825rem; font-style: italic; color: var(--text-secondary); margin-bottom: 0.5rem;">
            🤝 Draw offered to opponent...
          </div>
        `;
      } else {
        drawMount.innerHTML = '';
      }
    }

    // Rematch button enable/disable
    const rematchBtn = document.getElementById('mp-online-rematch');
    if (rematchBtn) {
      rematchBtn.disabled = this.onlineRole === 'spectator' || this.onlineRoomState.status !== 'ended';
    }

    // Resign and Draw buttons enable/disable
    const isPlaying = this.onlineRoomState.status === 'playing';
    const resignBtn = document.getElementById('mp-online-resign');
    const drawBtn = document.getElementById('mp-online-offer-draw');
    if (resignBtn) resignBtn.disabled = !isPlaying || this.onlineRole === 'spectator';
    if (drawBtn) drawBtn.disabled = !isPlaying || this.onlineRole === 'spectator';

    // Moves list
    const movesListEl = document.getElementById('online-moves-list');
    if (movesListEl && this.onlineRoomState.moves) {
      if (this.onlineRoomState.moves.length === 0) {
        movesListEl.innerHTML = `<span style="color: var(--text-secondary); font-size: 0.8rem;">No moves yet</span>`;
      } else {
        movesListEl.innerHTML = this.onlineRoomState.moves
          .map((m, idx) => {
            const moveNum = Math.floor(idx / 2) + 1;
            const isWhite = idx % 2 === 0;
            return `
              <span class="online-move-item">
                ${isWhite ? `<span>${moveNum}.</span>` : ''}
                <span class="move-san">${m.san}</span>
              </span>
            `;
          })
          .join('');
        movesListEl.scrollTop = movesListEl.scrollHeight;
      }
    }

    this.updateOnlinePresenceBadge();
  }

  updateOnlinePresenceBadge() {
    const dot = document.getElementById('presence-dot');
    const label = document.getElementById('presence-label');
    if (!dot || !label) return;

    if (!this.onlineRoomState) return;

    if (this.onlineRoomState.status === 'waiting') {
      dot.className = 'presence-dot';
      label.textContent = i18n.t('multiplayer.waitingOpponent');
      return;
    }

    const opponentUid =
      this.onlineRole === 'white' ? this.onlineRoomState.players?.black : this.onlineRoomState.players?.white;

    if (opponentUid && this.onlinePresence[opponentUid]) {
      const isOnline = Boolean(this.onlinePresence[opponentUid].online);
      dot.className = `presence-dot ${isOnline ? 'online' : 'offline'}`;
      label.textContent = isOnline ? i18n.t('multiplayer.opponentOnline') : i18n.t('multiplayer.opponentOffline');
    } else {
      dot.className = 'presence-dot online';
      label.textContent = 'Match Active';
    }
  }

  getRoleBadgeText() {
    if (this.onlineRole === 'white') return `${i18n.t('multiplayer.playingAs')} White ⚪`;
    if (this.onlineRole === 'black') return `${i18n.t('multiplayer.playingAs')} Black ⚫`;
    return `👁️ ${i18n.t('multiplayer.spectating')}`;
  }

  getOnlineStatusText() {
    if (!this.onlineRoomState) return '';
    const { status, turn, result, reason } = this.onlineRoomState;

    if (status === 'waiting') {
      return `⏳ ${i18n.t('multiplayer.waitingOpponent')}`;
    }
    if (status === 'playing') {
      const turnText = turn === 'w' ? i18n.t('multiplayer.whiteTurn') : i18n.t('multiplayer.blackTurn');
      const isMyTurn = this.isMyOnlineTurn();
      return `${turnText} ${isMyTurn ? '★ (Your Turn)' : ''}`;
    }
    if (status === 'ended') {
      return `🏁 Game Over: ${result || ''} (${reason || ''})`;
    }
    return '';
  }

  async leaveOnlineRoom(renderLobby = true) {
    this.stopOnlineClock();
    if (this.onlineUnsubState) {
      this.onlineUnsubState();
      this.onlineUnsubState = null;
    }
    if (this.onlineUnsubPresence) {
      this.onlineUnsubPresence();
      this.onlineUnsubPresence = null;
    }

    if (this.onlineRoomId) {
      await firebaseAdapter.leaveRoom(this.onlineRoomId);
      this.onlineRoomId = null;
    }

    this.onlineRole = null;
    this.onlineRoomState = null;
    this.isGameOver = false;

    localStorage.removeItem('chess_online_room_id');
    this.clearUrlRoomParam();

    if (this.board) {
      this.board.destroy();
      this.board = null;
    }

    if (renderLobby) {
      this.renderOnlineLobby();
    }
  }

  updateUrlRoomParam(roomId) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url.toString());
  }

  clearUrlRoomParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }

  /* ========================================================================
     Game Over Dialog & PGN Export
     ======================================================================== */

  openGameOverDialog({ result, title, reason, isOnline = false }) {
    const mountEl = document.getElementById('mp-modals-mount');
    if (!mountEl) return;

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="mp-gameover-backdrop">
        <div class="chess-dialog-box" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <h3 class="dialog-title">🏁 ${i18n.t('standard.gameOver')}</h3>
            <span class="gameover-result-badge">${result}</span>
            <p class="gameover-reason">${title}<br /><span style="font-size: 0.9rem; font-weight: normal; color: var(--text-secondary);">${reason}</span></p>
          </div>
          <div class="dialog-body" style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${
              !isOnline || this.onlineRole !== 'spectator'
                ? `
              <button class="btn btn-primary" id="mp-btn-rematch-dialog">
                🔁 ${i18n.t('multiplayer.rematch')}
              </button>
            `
                : ''
            }
            <button class="btn btn-secondary" id="mp-btn-download-pgn">
              ⬇️ ${i18n.t('multiplayer.downloadPgn')}
            </button>
            <button class="btn btn-secondary" id="mp-btn-close-dialog">
              👀 ${i18n.t('standard.close')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mp-btn-rematch-dialog')?.addEventListener('click', () => {
      mountEl.innerHTML = '';
      if (isOnline) {
        firebaseAdapter.rematch(this.onlineRoomId);
      } else {
        this.rematchSwapColorsHotseat();
      }
    });

    document.getElementById('mp-btn-download-pgn')?.addEventListener('click', () => {
      this.downloadPgn();
    });

    document.getElementById('mp-btn-close-dialog')?.addEventListener('click', () => {
      mountEl.innerHTML = '';
    });
  }

  downloadPgn() {
    const isOnline = this.subMode === 'online';
    const eventName = isOnline ? 'Online Match' : 'Hot-Seat Match';
    const whiteName = isOnline
      ? `Player White (${this.onlineRoomState?.players?.white || 'Anonymous'})`
      : `Player 1 (${this.orientation === 'white' ? 'Bottom' : 'Top'})`;
    const blackName = isOnline
      ? `Player Black (${this.onlineRoomState?.players?.black || 'Anonymous'})`
      : `Player 2 (${this.orientation === 'white' ? 'Top' : 'Bottom'})`;

    const pgnHeader = [
      `[Event "Chess Playground ${eventName}"]`,
      `[Site "Chess Playground"]`,
      `[Date "${new Date().toISOString().split('T')[0]}"]`,
      `[White "${whiteName}"]`,
      `[Black "${blackName}"]`,
      `[Result "${this.gameOverResult || this.onlineRoomState?.result || '*'}"]`,
      `[TimeControl "${isOnline ? this.onlineSelectedPresetId : this.selectedPresetId}"]`,
      `[Termination "${this.gameOverReason || this.onlineRoomState?.reason || 'Normal'}"]`,
      '',
      this.chess.pgn() || ''
    ].join('\n');

    const blob = new Blob([pgnHeader], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-match-${Date.now()}.pgn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  findKingSquare(color) {
    const board = this.chess.board();
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
}

// Module export for mounting multiplayer mode
let activeMultiplayer = null;

export function initMultiplayerMode(container) {
  if (activeMultiplayer) {
    activeMultiplayer.destroy();
  }
  activeMultiplayer = new MultiplayerGame(container);
  activeMultiplayer.mount();
  return activeMultiplayer;
}
