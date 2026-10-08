import { describe, it, expect, beforeEach } from 'vitest';
import { stockfishService, StockfishService } from '../src/core/engine/stockfishService.js';
import { Chess } from 'chess.js';

describe('Stockfish Service & Engine Fallback Verification', () => {
  let chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('correctly handles non-browser environments and falls back gracefully', async () => {
    const service = new StockfishService();
    expect(service.isReady).toBe(false);

    // Initializing in Node.js test environment returns false (no Worker)
    const initialized = await service.init();
    expect(initialized).toBe(false);
    expect(service.isReady).toBe(false);
  });

  it('returns valid legal moves in fallback mode', async () => {
    const bestMove = await stockfishService.getBestMove(chess.fen(), { level: 2 });
    expect(bestMove).not.toBeNull();
    expect(bestMove.from).toBeDefined();
    expect(bestMove.to).toBeDefined();

    // Verify move is strictly legal in starting position
    const legalMoves = chess.moves({ verbose: true });
    const isLegal = legalMoves.some((m) => m.from === bestMove.from && m.to === bestMove.to);
    expect(isLegal).toBe(true);
  });

  it('evaluates position in fallback mode', async () => {
    const evalResult = await stockfishService.evaluatePosition(chess.fen(), 6);
    expect(evalResult).toBeDefined();
    expect(typeof evalResult.scoreCp).toBe('number');
    // Starting board position is roughly 0
    expect(Math.abs(evalResult.scoreCp)).toBeLessThanOrEqual(50);
  });

  it('accurately converts tactical positions to winning evaluations', async () => {
    // Scholar's Mate checkmate position
    const mateFen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    const evalResult = await stockfishService.evaluatePosition(mateFen, 4);
    expect(evalResult.scoreCp).toBe(30000);
  });
});
