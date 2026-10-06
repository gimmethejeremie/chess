/**
 * Reusable 8x8 Chess Board Component using Pointer Events (touch + mouse).
 * Features:
 * - Position rendering from square->piece dictionary or chess.js board layout
 * - Touch-friendly drag-and-drop with floating ghost piece (no scrolling during drag)
 * - Orientation flip, coordinates toggle, 4 color themes, switchable SVG piece sets
 * - Highlights: selected, legal moves (dots & capture rings), last move, king check, custom marks
 * - Right-click drag to draw arrows and toggle square highlights (Lichess style)
 * - Events: onSquareClick, onDragStart, onDrop, onRightClick, onLongPress
 */
import './board.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const BASE_URL = import.meta.env?.BASE_URL || '/';

const PIECE_NAMES = {
  wP: 'White Pawn',
  wN: 'White Knight',
  wB: 'White Bishop',
  wR: 'White Rook',
  wQ: 'White Queen',
  wK: 'White King',
  bP: 'Black Pawn',
  bN: 'Black Knight',
  bB: 'Black Bishop',
  bR: 'Black Rook',
  bQ: 'Black Queen',
  bK: 'Black King'
};

/**
 * Normalize piece representation to standard format (e.g., 'wP', 'bK')
 * Accepts:
 * - String: 'wP', 'bK', 'P', 'p'
 * - Object: { color: 'w', type: 'p' }
 */
export function normalizePiece(piece) {
  if (!piece) return null;
  if (typeof piece === 'string') {
    if (piece.length === 2) return piece;
    // Single FEN char: uppercase = white, lowercase = black
    const color = piece === piece.toUpperCase() ? 'w' : 'b';
    return `${color}${piece.toUpperCase()}`;
  }
  if (typeof piece === 'object' && piece.type && piece.color) {
    return `${piece.color}${piece.type.toUpperCase()}`;
  }
  return null;
}

export class BoardRenderer {
  /**
   * @param {HTMLElement} container Parent DOM element
   * @param {Object} [options]
   * @param {Object|Map} [options.position={}] Initial square->piece mapping
   * @param {'white'|'black'} [options.orientation='white']
   * @param {'cburnett'|'merida'|'alpha'} [options.pieceSet='cburnett']
   * @param {'classic'|'wood'|'ocean'|'slate'} [options.boardTheme='classic']
   * @param {boolean} [options.showCoordinates=true]
   * @param {boolean} [options.interactive=true]
   * @param {Function} [options.onSquareClick]
   * @param {Function} [options.onDragStart]
   * @param {Function} [options.onDrop]
   * @param {Function} [options.onRightClick]
   * @param {Function} [options.onLongPress]
   */
  constructor(container, options = {}) {
    if (!container) {
      throw new Error('[BoardRenderer] A container element is required');
    }

    this.container = container;
    this.orientation = options.orientation || 'white';
    this.pieceSet = options.pieceSet || 'cburnett';
    this.boardTheme = options.boardTheme || 'classic';
    this.showCoordinates = options.showCoordinates !== undefined ? options.showCoordinates : true;
    this.interactive = options.interactive !== undefined ? options.interactive : true;

    this.callbacks = {
      onSquareClick: options.onSquareClick || (() => {}),
      onDragStart: options.onDragStart || (() => {}),
      onDrop: options.onDrop || (() => {}),
      onRightClick: options.onRightClick || (() => {}),
      onLongPress: options.onLongPress || (() => {})
    };

    // Highlights state
    this.highlights = {
      selected: null,
      lastMove: null, // { from: 'e2', to: 'e4' } or ['e2', 'e4']
      check: null,    // square of king in check
      legalMoves: [], // array of square strings or { square: 'e4', isCapture: true }
      markedSquares: new Set() // squares marked via right-click
    };

    // Arrows state: [{ from: 'e2', to: 'e4', color: '#f59e0b' }]
    this.arrows = [];

    // Internal position Map: square -> 'wP'
    this.position = new Map();
    if (options.position) {
      this.setPosition(options.position, false);
    }

    // Drag-and-drop state (primary pointer)
    this.dragState = {
      active: false,
      pointerId: null,
      fromSquare: null,
      piece: null,
      startX: 0,
      startY: 0,
      ghostEl: null,
      sourcePieceEl: null
    };

    // Right-click drag state (secondary pointer)
    this.rightClickState = {
      active: false,
      pointerId: null,
      fromSquare: null
    };

    // Long press timer for touch devices
    this.longPressTimer = null;

    // Bound listeners for cleanup
    this.boundOnPointerDown = this.handlePointerDown.bind(this);
    this.boundOnPointerMove = this.handlePointerMove.bind(this);
    this.boundOnPointerUp = this.handlePointerUp.bind(this);
    this.boundOnPointerCancel = this.handlePointerCancel.bind(this);
    this.boundOnContextMenu = this.handleContextMenu.bind(this);

    this.boardElement = null;
    this.arrowOverlay = null;
    this.squareElements = new Map(); // square -> DOM element

    this.mount();
  }

