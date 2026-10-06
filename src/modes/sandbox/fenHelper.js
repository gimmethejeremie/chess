/**
 * FEN Parser, Generator and Validator for Sandbox Mode.
 * Works independently of chess rule validation.
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

/**
 * Generate standard FEN string from a board position Map or Object and game attributes
 * @param {Object} options
 * @param {Map|Object} options.position Square -> piece mapping (e.g., { e4: 'wP' })
 * @param {'w'|'b'} [options.turn='w']
 * @param {string} [options.castling='KQkq']
 * @param {string} [options.enPassant='-']
 * @param {number} [options.halfmove=0]
 * @param {number} [options.fullmove=1]
 * @returns {string} FEN string
 */
export function positionToFen({
  position,
  turn = 'w',
  castling = '-',
  enPassant = '-',
  halfmove = 0,
  fullmove = 1
} = {}) {
  const posMap = position instanceof Map ? position : new Map(Object.entries(position || {}));
  const rankStrings = [];

  for (let r = 7; r >= 0; r--) {
    let emptyCount = 0;
    let rankStr = '';

    for (let c = 0; c < 8; c++) {
      const square = `${FILES[c]}${RANKS[r]}`;
      const pieceCode = posMap.get(square);

      if (pieceCode) {
        if (emptyCount > 0) {
          rankStr += emptyCount;
          emptyCount = 0;
        }
        const color = pieceCode[0];
        const type = pieceCode[1];
        rankStr += color === 'w' ? type.toUpperCase() : type.toLowerCase();
      } else {
        emptyCount++;
      }
    }

    if (emptyCount > 0) {
      rankStr += emptyCount;
    }
    rankStrings.push(rankStr);
  }

  const piecePlacement = rankStrings.join('/');
  const castlingStr = castling || '-';
  const epStr = enPassant || '-';
  return `${piecePlacement} ${turn} ${castlingStr} ${epStr} ${halfmove} ${fullmove}`;
}

/**
 * Parse a FEN string into board position Map and game attributes
 * @param {string} fen
 * @returns {{ position: Map<string, string>, turn: 'w'|'b', castling: string, enPassant: string, halfmove: number, fullmove: number }}
 */
export function fenToPosition(fen) {
  if (!fen || typeof fen !== 'string') {
    throw new Error('Invalid FEN: Expected a non-empty string');
  }

  const tokens = fen.trim().split(/\s+/);
  if (tokens.length < 1) {
    throw new Error('Invalid FEN format');
  }

  const [piecesPart, turn = 'w', castling = '-', enPassant = '-', halfmove = '0', fullmove = '1'] = tokens;
  const ranks = piecesPart.split('/');
  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN: Expected 8 ranks, got ${ranks.length}`);
  }

  const position = new Map();

  for (let r = 0; r < 8; r++) {
    const rankStr = ranks[r];
    const rankNum = RANKS[7 - r]; // Rank 8 is at index 0
    let col = 0;

    for (const char of rankStr) {
      if (char >= '1' && char <= '8') {
        col += parseInt(char, 10);
      } else if (/[pnbrqkPNBRQK]/.test(char)) {
        if (col >= 8) {
          throw new Error(`Invalid FEN: rank ${rankNum} exceeds 8 files`);
        }
        const square = `${FILES[col]}${rankNum}`;
        const color = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toUpperCase();
        position.set(square, `${color}${type}`);
        col++;
      } else {
        throw new Error(`Invalid FEN character: "${char}"`);
      }
    }

    if (col !== 8) {
      throw new Error(`Invalid FEN: rank ${rankNum} has file count ${col} instead of 8`);
    }
  }

  return {
    position,
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling || '-',
    enPassant: enPassant || '-',
    halfmove: parseInt(halfmove, 10) || 0,
    fullmove: parseInt(fullmove, 10) || 1
  };
}

/**
 * Validate a FEN string without throwing
 * @param {string} fen
 * @returns {boolean}
 */
export function isValidFen(fen) {
  try {
    fenToPosition(fen);
    return true;
  } catch (e) {
    return false;
  }
}
