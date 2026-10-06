/**
 * Mode 1: Standard Chess (Rule-enforced)
 * Full legal chess implementation using chess.js and shared BoardRenderer.
 * Features:
 * - AI Chess Engine Bot with 3 difficulty levels (Beginner, Intermediate, Master)
 * - Anti-drift Chess Clock with Blitz & Rapid presets and flag timeout detection
 * - Automatic ECO Opening recognition with Vietnamese & English book definitions
 * - Real-time Evaluation Bar showing position advantage and centipawn score
 * - Castling, en passant, promotion with piece-choice dialog
 * - Check, checkmate, stalemate, 3-fold repetition, 50-move rule, insufficient material
 * - Click-to-move & drag-and-drop with legal hints and sound effects
 * - SAN move list with review mode (click move to inspect past position)
 * - Navigation: |<<, <, >, >>, Undo, Redo
 * - Actions: New Game Setup, Flip, Resign, Offer Draw, PGN / FEN Import/Export
 */

import { Chess } from 'chess.js';
import { BoardRenderer } from '../../core/board/index.js';
import { BoardToolbar } from '../../core/board/boardToolbar.js';
import { icons } from '../../core/icons/index.js';
import { soundManager } from '../../core/sounds/index.js';
import { store } from '../../core/store/index.js';
import { router } from '../../core/router/index.js';
import { i18n } from '../../core/i18n/index.js';
import { getBestMove, evaluateBoard } from '../../core/engine/ai.js';
import { identifyOpening } from '../../core/engine/openings.js';
import { EvaluationBar } from '../../core/engine/evalBar.js';
import { ChessClock } from '../../core/clock/index.js';
import './standard.css';

const BASE_URL = import.meta.env?.BASE_URL || '/';

export class StandardChessGame {
  /**
   * @param {HTMLElement} container Mount target
   */
  constructor(container) {
    this.container = container;
    this.chess = new Chess();
    this.board = null;
    this.boardToolbar = null;
    this.evalBar = null;
    this.clock = null;
    this.keyHandler = null;

    // Game Mode & Match Setup
    this.gameMode = 'bot'; // 'bot' | 'pass'
    this.botLevel = 2; // 1 | 2 | 3
    this.playerColor = 'w'; // 'w' | 'b'
    this.timeControl = '5+0'; // 'unlimited' | '3+2' | '5+0' | '10+0'
    this.aiTimeoutId = null;
    this.isZenMode = false;

    // History snapshots for review: [{ index: 0, fen: '', san: '', lastMove: null }]
    this.historySnapshots = [
      {
        index: 0,
        fen: this.chess.fen(),
        san: '',
        lastMove: null
      }
    ];

    // Pointer to current reviewed position (default: latest live)
    this.reviewIndex = 0;

    // Stack for Redo functionality
    this.undoneMoves = [];

    // Pending promotion move state
    this.pendingPromotion = null; // { from, to, color }

    // Game over state
    this.isGameOver = false;
    this.gameOverReason = '';
    this.gameOverResult = '';

    // Active unsubscribers
    this.storeUnsub = null;
    this.i18nUnsub = null;
    this.clockUnsubTick = null;
    this.clockUnsubTimeout = null;
  }

  mount() {
    this.renderLayout();
    this.initBoard();

    // Mount Evaluation Bar
    const evalMount = document.getElementById('std-eval-mount');
    if (evalMount) {
      this.evalBar = new EvaluationBar(evalMount, {
        orientation: this.playerColor === 'b' ? 'black' : 'white',
        visible: true
      });
      this.evalBar.update(0);
    }

    // Mount BoardToolbar
    const toolbarMount = document.getElementById('std-board-toolbar');
    if (toolbarMount && this.board) {
      this.boardToolbar = new BoardToolbar(toolbarMount, {
        board: this.board,
        showFlip: true,
        showThemes: true,
        showCoords: true,
        showZen: true,
        showClearArrows: true,
        showEvalBar: true,
        isEvalVisible: true,
        onFlip: () => this.handleFlip(),
        onZenToggle: (isZen) => this.setZenMode(isZen),
        onEvalToggle: (visible) => {
          if (this.evalBar) {
            this.evalBar.setVisible(visible);
          }
        }
      });
    }

    // Initialize Match Clock
    this.initClock();

    // Initial UI synchronization
    this.updateUI();
    this.updateOpeningDisplay();
    this.updateEvalBar();

    // Subscribe to store updates for pieceSet, boardTheme, coordinates
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

    // If bot game and player chose Black, Bot (White) makes move 1!
    if (this.gameMode === 'bot' && this.playerColor === 'b') {
      this.scheduleAiMove();
    }
  }

