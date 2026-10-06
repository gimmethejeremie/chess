/**
 * Client-side Chess AI Engine
 * Features:
 * - Material + Piece-Square Table (PST) positional heuristic evaluation
 * - Minimax with Alpha-Beta Pruning
 * - Quiescence Search for capturing stability
 * - 3 Difficulty levels:
 *    1 = Beginner (Depth 1-2, occasional blunder)
 *    2 = Intermediate (Depth 3, positional awareness)
 *    3 = Advanced (Depth 4+ with alpha-beta + quiescence search)
 */

// Piece values in centipawns
export const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// Piece-Square Tables (from White's perspective, 8x8 flattened a8=0 ... h1=63)
// For Black, squares are mirrored vertically: r -> (7 - r) * 8 + c
const PAWN_TABLE = [
   0,   0,   0,   0,   0,   0,   0,   0,
  50,  50,  50,  50,  50,  50,  50,  50,
  10,  10,  20,  30,  30,  20,  10,  10,
   5,   5,  10,  25,  25,  10,   5,   5,
   0,   0,   0,  20,  20,   0,   0,   0,
   5,  -5, -10,   0,   0, -10,  -5,   5,
   5,  10,  10, -20, -20,  10,  10,   5,
   0,   0,   0,   0,   0,   0,   0,   0
];

const KNIGHT_TABLE = [
 -50, -40, -30, -30, -30, -30, -40, -50,
 -40, -20,   0,   0,   0,   0, -20, -40,
 -30,   0,  10,  15,  15,  10,   0, -30,
 -30,   5,  15,  20,  20,  15,   5, -30,
 -30,   0,  15,  20,  20,  15,   0, -30,
 -30,   5,  10,  15,  15,  10,   5, -30,
 -40, -20,   0,   5,   5,   0, -20, -40,
 -50, -40, -30, -30, -30, -30, -40, -50
];

const BISHOP_TABLE = [
 -20, -10, -10, -10, -10, -10, -10, -20,
 -10,   0,   0,   0,   0,   0,   0, -10,
 -10,   0,   5,  10,  10,   5,   0, -10,
 -10,   5,   5,  10,  10,   5,   5, -10,
 -10,   0,  10,  10,  10,  10,   0, -10,
 -10,  10,  10,  10,  10,  10,  10, -10,
 -10,   5,   0,   0,   0,   0,   5, -10,
 -20, -10, -10, -10, -10, -10, -10, -20
];

const ROOK_TABLE = [
   0,   0,   0,   0,   0,   0,   0,   0,
   5,  10,  10,  10,  10,  10,  10,   5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
   0,   0,   0,   5,   5,   0,   0,   0
];

const QUEEN_TABLE = [
 -20, -10, -10,  -5,  -5, -10, -10, -20,
 -10,   0,   0,   0,   0,   0,   0, -10,
 -10,   0,   5,   5,   5,   5,   0, -10,
  -5,   0,   5,   5,   5,   5,   0,  -5,
   0,   0,   5,   5,   5,   5,   0,  -5,
 -10,   5,   5,   5,   5,   5,   0, -10,
 -10,   0,   5,   0,   0,   0,   0, -10,
 -20, -10, -10,  -5,  -5, -10, -10, -20
];

const KING_TABLE_MID = [
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -20, -30, -30, -40, -40, -30, -30, -20,
 -10, -20, -20, -20, -20, -20, -20, -10,
  20,  20,   0,   0,   0,   0,  20,  20,
  20,  30,  10,   0,   0,  10,  30,  20
];

function squareToIndex(square) {
  const file = square.charCodeAt(0) - 97; // 'a'=0 ... 'h'=7
  const rank = 8 - parseInt(square[1], 10); // '8'=0 ... '1'=7
  return rank * 8 + file;
}