  /**
   * Build initial DOM structure and attach event listeners
   */
  mount() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'chess-board-wrapper';

    this.boardElement = document.createElement('div');
    this.boardElement.className = 'chess-board';
    this.boardElement.setAttribute('data-board-theme', this.boardTheme);
    this.boardElement.setAttribute('role', 'grid');
    this.boardElement.setAttribute('aria-label', 'Chess Board');

    // Create SVG arrow overlay layer
    this.arrowOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrowOverlay.setAttribute('class', 'chess-arrows-overlay');
    this.arrowOverlay.setAttribute('viewBox', '0 0 100 100');
    this.arrowOverlay.innerHTML = `
      <defs>
        <marker id="arrowhead-default" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(245, 158, 11, 0.9)" />
        </marker>
        <marker id="arrowhead-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(34, 197, 94, 0.9)" />
        </marker>
        <marker id="arrowhead-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(239, 68, 68, 0.9)" />
        </marker>
        <marker id="arrowhead-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(59, 130, 246, 0.9)" />
        </marker>
      </defs>
      <g id="arrows-group"></g>
    `;
    this.boardElement.appendChild(this.arrowOverlay);

    // Attach pointer and contextmenu events
    this.boardElement.addEventListener('pointerdown', this.boundOnPointerDown);
    this.boardElement.addEventListener('pointermove', this.boundOnPointerMove);
    this.boardElement.addEventListener('pointerup', this.boundOnPointerUp);
    this.boardElement.addEventListener('pointercancel', this.boundOnPointerCancel);
    this.boardElement.addEventListener('contextmenu', this.boundOnContextMenu);

    wrapper.appendChild(this.boardElement);
    this.container.appendChild(wrapper);

