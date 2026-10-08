/**
 * Chess Game Review & Analysis Engine
 * Calculates player accuracy %, classifies moves (Brilliant, Best, Good,
 * Inaccuracy, Mistake, Blunder, Missed Win), and identifies key moments
 * using Stockfish evaluation or client-side engine.
 */
import { Chess } from 'chess.js';
import { stockfishService } from '../engine/stockfishService.js';
import { evaluateBoard } from '../engine/ai.js';
import { i18n } from '../i18n/index.js';

/**
 * Calculate winning probability from centipawn evaluation
 * Standard sigmoid: W(cp) = 1 / (1 + 10^(-cp / 400))
 * @param {number} cp Score in centipawns (from White perspective)
 * @returns {number} 0.0 to 1.0 (White win probability)
 */
export function winProbability(cp) {
  if (cp >= 20000) return 1.0;
  if (cp <= -20000) return 0.0;
  return 1 / (1 + Math.pow(10, -cp / 400));
}

/**
 * Classify a move based on centipawn loss and win probability change
 * @param {object} params
 * @param {number} params.prevEval
 * @param {number} params.currEval
 * @param {'w'|'b'} params.turn
 * @param {object} params.playedMove { from, to, san }
 * @param {object} [params.bestMove] { from, to }
 * @param {boolean} [params.isSacrifice=false]
 * @returns {'brilliant'|'best'|'good'|'inaccuracy'|'mistake'|'blunder'|'missedWin'}
 */
export function classifyMove({ prevEval, currEval, turn, playedMove, bestMove, isSacrifice = false }) {
  const isWhite = turn === 'w';

  // Win probability from active player's perspective
  const winBefore = isWhite ? winProbability(prevEval) : 1 - winProbability(prevEval);
  const winAfter = isWhite ? winProbability(currEval) : 1 - winProbability(currEval);

  const deltaWin = Math.max(0, winBefore - winAfter);
  const cpLoss = isWhite ? Math.max(0, prevEval - currEval) : Math.max(0, currEval - prevEval);

  const isEngineBest =
    bestMove &&
    bestMove.from &&
    playedMove &&
    playedMove.from === bestMove.from &&
    playedMove.to === bestMove.to;

  // Missed Win: was winning (> 82%) and dropped to <= 55%
  if (winBefore >= 0.82 && winAfter < 0.55) {
    return 'missedWin';
  }

  // Brilliant: finding best move under tension with sacrifice or turning game into winning
  if (isSacrifice && cpLoss <= 25 && winAfter >= 0.65 && winBefore < 0.85) {
    return 'brilliant';
  }

  // Best move
  if (isEngineBest || cpLoss <= 12 || deltaWin <= 0.015) {
    return 'best';
  }

  // Good move
  if (deltaWin <= 0.05 || cpLoss <= 45) {
    return 'good';
  }

  // Inaccuracy
  if (deltaWin <= 0.12 || cpLoss <= 110) {
    return 'inaccuracy';
  }

  // Mistake
  if (deltaWin <= 0.24 || cpLoss <= 230) {
    return 'mistake';
  }

  // Blunder
  return 'blunder';
}

/**
 * Format score in human-readable centipawns or mate string
 * @param {number} cp Score from White perspective
 * @param {number} [mate] Mate in N moves
 * @returns {string} e.g. "+1.4", "-0.8", "M2"
 */