function getPstScore(pieceType, square, color) {
  const index = squareToIndex(square);
  const pstIndex = color === 'w' ? index : (7 - Math.floor(index / 8)) * 8 + (index % 8);

  switch (pieceType) {
    case 'p': return PAWN_TABLE[pstIndex];
    case 'n': return KNIGHT_TABLE[pstIndex];
    case 'b': return BISHOP_TABLE[pstIndex];
    case 'r': return ROOK_TABLE[pstIndex];
    case 'q': return QUEEN_TABLE[pstIndex];
    case 'k': return KING_TABLE_MID[pstIndex];
    default: return 0;
  }
}

/**
 * Static board evaluation in centipawns from White's perspective (+ = White advantage, - = Black advantage)
 * @param {import('chess.js').Chess} chess
 * @returns {number} Score in centipawns
 */
export function evaluateBoard(chess) {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -30000 : 30000;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return 0;
  }

  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const squareName = String.fromCharCode(97 + c) + (8 - r);
      const pieceVal = PIECE_VALUES[piece.type] || 0;
      const pstVal = getPstScore(piece.type, squareName, piece.color);
      const totalPieceScore = pieceVal + pstVal;

      if (piece.color === 'w') {
        score += totalPieceScore;
      } else {
        score -= totalPieceScore;
      }
    }
  }

  // Small check bonus
  if (chess.isCheck()) {
    score += chess.turn() === 'w' ? -25 : 25;
  }

  return score;
}

/**
 * Quiescence search to avoid horizon effect on tactical captures
 */
function quiescence(chess, alpha, beta, isMaximizing, depth = 0) {
  const standPat = evaluateBoard(chess);
  if (depth >= 1) return standPat;

  const captureMoves = chess.moves({ verbose: true }).filter((m) => m.captured);
  if (captureMoves.length === 0) return standPat;

  captureMoves.sort((a, b) => (PIECE_VALUES[b.captured] || 0) - (PIECE_VALUES[a.captured] || 0));

  if (isMaximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    for (const move of captureMoves) {
      chess.move(move);
      const score = quiescence(chess, alpha, beta, false, depth + 1);
      chess.undo();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;

    for (const move of captureMoves) {
      chess.move(move);
      const score = quiescence(chess, alpha, beta, true, depth + 1);
      chess.undo();

      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

/**
 * Minimax with Alpha-Beta Pruning
 */
function minimax(chess, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || chess.isGameOver()) {
    return quiescence(chess, alpha, beta, isMaximizing, 0);
  }

  const moves = chess.moves({ verbose: true });
  // Move ordering: captures and checks first
  moves.sort((a, b) => {
    const valA = (a.captured ? (PIECE_VALUES[a.captured] || 0) * 10 : 0) + (a.san.includes('+') ? 50 : 0);
    const valB = (b.captured ? (PIECE_VALUES[b.captured] || 0) * 10 : 0) + (b.san.includes('+') ? 50 : 0);
    return valB - valA;
  });

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();

      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Beta cutoff
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();

      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Alpha cutoff
    }
    return minEval;
  }
}

/**
 * Computes best move for current turn with configurable difficulty
 * @param {import('chess.js').Chess} chess Chess instance
 * @param {number} [level=2] 1: Beginner, 2: Intermediate, 3: Master
 * @returns {{ from: string, to: string, promotion?: string, score: number }}
 */
export function getBestMove(chess, level = 2) {
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const isWhite = chess.turn() === 'w';

  // Level 1: Beginner - 25% chance of random move, else depth 1
  if (level === 1 && Math.random() < 0.25) {
    const randMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return {
      from: randMove.from,
      to: randMove.to,
      promotion: randMove.promotion || 'q',
      score: 0
    };
  }

  const searchDepth = level === 1 ? 1 : level === 2 ? 2 : 3;
  let bestMove = legalMoves[0];
  let bestScore = isWhite ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of legalMoves) {
    chess.move(move);
    const score = minimax(chess, searchDepth - 1, alpha, beta, !isWhite);
    chess.undo();

    if (isWhite) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
      beta = Math.min(beta, bestScore);
    }
  }

  return {
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion || 'q',
    score: bestScore
  };
}