    this.renderBoard();
  }

  /**
   * Re-render board grid squares according to orientation and position
   */
  renderBoard() {
    if (!this.boardElement) return;

    // Clear squares, preserve arrowOverlay
    const squares = this.boardElement.querySelectorAll('.chess-square');
    squares.forEach((sq) => sq.remove());
    this.squareElements.clear();

    const isWhite = this.orientation === 'white';

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const file = isWhite ? FILES[col] : FILES[7 - col];
        const rank = isWhite ? RANKS[7 - row] : RANKS[row];
        const square = `${file}${rank}`;

        const isLight = (col + row) % 2 === 0;

        const pieceCode = this.position.get(square);
        const pieceDesc = pieceCode ? `, ${PIECE_NAMES[pieceCode] || pieceCode}` : '';

        const squareEl = document.createElement('div');
        squareEl.className = `chess-square ${isLight ? 'light' : 'dark'}`;
        squareEl.setAttribute('data-square', square);
        squareEl.setAttribute('role', 'gridcell');
        squareEl.setAttribute('aria-label', `${square}${pieceDesc}`);

        if (this.interactive) {
          squareEl.setAttribute('tabindex', '0');
          squareEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (this.callbacks?.onSquareClick) {
                this.callbacks.onSquareClick({ square, piece: this.position.get(square) || null, event: e });
              }
            }
          });
        }

        // Coordinates overlay (Lichess style corner labels)
        if (this.showCoordinates) {
          if (row === 7) {
            const fileCoord = document.createElement('span');
            fileCoord.className = 'square-coord file';
            fileCoord.textContent = file;
            squareEl.appendChild(fileCoord);
          }
          if (col === 0) {
            const rankCoord = document.createElement('span');
            rankCoord.className = 'square-coord rank';
            rankCoord.textContent = rank;
            squareEl.appendChild(rankCoord);
          }
        }

        // Render piece if exists
        if (pieceCode) {
          const pieceImg = this.createPieceElement(pieceCode);
          squareEl.appendChild(pieceImg);
        }

        this.boardElement.appendChild(squareEl);
        this.squareElements.set(square, squareEl);
      }
    }

    this.applyHighlights();
    this.renderArrows();
  }

  createPieceElement(pieceCode) {
    const img = document.createElement('img');
    img.className = 'chess-piece';
    img.src = `${BASE_URL}assets/pieces/${this.pieceSet}/${pieceCode}.svg`;
    img.alt = pieceCode;
    img.draggable = false;
    img.setAttribute('aria-hidden', 'true');
    return img;
  }

  /**
   * Set board position
   * @param {Object|Map|Array} pos Position dictionary or chess.js board 2D array
   * @param {boolean} [render=true]
   */
  setPosition(pos, render = true) {
    this.position.clear();

    if (!pos) {
      if (render) this.renderBoard();
      return;
    }

    if (Array.isArray(pos)) {
      for (let r = 0; r < pos.length; r++) {
        for (let c = 0; c < pos[r].length; c++) {
          const square = `${FILES[c]}${RANKS[7 - r]}`;
          const p = pos[r][c];
          if (p) {
            this.position.set(square, `${p.color}${p.type.toUpperCase()}`);
          }
        }
      }
    } else if (pos instanceof Map) {
      for (const [sq, p] of pos.entries()) {
        const normalized = normalizePiece(p);
        if (normalized) this.position.set(sq, normalized);
      }
    } else if (typeof pos === 'object') {
      for (const [sq, p] of Object.entries(pos)) {
        const normalized = normalizePiece(p);
        if (normalized) this.position.set(sq, normalized);
      }
    }

    if (render) {
      this.updatePiecesOnly();
      this.applyHighlights();
    }
  }

  updatePiecesOnly() {
    for (const [square, squareEl] of this.squareElements.entries()) {
      const existingImg = squareEl.querySelector('.chess-piece');
      const pieceCode = this.position.get(square);
      const pieceDesc = pieceCode ? `, ${PIECE_NAMES[pieceCode] || pieceCode}` : '';

      squareEl.setAttribute('aria-label', `${square}${pieceDesc}`);

      if (pieceCode) {
        const src = `${BASE_URL}assets/pieces/${this.pieceSet}/${pieceCode}.svg`;
        if (existingImg) {
          if (existingImg.src !== src) {
            existingImg.src = src;
            existingImg.alt = pieceCode;
          }
        } else {
          squareEl.appendChild(this.createPieceElement(pieceCode));
        }
      } else if (existingImg) {
        existingImg.remove();
      }
    }
  }

  setOrientation(orientation) {
    if (orientation !== this.orientation) {
      this.orientation = orientation;
      this.renderBoard();
    }
  }

  flip() {
    this.setOrientation(this.orientation === 'white' ? 'black' : 'white');
  }

  setPieceSet(pieceSet) {
    if (this.pieceSet !== pieceSet) {
      this.pieceSet = pieceSet;
      this.updatePiecesOnly();
    }
  }

  setBoardTheme(theme) {
    this.boardTheme = theme;
    if (this.boardElement) {
      this.boardElement.setAttribute('data-board-theme', theme);
    }
  }

  setShowCoordinates(show) {
    this.showCoordinates = Boolean(show);
    this.renderBoard();
  }

  setHighlights(highlights = {}) {
    this.highlights = {
      ...this.highlights,
      ...highlights
    };
    this.applyHighlights();
  }

  clearHighlights() {
    this.highlights.selected = null;
    this.highlights.lastMove = null;
    this.highlights.check = null;
    this.highlights.legalMoves = [];
    this.applyHighlights();
  }

  clearMarkedSquares() {
    this.highlights.markedSquares.clear();
    this.applyHighlights();
  }

  applyHighlights() {
    for (const squareEl of this.squareElements.values()) {
      squareEl.classList.remove(
        'highlight-selected',
        'highlight-last-move',
        'highlight-check',
        'highlight-marked'
      );
      const hints = squareEl.querySelectorAll('.legal-move-hint');
      hints.forEach((h) => h.remove());
    }

    if (this.highlights.selected) {
      const el = this.squareElements.get(this.highlights.selected);
      if (el) el.classList.add('highlight-selected');
    }

    if (this.highlights.lastMove) {
      const moves = Array.isArray(this.highlights.lastMove)
        ? this.highlights.lastMove
        : [this.highlights.lastMove.from, this.highlights.lastMove.to];
      for (const sq of moves) {
        const el = this.squareElements.get(sq);
        if (el) el.classList.add('highlight-last-move');
      }
    }

    if (this.highlights.check) {
      const el = this.squareElements.get(this.highlights.check);
      if (el) el.classList.add('highlight-check');
    }

    for (const sq of this.highlights.markedSquares) {
      const el = this.squareElements.get(sq);
      if (el) el.classList.add('highlight-marked');
    }

    if (Array.isArray(this.highlights.legalMoves)) {
      for (const item of this.highlights.legalMoves) {
        const targetSquare = typeof item === 'string' ? item : item.square;
        const isCapture = typeof item === 'object' && item.isCapture !== undefined
          ? item.isCapture
          : Boolean(this.position.get(targetSquare));

        const el = this.squareElements.get(targetSquare);
        if (el) {
          const hint = document.createElement('div');
          hint.className = `legal-move-hint ${isCapture ? 'capture-ring' : 'dot'}`;
          el.appendChild(hint);
        }
      }
    }
  }

  /* ========================================================================
     Arrow Drawing & Annotations
     ======================================================================== */

  getSquareCenterCoords(square) {
    if (!square || square.length < 2) return null;
    const file = square[0];
    const rank = square[1];

    const fileIdx = FILES.indexOf(file);
    const rankIdx = RANKS.indexOf(rank);
    if (fileIdx === -1 || rankIdx === -1) return null;

    const isWhite = this.orientation === 'white';
    const col = isWhite ? fileIdx : 7 - fileIdx;
    const row = isWhite ? 7 - rankIdx : rankIdx;

    return {
      x: (col + 0.5) * 12.5,
      y: (row + 0.5) * 12.5
    };
  }

  addArrow(from, to, color = 'rgba(245, 158, 11, 0.9)') {
    if (!from || !to || from === to) return;
    // Check if arrow already exists
    const idx = this.arrows.findIndex((a) => a.from === from && a.to === to);
    if (idx !== -1) {
      this.arrows.splice(idx, 1);
    } else {
      this.arrows.push({ from, to, color });
    }
    this.renderArrows();
  }

  clearArrows() {
    this.arrows = [];
    this.renderArrows();
  }

  renderArrows() {
    if (!this.arrowOverlay) return;
    const group = this.arrowOverlay.querySelector('#arrows-group');
    if (!group) return;

    group.innerHTML = '';

    for (const arr of this.arrows) {
      const p1 = this.getSquareCenterCoords(arr.from);
      const p2 = this.getSquareCenterCoords(arr.to);
      if (!p1 || !p2) continue;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;

      // Shorten line slightly so arrow head sits at the target square center
      const shorten = 3.2;
      const endX = p2.x - (dx / len) * shorten;
      const endY = p2.y - (dy / len) * shorten;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', endX);
      line.setAttribute('y2', endY);
      line.setAttribute('stroke', arr.color || 'rgba(245, 158, 11, 0.9)');
      line.setAttribute('stroke-width', '2.2');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('marker-end', 'url(#arrowhead-default)');

      group.appendChild(line);
    }
  }

  /* ========================================================================
     Pointer Events & Drag-and-Drop Implementation
     ======================================================================== */

  getSquareFromPoint(clientX, clientY) {
    if (!this.boardElement) return null;
    const rect = this.boardElement.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }

    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);

    if (col < 0 || col > 7 || row < 0 || row > 7) return null;

    const isWhite = this.orientation === 'white';
    const file = isWhite ? FILES[col] : FILES[7 - col];
    const rank = isWhite ? RANKS[7 - row] : RANKS[row];
    return `${file}${rank}`;
  }

  handlePointerDown(e) {
    if (!this.interactive) return;

    // Right-click handling (Secondary button: 2) -> Arrow / Mark gesture
    if (e.button === 2) {
      e.preventDefault();
      const square = this.getSquareFromPoint(e.clientX, e.clientY);
      if (square) {
        this.rightClickState.active = true;
        this.rightClickState.pointerId = e.pointerId;
        this.rightClickState.fromSquare = square;
      }
      return;
    }

    // Only primary pointer button (left-click or touch)
    if (e.button !== 0) return;

    e.preventDefault();

    const square = this.getSquareFromPoint(e.clientX, e.clientY);
    if (!square) return;

    const piece = this.position.get(square);

    this.dragState.pointerId = e.pointerId;
    this.dragState.fromSquare = square;
    this.dragState.piece = piece;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.active = false;

    // Long press detection for touch devices (500ms)
    if (e.pointerType === 'touch' && piece) {
      if (this.longPressTimer) clearTimeout(this.longPressTimer);
      this.longPressTimer = setTimeout(() => {
        this.callbacks.onLongPress({ square, piece, event: e });
      }, 500);
    }

    try {
      this.boardElement.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  handlePointerMove(e) {
    // If right-click dragging, nothing special needed until up
    if (this.rightClickState.active && this.rightClickState.pointerId === e.pointerId) {
      return;
    }

    if (this.dragState.pointerId !== e.pointerId) return;
    e.preventDefault();

    const dist = Math.hypot(
      e.clientX - this.dragState.startX,
      e.clientY - this.dragState.startY
    );

    // Cancel long press timer if moved
    if (dist > 5 && this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // If drag threshold reached and piece exists, initiate drag
    if (!this.dragState.active && dist > 4 && this.dragState.piece) {
      this.dragState.active = true;

      const squareEl = this.squareElements.get(this.dragState.fromSquare);
      if (squareEl) {
        this.dragState.sourcePieceEl = squareEl.querySelector('.chess-piece');
        if (this.dragState.sourcePieceEl) {
          this.dragState.sourcePieceEl.classList.add('dragging-source');
        }
      }

      // Create floating ghost element
      const ghost = document.createElement('img');
      ghost.className = 'chess-ghost-piece';
      ghost.src = `${BASE_URL}assets/pieces/${this.pieceSet}/${this.dragState.piece}.svg`;
      ghost.alt = 'Dragging piece';

      const squareWidth = this.boardElement.clientWidth / 8;
      ghost.style.width = `${squareWidth}px`;
      ghost.style.height = `${squareWidth}px`;

      document.body.appendChild(ghost);
      this.dragState.ghostEl = ghost;

      this.callbacks.onDragStart({
        square: this.dragState.fromSquare,
        piece: this.dragState.piece,
        event: e
      });
    }

    // Move ghost piece smoothly under pointer
    if (this.dragState.active && this.dragState.ghostEl) {
      const squareWidth = this.boardElement.clientWidth / 8;
      const x = e.clientX - squareWidth / 2;
      const y = e.clientY - squareWidth / 2;
      this.dragState.ghostEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }

  handlePointerUp(e) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // Right-click gesture completed
    if (this.rightClickState.active && this.rightClickState.pointerId === e.pointerId) {
      const fromSquare = this.rightClickState.fromSquare;
      const toSquare = this.getSquareFromPoint(e.clientX, e.clientY);

      this.rightClickState.active = false;
      this.rightClickState.pointerId = null;
      this.rightClickState.fromSquare = null;

      if (fromSquare && toSquare) {
        if (fromSquare === toSquare) {
          // Toggle square highlight
          if (this.highlights.markedSquares.has(fromSquare)) {
            this.highlights.markedSquares.delete(fromSquare);
          } else {
            this.highlights.markedSquares.add(fromSquare);
          }
          this.applyHighlights();
        } else {
          // Toggle arrow
          this.addArrow(fromSquare, toSquare);
        }

        this.callbacks.onRightClick({
          fromSquare,
          toSquare,
          square: fromSquare,
          event: e
        });
      }
      return;
    }

    if (this.dragState.pointerId !== e.pointerId) return;

    try {
      this.boardElement.releasePointerCapture(e.pointerId);
    } catch (err) {}

    const fromSquare = this.dragState.fromSquare;
    const piece = this.dragState.piece;
    const wasDragging = this.dragState.active;

    if (this.dragState.ghostEl) {
      this.dragState.ghostEl.remove();
      this.dragState.ghostEl = null;
    }
    if (this.dragState.sourcePieceEl) {
      this.dragState.sourcePieceEl.classList.remove('dragging-source');
      this.dragState.sourcePieceEl = null;
    }

    this.dragState.pointerId = null;
    this.dragState.active = false;

    if (wasDragging) {
      const toSquare = this.getSquareFromPoint(e.clientX, e.clientY);
      // toSquare may be null if dragged outside the board (handled as off-board drop)
      this.callbacks.onDrop({
        fromSquare,
        toSquare,
        piece,
        event: e
      });
    } else if (fromSquare) {
      this.callbacks.onSquareClick({
        square: fromSquare,
        piece,
        event: e
      });
    }
  }

  handlePointerCancel(e) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.dragState.pointerId === e.pointerId) {
      if (this.dragState.ghostEl) {
        this.dragState.ghostEl.remove();
        this.dragState.ghostEl = null;
      }
      if (this.dragState.sourcePieceEl) {
        this.dragState.sourcePieceEl.classList.remove('dragging-source');
      }
      this.dragState.pointerId = null;
      this.dragState.active = false;
    }
    if (this.rightClickState.pointerId === e.pointerId) {
      this.rightClickState.active = false;
      this.rightClickState.pointerId = null;
    }
  }

  handleContextMenu(e) {
    e.preventDefault();
  }

  /**
   * Clean up all event listeners and DOM references
   */
  destroy() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    if (this.boardElement) {
      this.boardElement.removeEventListener('pointerdown', this.boundOnPointerDown);
      this.boardElement.removeEventListener('pointermove', this.boundOnPointerMove);
      this.boardElement.removeEventListener('pointerup', this.boundOnPointerUp);
      this.boardElement.removeEventListener('pointercancel', this.boundOnPointerCancel);
      this.boardElement.removeEventListener('contextmenu', this.boundOnContextMenu);
      this.boardElement.remove();
    }
    if (this.dragState.ghostEl) {
      this.dragState.ghostEl.remove();
    }
    this.squareElements.clear();
  }
}