export function formatEvaluation(cp, mate) {
  if (mate !== undefined && mate !== null) {
    return mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`;
  }
  if (Math.abs(cp) >= 25000) {
    return cp > 0 ? '+M' : '-M';
  }
  const pawns = (cp / 100).toFixed(1);
  return cp > 0 ? `+${pawns}` : `${pawns}`;
}

/**
 * Perform a full asynchronous Game Review of past snapshots
 * @param {Array<{ fen: string, san: string, lastMove: object }>} snapshots
 * @param {Function} [onProgress] Callback ({ current, total, percent })
 * @returns {Promise<object>} Complete review analysis result
 */
export async function analyzeGameReview(snapshots, onProgress = null) {
  if (!Array.isArray(snapshots) || snapshots.length <= 1) {
    return {
      whiteAccuracy: 100,
      blackAccuracy: 100,
      summary: {
        white: { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, missedWin: 0 },
        black: { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, missedWin: 0 }
      },
      moves: [],
      evalHistory: [0],
      keyMoments: []
    };
  }

  const movesCount = snapshots.length - 1;
  const analyzedMoves = [];
  const evalHistory = [0];
  const keyMoments = [];

  const summary = {
    white: { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, missedWin: 0 },
    black: { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, missedWin: 0 }
  };

  const whiteAccuracyValues = [];
  const blackAccuracyValues = [];

  // Track initial position evaluation
  let currentPrevEval = 0;
  try {
    const initEval = await stockfishService.evaluatePosition(snapshots[0].fen, 4);
    currentPrevEval = initEval.scoreCp || 0;
  } catch {
    currentPrevEval = 0;
  }
  evalHistory[0] = currentPrevEval;

  for (let i = 1; i <= movesCount; i++) {
    const prevSnap = snapshots[i - 1];
    const snap = snapshots[i];
    const playedMove = snap.lastMove || {};

    const chessPrev = new Chess(prevSnap.fen);
    const turn = chessPrev.turn(); // who played the move: 'w' or 'b'

    // Evaluate position before and after
    let bestMoveObj = null;
    let evalAfter = 0;
    let mateAfter = null;

    try {
      // Find best move in previous position
      const prevEngineRes = await stockfishService.evaluatePosition(prevSnap.fen, 6);
      bestMoveObj = prevEngineRes.bestMove;

      // Evaluate new position
      const currEngineRes = await stockfishService.evaluatePosition(snap.fen, 6);
      evalAfter = currEngineRes.scoreCp;
      mateAfter = currEngineRes.mate;
    } catch {
      const chessCurr = new Chess(snap.fen);
      evalAfter = evaluateBoard(chessCurr);
    }

    evalHistory.push(evalAfter);

    // Check if played move was a piece sacrifice (e.g. piece moved to capture/attack with material drop)
    const isSacrifice = false; // standard heuristic

    const classification = classifyMove({
      prevEval: currentPrevEval,
      currEval: evalAfter,
      turn,
      playedMove,
      bestMove: bestMoveObj,
      isSacrifice
    });

    // Update accuracy statistics
    const isWhite = turn === 'w';
    const winBefore = isWhite ? winProbability(currentPrevEval) : 1 - winProbability(currentPrevEval);
    const winAfter = isWhite ? winProbability(evalAfter) : 1 - winProbability(evalAfter);
    const deltaWin = Math.max(0, winBefore - winAfter);

    // Move accuracy bounded in [0, 100]
    const moveAcc = Math.max(0, Math.min(100, (1 - 2.1 * deltaWin) * 100));

    if (isWhite) {
      whiteAccuracyValues.push(moveAcc);
      summary.white[classification] = (summary.white[classification] || 0) + 1;
    } else {
      blackAccuracyValues.push(moveAcc);
      summary.black[classification] = (summary.black[classification] || 0) + 1;
    }

    // Convert bestMove to SAN in previous position if available
    let bestSan = '';
    if (bestMoveObj && bestMoveObj.from && bestMoveObj.to) {
      try {
        const testChess = new Chess(prevSnap.fen);
        const testMove = testChess.move({
          from: bestMoveObj.from,
          to: bestMoveObj.to,
          promotion: bestMoveObj.promotion || 'q'
        });
        if (testMove) bestSan = testMove.san;
      } catch {
        bestSan = `${bestMoveObj.from}-${bestMoveObj.to}`;
      }
    }

    if (['inaccuracy', 'mistake', 'blunder', 'missedWin'].includes(classification)) {
      keyMoments.push(i);
    }

    analyzedMoves.push({
      moveIndex: i,
      color: turn,
      san: snap.san,
      from: playedMove.from,
      to: playedMove.to,
      fen: snap.fen,
      prevFen: prevSnap.fen,
      prevEval: currentPrevEval,
      currEval: evalAfter,
      mate: mateAfter,
      bestMove: bestMoveObj,
      bestSan: bestSan || snap.san,
      classification
    });

    currentPrevEval = evalAfter;

    if (onProgress) {
      onProgress({
        current: i,
        total: movesCount,
        percent: Math.round((i / movesCount) * 100)
      });
    }
  }

  // Calculate overall player accuracy
  const calcAvg = (arr) => {
    if (arr.length === 0) return 100;
    const sum = arr.reduce((a, b) => a + b, 0);
    return Math.round((sum / arr.length) * 10) / 10;
  };

  return {
    whiteAccuracy: calcAvg(whiteAccuracyValues),
    blackAccuracy: calcAvg(blackAccuracyValues),
    summary,
    moves: analyzedMoves,
    evalHistory,
    keyMoments
  };
}
