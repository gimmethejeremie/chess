/**
 * Mode 2: Sandbox Mode (Free Manual Board & Board Editor)
 * Features:
 * - Empty board or standard position toggle
 * - Piece palette with all 12 pieces (drag or click-to-place)
 * - Free drag to ANY square, no legality checks
 * - Replace on drop, delete piece by dragging off-board, long-press, or eraser tool
 * - Clear board (with confirm) & Reset to start position
 * - Side to move, castling rights, en passant square controls
 * - Live FEN generation, copy to clipboard, and FEN loader
 * - Complete Undo / Redo for every modification
 * - Save & load named custom positions in localStorage
 * - Right-click drag to draw arrows and highlight squares
 * - Board flip & coordinates toggle
 */

import { BoardRenderer } from '../../core/board/index.js';
import { BoardToolbar } from '../../core/board/boardToolbar.js';
import { icons } from '../../core/icons/index.js';
import { soundManager } from '../../core/sounds/index.js';
import { store } from '../../core/store/index.js';
import { router } from '../../core/router/index.js';
import { storage } from '../../core/storage/index.js';
import { i18n } from '../../core/i18n/index.js';
import {
  STARTING_FEN,
  EMPTY_FEN,
  positionToFen,
  fenToPosition,
  isValidFen
} from './fenHelper.js';
import './sandbox.css';

const BASE_URL = import.meta.env?.BASE_URL || '/';
const SAVED_POSITIONS_KEY = 'sandbox_saved_positions';

const PALETTE_PIECES = {
  white: ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP'],
  black: ['bK', 'bQ', 'bR', 'bB', 'bN', 'bP']
};

export class SandboxGame {
  /**
   * @param {HTMLElement} container Mount target
   */
  constructor(container) {
    this.container = container;
    this.board = null;
    this.boardToolbar = null;

    // Board position Map: square -> 'wP'
    this.position = new Map();

    // Attributes for FEN
    this.turn = 'w';
    this.castling = { K: true, Q: true, k: true, q: true };
    this.enPassant = '-';
    this.halfmove = 0;
    this.fullmove = 1;

    // Active palette tool: null | 'eraser' | 'arrow' | 'wP' | 'bK' etc.
    this.activeTool = null;

    // Undo / Redo history snapshots
    this.history = [];
    this.historyIndex = -1;

    // Saved positions from localStorage
    this.savedPositions = storage.get(SAVED_POSITIONS_KEY, []);

    // Active store unsubscribe listener
    this.storeUnsub = null;
    this.i18nUnsub = null;

    // Initialize with standard starting position
    this.loadFenInternal(STARTING_FEN, false);
  }

