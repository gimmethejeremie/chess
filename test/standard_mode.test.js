import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Chess } from 'chess.js';

describe('Standard Mode - Legal Rules Engine Verification', () => {
  let chess;
  let originalDocument;

  beforeEach(() => {
    chess = new Chess();
    originalDocument = globalThis.document;
    const createEl = () => ({
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      appendChild: () => {},
      addEventListener: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    });
    globalThis.document = {
      body: {
        appendChild: () => {},
        removeChild: () => {}
      },
      createElement: createEl,
      createElementNS: createEl,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('handles Kingside and Queenside castling properly', () => {
    // White Kingside castling setup
    chess.load('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    // Moves leading to castling: O-O
    const castleMove = chess.move('O-O');
    expect(castleMove).not.toBeNull();
    expect(castleMove.flags).toContain('k');
    expect(chess.get('g1').type).toBe('k');
    expect(chess.get('f1').type).toBe('r');
  });

  it('handles en passant capture and removes captured pawn', () => {
    // 1. e4 e6 2. e5 d5 -> en passant available on d6
    chess.move('e4');
    chess.move('e6');
    chess.move('e5');
    chess.move('d5');

    const moves = chess.moves({ square: 'e5', verbose: true });
    const epMove = moves.find((m) => m.to === 'd6');
    expect(epMove).toBeDefined();
    expect(epMove.flags).toContain('e');

    // Execute en passant
    const executed = chess.move({ from: 'e5', to: 'd6' });
    expect(executed.captured).toBe('p');
    expect(chess.get('d5')).toBeFalsy(); // Captured black pawn on d5 removed
    expect(chess.get('d6').type).toBe('p');
  });

  it('detects pawn promotion and supports promoting to Q, R, B, N', () => {
    // White pawn on e7 about to promote
    const fen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
    chess.load(fen);

    const moves = chess.moves({ square: 'e7', verbose: true });
    expect(moves.length).toBe(4);
    expect(moves.every((m) => m.promotion)).toBe(true);

    // Promote to Queen
    const qMove = chess.move({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(qMove.san).toBe('e8=Q');
    expect(chess.get('e8').type).toBe('q');

    // Test promotion to Knight
    chess.load(fen);
    const nMove = chess.move({ from: 'e7', to: 'e8', promotion: 'n' });
    expect(nMove.san).toBe('e8=N');
    expect(chess.get('e8').type).toBe('n');
  });

  it('accurately identifies Check and Checkmate', () => {
    // Scholar's Mate: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
    chess.move('e4');
    chess.move('e5');
    chess.move('Bc4');
    chess.move('Nc6');
    chess.move('Qh5');
    chess.move('Nf6');
    chess.move('Qxf7#');

    expect(chess.isCheck()).toBe(true);
    expect(chess.isCheckmate()).toBe(true);
    expect(chess.isGameOver()).toBe(true);
  });

  it('accurately identifies Stalemate', () => {
    // Classic Stalemate position: King on a8, Queen on c7, White King on a6
    chess.load('k7/2Q5/K7/8/8/8/8/8 b - - 0 1');
    expect(chess.isCheck()).toBe(false);
    expect(chess.isStalemate()).toBe(true);
    expect(chess.isDraw()).toBe(true);
  });

  it('accurately identifies Insufficient Material', () => {
    // King vs King
    chess.load('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
    expect(chess.isInsufficientMaterial()).toBe(true);
    expect(chess.isDraw()).toBe(true);

    // King + Bishop vs King
    chess.load('8/8/8/4k3/8/8/4KB2/8 w - - 0 1');
    expect(chess.isInsufficientMaterial()).toBe(true);
  });

  it('supports FEN load and PGN export', () => {
    const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    chess.load(fen);
    expect(chess.fen()).toBe(fen);

    chess.move('Nf3');
    expect(chess.pgn()).toContain('2. Nf3');
  });

  it('supports undo and redo mechanics', () => {
    chess.move('e4');
    chess.move('e5');
    expect(chess.history().length).toBe(2);

    const undone = chess.undo();
    expect(undone.san).toBe('e5');
    expect(chess.history().length).toBe(1);
    expect(chess.turn()).toBe('b');

    // Redo by reapplying move
    chess.move(undone);
    expect(chess.history().length).toBe(2);
    expect(chess.turn()).toBe('w');
  });

  it('detects chess openings dynamically as moves are played', async () => {
    const { identifyOpening, formatOpeningLabel } = await import('../src/core/engine/openings.js');

    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 -> Italian Game
    chess.move('e4');
    chess.move('e5');
    chess.move('Nf3');
    chess.move('Nc6');
    chess.move('Bc4');

    const opening = identifyOpening(chess.history());
    expect(opening).not.toBeNull();
    expect(opening.eco).toBe('C50');
    expect(opening.name).toBe('Italian Game');
    expect(formatOpeningLabel(opening, 'vi')).toBe('C50 · Khai cuộc Ý');
  });

  it('computes static position evaluation correctly for opening and tactical situations', async () => {
    const { evaluateBoard } = await import('../src/core/engine/ai.js');

    // Starting position evaluation is ~0 (symmetric)
    const startScore = evaluateBoard(chess);
    expect(Math.abs(startScore)).toBeLessThan(50);

    // After White captures a free queen: White has huge material advantage
    chess.load('rnb1kbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1');
    const normalScore = evaluateBoard(chess);
    chess.load('rnb1kbnr/pppp1ppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1');
    const blackDownPawn = evaluateBoard(chess);
    expect(blackDownPawn).toBeGreaterThan(normalScore);
  });

  it('exposes direct 1-click match configuration and Zen mode control methods', async () => {
    const { StandardChessGame } = await import('../src/modes/standard/index.js');
    expect(typeof StandardChessGame.prototype.setGameMode).toBe('function');
    expect(typeof StandardChessGame.prototype.setBotLevel).toBe('function');
    expect(typeof StandardChessGame.prototype.setTimeControl).toBe('function');
    expect(typeof StandardChessGame.prototype.toggleZenMode).toBe('function');
    expect(typeof StandardChessGame.prototype.setZenMode).toBe('function');
    expect(typeof StandardChessGame.prototype.syncQuickPanelUI).toBe('function');

    // Verify initial instance default state
    const dummyContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    const game = new StandardChessGame(dummyContainer);
    expect(game.gameMode).toBe('bot');
    expect(game.botLevel).toBe(2);
    expect(game.timeControl).toBe('5+0');
    expect(game.isZenMode).toBe(false);

    // Verify state mutations
    game.setBotLevel(1);
    expect(game.botLevel).toBe(1);
    game.setBotLevel(3);
    expect(game.botLevel).toBe(3);

    game.setTimeControl('10+0');
    expect(game.timeControl).toBe('10+0');
    game.setTimeControl('unlimited');
    expect(game.timeControl).toBe('unlimited');

    game.setGameMode('pass');
    expect(game.gameMode).toBe('pass');

    game.setZenMode(true);
    expect(game.isZenMode).toBe(true);
    game.toggleZenMode();
    expect(game.isZenMode).toBe(false);

    game.destroy();
  });

  it('exposes Game Review workflow methods and handles review navigation', async () => {
    const { StandardChessGame } = await import('../src/modes/standard/index.js');
    expect(typeof StandardChessGame.prototype.startReviewMode).toBe('function');
    expect(typeof StandardChessGame.prototype.exitReviewMode).toBe('function');
    expect(typeof StandardChessGame.prototype.navigateToReviewMove).toBe('function');
    expect(typeof StandardChessGame.prototype.handleRetryMoveClick).toBe('function');
    expect(typeof StandardChessGame.prototype.handleRetryMoveAttempt).toBe('function');

    const dummyContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    const game = new StandardChessGame(dummyContainer);
    expect(game.isReviewMode).toBe(false);
    expect(game.reviewData).toBe(null);

    // Mock history snapshots
    game.historySnapshots = [
      { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', san: '', lastMove: null },
      { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', san: 'e4', lastMove: { from: 'e2', to: 'e4' } },
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', san: 'e5', lastMove: { from: 'e7', to: 'e5' } }
    ];

    // Mock review data
    game.reviewData = {
      whiteAccuracy: 88.5,
      blackAccuracy: 82.1,
      summary: {
        white: { best: 1, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { best: 1, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
      },
      moves: [
        { moveIndex: 1, color: 'w', san: 'e4', from: 'e2', to: 'e4', classification: 'best', currEval: 25, bestSan: 'e4' },
        { moveIndex: 2, color: 'b', san: 'e5', from: 'e7', to: 'e5', classification: 'best', currEval: 20, bestSan: 'e5' }
      ],
      evalHistory: [0, 25, 20],
      keyMoments: []
    };

    game.isReviewMode = true;
    game.navigateToReviewMove(1);
    expect(game.reviewMoveIndex).toBe(1);

    game.navigateToReviewMove(2);
    expect(game.reviewMoveIndex).toBe(2);

    // Out of bounds clamping
    game.navigateToReviewMove(10);
    expect(game.reviewMoveIndex).toBe(2);

    game.navigateToReviewMove(-5);
    expect(game.reviewMoveIndex).toBe(0);

    game.exitReviewMode();
    expect(game.isReviewMode).toBe(false);

    game.destroy();
  });
});