  destroy() {
    if (this.isZenMode) {
      this.setZenMode(false);
    }
    const floatingBtn = document.getElementById('std-btn-zen-exit');
    if (floatingBtn) {
      floatingBtn.remove();
    }
    if (this.aiTimeoutId) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.storeUnsub) {
      this.storeUnsub();
      this.storeUnsub = null;
    }
    if (this.i18nUnsub) {
      this.i18nUnsub();
      this.i18nUnsub = null;
    }
    if (this.clockUnsubTick) {
      this.clockUnsubTick();
      this.clockUnsubTick = null;
    }
    if (this.clockUnsubTimeout) {
      this.clockUnsubTimeout();
      this.clockUnsubTimeout = null;
    }
    if (this.clock) {
      this.clock.destroy();
      this.clock = null;
    }
    if (this.evalBar) {
      this.evalBar.destroy();
      this.evalBar = null;
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

  /* ========================================================================
     Clock Integration
     ======================================================================== */

  initClock() {
    if (this.clockUnsubTick) {
      this.clockUnsubTick();
      this.clockUnsubTick = null;
    }
    if (this.clockUnsubTimeout) {
      this.clockUnsubTimeout();
      this.clockUnsubTimeout = null;
    }
    if (this.clock) {
      this.clock.destroy();
      this.clock = null;
    }

    const topClockEl = document.getElementById('std-top-clock');
    const bottomClockEl = document.getElementById('std-bottom-clock');

    if (this.timeControl === 'unlimited') {
      if (topClockEl) topClockEl.style.display = 'none';
      if (bottomClockEl) bottomClockEl.style.display = 'none';
      return;
    }

    let initialTimeMs = 300000;
    let incrementMs = 0;

    switch (this.timeControl) {
      case '3+2':
        initialTimeMs = 180000;
        incrementMs = 2000;
        break;
      case '5+0':
        initialTimeMs = 300000;
        incrementMs = 0;
        break;
      case '10+0':
        initialTimeMs = 600000;
        incrementMs = 0;
        break;
      default:
        initialTimeMs = 300000;
        incrementMs = 0;
    }

    this.clock = new ChessClock({
      initialTimeMs,
      incrementMs,
      incrementType: 'fischer'
    });

    if (topClockEl) {
      topClockEl.style.display = 'inline-flex';
      topClockEl.textContent = ChessClock.formatTime(initialTimeMs);
    }
    if (bottomClockEl) {
      bottomClockEl.style.display = 'inline-flex';
      bottomClockEl.textContent = ChessClock.formatTime(initialTimeMs);
    }

    this.clockUnsubTick = this.clock.onTick(({ whiteMs, blackMs, activeColor }) => {
      this.updateClockDisplay(whiteMs, blackMs, activeColor);
    });

    this.clockUnsubTimeout = this.clock.onTimeout(({ flaggedColor, winnerColor }) => {
      const isWhiteWon = winnerColor === 'w';
      const winnerText = isWhiteWon ? i18n.t('standard.whiteWon') : i18n.t('standard.blackWon');
      const template = i18n.t('standard.timeoutWin') || '{winner} thắng do đối phương hết giờ!';
      const reasonText = template.replace('{winner}', winnerText);

      this.endGame({
        result: isWhiteWon ? '1 - 0' : '0 - 1',
        title: `${winnerText}!`,
        reason: reasonText
      });
    });
  }

  updateClockDisplay(whiteMs, blackMs, activeColor) {
    const isWhiteOrientation = !this.board || this.board.orientation === 'white';
    const topClockEl = document.getElementById('std-top-clock');
    const bottomClockEl = document.getElementById('std-bottom-clock');

    const topMs = isWhiteOrientation ? blackMs : whiteMs;
    const bottomMs = isWhiteOrientation ? whiteMs : blackMs;
    const topColor = isWhiteOrientation ? 'b' : 'w';
    const bottomColor = isWhiteOrientation ? 'w' : 'b';

    if (topClockEl) {
      topClockEl.textContent = ChessClock.formatTime(topMs);
      topClockEl.classList.toggle('active', activeColor === topColor && !this.isGameOver);
      topClockEl.classList.toggle('low-time', topMs < 15000 && activeColor === topColor);
    }

    if (bottomClockEl) {
      bottomClockEl.textContent = ChessClock.formatTime(bottomMs);
      bottomClockEl.classList.toggle('active', activeColor === bottomColor && !this.isGameOver);
      bottomClockEl.classList.toggle('low-time', bottomMs < 15000 && activeColor === bottomColor);
    }
  }

  /* ========================================================================
     Opening & Evaluation Updates
     ======================================================================== */

  updateOpeningDisplay() {
    const openingStrip = document.getElementById('std-opening-strip');
    const ecoEl = document.getElementById('std-opening-eco');
    const nameEl = document.getElementById('std-opening-name');
    if (!openingStrip || !ecoEl || !nameEl) return;

    const currentChess = this.isLive()
      ? this.chess
      : new Chess(this.historySnapshots[this.reviewIndex].fen);

    const history = currentChess.history();
    const opening = identifyOpening(history);

    if (opening && history.length > 0) {
      openingStrip.style.display = 'flex';
      ecoEl.textContent = opening.eco;
      nameEl.textContent = (i18n.currentLang === 'vi' && opening.nameVi) ? opening.nameVi : opening.name;
      openingStrip.title = `${opening.eco}: ${nameEl.textContent}`;
    } else {
      openingStrip.style.display = 'none';
    }
  }

  updateEvalBar() {
    if (!this.evalBar) return;
    const activeChess = this.isLive()
      ? this.chess
      : new Chess(this.historySnapshots[this.reviewIndex].fen);
    const score = evaluateBoard(activeChess);
    this.evalBar.update(score);
  }

  /* ========================================================================
     Localization & Rendering
     ======================================================================== */

  updateI18n() {
    const backBtn = document.getElementById('std-back-home');
    if (backBtn) {
      backBtn.title = i18n.t('standard.back');
      backBtn.innerHTML = `${icons.back}<span>${i18n.t('standard.back')}</span>`;
    }
    const titleEl = document.querySelector('.standard-mode-title');
    if (titleEl) titleEl.textContent = i18n.t('standard.title');

    const zenBtn = document.getElementById('std-btn-zen');
    if (zenBtn) {
      zenBtn.title = `${i18n.t('standard.zenMode')} (Z)`;
      const labelSpan = zenBtn.querySelector('span');
      if (labelSpan) labelSpan.textContent = i18n.t('standard.zenMode');
    }

    const oppLabel = document.getElementById('std-lbl-opponent');
    if (oppLabel) oppLabel.textContent = i18n.t('standard.opponent');
    const diffLabel = document.getElementById('std-lbl-difficulty');
    if (diffLabel) diffLabel.textContent = i18n.t('standard.difficulty');
    const clockLabel = document.getElementById('std-lbl-clock');
    if (clockLabel) clockLabel.textContent = i18n.t('standard.clock');

    const vsAiBtn = document.querySelector('#std-seg-opponent [data-mode="bot"] span');
    if (vsAiBtn) vsAiBtn.textContent = i18n.t('standard.playVsBot');
    const vsHumanBtn = document.querySelector('#std-seg-opponent [data-mode="pass"] span');
    if (vsHumanBtn) vsHumanBtn.textContent = i18n.t('standard.playPassPlay');

    const easyBtn = document.querySelector('#std-pills-bot-level [data-level="1"]');
    if (easyBtn) easyBtn.textContent = i18n.t('standard.level1');
    const medBtn = document.querySelector('#std-pills-bot-level [data-level="2"]');
    if (medBtn) medBtn.textContent = i18n.t('standard.level2');
    const hardBtn = document.querySelector('#std-pills-bot-level [data-level="3"]');
    if (hardBtn) hardBtn.textContent = i18n.t('standard.level3');

    this.updateStatus();
    this.updatePlayerStrips();
    this.updateOpeningDisplay();

    const resumeBtn = document.getElementById('std-btn-resume-live');
    if (resumeBtn) resumeBtn.textContent = `${i18n.t('standard.liveBtn')} »`;

    const movesHeader = document.querySelector('.side-panel-header .side-panel-title');
    if (movesHeader) movesHeader.textContent = i18n.t('standard.moves');

    const emptyMoves = document.getElementById('std-empty-moves');
    if (emptyMoves) emptyMoves.textContent = i18n.t('standard.noMoves');

    const undoBtn = document.getElementById('std-btn-undo');
    if (undoBtn) {
      undoBtn.title = i18n.t('standard.undo');
      undoBtn.innerHTML = `${icons.undo}<span>${i18n.t('standard.undo')}</span>`;
    }

    const redoBtn = document.getElementById('std-btn-redo');
    if (redoBtn) {
      redoBtn.title = i18n.t('standard.redo');
      redoBtn.innerHTML = `${icons.redo}<span>${i18n.t('standard.redo')}</span>`;
    }

    const newBtn = document.getElementById('std-action-new');
    if (newBtn) newBtn.innerHTML = `${icons.reset}<span>${i18n.t('standard.newGame')}</span>`;

    const drawBtn = document.getElementById('std-action-draw');
    if (drawBtn) drawBtn.innerHTML = `${icons.handshake}<span>${i18n.t('standard.offerDraw')}</span>`;

    const resignBtn = document.getElementById('std-action-resign');
    if (resignBtn) resignBtn.innerHTML = `${icons.flag}<span>${i18n.t('standard.resign')}</span>`;

    const pgnBtn = document.getElementById('std-action-pgn');
    if (pgnBtn) pgnBtn.innerHTML = `${icons.pgn}<span>${i18n.t('standard.pgnFen')}</span>`;
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="standard-mode-container">
        <!-- Top Header Bar -->
        <header class="standard-header">
          <div class="standard-header-left">
            <button class="mode-back-btn" id="std-back-home" title="${i18n.t('standard.back')}">
              ${icons.back}
              <span>${i18n.t('standard.back')}</span>
            </button>
            <h2 class="standard-mode-title">${i18n.t('standard.title')}</h2>
          </div>
          <div class="standard-header-right">
            <button class="mode-zen-btn" id="std-btn-zen" title="${i18n.t('standard.zenMode')} (Z)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
              <span>${i18n.t('standard.zenMode')}</span>
            </button>
            <div class="game-status-badge" id="std-turn-badge">
              <span class="player-indicator white"></span>
              <span id="std-turn-text">${i18n.t('standard.whiteTurn')}</span>
            </div>
          </div>
        </header>

        <!-- Main Game Layout (Board + Side Panel) -->
        <div class="standard-game-layout">
          <!-- Board Column -->
          <div class="standard-board-area">
            <!-- Top Player Strip (Opponent) -->
            <div class="player-strip" id="std-top-player-strip">
              <div class="player-tag">
                <span class="player-indicator black" id="std-top-player-indicator"></span>
                <span id="std-top-player-label">Black</span>
              </div>
              <div class="player-clock-box" id="std-top-clock" style="display: none;">5:00</div>
            </div>

            <!-- Board Mount Target with Evaluation Bar -->
            <div class="board-with-eval-layout" style="width: 100%;">
              <div class="std-eval-mount" id="std-eval-mount"></div>
              <div id="std-board-mount" style="flex: 1; min-width: 0;"></div>
            </div>

            <!-- Bottom Player Strip (Self) -->
            <div class="player-strip active" id="std-bottom-player-strip">
              <div class="player-tag">
                <span class="player-indicator white" id="std-bottom-player-indicator"></span>
                <span id="std-bottom-player-label">White</span>
              </div>
              <div class="player-clock-box" id="std-bottom-clock" style="display: none;">5:00</div>
            </div>

            <!-- Live Board Toolbar Component Mount -->
            <div id="std-board-toolbar" class="std-board-toolbar-wrap"></div>

            <!-- Review Notice Banner (visible during history review) -->
            <div class="review-notice-banner" id="std-review-notice" style="display: none;">
              <span id="std-review-text">${i18n.t('standard.liveNotice')}</span>
              <button class="btn-resume-live" id="std-btn-resume-live">${i18n.t('standard.liveBtn')} »</button>
            </div>
          </div>

          <!-- Side Panel Column -->
          <aside class="standard-side-panel">
            <!-- Match Quick Config Panel -->
            <div class="match-quick-panel">
              <div class="match-row">
                <span class="match-row-label" id="std-lbl-opponent">${i18n.t('standard.opponent')}</span>
                <div class="match-segmented" id="std-seg-opponent" role="group">
                  <button type="button" class="match-seg-btn ${this.gameMode === 'bot' ? 'active' : ''}" data-mode="bot">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x2="16" y1="16" x2="16"/></svg>
                    <span>${i18n.t('standard.playVsBot')}</span>
                  </button>
                  <button type="button" class="match-seg-btn ${this.gameMode === 'pass' ? 'active' : ''}" data-mode="pass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span>${i18n.t('standard.playPassPlay')}</span>
                  </button>
                </div>
              </div>

              <div class="match-row" id="std-row-bot-level" style="display: ${this.gameMode === 'bot' ? 'flex' : 'none'};">
                <span class="match-row-label" id="std-lbl-difficulty">${i18n.t('standard.difficulty')}</span>
                <div class="match-pill-group" id="std-pills-bot-level" role="group">
                  <button type="button" class="match-pill-btn ${this.botLevel === 1 ? 'active' : ''}" data-level="1">${i18n.t('standard.level1')}</button>
                  <button type="button" class="match-pill-btn ${this.botLevel === 2 ? 'active' : ''}" data-level="2">${i18n.t('standard.level2')}</button>
                  <button type="button" class="match-pill-btn ${this.botLevel === 3 ? 'active' : ''}" data-level="3">${i18n.t('standard.level3')}</button>
                </div>
              </div>

              <div class="match-row">
                <span class="match-row-label" id="std-lbl-clock">${i18n.t('standard.clock')}</span>
                <div class="match-pill-group" id="std-pills-clock" role="group">
                  <button type="button" class="match-pill-btn ${this.timeControl === 'unlimited' ? 'active' : ''}" data-time="unlimited">∞</button>
                  <button type="button" class="match-pill-btn ${this.timeControl === '3+2' ? 'active' : ''}" data-time="3+2">3+2</button>
                  <button type="button" class="match-pill-btn ${this.timeControl === '5+0' ? 'active' : ''}" data-time="5+0">5+0</button>
                  <button type="button" class="match-pill-btn ${this.timeControl === '10+0' ? 'active' : ''}" data-time="10+0">10+0</button>
                </div>
              </div>
            </div>

            <div class="side-panel-header">
              <span class="side-panel-title">${i18n.t('standard.moves')}</span>
              <span id="std-move-count" style="font-weight: 500; font-size: 0.8rem; color: var(--text-secondary);">0 moves</span>
            </div>

            <!-- Opening Explorer Strip -->
            <div class="opening-name-strip" id="std-opening-strip" style="display: none;">
              <span class="opening-eco-badge" id="std-opening-eco">A00</span>
              <span class="opening-name-text" id="std-opening-name">...</span>
            </div>

            <!-- Scrollable Move List -->
            <div class="move-list-scroll" id="std-move-list-scroll">
              <div class="empty-moves-text" id="std-empty-moves">${i18n.t('standard.noMoves')}</div>
              <table class="move-list-table" id="std-move-list-table" style="display: none;">
                <tbody id="std-move-list-body"></tbody>
              </table>
            </div>

            <!-- History Navigation Buttons -->
            <div class="history-nav-toolbar">
              <div class="history-step-group" role="group" aria-label="Move History Navigation">
                <button class="nav-btn" id="std-nav-first" title="First move" aria-label="First move">${icons.first}</button>
                <button class="nav-btn" id="std-nav-prev" title="Previous move (Left arrow)" aria-label="Previous move">${icons.prev}</button>
                <button class="nav-btn" id="std-nav-next" title="Next move (Right arrow)" aria-label="Next move">${icons.next}</button>
                <button class="nav-btn" id="std-nav-last" title="Latest move" aria-label="Latest move">${icons.last}</button>
              </div>
              <div class="history-nav-separator"></div>
              <div class="history-undo-group" role="group" aria-label="Undo and Redo">
                <button class="nav-btn" id="std-btn-undo" title="${i18n.t('standard.undo')}" aria-label="${i18n.t('standard.undo')}">${icons.undo}<span>${i18n.t('standard.undo')}</span></button>
                <button class="nav-btn" id="std-btn-redo" title="${i18n.t('standard.redo')}" aria-label="${i18n.t('standard.redo')}">${icons.redo}<span>${i18n.t('standard.redo')}</span></button>
              </div>
            </div>

            <!-- Game Actions Grid -->
            <div class="game-actions-panel">
              <button class="action-btn" id="std-action-new">${icons.reset}<span>${i18n.t('standard.newGame')}</span></button>
              <button class="action-btn" id="std-action-pgn">${icons.pgn}<span>${i18n.t('standard.pgnFen')}</span></button>
              <button class="action-btn" id="std-action-draw">${icons.handshake}<span>${i18n.t('standard.offerDraw')}</span></button>
              <button class="action-btn danger" id="std-action-resign">${icons.flag}<span>${i18n.t('standard.resign')}</span></button>
            </div>
          </aside>
        </div>
      </div>

      <!-- Modals Container -->
      <div id="std-modals-mount"></div>
    `;

    this.attachDomEvents();
  }

  initBoard() {
    const mountEl = document.getElementById('std-board-mount');
    if (!mountEl) return;

    const state = store.getState();
    const initialOrientation = this.playerColor === 'b' ? 'black' : 'white';

    this.board = new BoardRenderer(mountEl, {
      position: this.chess.board(),
      orientation: initialOrientation,
      pieceSet: state.pieceSet,
      boardTheme: state.boardTheme,
      showCoordinates: state.showCoordinates,
      interactive: true,
      clearAnnotationsOnLeftClick: true,

      onSquareClick: ({ square, piece }) => {
        this.handleSquareClick(square, piece);
      },

      onDragStart: ({ square, piece }) => {
        this.handleDragStart(square, piece);
      },

      onDrop: ({ fromSquare, toSquare }) => {
        this.handleDrop(fromSquare, toSquare);
      }
    });
  }

  attachDomEvents() {
    // Back to home
    const backBtn = document.getElementById('std-back-home');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        router.navigate(null);
      });
    }

    // Zen Mode Header Button
    const zenBtn = document.getElementById('std-btn-zen');
    if (zenBtn) {
      zenBtn.addEventListener('click', () => {
        this.toggleZenMode();
      });
    }

    // Keyboard navigation & Zen mode shortcut (Z, Esc)
    this.keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        this.toggleZenMode();
        return;
      }

      if (e.key === 'Escape' && this.isZenMode) {
        e.preventDefault();
        this.setZenMode(false);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.jumpToHistory(this.reviewIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.jumpToHistory(this.reviewIndex + 1);
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // Match Quick Config Panel Events
    const segButtons = this.container.querySelectorAll('#std-seg-opponent .match-seg-btn');
    segButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode) this.setGameMode(mode);
      });
    });

    const levelButtons = this.container.querySelectorAll('#std-pills-bot-level .match-pill-btn');
    levelButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = parseInt(btn.getAttribute('data-level'), 10);
        if (lvl) this.setBotLevel(lvl);
      });
    });

    const clockButtons = this.container.querySelectorAll('#std-pills-clock .match-pill-btn');
    clockButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const time = btn.getAttribute('data-time');
        if (time) this.setTimeControl(time);
      });
    });

    // Resume live game
    const resumeLiveBtn = document.getElementById('std-btn-resume-live');
    if (resumeLiveBtn) {
      resumeLiveBtn.addEventListener('click', () => {
        this.jumpToHistory(this.historySnapshots.length - 1);
      });
    }

    // Navigation buttons
    document.getElementById('std-nav-first')?.addEventListener('click', () => this.jumpToHistory(0));
    document.getElementById('std-nav-prev')?.addEventListener('click', () => this.jumpToHistory(this.reviewIndex - 1));
    document.getElementById('std-nav-next')?.addEventListener('click', () => this.jumpToHistory(this.reviewIndex + 1));
    document.getElementById('std-nav-last')?.addEventListener('click', () => this.jumpToHistory(this.historySnapshots.length - 1));

    // Undo / Redo
    document.getElementById('std-btn-undo')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('std-btn-redo')?.addEventListener('click', () => this.handleRedo());

    // Game Actions
    document.getElementById('std-action-new')?.addEventListener('click', () => this.promptNewGame());
    document.getElementById('std-action-pgn')?.addEventListener('click', () => this.openPgnFenModal());
    document.getElementById('std-action-draw')?.addEventListener('click', () => this.promptDrawOffer());
    document.getElementById('std-action-resign')?.addEventListener('click', () => this.promptResign());
  }

  /* ========================================================================
     Match Controls & Zen Mode
     ======================================================================== */

  toggleZenMode() {
    this.setZenMode(!this.isZenMode);
  }

  setZenMode(active) {
    this.isZenMode = Boolean(active);
    if (!this.container) return;
    const container = typeof this.container.querySelector === 'function'
      ? this.container.querySelector('.standard-mode-container')
      : null;
    if (container) {
      container.classList?.toggle('zen-mode', this.isZenMode);
    }
    const appLayout = typeof document !== 'undefined' ? document.querySelector('.standard-game-layout') : null;
    if (appLayout) {
      appLayout.classList?.toggle('zen-mode-active', this.isZenMode);
    }
    const zenBtn = typeof document !== 'undefined' ? document.getElementById('std-btn-zen') : null;
    if (zenBtn) {
      zenBtn.classList?.toggle('active', this.isZenMode);
    }
    if (this.boardToolbar) {
      this.boardToolbar.setZen(this.isZenMode);
    }

    if (typeof document !== 'undefined') {
      let floatingBtn = document.getElementById('std-btn-zen-exit');
      if (this.isZenMode) {
        if (!floatingBtn) {
          floatingBtn = document.createElement('button');
          floatingBtn.id = 'std-btn-zen-exit';
          floatingBtn.className = 'zen-exit-floating-btn';
          floatingBtn.innerHTML = `✕ <span>${i18n.t('standard.exitZen')}</span>`;
          floatingBtn.title = `${i18n.t('standard.exitZen')} (Esc / Z)`;
          floatingBtn.addEventListener('click', () => this.setZenMode(false));
          document.body?.appendChild(floatingBtn);
        }
      } else if (floatingBtn) {
        floatingBtn.remove();
      }
    }
  }

  setGameMode(mode) {
    if (this.gameMode === mode) return;
    this.gameMode = mode;
    this.syncQuickPanelUI();
    this.updatePlayerStrips();
    this.showToast(mode === 'bot' ? i18n.t('standard.playVsBot') : i18n.t('standard.playPassPlay'));

    if (mode === 'bot' && !this.isGameOver && this.chess.turn() !== this.playerColor) {
      this.makeAiMoveIfNeeded();
    }
  }

  setBotLevel(lvl) {
    this.botLevel = lvl;
    this.syncQuickPanelUI();
    this.updatePlayerStrips();
    const lvlName = lvl === 1 ? i18n.t('standard.level1') : lvl === 2 ? i18n.t('standard.level2') : i18n.t('standard.level3');
    this.showToast(i18n.t('standard.levelChanged', { level: lvlName }));
  }

  setTimeControl(time) {
    this.timeControl = time;
    this.syncQuickPanelUI();
    this.initClock();
    const timeLabel = time === 'unlimited' ? '∞' : time;
    this.showToast(i18n.t('standard.clockChanged', { time: timeLabel }));
  }

  syncQuickPanelUI() {
    if (!this.container || typeof this.container.querySelectorAll !== 'function') return;
    const segButtons = this.container.querySelectorAll('#std-seg-opponent .match-seg-btn');
    if (segButtons) {
      segButtons.forEach((b) => {
        b.classList?.toggle('active', b.getAttribute?.('data-mode') === this.gameMode);
      });
    }

    const botRow = typeof document !== 'undefined' ? document.getElementById('std-row-bot-level') : null;
    if (botRow) {
      botRow.style.display = this.gameMode === 'bot' ? 'flex' : 'none';
    }

    const levelButtons = this.container.querySelectorAll('#std-pills-bot-level .match-pill-btn');
    if (levelButtons) {
      levelButtons.forEach((b) => {
        b.classList?.toggle('active', parseInt(b.getAttribute?.('data-level'), 10) === this.botLevel);
      });
    }

    const clockButtons = this.container.querySelectorAll('#std-pills-clock .match-pill-btn');
    if (clockButtons) {
      clockButtons.forEach((b) => {
        b.classList?.toggle('active', b.getAttribute?.('data-time') === this.timeControl);
      });
    }
  }

  /* ========================================================================
     Move Handling & Legal Moves
     ======================================================================== */

  isLive() {
    return this.reviewIndex === this.historySnapshots.length - 1;
  }

  handleSquareClick(square, piece) {
    if (this.isGameOver) return;

    // In bot mode, ignore clicks when it's not player's turn
    if (this.gameMode === 'bot' && this.chess.turn() !== this.playerColor) {
      return;
    }

    // If reviewing past position, jump back to live position first
    if (!this.isLive()) {
      this.jumpToHistory(this.historySnapshots.length - 1);
    }

    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;

    // If clicking friendly piece -> select and show legal moves
    if (pieceColor === currentTurn) {
      this.selectSquare(square);
    } else if (this.board && this.board.highlights.selected) {
      // If a friendly piece was already selected -> attempt move to clicked square
      const fromSquare = this.board.highlights.selected;
      this.attemptMove(fromSquare, square);
    }
  }

  handleDragStart(square, piece) {
    if (this.isGameOver) return;

    if (this.gameMode === 'bot' && this.chess.turn() !== this.playerColor) {
      return;
    }

    if (!this.isLive()) {
      this.jumpToHistory(this.historySnapshots.length - 1);
    }

    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;

    if (pieceColor === currentTurn) {
      this.selectSquare(square);
    }
  }

  handleDrop(fromSquare, toSquare) {
    if (this.isGameOver) return;

    if (this.gameMode === 'bot' && this.chess.turn() !== this.playerColor) {
      return;
    }

    this.attemptMove(fromSquare, toSquare);
  }

  selectSquare(square) {
    const legalMoves = this.chess.moves({ square, verbose: true }).map((m) => ({
      square: m.to,
      isCapture: Boolean(m.captured)
    }));

    const checkSquare = this.chess.isCheck()
      ? this.findKingSquare(this.chess.turn())
      : null;

    const currentLastMove = this.historySnapshots[this.historySnapshots.length - 1]?.lastMove;

    this.board.setHighlights({
      selected: square,
      legalMoves,
      lastMove: currentLastMove,
      check: checkSquare
    });
  }

  attemptMove(fromSquare, toSquare) {
    // Check if legal move exists from fromSquare to toSquare
    const moves = this.chess.moves({ square: fromSquare, verbose: true });
    const targetMoves = moves.filter((m) => m.to === toSquare);

    if (targetMoves.length === 0) {
      // Illegal move
      this.board.clearHighlights();
      const currentLastMove = this.historySnapshots[this.historySnapshots.length - 1]?.lastMove;
      const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;
      this.board.setHighlights({ lastMove: currentLastMove, check: checkSquare });
      return;
    }

    // Check if move is a pawn promotion
    const isPromotion = targetMoves.some((m) => m.promotion);
    if (isPromotion) {
      this.openPromotionDialog(fromSquare, toSquare, this.chess.turn());
      return;
    }

    // Execute standard move
    this.executeMove({ from: fromSquare, to: toSquare });
  }

  executeMove(moveObj) {
    try {
      const move = this.chess.move(moveObj);
      if (!move) return;

      // Clear redo stack on new move
      this.undoneMoves = [];

      // Clear annotations when move is made
      this.board?.clearArrows();
      this.board?.clearMarkedSquares();

      // Audio feedback
      if (this.chess.isCheckmate() || this.chess.isGameOver()) {
        soundManager.play('game-end');
      } else if (this.chess.isCheck()) {
        soundManager.play('check');
      } else if (move.captured) {
        soundManager.play('capture');
      } else if (move.flags.includes('k') || move.flags.includes('q')) {
        soundManager.play('castle');
      } else {
        soundManager.play('move');
      }

      // Record snapshot
      const snapshot = {
        index: this.historySnapshots.length,
        fen: this.chess.fen(),
        san: move.san,
        lastMove: { from: move.from, to: move.to }
      };
      this.historySnapshots.push(snapshot);
      this.reviewIndex = this.historySnapshots.length - 1;

      // Update Board position and highlights
      this.board.setPosition(this.chess.board());
      const checkSquare = this.chess.isCheck()
        ? this.findKingSquare(this.chess.turn())
        : null;

      this.board.setHighlights({
        selected: null,
        legalMoves: [],
        lastMove: { from: move.from, to: move.to },
        check: checkSquare
      });

      // Advance or start Clock
      if (this.clock && !this.isGameOver) {
        if (!this.clock.isRunning) {
          this.clock.start(this.chess.turn());
        } else {
          this.clock.switchTurn();
        }
      }

      this.updateUI();
      this.updateOpeningDisplay();
      this.updateEvalBar();
      this.checkGameEndConditions();

      // Trigger AI Move if playing against bot and it's bot's turn
      if (!this.isGameOver && this.gameMode === 'bot') {
        const botColor = this.playerColor === 'w' ? 'b' : 'w';
        if (this.chess.turn() === botColor) {
          this.scheduleAiMove();
        }
      }
    } catch (err) {
      console.warn('[StandardGame] Move failed:', err);
      this.board.clearHighlights();
    }
  }

  /* ========================================================================
     AI Chess Engine Bot Loop
     ======================================================================== */

  scheduleAiMove() {
    if (this.isGameOver) return;
    if (this.aiTimeoutId) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }

    // Indicate bot thinking
    const textEl = document.getElementById('std-turn-text');
    if (textEl) {
      textEl.textContent = i18n.t('standard.botThinking');
    }

    if (this.board) {
      this.board.interactive = false;
    }

    // Natural human-like pause (450ms - 650ms)
    this.aiTimeoutId = setTimeout(() => {
      this.makeAiMove();
    }, 450 + Math.random() * 200);
  }

  makeAiMove() {
    this.aiTimeoutId = null;
    if (this.isGameOver) return;

    const botColor = this.playerColor === 'w' ? 'b' : 'w';
    if (this.chess.turn() !== botColor) {
      if (this.board) {
        this.board.interactive = this.isLive() && !this.isGameOver;
      }
      return;
    }

    const bestMove = getBestMove(this.chess, this.botLevel);
    if (bestMove) {
      this.executeMove(bestMove);
    }

    if (this.board) {
      this.board.interactive = this.isLive() && !this.isGameOver;
    }
  }

  /* ========================================================================
     Pawn Promotion Dialog
     ======================================================================== */

  openPromotionDialog(fromSquare, toSquare, color) {
    this.pendingPromotion = { from: fromSquare, to: toSquare, color };
    const mountEl = document.getElementById('std-modals-mount');
    if (!mountEl) return;

    const pieceSet = store.getState().pieceSet;
    const pieces = [
      { type: 'q', label: i18n.t('standard.queen'), code: `${color}Q` },
      { type: 'r', label: i18n.t('standard.rook'), code: `${color}R` },
      { type: 'b', label: i18n.t('standard.bishop'), code: `${color}B` },
      { type: 'n', label: i18n.t('standard.knight'), code: `${color}N` }
    ];

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="std-promotion-backdrop">
        <div class="chess-dialog-box" role="dialog" aria-modal="true" aria-labelledby="std-promote-title">
          <div class="dialog-header">
            <h3 class="dialog-title" id="std-promote-title">${i18n.t('standard.promoteTitle')}</h3>
            <p class="dialog-subtitle">${i18n.t('standard.promoteDesc')}</p>
          </div>
          <div class="dialog-body">
            <div class="promotion-pieces-grid">
              ${pieces
                .map(
                  (p) => `
                <button class="promotion-piece-btn" data-promo-piece="${p.type}" title="${p.label}">
                  <img src="${BASE_URL}assets/pieces/${pieceSet}/${p.code}.svg" alt="${p.label}" class="promotion-piece-img" />
                  <span class="promotion-piece-label">${p.label}</span>
                </button>
              `
                )
                .join('')}
            </div>
            <button class="btn btn-secondary" id="std-cancel-promo" style="width: 100%;">
              ${i18n.t('standard.cancel')}
            </button>
          </div>
        </div>
      </div>
    `;

    // Piece button selection
    mountEl.querySelectorAll('[data-promo-piece]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pieceType = btn.getAttribute('data-promo-piece');
        this.closeModals();
        if (this.pendingPromotion) {
          const { from, to } = this.pendingPromotion;
          this.pendingPromotion = null;
          this.executeMove({ from, to, promotion: pieceType });
        }
      });
    });

    // Cancel promotion
    document.getElementById('std-cancel-promo')?.addEventListener('click', () => {
      this.closeModals();
      this.pendingPromotion = null;
      this.board.clearHighlights();
    });
  }

  /* ========================================================================
     Game Over Evaluation
     ======================================================================== */

  checkGameEndConditions() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
      const winnerText = winner === 'White' ? i18n.t('standard.whiteWon') : i18n.t('standard.blackWon');
      this.endGame({
        result: winner === 'White' ? '1 - 0' : '0 - 1',
        title: `${winnerText}!`,
        reason: i18n.t('standard.checkmate')
      });
    } else if (this.chess.isStalemate()) {
      this.endGame({
        result: '½ - ½',
        title: i18n.t('standard.draw'),
        reason: i18n.t('standard.stalemate')
      });
    } else if (this.chess.isThreefoldRepetition()) {
      this.endGame({
        result: '½ - ½',
        title: i18n.t('standard.draw'),
        reason: i18n.t('standard.threefold')
      });
    } else if (this.chess.isDrawByFiftyMoves()) {
      this.endGame({
        result: '½ - ½',
        title: i18n.t('standard.draw'),
        reason: i18n.t('standard.fiftyMoves')
      });
    } else if (this.chess.isInsufficientMaterial()) {
      this.endGame({
        result: '½ - ½',
        title: i18n.t('standard.draw'),
        reason: i18n.t('standard.insufficient')
      });
    }
  }

  endGame({ result, title, reason }) {
    this.isGameOver = true;
    this.gameOverResult = result;
    this.gameOverReason = `${title} (${reason})`;

    if (this.clock) {
      this.clock.pause();
    }
    if (this.aiTimeoutId) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }
    if (this.board) {
      this.board.interactive = false;
    }

    soundManager.play('game-end');
    this.updateUI();
    this.openGameOverDialog({ result, title, reason });
  }

  openGameOverDialog({ result, title, reason }) {
    const mountEl = document.getElementById('std-modals-mount');
    if (!mountEl) return;

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="std-gameover-backdrop">
        <div class="chess-dialog-box" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <h3 class="dialog-title" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              ${icons.trophy} ${i18n.t('standard.gameOver')}
            </h3>
            <span class="gameover-result-badge">${result}</span>
            <p class="gameover-reason">${title}<br /><span style="font-size: 0.9rem; font-weight: normal; color: var(--text-secondary);">${reason}</span></p>
          </div>
          <div class="dialog-body" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button class="btn btn-primary" id="std-btn-new-game-dialog" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
              ${icons.reset} <span>${i18n.t('standard.newGame')}</span>
            </button>
            <button class="btn btn-secondary" id="std-btn-review-board-dialog">
              <span>${i18n.t('standard.close')}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('std-btn-new-game-dialog')?.addEventListener('click', () => {
      this.closeModals();
      this.openNewGameModal();
    });

    document.getElementById('std-btn-review-board-dialog')?.addEventListener('click', () => {
      this.closeModals();
    });
  }

  /* ========================================================================
     History Review, Undo, Redo, Navigation
     ======================================================================== */

  jumpToHistory(targetIndex) {
    if (targetIndex < 0 || targetIndex >= this.historySnapshots.length) return;

    this.reviewIndex = targetIndex;
    const snapshot = this.historySnapshots[targetIndex];

    // Load position onto the board
    const tempChess = new Chess(snapshot.fen);
    this.board.setPosition(tempChess.board());

    const isLive = this.isLive();
    const checkSquare = tempChess.isCheck()
      ? this.findKingSquare(tempChess.turn(), tempChess)
      : null;

    this.board.setHighlights({
      selected: null,
      legalMoves: [],
      lastMove: snapshot.lastMove,
      check: checkSquare
    });

    // Make board interactive only if live and game not over
    this.board.interactive = isLive && !this.isGameOver && (this.gameMode !== 'bot' || this.chess.turn() === this.playerColor);

    this.updateUI();
    this.updateOpeningDisplay();
    this.updateEvalBar();

    // If jumping back to live and it's bot's turn, resume AI move
    if (isLive && !this.isGameOver && this.gameMode === 'bot') {
      const botColor = this.playerColor === 'w' ? 'b' : 'w';
      if (this.chess.turn() === botColor && !this.aiTimeoutId) {
        this.scheduleAiMove();
      }
    }
  }

  handleUndo() {
    if (this.historySnapshots.length <= 1) return;

    if (this.aiTimeoutId) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }

    const undoSingle = () => {
      const undone = this.chess.undo();
      if (undone) {
        this.undoneMoves.push(undone);
        this.historySnapshots.pop();
      }
      return undone;
    };

    if (this.gameMode === 'bot') {
      // If playing vs bot and it's player's turn, undo both bot move and player move
      if (this.chess.turn() === this.playerColor && this.historySnapshots.length >= 3) {
        undoSingle();
        undoSingle();
      } else {
        undoSingle();
      }
    } else {
      undoSingle();
    }

    this.reviewIndex = this.historySnapshots.length - 1;
    this.isGameOver = false;

    if (this.clock) {
      this.clock.pause();
    }

    this.board.setPosition(this.chess.board());
    const lastSnapshot = this.historySnapshots[this.historySnapshots.length - 1];
    const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;

    this.board.setHighlights({
      selected: null,
      legalMoves: [],
      lastMove: lastSnapshot.lastMove,
      check: checkSquare
    });
    this.board.interactive = true;

    soundManager.play('move');
    this.updateUI();
    this.updateOpeningDisplay();
    this.updateEvalBar();
  }

  handleRedo() {
    if (this.undoneMoves.length === 0) return;
    const move = this.undoneMoves.pop();
    this.executeMove(move);
  }

  handleFlip() {
    if (this.board) {
      this.board.flip();
      if (this.evalBar) {
        this.evalBar.setOrientation(this.board.orientation);
      }
      this.updatePlayerStrips();
      if (this.clock) {
        this.updateClockDisplay(this.clock.getTime('w'), this.clock.getTime('b'), this.clock.activeColor);
      }
    }
  }

  /* ========================================================================
     New Game Setup Dialog
     ======================================================================== */

  promptNewGame() {
    this.openNewGameModal();
  }

  openNewGameModal() {
    const mountEl = document.getElementById('std-modals-mount');
    if (!mountEl) return;

    let selectedOpponent = this.gameMode;
    let selectedLevel = this.botLevel;
    let selectedColor = this.playerColor;
    let selectedTime = this.timeControl;

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="std-newgame-backdrop">
        <div class="chess-dialog-box new-game-modal" role="dialog" aria-modal="true" aria-labelledby="std-setup-title">
          <div class="dialog-header">
            <h3 class="dialog-title" id="std-setup-title">${i18n.t('standard.newGameSetupTitle')}</h3>
          </div>
          <div class="dialog-body">
            <!-- Opponent Selector -->
            <div class="setup-group">
              <label class="setup-label">${i18n.t('standard.opponent')}</label>
              <div class="pill-selector" id="setup-opponent-pills">
                <button type="button" class="setup-pill-btn ${selectedOpponent === 'bot' ? 'active' : ''}" data-opponent="bot">
                  ${icons.bot}
                  <span>${i18n.t('standard.playVsBot')}</span>
                </button>
                <button type="button" class="setup-pill-btn ${selectedOpponent === 'pass' ? 'active' : ''}" data-opponent="pass">
                  ${icons.user}
                  <span>${i18n.t('standard.playPassPlay')}</span>
                </button>
              </div>
            </div>

            <!-- Bot Level Selector -->
            <div class="setup-group" id="setup-level-group" style="${selectedOpponent === 'bot' ? '' : 'display: none;'}">
              <label class="setup-label">${i18n.t('standard.botLevel')}</label>
              <div class="pill-selector" id="setup-level-pills">
                <button type="button" class="setup-pill-btn ${selectedLevel === 1 ? 'active' : ''}" data-level="1">
                  ${i18n.t('standard.level1')}
                </button>
                <button type="button" class="setup-pill-btn ${selectedLevel === 2 ? 'active' : ''}" data-level="2">
                  ${i18n.t('standard.level2')}
                </button>
                <button type="button" class="setup-pill-btn ${selectedLevel === 3 ? 'active' : ''}" data-level="3">
                  ${i18n.t('standard.level3')}
                </button>
              </div>
            </div>

            <!-- Side Selection -->
            <div class="setup-group">
              <label class="setup-label">${i18n.t('standard.playAs')}</label>
              <div class="pill-selector" id="setup-color-pills">
                <button type="button" class="setup-pill-btn ${selectedColor === 'w' ? 'active' : ''}" data-color="w">
                  <span class="player-indicator white"></span>
                  <span>${i18n.t('standard.whiteColor')}</span>
                </button>
                <button type="button" class="setup-pill-btn ${selectedColor === 'random' ? 'active' : ''}" data-color="random">
                  ${icons.flip}
                  <span>${i18n.t('standard.randomColor')}</span>
                </button>
                <button type="button" class="setup-pill-btn ${selectedColor === 'b' ? 'active' : ''}" data-color="b">
                  <span class="player-indicator black"></span>
                  <span>${i18n.t('standard.blackColor')}</span>
                </button>
              </div>
            </div>

            <!-- Time Control Selector -->
            <div class="setup-group">
              <label class="setup-label">${i18n.t('standard.timeControl')}</label>
              <div class="pill-selector" id="setup-time-pills">
                <button type="button" class="setup-pill-btn ${selectedTime === 'unlimited' ? 'active' : ''}" data-time="unlimited">
                  ${i18n.t('standard.unlimited')}
                </button>
                <button type="button" class="setup-pill-btn ${selectedTime === '3+2' ? 'active' : ''}" data-time="3+2">
                  ${i18n.t('standard.blitz32')}
                </button>
                <button type="button" class="setup-pill-btn ${selectedTime === '5+0' ? 'active' : ''}" data-time="5+0">
                  ${i18n.t('standard.blitz50')}
                </button>
                <button type="button" class="setup-pill-btn ${selectedTime === '10+0' ? 'active' : ''}" data-time="10+0">
                  ${i18n.t('standard.rapid100')}
                </button>
              </div>
            </div>

            <!-- Dialog Buttons -->
            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
              <button class="btn btn-secondary" id="std-cancel-newgame" style="flex: 1;">
                ${i18n.t('standard.cancel')}
              </button>
              <button class="btn btn-primary" id="std-confirm-newgame" style="flex: 2;">
                ${i18n.t('standard.startGame')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const levelGroup = document.getElementById('setup-level-group');

    mountEl.querySelectorAll('#setup-opponent-pills .setup-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        mountEl.querySelectorAll('#setup-opponent-pills .setup-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedOpponent = btn.getAttribute('data-opponent');
        if (levelGroup) {
          levelGroup.style.display = selectedOpponent === 'bot' ? 'block' : 'none';
        }
      });
    });

    mountEl.querySelectorAll('#setup-level-pills .setup-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        mountEl.querySelectorAll('#setup-level-pills .setup-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedLevel = parseInt(btn.getAttribute('data-level'), 10);
      });
    });

    mountEl.querySelectorAll('#setup-color-pills .setup-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        mountEl.querySelectorAll('#setup-color-pills .setup-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = btn.getAttribute('data-color');
      });
    });

    mountEl.querySelectorAll('#setup-time-pills .setup-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        mountEl.querySelectorAll('#setup-time-pills .setup-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTime = btn.getAttribute('data-time');
      });
    });

    document.getElementById('std-cancel-newgame')?.addEventListener('click', () => {
      this.closeModals();
    });

    document.getElementById('std-confirm-newgame')?.addEventListener('click', () => {
      let resolvedColor = selectedColor;
      if (resolvedColor === 'random') {
        resolvedColor = Math.random() < 0.5 ? 'w' : 'b';
      }

      this.closeModals();
      this.startNewConfiguredGame({
        gameMode: selectedOpponent,
        botLevel: selectedLevel,
        playerColor: resolvedColor,
        timeControl: selectedTime
      });
    });
  }

  startNewConfiguredGame({ gameMode, botLevel, playerColor, timeControl }) {
    if (this.aiTimeoutId) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }

    this.gameMode = gameMode;
    this.botLevel = botLevel;
    this.playerColor = playerColor;
    this.timeControl = timeControl;

    this.chess.reset();
    this.historySnapshots = [
      {
        index: 0,
        fen: this.chess.fen(),
        san: '',
        lastMove: null
      }
    ];
    this.reviewIndex = 0;
    this.undoneMoves = [];
    this.isGameOver = false;
    this.gameOverReason = '';
    this.gameOverResult = '';

    const boardOrientation = this.playerColor === 'b' ? 'black' : 'white';
    if (this.board) {
      this.board.setOrientation(boardOrientation);
      this.board.setPosition(this.chess.board());
      this.board.clearHighlights();
      this.board.clearMarkedSquares();
      this.board.clearArrows();
      this.board.interactive = true;
    }

    if (this.evalBar) {
      this.evalBar.setOrientation(boardOrientation);
      this.evalBar.update(0);
    }

    this.initClock();
    this.syncQuickPanelUI();
    this.updateUI();
    this.updateOpeningDisplay();

    // If bot game and player is Black, Bot (White) makes move 1!
    if (this.gameMode === 'bot' && this.playerColor === 'b') {
      this.scheduleAiMove();
    }
  }

  resetGame() {
    this.startNewConfiguredGame({
      gameMode: this.gameMode,
      botLevel: this.botLevel,
      playerColor: this.playerColor,
      timeControl: this.timeControl
    });
  }

  promptResign() {
    if (this.isGameOver) return;
    if (!window.confirm(i18n.t('standard.confirmResign'))) return;

    const resigningColor = this.chess.turn();
    const winner = resigningColor === 'w' ? 'Black' : 'White';
    const loserText = resigningColor === 'w' ? 'White' : 'Black';
    const winnerText = winner === 'White' ? i18n.t('standard.whiteWon') : i18n.t('standard.blackWon');

    this.endGame({
      result: winner === 'White' ? '1 - 0' : '0 - 1',
      title: `${winnerText}!`,
      reason: `${loserText} ${i18n.t('standard.resigned')}`
    });
  }

  promptDrawOffer() {
    if (this.isGameOver) return;

    // If vs Bot, AI evaluates position before agreeing to draw
    if (this.gameMode === 'bot') {
      const evalScore = evaluateBoard(this.chess);
      const isBotWhite = this.playerColor === 'b';
      const botScore = isBotWhite ? evalScore : -evalScore;

      // Bot accepts draw if position is balanced (|score| < 150)
      if (Math.abs(botScore) < 150) {
        this.endGame({
          result: '½ - ½',
          title: i18n.t('standard.draw'),
          reason: i18n.t('standard.drawAgreed')
        });
      } else {
        this.showToast(isBotWhite && botScore > 150 ? 'Máy từ chối xin hòa (Đang có ưu thế)' : 'Máy từ chối hòa!');
      }
      return;
    }

    if (!window.confirm(i18n.t('standard.confirmDraw'))) return;

    this.endGame({
      result: '½ - ½',
      title: i18n.t('standard.draw'),
      reason: i18n.t('standard.drawAgreed')
    });
  }

  /* ========================================================================
     PGN / FEN Import and Export Modal
     ======================================================================== */

  openPgnFenModal() {
    const mountEl = document.getElementById('std-modals-mount');
    if (!mountEl) return;

    const currentFen = this.chess.fen();
    const currentPgn = this.chess.pgn();

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="std-pgnfen-backdrop">
        <div class="chess-dialog-box" style="max-width: 500px;" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <h3 class="dialog-title" style="display: flex; align-items: center; gap: 0.5rem;">
              ${icons.pgn} ${i18n.t('standard.pgnFen')}
            </h3>
            <p class="dialog-subtitle">Import or export board positions and game notation</p>
          </div>

          <div class="dialog-body">
            <div class="pgnfen-tabs">
              <button class="pgnfen-tab active" id="tab-fen-btn">FEN</button>
              <button class="pgnfen-tab" id="tab-pgn-btn">PGN</button>
            </div>

            <!-- FEN Tab Panel -->
            <div id="panel-fen">
              <div class="pgnfen-input-group">
                <label class="pgnfen-label">${i18n.t('standard.fenLabel')}</label>
                <textarea class="pgnfen-textarea" id="std-fen-text" readonly rows="2">${currentFen}</textarea>
                <button class="btn btn-secondary" id="std-btn-copy-fen" style="margin-top: 0.4rem; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  ${icons.copy} <span>${i18n.t('standard.copyFen')}</span>
                </button>
              </div>

              <div class="pgnfen-input-group" style="margin-top: 1rem;">
                <label class="pgnfen-label">${i18n.t('standard.loadFen')}</label>
                <input type="text" class="toolbar-select" id="std-fen-input" placeholder="${i18n.t('standard.pasteFenPlaceholder')}" style="width: 100%; box-sizing: border-box;" />
                <button class="btn btn-primary" id="std-btn-load-fen" style="margin-top: 0.4rem; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  ${icons.save} <span>${i18n.t('standard.loadFen')}</span>
                </button>
              </div>
            </div>

            <!-- PGN Tab Panel -->
            <div id="panel-pgn" style="display: none;">
              <div class="pgnfen-input-group">
                <label class="pgnfen-label">${i18n.t('standard.pgnLabel')}</label>
                <textarea class="pgnfen-textarea" id="std-pgn-text" readonly rows="4">${currentPgn || '1. ...'}</textarea>
                <button class="btn btn-secondary" id="std-btn-copy-pgn" style="margin-top: 0.4rem; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  ${icons.copy} <span>${i18n.t('standard.copyPgn')}</span>
                </button>
              </div>

              <div class="pgnfen-input-group" style="margin-top: 1rem;">
                <label class="pgnfen-label">${i18n.t('standard.loadPgn')}</label>
                <textarea class="pgnfen-textarea" id="std-pgn-input" placeholder="${i18n.t('standard.pastePgnPlaceholder')}" rows="3"></textarea>
                <button class="btn btn-primary" id="std-btn-load-pgn" style="margin-top: 0.4rem; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  ${icons.save} <span>${i18n.t('standard.loadPgn')}</span>
                </button>
              </div>
            </div>

            <div id="std-pgnfen-feedback"></div>

            <button class="btn btn-secondary" id="std-btn-close-pgnfen" style="margin-top: 1rem; width: 100%;">
              ${i18n.t('standard.close')}
            </button>
          </div>
        </div>
      </div>
    `;

    // Tab switching
    const tabFen = document.getElementById('tab-fen-btn');
    const tabPgn = document.getElementById('tab-pgn-btn');
    const panelFen = document.getElementById('panel-fen');
    const panelPgn = document.getElementById('panel-pgn');

    tabFen?.addEventListener('click', () => {
      tabFen.classList.add('active');
      tabPgn?.classList.remove('active');
      panelFen.style.display = 'block';
      panelPgn.style.display = 'none';
    });

    tabPgn?.addEventListener('click', () => {
      tabPgn.classList.add('active');
      tabFen?.classList.remove('active');
      panelPgn.style.display = 'block';
      panelFen.style.display = 'none';
    });

    // Copy FEN
    document.getElementById('std-btn-copy-fen')?.addEventListener('click', () => {
      this.copyToClipboard(currentFen, i18n.t('standard.copied'));
    });

    // Copy PGN
    document.getElementById('std-btn-copy-pgn')?.addEventListener('click', () => {
      this.copyToClipboard(currentPgn || '', i18n.t('standard.copied'));
    });

    // Load FEN
    document.getElementById('std-btn-load-fen')?.addEventListener('click', () => {
      const fenVal = document.getElementById('std-fen-input')?.value.trim();
      if (!fenVal) return;

      try {
        const test = new Chess();
        test.load(fenVal);

        // Valid FEN: apply to game
        this.chess.load(fenVal);
        this.historySnapshots = [
          {
            index: 0,
            fen: this.chess.fen(),
            san: '',
            lastMove: null
          }
        ];
        this.reviewIndex = 0;
        this.undoneMoves = [];
        this.isGameOver = false;

        this.board.setPosition(this.chess.board());
        this.board.clearHighlights();
        this.updateUI();
        this.updateOpeningDisplay();
        this.updateEvalBar();
        this.closeModals();
        this.showToast('FEN loaded successfully!');
      } catch (e) {
        this.showModalFeedback(i18n.t('standard.invalidFen'), true);
      }
    });

    // Load PGN
    document.getElementById('std-btn-load-pgn')?.addEventListener('click', () => {
      const pgnVal = document.getElementById('std-pgn-input')?.value.trim();
      if (!pgnVal) return;

      try {
        const test = new Chess();
        test.loadPgn(pgnVal);

        // Valid PGN: load moves
        this.chess.loadPgn(pgnVal);
        const historyVerbose = this.chess.history({ verbose: true });

        // Rebuild snapshots
        const rebuildGame = new Chess();
        this.historySnapshots = [
          {
            index: 0,
            fen: rebuildGame.fen(),
            san: '',
            lastMove: null
          }
        ];

        for (let i = 0; i < historyVerbose.length; i++) {
          const m = historyVerbose[i];
          rebuildGame.move(m);
          this.historySnapshots.push({
            index: i + 1,
            fen: rebuildGame.fen(),
            san: m.san,
            lastMove: { from: m.from, to: m.to }
          });
        }

        this.reviewIndex = this.historySnapshots.length - 1;
        this.undoneMoves = [];
        this.isGameOver = false;

        this.board.setPosition(this.chess.board());
        const lastSnapshot = this.historySnapshots[this.historySnapshots.length - 1];
        const checkSquare = this.chess.isCheck() ? this.findKingSquare(this.chess.turn()) : null;
        this.board.setHighlights({
          selected: null,
          legalMoves: [],
          lastMove: lastSnapshot.lastMove,
          check: checkSquare
        });

        this.updateUI();
        this.updateOpeningDisplay();
        this.updateEvalBar();
        this.closeModals();
        this.showToast('PGN loaded successfully!');
      } catch (e) {
        this.showModalFeedback(i18n.t('standard.invalidPgn'), true);
      }
    });

    // Close
    document.getElementById('std-btn-close-pgnfen')?.addEventListener('click', () => {
      this.closeModals();
    });
  }

  showModalFeedback(msg, isError = false) {
    const fb = document.getElementById('std-pgnfen-feedback');
    if (fb) {
      fb.className = isError ? 'pgnfen-error' : 'pgnfen-success';
      fb.textContent = msg;
    }
  }

  copyToClipboard(text, successMsg) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(successMsg);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      this.showToast(successMsg);
    }
  }

  showToast(msg) {
    if (typeof document === 'undefined' || !document.body) return;
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2500);
  }

  closeModals() {
    const mountEl = document.getElementById('std-modals-mount');
    if (mountEl) {
      mountEl.innerHTML = '';
    }
  }

  /* ========================================================================
     UI Sync & Update Helpers
     ======================================================================== */

  updateUI() {
    this.updateTurnBadge();
    this.updatePlayerStrips();
    this.updateMoveListTable();
    this.updateNavigationState();
  }

  updateTurnBadge() {
    const badge = document.getElementById('std-turn-badge');
    const textEl = document.getElementById('std-turn-text');
    if (!badge || !textEl) return;

    badge.className = 'game-status-badge';

    if (this.isGameOver) {
      badge.classList.add('game-over');
      textEl.textContent = this.gameOverResult || i18n.t('standard.gameOver');
      return;
    }

    const activeChess = this.isLive()
      ? this.chess
      : new Chess(this.historySnapshots[this.reviewIndex].fen);

    const isWhite = activeChess.turn() === 'w';
    const isCheck = activeChess.isCheck();

    if (isCheck) {
      badge.classList.add('in-check');
      textEl.textContent = `${i18n.t('standard.check')} (${isWhite ? i18n.t('standard.whiteTurn') : i18n.t('standard.blackTurn')})`;
    } else {
      textEl.textContent = isWhite ? i18n.t('standard.whiteTurn') : i18n.t('standard.blackTurn');
    }

    const indicator = badge.querySelector('.player-indicator');
    if (indicator) {
      indicator.className = `player-indicator ${isWhite ? 'white' : 'black'}`;
    }
  }

  updateStatus() {
    this.updateTurnBadge();
  }

  updatePlayerStrips() {
    const isWhiteOrientation = !this.board || this.board.orientation === 'white';

    const topStrip = document.getElementById('std-top-player-strip');
    const bottomStrip = document.getElementById('std-bottom-player-strip');
    const topIndicator = document.getElementById('std-top-player-indicator');
    const bottomIndicator = document.getElementById('std-bottom-player-indicator');
    const topLabel = document.getElementById('std-top-player-label');
    const bottomLabel = document.getElementById('std-bottom-player-label');

    const topColor = isWhiteOrientation ? 'black' : 'white';
    const bottomColor = isWhiteOrientation ? 'white' : 'black';

    if (topIndicator) topIndicator.className = `player-indicator ${topColor}`;
    if (bottomIndicator) bottomIndicator.className = `player-indicator ${bottomColor}`;

    let topName = topColor === 'white' ? 'White' : 'Black';
    let bottomName = bottomColor === 'white' ? 'White' : 'Black';

    if (this.gameMode === 'bot') {
      const userColorCode = this.playerColor === 'w' ? 'white' : 'black';
      const youStr = i18n.t('standard.you') || 'Bạn';
      const levelLabel = this.getBotLevelLabel();
      const botStr = `${i18n.t('standard.bot') || 'Máy'} (${levelLabel})`;

      if (topColor === userColorCode) {
        topName = youStr;
        bottomName = botStr;
      } else {
        topName = botStr;
        bottomName = youStr;
      }
    }

    if (topLabel) topLabel.textContent = topName;
    if (bottomLabel) bottomLabel.textContent = bottomName;

    const currentTurn = this.chess.turn() === 'w' ? 'white' : 'black';
    if (topStrip) topStrip.classList.toggle('active', topColor === currentTurn && !this.isGameOver);
    if (bottomStrip) bottomStrip.classList.toggle('active', bottomColor === currentTurn && !this.isGameOver);
  }

  getBotLevelLabel() {
    if (this.botLevel === 1) return i18n.t('standard.level1') || 'Tập sự';
    if (this.botLevel === 2) return i18n.t('standard.level2') || 'Trung bình';
    return i18n.t('standard.level3') || 'Cao thủ';
  }

  updateMoveListTable() {
    const emptyEl = document.getElementById('std-empty-moves');
    const tableEl = document.getElementById('std-move-list-table');
    const tbody = document.getElementById('std-move-list-body');
    const countEl = document.getElementById('std-move-count');
    const scrollEl = document.getElementById('std-move-list-scroll');

    const totalMoves = this.historySnapshots.length - 1;

    if (countEl) {
      countEl.textContent = `${totalMoves} ${totalMoves === 1 ? 'ply' : 'plies'}`;
    }

    if (totalMoves === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (tableEl) tableEl.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'table';
    if (!tbody) return;

    tbody.innerHTML = '';

    // Group snapshots into move pairs (White and Black)
    for (let i = 1; i <= totalMoves; i += 2) {
      const moveNumber = Math.ceil(i / 2);
      const whiteSnapshot = this.historySnapshots[i];
      const blackSnapshot = this.historySnapshots[i + 1] || null;

      const tr = document.createElement('tr');
      tr.className = 'move-row';

      // Move number column
      const tdNum = document.createElement('td');
      tdNum.className = 'move-number';
      tdNum.textContent = `${moveNumber}.`;
      tr.appendChild(tdNum);

      // White move column
      const tdWhite = document.createElement('td');
      tdWhite.className = 'move-cell';
      const btnWhite = document.createElement('button');
      btnWhite.className = `move-chip ${this.reviewIndex === i ? 'active' : ''}`;
      btnWhite.textContent = whiteSnapshot.san;
      btnWhite.addEventListener('click', () => this.jumpToHistory(i));
      tdWhite.appendChild(btnWhite);
      tr.appendChild(tdWhite);

      // Black move column
      const tdBlack = document.createElement('td');
      tdBlack.className = 'move-cell';
      if (blackSnapshot) {
        const btnBlack = document.createElement('button');
        btnBlack.className = `move-chip ${this.reviewIndex === i + 1 ? 'active' : ''}`;
        btnBlack.textContent = blackSnapshot.san;
        btnBlack.addEventListener('click', () => this.jumpToHistory(i + 1));
        tdBlack.appendChild(btnBlack);
      }
      tr.appendChild(tdBlack);

      tbody.appendChild(tr);
    }

    // Auto-scroll to active or latest move
    if (scrollEl) {
      const activeBtn = scrollEl.querySelector('.move-chip.active');
      if (activeBtn) {
        activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    }
  }

  updateNavigationState() {
    const isLive = this.isLive();
    const totalSnapshots = this.historySnapshots.length;

    const btnFirst = document.getElementById('std-nav-first');
    const btnPrev = document.getElementById('std-nav-prev');
    const btnNext = document.getElementById('std-nav-next');
    const btnLast = document.getElementById('std-nav-last');
    const btnUndo = document.getElementById('std-btn-undo');
    const btnRedo = document.getElementById('std-btn-redo');
    const reviewNotice = document.getElementById('std-review-notice');

    if (btnFirst) btnFirst.disabled = this.reviewIndex === 0;
    if (btnPrev) btnPrev.disabled = this.reviewIndex === 0;
    if (btnNext) btnNext.disabled = isLive;
    if (btnLast) btnLast.disabled = isLive;

    if (btnUndo) btnUndo.disabled = totalSnapshots <= 1;
    if (btnRedo) btnRedo.disabled = this.undoneMoves.length === 0;

    if (reviewNotice) {
      reviewNotice.style.display = isLive ? 'none' : 'flex';
      const reviewText = document.getElementById('std-review-text');
      if (reviewText) {
        reviewText.textContent = `${i18n.t('standard.reviewing')} #${this.reviewIndex} of ${totalSnapshots - 1}`;
      }
    }
  }

  findKingSquare(color, chessInstance = this.chess) {
    const board = chessInstance.board();
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

// Module export for mounting standard mode
let activeGame = null;

export function initStandardMode(container) {
  if (activeGame) {
    activeGame.destroy();
  }
  activeGame = new StandardChessGame(container);
  activeGame.mount();
  return activeGame;
}
