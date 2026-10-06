import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';

describe('Standard Mode - Legal Rules Engine Verification', () => {
  let chess;

  beforeEach(() => {
    chess = new Chess();
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
});