  mount() {
    this.renderLayout();
    this.initBoard();
    this.attachDomEvents();
    this.pushSnapshot();
    this.updateUI();

    // Mount BoardToolbar
    const toolbarMount = document.getElementById('sb-board-toolbar');
    if (toolbarMount && this.board) {
      this.boardToolbar = new BoardToolbar(toolbarMount, {
        board: this.board,
        showFlip: true,
        showThemes: true,
        showCoords: true,
        showReset: false,
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
      const coordsBtn = document.getElementById('sb-btn-coords');
      if (coordsBtn) {
        coordsBtn.classList.toggle('active', state.showCoordinates);
      }
      this.renderPaletteIcons();
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
    const backBtn = document.getElementById('sb-back-home');
    if (backBtn) {
      backBtn.title = i18n.t('sandbox.back');
      backBtn.innerHTML = `${icons.back}<span>${i18n.t('sandbox.back')}</span>`;
    }
    const titleEl = document.querySelector('.sandbox-title');
    if (titleEl) titleEl.textContent = i18n.t('sandbox.title');

    const undoBtn = document.getElementById('sb-btn-undo');
    if (undoBtn) {
      undoBtn.title = i18n.t('sandbox.undo');
      undoBtn.innerHTML = `${icons.undo}<span>${i18n.t('sandbox.undo')}</span>`;
    }
    const redoBtn = document.getElementById('sb-btn-redo');
    if (redoBtn) {
      redoBtn.title = i18n.t('sandbox.redo');
      redoBtn.innerHTML = `${icons.redo}<span>${i18n.t('sandbox.redo')}</span>`;
    }
    const clearBtn = document.getElementById('sb-btn-clear');
    if (clearBtn) {
      clearBtn.title = i18n.t('sandbox.clear');
      clearBtn.innerHTML = `${icons.clearTrash}<span>${i18n.t('sandbox.clear')}</span>`;
    }
    const resetBtn = document.getElementById('sb-btn-reset-start');
    if (resetBtn) {
      resetBtn.title = i18n.t('sandbox.startingPos');
      resetBtn.innerHTML = `${icons.chessKnight}<span>${i18n.t('sandbox.startingPos')}</span>`;
    }
    const flipBtn = document.getElementById('sb-btn-flip');
    if (flipBtn) {
      flipBtn.title = i18n.t('standard.flip');
      flipBtn.innerHTML = `${icons.flip}<span>${i18n.t('demo.flip') || 'Xoay bàn'}</span>`;
    }
    const coordsBtn = document.getElementById('sb-btn-coords');
    if (coordsBtn) {
      coordsBtn.title = i18n.t('demo.coords') || 'Tọa độ';
      coordsBtn.innerHTML = `${icons.coords}<span>${i18n.t('demo.coords') || 'Tọa độ'}</span>`;
    }
    const eraserBtn = document.getElementById('tool-eraser');
    if (eraserBtn) {
      eraserBtn.title = i18n.t('sandbox.eraser');
      eraserBtn.innerHTML = `${icons.eraser}<span class="btn-label">${i18n.t('sandbox.eraser')}</span>`;
    }
    const drawBtn = document.getElementById('tool-arrow');
    if (drawBtn) {
      drawBtn.title = i18n.t('sandbox.drawMode');
      drawBtn.innerHTML = `${icons.arrowTool}<span class="btn-label">${i18n.t('sandbox.drawMode')}</span>`;
    }
    const clearArrowsBtn = document.getElementById('tool-clear-arrows');
    if (clearArrowsBtn) {
      clearArrowsBtn.title = i18n.t('sandbox.clearAnnotations');
      clearArrowsBtn.innerHTML = `${icons.clearTrash}<span class="btn-label">${i18n.t('sandbox.clearAnnotations')}</span>`;
    }
    const copyFenBtn = document.getElementById('sb-btn-copy-fen');
    if (copyFenBtn) copyFenBtn.innerHTML = `${icons.copy}<span>${i18n.t('sandbox.copyFen')}</span>`;
    const loadFenBtn = document.getElementById('sb-btn-load-fen');
    if (loadFenBtn) loadFenBtn.innerHTML = `${icons.folderOpen}<span>${i18n.t('sandbox.loadFen')}</span>`;
    const saveBtn = document.getElementById('sb-btn-save-pos');
    if (saveBtn) saveBtn.innerHTML = `${icons.save}<span>${i18n.t('sandbox.saveBtn')}</span>`;

    this.renderSavedPositions();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="sandbox-container">
        <!-- Header -->
        <header class="sandbox-header">
          <div class="sandbox-header-left">
            <button class="mode-back-btn" id="sb-back-home" title="${i18n.t('sandbox.back')}">
              ${icons.back}
              <span>${i18n.t('sandbox.back')}</span>
            </button>
            <h2 class="sandbox-title">${i18n.t('sandbox.title')}</h2>
            <span class="sandbox-badge">Free Play / Editor</span>
          </div>

          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary" id="sb-btn-undo" title="${i18n.t('sandbox.undo')}">
              ${icons.undo}
              <span>${i18n.t('sandbox.undo')}</span>
            </button>
            <button class="btn btn-secondary" id="sb-btn-redo" title="${i18n.t('sandbox.redo')}">
              ${icons.redo}
              <span>${i18n.t('sandbox.redo')}</span>
            </button>
          </div>
        </header>

        <!-- Main Layout -->
        <div class="sandbox-layout">
          <!-- Left/Center Play Area: Palette + Board + Actions -->
          <div class="sandbox-play-area">
            <!-- Piece Palette Card -->
            <div class="piece-palette-card">
              <!-- Black pieces row -->
              <div class="palette-row" id="palette-black-row">
                ${PALETTE_PIECES.black
                  .map(
                    (p) => `
                  <div class="palette-item" data-piece="${p}" title="${p}">
                    <img src="${BASE_URL}assets/pieces/${store.getState().pieceSet}/${p}.svg" class="palette-img" alt="${p}" />
                  </div>
                `
                  )
                  .join('')}
              </div>

              <!-- White pieces row -->
              <div class="palette-row" id="palette-white-row">
                ${PALETTE_PIECES.white
                  .map(
                    (p) => `
                  <div class="palette-item" data-piece="${p}" title="${p}">
                    <img src="${BASE_URL}assets/pieces/${store.getState().pieceSet}/${p}.svg" class="palette-img" alt="${p}" />
                  </div>
                `
                  )
                  .join('')}
              </div>

              <!-- Palette Tools (Eraser & Arrow drawing mode) -->
              <div class="palette-tools-row">
                <button class="tool-chip-btn danger" id="tool-eraser" title="${i18n.t('sandbox.eraser')}">
                  ${icons.eraser}
                  <span class="btn-label">${i18n.t('sandbox.eraser')}</span>
                </button>
                <button class="tool-chip-btn" id="tool-arrow" title="${i18n.t('sandbox.drawMode')}">
                  ${icons.arrowTool}
                  <span class="btn-label">${i18n.t('sandbox.drawMode')}</span>
                </button>
                <button class="tool-chip-btn" id="tool-clear-arrows" title="${i18n.t('sandbox.clearAnnotations')}">
                  ${icons.clearTrash}
                  <span class="btn-label">${i18n.t('sandbox.clearAnnotations')}</span>
                </button>
              </div>
            </div>

            <!-- Board Mount -->
            <div id="sb-board-mount" style="width: 100%;"></div>

            <!-- Reactive Board Control Bar -->
            <div id="sb-board-toolbar" class="sb-board-toolbar-wrap"></div>

            <!-- Board Quick Action Toolbar -->
            <div class="sandbox-board-actions">
              <button class="toolbar-btn" id="sb-btn-flip" title="${i18n.t('standard.flip')}">
                ${icons.flip}
                <span>${i18n.t('demo.flip') || 'Xoay bàn'}</span>
              </button>
              <button class="toolbar-btn ${store.getState().showCoordinates ? 'active' : ''}" id="sb-btn-coords" title="${i18n.t('demo.coords') || 'Tọa độ'}">
                ${icons.coords}
                <span>${i18n.t('demo.coords') || 'Tọa độ'}</span>
              </button>
              <button class="toolbar-btn" id="sb-btn-reset-start" title="${i18n.t('sandbox.startingPos')}">
                ${icons.chessKnight}
                <span>${i18n.t('sandbox.startingPos')}</span>
              </button>
              <button class="toolbar-btn danger" id="sb-btn-clear" title="${i18n.t('sandbox.clear')}">
                ${icons.clearTrash}
                <span>${i18n.t('sandbox.clear')}</span>
              </button>
            </div>
          </div>

          <!-- Right Sidebar: FEN Editor, Attributes, Saved Positions -->
          <aside class="sandbox-sidebar">
            <!-- Position Attributes -->
            <div class="sandbox-card">
              <h3 class="sandbox-card-title">${icons.settings} <span>${i18n.t('sandbox.settingsTitle')}</span></h3>

              <!-- Side to Move -->
              <div class="attr-group">
                <label class="attr-label">${i18n.t('sandbox.sideToMove')}</label>
                <div class="pill-toggle-group">
                  <button class="pill-option active" id="turn-btn-w" data-turn="w">
                    <span class="color-dot white"></span>
                    <span>${i18n.t('sandbox.white')}</span>
                  </button>
                  <button class="pill-option" id="turn-btn-b" data-turn="b">
                    <span class="color-dot black"></span>
                    <span>${i18n.t('sandbox.black')}</span>
                  </button>
                </div>
              </div>

              <!-- Castling Rights -->
              <div class="attr-group">
                <label class="attr-label">${i18n.t('sandbox.castling')}</label>
                <div class="castling-checkboxes">
                  <label class="checkbox-label">
                    <input type="checkbox" id="castling-K" checked />
                    White O-O (K)
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="castling-Q" checked />
                    White O-O-O (Q)
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="castling-k" checked />
                    Black O-O (k)
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="castling-q" checked />
                    Black O-O-O (q)
                  </label>
                </div>
              </div>

              <!-- En Passant Square -->
              <div class="attr-group">
                <label class="attr-label">${i18n.t('sandbox.enPassant')}</label>
                <input type="text" class="toolbar-select" id="sb-ep-input" value="-" placeholder="e.g. e3 or -" style="width: 100%; box-sizing: border-box;" />
              </div>
            </div>

            <!-- FEN Import / Export -->
            <div class="sandbox-card">
              <h3 class="sandbox-card-title">${icons.pgn} <span>${i18n.t('sandbox.fenTitle')}</span></h3>
              <textarea class="fen-textarea" id="sb-fen-display" readonly rows="2"></textarea>
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button class="btn btn-secondary" id="sb-btn-copy-fen" style="flex: 1;">
                  ${icons.copy}
                  <span>${i18n.t('sandbox.copyFen')}</span>
                </button>
              </div>

              <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <label class="attr-label">${i18n.t('sandbox.loadFen')}</label>
                <input type="text" class="toolbar-select" id="sb-load-fen-input" placeholder="${i18n.t('sandbox.pasteFenPlaceholder')}" style="width: 100%; box-sizing: border-box;" />
                <button class="btn btn-primary" id="sb-btn-load-fen" style="margin-top: 0.5rem; width: 100%;">
                  ${icons.folderOpen}
                  <span>${i18n.t('sandbox.loadFen')}</span>
                </button>
              </div>
            </div>

            <!-- Saved Positions Manager -->
            <div class="sandbox-card">
              <h3 class="sandbox-card-title">${icons.save} <span>${i18n.t('sandbox.savedTitle')}</span></h3>
              <div class="save-pos-input-group">
                <input type="text" class="toolbar-select" id="sb-save-name-input" placeholder="${i18n.t('sandbox.namePlaceholder')}" style="flex: 1;" />
                <button class="btn btn-primary" id="sb-btn-save-pos" style="width: auto; padding: 0 1rem;">
                  ${icons.save}
                  <span>${i18n.t('sandbox.saveBtn')}</span>
                </button>
              </div>

              <div class="saved-positions-list" id="sb-saved-positions-list">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  initBoard() {
    const mountEl = document.getElementById('sb-board-mount');
    if (!mountEl) return;

    const state = store.getState();

    this.board = new BoardRenderer(mountEl, {
      position: this.position,
      orientation: 'white',
      pieceSet: state.pieceSet,
      boardTheme: state.boardTheme,
      showCoordinates: state.showCoordinates,
      interactive: true,
      drawMode: this.activeTool === 'arrow' ? 'arrow' : null,
      clearAnnotationsOnLeftClick: false,

      onSquareClick: ({ square, piece }) => {
        this.handleSquareClick(square, piece);
      },

      onDragStart: ({ square, piece }) => {
        // If in Arrow mode, cancel piece drag
        if (this.activeTool === 'arrow') {
          return;
        }
      },

      onDrop: ({ fromSquare, toSquare, piece }) => {
        this.handleFreeDrop(fromSquare, toSquare, piece);
      },

      onLongPress: ({ square }) => {
        // Long-press deletes piece on mobile touch
        this.removePiece(square);
      }
    });
  }

  attachDomEvents() {
    // Back to home
    document.getElementById('sb-back-home')?.addEventListener('click', () => {
      router.navigate(null);
    });

    // Undo / Redo
    document.getElementById('sb-btn-undo')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('sb-btn-redo')?.addEventListener('click', () => this.handleRedo());

    // Palette piece drag-and-drop & click selection
    this.attachPaletteEvents();

    // Board quick actions
    document.getElementById('sb-btn-flip')?.addEventListener('click', () => {
      this.board?.flip();
    });

    const coordsBtn = document.getElementById('sb-btn-coords');
    coordsBtn?.addEventListener('click', () => {
      const show = store.toggleCoordinates();
      this.board?.setShowCoordinates(show);
      if (this.boardToolbar) {
        this.boardToolbar.updateState();
      }
      coordsBtn.classList.toggle('active', show);
    });

    document.getElementById('sb-btn-reset-start')?.addEventListener('click', () => {
      this.loadFenInternal(STARTING_FEN, true);
    });

    document.getElementById('sb-btn-clear')?.addEventListener('click', () => {
      if (this.position.size === 0 || window.confirm(i18n.t('sandbox.clearConfirm'))) {
        this.clearBoard();
      }
    });

    // Tool buttons (Eraser, Arrow mode, Clear arrows)
    const eraserBtn = document.getElementById('tool-eraser');
    eraserBtn?.addEventListener('click', () => {
      if (this.activeTool === 'eraser') {
        this.setActiveTool(null);
      } else {
        this.setActiveTool('eraser');
      }
    });

    const arrowBtn = document.getElementById('tool-arrow');
    arrowBtn?.addEventListener('click', () => {
      if (this.activeTool === 'arrow') {
        this.setActiveTool(null);
      } else {
        this.setActiveTool('arrow');
      }
    });

    document.getElementById('tool-clear-arrows')?.addEventListener('click', () => {
      this.board?.clearArrows();
      this.board?.clearMarkedSquares();
    });

    // Side to move buttons
    document.getElementById('turn-btn-w')?.addEventListener('click', () => this.setTurn('w'));
    document.getElementById('turn-btn-b')?.addEventListener('click', () => this.setTurn('b'));

    // Castling checkboxes
    ['K', 'Q', 'k', 'q'].forEach((flag) => {
      const el = document.getElementById(`castling-${flag}`);
      el?.addEventListener('change', () => {
        this.castling[flag] = el.checked;
        this.pushSnapshot();
        this.updateFenDisplay();
      });
    });

    // En passant input
    const epInput = document.getElementById('sb-ep-input');
    epInput?.addEventListener('change', () => {
      const val = epInput.value.trim().toLowerCase();
      this.enPassant = /^[a-h][36]$/.test(val) ? val : '-';
      epInput.value = this.enPassant;
      this.pushSnapshot();
      this.updateFenDisplay();
    });

    // Copy FEN
    document.getElementById('sb-btn-copy-fen')?.addEventListener('click', () => {
      const fen = this.getCurrentFen();
      navigator.clipboard?.writeText(fen).then(() => {
        this.showToast(i18n.t('sandbox.copied'));
      });
    });

    // Load FEN
    document.getElementById('sb-btn-load-fen')?.addEventListener('click', () => {
      const fenInput = document.getElementById('sb-load-fen-input');
      const fenVal = fenInput?.value.trim();
      if (!fenVal) return;

      if (!isValidFen(fenVal)) {
        alert(i18n.t('sandbox.invalidFen'));
        return;
      }

      this.loadFenInternal(fenVal, true);
      if (fenInput) fenInput.value = '';
      this.showToast(i18n.t('sandbox.loadedSuccess'));
    });

    // Save Position
    document.getElementById('sb-btn-save-pos')?.addEventListener('click', () => {
      const nameInput = document.getElementById('sb-save-name-input');
      const name = nameInput?.value.trim() || `Position #${this.savedPositions.length + 1}`;

      const savedItem = {
        id: `pos_${Date.now()}`,
        name,
        fen: this.getCurrentFen(),
        date: new Date().toLocaleDateString()
      };

      this.savedPositions.unshift(savedItem);
      storage.set(SAVED_POSITIONS_KEY, this.savedPositions);
      if (nameInput) nameInput.value = '';

      this.renderSavedPositions();
      this.showToast(i18n.t('sandbox.savedSuccess'));
    });

    this.renderSavedPositions();
  }

  /**
   * Pointer Events for palette items (Touch drag + Mouse drag + click to select brush)
   */
  attachPaletteEvents() {
    const paletteItems = document.querySelectorAll('.palette-item');

    paletteItems.forEach((item) => {
      const pieceCode = item.getAttribute('data-piece');

      // Click to select piece brush
      item.addEventListener('click', () => {
        if (this.activeTool === pieceCode) {
          this.setActiveTool(null);
        } else {
          this.setActiveTool(pieceCode);
        }
      });

      // Pointer drag from palette onto board
      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();

        const pieceSet = store.getState().pieceSet;
        const squareWidth = this.board?.boardElement ? this.board.boardElement.clientWidth / 8 : 48;

        // Create dragging ghost piece
        const ghost = document.createElement('img');
        ghost.className = 'chess-ghost-piece';
        ghost.src = `${BASE_URL}assets/pieces/${pieceSet}/${pieceCode}.svg`;
        ghost.style.width = `${squareWidth}px`;
        ghost.style.height = `${squareWidth}px`;
        ghost.style.transform = `translate3d(${e.clientX - squareWidth / 2}px, ${e.clientY - squareWidth / 2}px, 0)`;

        document.body.appendChild(ghost);

        const onPointerMove = (moveEvent) => {
          ghost.style.transform = `translate3d(${moveEvent.clientX - squareWidth / 2}px, ${moveEvent.clientY - squareWidth / 2}px, 0)`;
        };

        const onPointerUp = (upEvent) => {
          ghost.remove();
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);

          if (this.board) {
            const targetSquare = this.board.getSquareFromPoint(upEvent.clientX, upEvent.clientY);
            if (targetSquare) {
              this.placePiece(targetSquare, pieceCode);
            }
          }
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });
    });
  }

  setActiveTool(tool) {
    this.activeTool = tool;

    // Update active class on palette items
    document.querySelectorAll('.palette-item').forEach((item) => {
      item.classList.toggle('active-brush', item.getAttribute('data-piece') === tool);
    });

    document.getElementById('tool-eraser')?.classList.toggle('active', tool === 'eraser');
    document.getElementById('tool-arrow')?.classList.toggle('active', tool === 'arrow');

    if (this.board) {
      this.board.setDrawMode(tool === 'arrow' ? 'arrow' : null);
    }
  }

  handleSquareClick(square, existingPiece) {
    // If Arrow tool is active: drawing is handled directly by board annotation gesture
    if (this.activeTool === 'arrow') {
      return;
    }

    // If Eraser tool is active: delete piece
    if (this.activeTool === 'eraser') {
      if (existingPiece) {
        this.removePiece(square);
      }
      return;
    }

    // If a piece brush is active: place it
    if (this.activeTool) {
      this.placePiece(square, this.activeTool);
      return;
    }

    // Default click: toggle selection or do nothing
    if (existingPiece) {
      if (this.board.highlights.selected === square) {
        this.board.clearHighlights();
      } else {
        this.board.setHighlights({ selected: square });
      }
    } else {
      this.board.clearHighlights();
    }
  }

  handleFreeDrop(fromSquare, toSquare, piece) {
    if (this.activeTool === 'arrow') {
      return;
    }

    // Dragged OFF the board -> delete the piece
    if (!toSquare) {
      this.removePiece(fromSquare);
      return;
    }

    // Dropped onto same square -> no-op
    if (fromSquare === toSquare) {
      return;
    }

    // Move piece to any square without rules
    this.movePiece(fromSquare, toSquare);
  }

  /* ========================================================================
     Position Operations (Place, Move, Remove, Clear)
     ======================================================================== */

  placePiece(square, pieceCode) {
    this.position.set(square, pieceCode);
    this.board?.setPosition(this.position);
    soundManager.play('move');
    this.pushSnapshot();
    this.updateFenDisplay();
  }

  movePiece(fromSquare, toSquare) {
    const piece = this.position.get(fromSquare);
    if (!piece) return;

    const hadExisting = Boolean(this.position.get(toSquare));
    this.position.delete(fromSquare);
    this.position.set(toSquare, piece);

    this.board?.setPosition(this.position);
    this.board?.setHighlights({ lastMove: { from: fromSquare, to: toSquare } });

    soundManager.play(hadExisting ? 'capture' : 'move');
    this.pushSnapshot();
    this.updateFenDisplay();
  }

  removePiece(square) {
    if (this.position.has(square)) {
      this.position.delete(square);
      this.board?.setPosition(this.position);
      soundManager.play('capture');
      this.pushSnapshot();
      this.updateFenDisplay();
    }
  }

  clearBoard() {
    this.position.clear();
    this.castling = { K: false, Q: false, k: false, q: false };
    this.enPassant = '-';
    this.board?.setPosition(this.position);
    this.board?.clearHighlights();
    this.board?.clearArrows();
    this.pushSnapshot();
    this.updateUI();
  }

  setTurn(turn) {
    this.turn = turn;
    document.getElementById('turn-btn-w')?.classList.toggle('active', turn === 'w');
    document.getElementById('turn-btn-b')?.classList.toggle('active', turn === 'b');
    this.pushSnapshot();
    this.updateFenDisplay();
  }

  /* ========================================================================
     FEN Parsing and Synchronization
     ======================================================================== */

  getCurrentFen() {
    const castlingStr = [
      this.castling.K ? 'K' : '',
      this.castling.Q ? 'Q' : '',
      this.castling.k ? 'k' : '',
      this.castling.q ? 'q' : ''
    ].join('') || '-';

    return positionToFen({
      position: this.position,
      turn: this.turn,
      castling: castlingStr,
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      fullmove: this.fullmove
    });
  }

  loadFenInternal(fen, pushHistory = true) {
    try {
      const parsed = fenToPosition(fen);
      this.position = parsed.position;
      this.turn = parsed.turn;

      this.castling = {
        K: parsed.castling.includes('K'),
        Q: parsed.castling.includes('Q'),
        k: parsed.castling.includes('k'),
        q: parsed.castling.includes('q')
      };

      this.enPassant = parsed.enPassant || '-';
      this.halfmove = parsed.halfmove || 0;
      this.fullmove = parsed.fullmove || 1;

      if (this.board) {
        this.board.setPosition(this.position);
        this.board.clearHighlights();
      }

      if (pushHistory) {
        this.pushSnapshot();
      }
      this.updateUI();
    } catch (err) {
      console.warn('[Sandbox] FEN load error:', err);
    }
  }

  updateFenDisplay() {
    const fenDisplay = document.getElementById('sb-fen-display');
    if (fenDisplay) {
      fenDisplay.value = this.getCurrentFen();
    }
  }

  /* ========================================================================
     Undo / Redo Management
     ======================================================================== */

  pushSnapshot() {
    const snapshot = {
      position: new Map(this.position),
      turn: this.turn,
      castling: { ...this.castling },
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      fullmove: this.fullmove
    };

    // Truncate redo history if new action taken
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;

    this.updateUndoRedoButtons();
  }

  handleUndo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.applySnapshot(this.history[this.historyIndex]);
    }
  }

