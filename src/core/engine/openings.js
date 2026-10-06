/**
 * Opening Explorer & ECO Identifier Module
 * Matches game move history against the curated FIDE opening book using longest prefix matching.
 */

import { OPENINGS_DATA } from './openingsData.js';

// Index map: key = move string (e.g. "e4 e5 Nf3 Nc6 Bc4"), value = opening object
const openingsMap = new Map();
for (const item of OPENINGS_DATA) {
  openingsMap.set(item.moves.trim(), item);
}

/**
 * Normalizes input moves into an array of clean SAN strings
 * @param {Array<string>|string} moves
 * @returns {Array<string>}
 */
export function normalizeMoves(moves) {
  if (Array.isArray(moves)) {
    return moves.map((m) => m.trim()).filter(Boolean);
  }
  if (typeof moves === 'string') {
    // Strip turn numbers like "1. e4 e5 2. Nf3" -> ["e4", "e5", "Nf3"]
    return moves
      .replace(/\d+\.+/g, '')
      .split(/\s+/)
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Finds the deepest matching opening from the current move list
 * Uses longest prefix matching so "e4 e5 Nf3 Nc6 Bc4" returns Italian Game rather than King's Pawn
 * @param {Array<string>|string} moves List of SAN moves played so far
 * @returns {{ eco: string, name: string, nameVi: string, moves: string } | null}
 */
export function identifyOpening(moves) {
  const moveList = normalizeMoves(moves);
  if (moveList.length === 0) return null;

  // Search from longest prefix down to 1 move
  for (let len = moveList.length; len >= 1; len--) {
    const candidateKey = moveList.slice(0, len).join(' ');
    if (openingsMap.has(candidateKey)) {
      return openingsMap.get(candidateKey);
    }
  }

  return null;
}

/**
 * Formats opening into a clean, display-ready string with ECO code
 * @param {{ eco: string, name: string, nameVi: string } | null} opening
 * @param {'vi'|'en'} [lang='vi']
 * @returns {string} e.g. "C50 · Khai cuộc Ý" or "C50 · Italian Game"
 */
export function formatOpeningLabel(opening, lang = 'vi') {
  if (!opening) return '';
  const title = lang === 'vi' && opening.nameVi ? opening.nameVi : opening.name;
  return `${opening.eco} · ${title}`;
}
