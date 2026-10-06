import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import { evaluateBoard, getBestMove, PIECE_VALUES } from '../src/core/engine/ai.js';

describe('AI Chess Engine & Evaluation Verification', () => {
  let chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('evaluates starting board position as roughly balanced (near 0 cp)', () => {
    const score = evaluateBoard(chess);
    // Standard starting position score is 0 due to symmetrical pieces and PST
    expect(Math.abs(score)).toBeLessThanOrEqual(50);
  });

  it('gives White a large positive score when White is up material', () => {
    // White has extra Queen
    chess.load('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const score = evaluateBoard(chess);
    expect(score).toBeGreaterThan(700);
  });

  it('gives Black a large negative score when Black is up material', () => {
    // Black has extra Queen
    chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
    const score = evaluateBoard(chess);
    expect(score).toBeLessThan(-700);
  });

  it('identifies checkmate as an extreme score', () => {
    // Scholar's Mate: White mates Black
    chess.load('r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4');
    expect(chess.isCheckmate()).toBe(true);
    const score = evaluateBoard(chess);
    expect(score).toBe(30000);
  });

  it('finds mate in 1 move when available', () => {
    // White Queen on h5, Bishop on c4, pawn on e4. Black on e5.
    // 1. Qxf7# is mate in 1
    chess.load('r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 4');
    const bestMove = getBestMove(chess, 2);
    expect(bestMove).not.toBeNull();
    expect(bestMove.from).toBe('h5');
    expect(bestMove.to).toBe('f7');
  });

  it('finds obvious free piece capture', () => {
    // Black free undefended queen on e4, White pawn on d3 can capture dxe4
    chess.load('rnb1kbnr/pppp1ppp/8/8/4q3/3P4/PPP1PPPP/RNBQKBNR w KQkq - 0 1');
    const bestMove = getBestMove(chess, 2);
    expect(bestMove).not.toBeNull();
    expect(bestMove.from).toBe('d3');
    expect(bestMove.to).toBe('e4');
  });

  it('generates valid legal moves across all 3 difficulty levels', () => {
    for (const level of [1, 2, 3]) {
      const move = getBestMove(chess, level);
      expect(move).not.toBeNull();
      const legalMoves = chess.moves({ verbose: true });
      const isValid = legalMoves.some((m) => m.from === move.from && m.to === move.to);
      expect(isValid).toBe(true);
    }
  });
});
