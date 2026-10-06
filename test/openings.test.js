import { describe, it, expect } from 'vitest';
import { identifyOpening, formatOpeningLabel, normalizeMoves } from '../src/core/engine/openings.js';

describe('ECO Opening Explorer & Identifier Verification', () => {
  it('normalizes SAN strings with turn numbers accurately', () => {
    const raw = '1. e4 e5 2. Nf3 Nc6 3. Bc4';
    expect(normalizeMoves(raw)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  });

  it('accurately identifies Italian Game (C50)', () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'];
    const opening = identifyOpening(moves);
    expect(opening).not.toBeNull();
    expect(opening.eco).toBe('C50');
    expect(opening.name).toBe('Italian Game');
    expect(opening.nameVi).toBe('Khai cuộc Ý');
  });

  it('accurately identifies Ruy Lopez: Berlin Defense (C65)', () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'];
    const opening = identifyOpening(moves);
    expect(opening).not.toBeNull();
    expect(opening.eco).toBe('C65');
    expect(opening.name).toContain('Berlin');
  });

  it('accurately identifies Sicilian Defense (B20) and Najdorf (B90)', () => {
    const b20 = identifyOpening(['e4', 'c5']);
    expect(b20.eco).toBe('B20');
    expect(b20.name).toBe('Sicilian Defense');

    const b90 = identifyOpening(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(b90.eco).toBe('B90');
    expect(b90.name).toContain('Najdorf');
  });

  it('falls back to deepest known prefix when an off-book move is played', () => {
    // 1. e4 e5 2. Nf3 a6 (a6 is Miles / off standard book here)
    const moves = ['e4', 'e5', 'Nf3', 'a6'];
    const opening = identifyOpening(moves);
    expect(opening).not.toBeNull();
    expect(opening.moves).toBe('e4 e5 Nf3');
    expect(opening.eco).toBe('C40');
  });

  it('accurately identifies Queen\'s Gambit (D06)', () => {
    const opening = identifyOpening(['d4', 'd5', 'c4']);
    expect(opening.eco).toBe('D06');
    expect(opening.name).toContain("Queen's Gambit");
  });

  it('formats opening labels cleanly in Vietnamese and English', () => {
    const opening = identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(formatOpeningLabel(opening, 'vi')).toBe('C50 · Khai cuộc Ý');
    expect(formatOpeningLabel(opening, 'en')).toBe('C50 · Italian Game');
    expect(formatOpeningLabel(null)).toBe('');
  });
});
