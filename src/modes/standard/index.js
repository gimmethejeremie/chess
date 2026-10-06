/**
 * Mode 1: Standard Chess (Rule-enforced)
 * Full legal chess implementation using chess.js and shared BoardRenderer.
 * Features:
 * - Castling, en passant, promotion with piece-choice dialog
 * - Check, checkmate, stalemate, 3-fold repetition, 50-move rule, insufficient material
 * - Click-to-move & drag-and-drop with legal hints and sound effects
 * - SAN move list with review mode (click move to inspect past position)
 * - Navigation: |<<, <, >, >>, Undo, Redo
 * - Actions: New Game, Flip, Resign, Offer Draw
 * - PGN / FEN Import and Export
 * - Game-Over Dialog with result and reason
 */

import { Chess } from 'chess.js';
import { BoardRenderer } from '../../core/board/index.js';
import { BoardToolbar } from '../../core/board/boardToolbar.js';
import { icons } from '../../core/icons/index.js';
import { soundManager } from '../../core/sounds/index.js';
import { store } from '../../core/store/index.js';
import { i18n } from '../../core/i18n/index.js';
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
    this.keyHandler = null;

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

    // Active unsubscriber
    this.storeUnsub = null;
    this.i18nUnsub = null;
  }

  mount() {
    this.renderLayout();
    this.initBoard();
    this.updateUI();

    // Mount BoardToolbar
    const toolbarMount = document.getElementById('std-board-toolbar');
    if (toolbarMount && this.board) {
      this.boardToolbar = new BoardToolbar(toolbarMount, {
        board: this.board,
        showFlip: true,
        showThemes: true,
        showCoords: true,
        showZen: true
      });
    }

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
  }

  destroy() {
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
    const backBtn = document.getElementById('std-back-home');
    if (backBtn) {
      backBtn.title = i18n.t('standard.back');
      backBtn.innerHTML = `${icons.back}<span>${i18n.t('standard.back')}</span>`;
    }
    const titleEl = document.querySelector('.standard-mode-title');
    if (titleEl) titleEl.textContent = i18n.t('standard.title');

    this.updateStatus();

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

    const flipBtn = document.getElementById('std-action-flip');
    if (flipBtn) flipBtn.innerHTML = `${icons.flip}<span>${i18n.t('standard.flip')}</span>`;

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
          <div class="game-status-badge" id="std-turn-badge">
            <span class="player-indicator white"></span>
            <span id="std-turn-text">${i18n.t('standard.whiteTurn')}</span>
          </div>
        </header>

        <!-- Main Game Layout (Board + Side Panel) -->
        <div class="standard-game-layout">
          <!-- Board Column -->
          <div class="standard-board-area">
            <!-- Top Player Strip (Opponent / Black by default) -->
            <div class="player-strip" id="std-top-player-strip">
              <div class="player-tag">
                <span class="player-indicator black" id="std-top-player-indicator"></span>
                <span id="std-top-player-label">Black</span>
              </div>
            </div>

            <!-- Board Mount Target -->
            <div id="std-board-mount" style="width: 100%;"></div>

            <!-- Bottom Player Strip (Self / White by default) -->
            <div class="player-strip active" id="std-bottom-player-strip">
              <div class="player-tag">
                <span class="player-indicator white" id="std-bottom-player-indicator"></span>
                <span id="std-bottom-player-label">White</span>
              </div>
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
            <div class="side-panel-header">
              <span class="side-panel-title">${i18n.t('standard.moves')}</span>
              <span id="std-move-count" style="font-weight: 500; font-size: 0.8rem; color: var(--text-secondary);">0 moves</span>
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
              <div class="history-undo-group" role="group" aria-label="Undo and Redo">
                <button class="nav-btn" id="std-btn-undo" title="${i18n.t('standard.undo')}" aria-label="${i18n.t('standard.undo')}">${icons.undo}<span>${i18n.t('standard.undo')}</span></button>
                <button class="nav-btn" id="std-btn-redo" title="${i18n.t('standard.redo')}" aria-label="${i18n.t('standard.redo')}">${icons.redo}<span>${i18n.t('standard.redo')}</span></button>
              </div>
            </div>

            <!-- Game Actions Toolbar -->
            <div class="game-actions-panel">
              <button class="action-btn" id="std-action-new">${icons.reset}<span>${i18n.t('standard.newGame')}</span></button>
              <button class="action-btn" id="std-action-flip">${icons.flip}<span>${i18n.t('standard.flip')}</span></button>
              <button class="action-btn" id="std-action-draw">${icons.handshake}<span>${i18n.t('standard.offerDraw')}</span></button>
              <button class="action-btn danger" id="std-action-resign">${icons.flag}<span>${i18n.t('standard.resign')}</span></button>
              <button class="action-btn" id="std-action-pgn" style="grid-column: span 2;">${icons.pgn}<span>${i18n.t('standard.pgnFen')}</span></button>
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

    this.board = new BoardRenderer(mountEl, {
      position: this.chess.board(),
      orientation: 'white',
      pieceSet: state.pieceSet,
      boardTheme: state.boardTheme,
      showCoordinates: state.showCoordinates,
      interactive: true,

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
        store.setMode(null);
      });
    }

    // Keyboard navigation (Arrow keys)
    this.keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.jumpToHistory(this.reviewIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.jumpToHistory(this.reviewIndex + 1);
      }
    };
    window.addEventListener('keydown', this.keyHandler);

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
    document.getElementById('std-action-flip')?.addEventListener('click', () => this.handleFlip());
    document.getElementById('std-action-resign')?.addEventListener('click', () => this.promptResign());
    document.getElementById('std-action-draw')?.addEventListener('click', () => this.promptDrawOffer());
    document.getElementById('std-action-pgn')?.addEventListener('click', () => this.openPgnFenModal());
  }

  /* ========================================================================
     Move Handling & Legal Moves
     ======================================================================== */

  isLive() {
    return this.reviewIndex === this.historySnapshots.length - 1;
  }

  handleSquareClick(square, piece) {
    if (this.isGameOver) return;

    // If reviewing past position, jump back to live position first
    if (!this.isLive()) {
      this.jumpToHistory(this.historySnapshots.length - 1);
    }

    const currentTurn = this.chess.turn();
    const pieceColor = piece ? piece.charAt(0) : null;

    // If clicking friendly piece -> select and show legal moves
    if (pieceColor === currentTurn) {
      this.selectSquare(square);
    } else if (this.board.highlights.selected) {
      // If a friendly piece was already selected -> attempt move to clicked square
      const fromSquare = this.board.highlights.selected;
      this.attemptMove(fromSquare, square);
    }
  }

  handleDragStart(square, piece) {
    if (this.isGameOver) return;

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

      // Clear redo stack on new user move
      this.undoneMoves = [];

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

      this.updateUI();
      this.checkGameEndConditions();
    } catch (err) {
      console.warn('[StandardGame] Move failed:', err);
      this.board.clearHighlights();
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
            <h3 class="dialog-title" id="std-promote-title">👑 ${i18n.t('standard.promoteTitle')}</h3>
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
      btn.addEventListener('click', (e) => {
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

    soundManager.play('game-end');
    this.openGameOverDialog({ result, title, reason });
  }

  openGameOverDialog({ result, title, reason }) {
    const mountEl = document.getElementById('std-modals-mount');
    if (!mountEl) return;

    mountEl.innerHTML = `
      <div class="chess-modal-backdrop" id="std-gameover-backdrop">
        <div class="chess-dialog-box" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <h3 class="dialog-title">🏁 ${i18n.t('standard.gameOver')}</h3>
            <span class="gameover-result-badge">${result}</span>
            <p class="gameover-reason">${title}<br /><span style="font-size: 0.9rem; font-weight: normal; color: var(--text-secondary);">${reason}</span></p>
          </div>
          <div class="dialog-body" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button class="btn btn-primary" id="std-btn-new-game-dialog">
              ↺ ${i18n.t('standard.newGame')}
            </button>
            <button class="btn btn-secondary" id="std-btn-review-board-dialog">
              👀 ${i18n.t('standard.close')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('std-btn-new-game-dialog')?.addEventListener('click', () => {
      this.closeModals();
      this.resetGame();
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

    // Highlight review state
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
    this.board.interactive = isLive && !this.isGameOver;

    this.updateUI();
  }

  handleUndo() {
    if (this.historySnapshots.length <= 1) return;

    // Undo from chess.js
    const undone = this.chess.undo();
    if (undone) {
      this.undoneMoves.push(undone);
      this.historySnapshots.pop();
      this.reviewIndex = this.historySnapshots.length - 1;
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
      this.board.interactive = true;

      soundManager.play('move');
      this.updateUI();
    }
  }

  handleRedo() {
    if (this.undoneMoves.length === 0) return;
    const move = this.undoneMoves.pop();
    this.executeMove(move);
  }

  handleFlip() {
    if (this.board) {
      this.board.flip();
      this.updatePlayerStrips();
    }
  }

  promptNewGame() {
    if (this.historySnapshots.length > 1 && !this.isGameOver) {
      if (!window.confirm(i18n.t('standard.confirmNewGame'))) {
        return;
      }
    }
    this.resetGame();
  }

  resetGame() {
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

    if (this.board) {
      this.board.setPosition(this.chess.board());
      this.board.clearHighlights();
      this.board.clearMarkedSquares();
      this.board.interactive = true;
    }

    this.updateUI();
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
            <h3 class="dialog-title">♟️ ${i18n.t('standard.pgnFen')}</h3>
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
                <button class="btn btn-secondary" id="std-btn-copy-fen" style="margin-top: 0.4rem; width: 100%;">
                  📋 ${i18n.t('standard.copyFen')}
                </button>
              </div>

              <div class="pgnfen-input-group" style="margin-top: 1rem;">
                <label class="pgnfen-label">${i18n.t('standard.loadFen')}</label>
                <input type="text" class="toolbar-select" id="std-fen-input" placeholder="${i18n.t('standard.pasteFenPlaceholder')}" style="width: 100%; box-sizing: border-box;" />
                <button class="btn btn-primary" id="std-btn-load-fen" style="margin-top: 0.4rem; width: 100%;">
                  📥 ${i18n.t('standard.loadFen')}
                </button>
              </div>
            </div>

            <!-- PGN Tab Panel -->
            <div id="panel-pgn" style="display: none;">
              <div class="pgnfen-input-group">
                <label class="pgnfen-label">${i18n.t('standard.pgnLabel')}</label>
                <textarea class="pgnfen-textarea" id="std-pgn-text" readonly rows="4">${currentPgn || '1. ...'}</textarea>
                <button class="btn btn-secondary" id="std-btn-copy-pgn" style="margin-top: 0.4rem; width: 100%;">
                  📋 ${i18n.t('standard.copyPgn')}
                </button>
              </div>

              <div class="pgnfen-input-group" style="margin-top: 1rem;">
                <label class="pgnfen-label">${i18n.t('standard.loadPgn')}</label>
                <textarea class="pgnfen-textarea" id="std-pgn-input" placeholder="${i18n.t('standard.pastePgnPlaceholder')}" rows="3"></textarea>
                <button class="btn btn-primary" id="std-btn-load-pgn" style="margin-top: 0.4rem; width: 100%;">
                  📥 ${i18n.t('standard.loadPgn')}
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
      // Fallback
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
    if (topLabel) topLabel.textContent = isWhiteOrientation ? 'Black' : 'White';
    if (bottomLabel) bottomLabel.textContent = isWhiteOrientation ? 'White' : 'Black';

    const currentTurn = this.chess.turn() === 'w' ? 'white' : 'black';
    if (topStrip) topStrip.classList.toggle('active', topColor === currentTurn);
    if (bottomStrip) bottomStrip.classList.toggle('active', bottomColor === currentTurn);
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
