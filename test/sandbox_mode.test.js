import { describe, it, expect, beforeEach } from 'vitest';
import {
  positionToFen,
  fenToPosition,
  isValidFen,
  STARTING_FEN,
  EMPTY_FEN
} from '../src/modes/sandbox/fenHelper.js';

describe('Sandbox Mode - FEN Import / Export & Position Representation', () => {
  it('correctly converts empty board position to FEN', () => {
    const fen = positionToFen({
      position: new Map(),
      turn: 'w',
      castling: '-',
      enPassant: '-',
      halfmove: 0,
      fullmove: 1
    });
    expect(fen).toBe(EMPTY_FEN);
  });

  it('correctly converts starting position to standard FEN', () => {
    const parsed = fenToPosition(STARTING_FEN);
    expect(parsed.position.size).toBe(32);
    expect(parsed.turn).toBe('w');
    expect(parsed.castling).toBe('KQkq');

    const generatedFen = positionToFen({
      position: parsed.position,
      turn: parsed.turn,
      castling: parsed.castling,
      enPassant: parsed.enPassant,
      halfmove: parsed.halfmove,
      fullmove: parsed.fullmove
    });
    expect(generatedFen).toBe(STARTING_FEN);
  });

  it('parses custom FEN positions accurately', () => {
    const customFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    expect(isValidFen(customFen)).toBe(true);

    const parsed = fenToPosition(customFen);
    expect(parsed.position.get('e1')).toBe('wK');
    expect(parsed.position.get('e8')).toBe('bK');
    expect(parsed.position.get('c4')).toBe('wB');
    expect(parsed.turn).toBe('w');
    expect(parsed.castling).toBe('KQkq');
    expect(parsed.halfmove).toBe(4);
    expect(parsed.fullmove).toBe(4);
  });

  it('rejects invalid FEN strings', () => {
    expect(isValidFen('invalid')).toBe(false);
    expect(isValidFen('8/8/8/8/8/8/8')).toBe(false); // only 7 ranks
    expect(isValidFen('9/8/8/8/8/8/8/8 w - - 0 1')).toBe(false); // rank exceeds 8 files
    expect(isValidFen('')).toBe(false);
  });
});

describe('Sandbox Mode - Edit Operations (Place, Move, Remove, Clear, Undo/Redo)', () => {
  let position;
  let history;
  let historyIndex;

  function pushState(pos) {
    history = history.slice(0, historyIndex + 1);
    history.push(new Map(pos));
    historyIndex = history.length - 1;
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      position = new Map(history[historyIndex]);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      position = new Map(history[historyIndex]);
    }
  }

  beforeEach(() => {
    position = new Map();
    history = [];
    historyIndex = -1;
    pushState(position); // initial empty snapshot
  });

  it('places a piece on any square and replaces occupied squares', () => {
    // 1. Place White Queen on e4
    position.set('e4', 'wQ');
    pushState(position);
    expect(position.get('e4')).toBe('wQ');
    expect(position.size).toBe(1);

    // 2. Replace with Black Knight on e4
    position.set('e4', 'bN');
    pushState(position);
    expect(position.get('e4')).toBe('bN');
    expect(position.size).toBe(1);
  });

  it('moves a piece to any square without rule limitations', () => {
    // Place pawn on a1
    position.set('a1', 'wP');
    pushState(position);

    // Move directly from a1 to h8 (no diagonal/step restrictions in sandbox)
    const piece = position.get('a1');
    position.delete('a1');
    position.set('h8', piece);
    pushState(position);

    expect(position.get('a1')).toBeUndefined();
    expect(position.get('h8')).toBe('wP');
  });

  it('removes a piece from the board (drag off-board, eraser, long-press)', () => {
    position.set('e4', 'wK');
    pushState(position);
    expect(position.has('e4')).toBe(true);

    // Remove piece
    position.delete('e4');
    pushState(position);
    expect(position.has('e4')).toBe(false);
    expect(position.size).toBe(0);
  });

  it('clears all pieces on the board', () => {
    const parsedStart = fenToPosition(STARTING_FEN);
    position = new Map(parsedStart.position);
    pushState(position);
    expect(position.size).toBe(32);

    // Clear board
    position.clear();
    pushState(position);
    expect(position.size).toBe(0);
  });

  it('supports undo and redo for all edit operations', () => {
    // Action 1: Place King on e1
    position.set('e1', 'wK');
    pushState(position);

    // Action 2: Place Rook on a1
    position.set('a1', 'wR');
    pushState(position);

    // Action 3: Place Bishop on c1
    position.set('c1', 'wB');
    pushState(position);

    expect(position.size).toBe(3);

    // Undo action 3
    undo();
    expect(position.size).toBe(2);
    expect(position.get('c1')).toBeUndefined();

    // Undo action 2
    undo();
    expect(position.size).toBe(1);
    expect(position.get('a1')).toBeUndefined();

    // Redo action 2
    redo();
    expect(position.size).toBe(2);
    expect(position.get('a1')).toBe('wR');

    // Redo action 3
    redo();
    expect(position.size).toBe(3);
    expect(position.get('c1')).toBe('wB');
  });
});