  handleRedo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.applySnapshot(this.history[this.historyIndex]);
    }
  }

  applySnapshot(snapshot) {
    this.position = new Map(snapshot.position);
    this.turn = snapshot.turn;
    this.castling = { ...snapshot.castling };
    this.enPassant = snapshot.enPassant;
    this.halfmove = snapshot.halfmove;
    this.fullmove = snapshot.fullmove;

    this.board?.setPosition(this.position);
    this.board?.clearHighlights();
    this.updateUI();
  }

  updateUndoRedoButtons() {
    const btnUndo = document.getElementById('sb-btn-undo');
    const btnRedo = document.getElementById('sb-btn-redo');

    if (btnUndo) btnUndo.disabled = this.historyIndex <= 0;
    if (btnRedo) btnRedo.disabled = this.historyIndex >= this.history.length - 1;
  }

  /* ========================================================================
     Saved Positions Manager
     ======================================================================== */

  renderSavedPositions() {
    const listEl = document.getElementById('sb-saved-positions-list');
    if (!listEl) return;

    if (this.savedPositions.length === 0) {
      listEl.innerHTML = `<div class="empty-saved-text">${i18n.t('sandbox.noSaved')}</div>`;
      return;
    }

    listEl.innerHTML = this.savedPositions
      .map(
        (pos) => `
        <div class="saved-pos-item" data-pos-id="${pos.id}">
          <div class="saved-pos-info">
            <div class="saved-pos-name">${pos.name}</div>
            <div class="saved-pos-date">${pos.date}</div>
          </div>
          <div class="saved-pos-actions">
            <button class="saved-pos-btn" data-action="load" title="${i18n.t('sandbox.load')}">
              ${i18n.t('sandbox.load')}
            </button>
            <button class="saved-pos-btn delete" data-action="delete" title="${i18n.t('sandbox.delete')}">
              ${i18n.t('sandbox.delete')}
            </button>
          </div>
        </div>
      `
      )
      .join('');

    // Attach load & delete listeners
    listEl.querySelectorAll('.saved-pos-item').forEach((item) => {
      const id = item.getAttribute('data-pos-id');
      const posObj = this.savedPositions.find((p) => p.id === id);

      item.querySelector('[data-action="load"]')?.addEventListener('click', () => {
        if (posObj) {
          this.loadFenInternal(posObj.fen, true);
          this.showToast(i18n.t('sandbox.loadedSuccess'));
        }
      });

      item.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        this.savedPositions = this.savedPositions.filter((p) => p.id !== id);
        storage.set(SAVED_POSITIONS_KEY, this.savedPositions);
        this.renderSavedPositions();
        this.showToast(i18n.t('sandbox.deletedSuccess'));
      });
    });
  }

  /* ========================================================================
     UI Sync Helpers
     ======================================================================== */

  renderPaletteIcons() {
    const pieceSet = store.getState().pieceSet;
    document.querySelectorAll('.palette-item').forEach((item) => {
      const piece = item.getAttribute('data-piece');
      const img = item.querySelector('.palette-img');
      if (img && piece) {
        img.src = `${BASE_URL}assets/pieces/${pieceSet}/${piece}.svg`;
      }
    });
  }

  updateUI() {
    this.updateFenDisplay();
    this.updateUndoRedoButtons();

    // Turn pills
    document.getElementById('turn-btn-w')?.classList.toggle('active', this.turn === 'w');
    document.getElementById('turn-btn-b')?.classList.toggle('active', this.turn === 'b');

    // Castling
    ['K', 'Q', 'k', 'q'].forEach((flag) => {
      const el = document.getElementById(`castling-${flag}`);
      if (el) el.checked = Boolean(this.castling[flag]);
    });

    // En passant
    const epInput = document.getElementById('sb-ep-input');
    if (epInput) epInput.value = this.enPassant;
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
}

// Module export for mounting sandbox mode
let activeSandbox = null;

export function initSandboxMode(container) {
  if (activeSandbox) {
    activeSandbox.destroy();
  }
  activeSandbox = new SandboxGame(container);
  activeSandbox.mount();
  return activeSandbox;
}
