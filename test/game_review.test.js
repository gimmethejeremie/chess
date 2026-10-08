import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  winProbability,
  classifyMove,
  formatEvaluation,
  analyzeGameReview
} from '../src/core/analysis/gameReview.js';

describe('Game Review & Analysis Logic Verification', () => {
  it('winProbability correctly maps centipawn advantage into probabilities', () => {
    // 0 cp = 50%
    expect(winProbability(0)).toBeCloseTo(0.5, 2);
    // +400 cp = roughly 90.9%
    expect(winProbability(400)).toBeGreaterThan(0.85);
    // -400 cp = roughly 9.1%
    expect(winProbability(-400)).toBeLessThan(0.15);
  });

  it('correctly classifies a best move with little to no centipawn loss', () => {
    const classification = classifyMove({
      prevEval: 20,
      currEval: 25,
      turn: 'w',
      playedMove: { from: 'e2', to: 'e4', san: 'e4' },
      bestMove: { from: 'e2', to: 'e4' }
    });
    expect(classification).toBe('best');
  });

  it('correctly classifies a severe blunder when giving up a queen', () => {
    // White was +50, drops to -800
    const classification = classifyMove({
      prevEval: 50,
      currEval: -800,
      turn: 'w',
      playedMove: { from: 'd1', to: 'h5', san: 'Qh5' },
      bestMove: { from: 'e2', to: 'e4' }
    });
    expect(classification).toBe('blunder');
  });

  it('identifies missed win when player drops from dominant win to draw', () => {
    // White was winning +600 (winProb > 95%), drops to 0 cp (winProb 50%)
    const classification = classifyMove({
      prevEval: 600,
      currEval: 0,
      turn: 'w',
      playedMove: { from: 'e4', to: 'e5', san: 'e5' },
      bestMove: { from: 'd1', to: 'd8' }
    });
    expect(classification).toBe('missedWin');
  });

  it('formatEvaluation formats numeric scores and checkmate', () => {
    expect(formatEvaluation(150)).toBe('+1.5');
    expect(formatEvaluation(-80)).toBe('-0.8');
    expect(formatEvaluation(30000, 2)).toBe('+M2');
    expect(formatEvaluation(-30000, -3)).toBe('-M3');
  });

  it('analyzes a series of moves and produces player accuracy and breakdown', async () => {
    const chess = new Chess();
    const snapshots = [
      { fen: chess.fen(), san: '', lastMove: null }
    ];

    const movesToPlay = ['e4', 'e5', 'Nf3', 'Nc6'];
    for (const san of movesToPlay) {
      const move = chess.move(san);
      snapshots.push({
        fen: chess.fen(),
        san,
        lastMove: { from: move.from, to: move.to }
      });
    }

    const review = await analyzeGameReview(snapshots);

    expect(review).toBeDefined();
    expect(review.whiteAccuracy).toBeGreaterThan(60);
    expect(review.blackAccuracy).toBeGreaterThan(60);
    expect(review.moves.length).toBe(4);
    expect(review.evalHistory.length).toBe(5);
    expect(review.summary.white).toBeDefined();
    expect(review.summary.black).toBeDefined();
  });
});
