import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePiece } from '../src/core/board/index.js';
import { SoundManager } from '../src/core/sounds/index.js';
import { store } from '../src/core/store/index.js';

describe('Chess Assets & Attribution Verification', () => {
  const PIECES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
  const SETS = ['cburnett', 'merida', 'alpha'];
  const SOUNDS = ['move.mp3', 'capture.mp3', 'check.mp3', 'castle.mp3', 'game-end.mp3', 'low-time.mp3'];

  it('contains all 12 SVG pieces for each of the 3 sets', () => {
    for (const s of SETS) {
      for (const p of PIECES) {
        const filePath = path.resolve(process.cwd(), 'public/assets/pieces', s, `${p}.svg`);
        expect(fs.existsSync(filePath), `Missing piece SVG: ${filePath}`).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(100);
      }
    }
  });

  it('contains all 6 audio files in /public/assets/sounds/', () => {
    for (const snd of SOUNDS) {
      const filePath = path.resolve(process.cwd(), 'public/assets/sounds', snd);
      expect(fs.existsSync(filePath), `Missing sound: ${filePath}`).toBe(true);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(1000);
    }
  });

  it('ATTRIBUTIONS.md mentions all 3 piece sets and licenses', () => {
    const attrPath = path.resolve(process.cwd(), 'ATTRIBUTIONS.md');
    expect(fs.existsSync(attrPath)).toBe(true);
    const content = fs.readFileSync(attrPath, 'utf-8');
    expect(content).toContain('cburnett');
    expect(content).toContain('merida');
    expect(content).toContain('alpha');
    expect(content).toContain('CC BY-SA');
    expect(content).toContain('CC0');
  });
});

describe('Board & Sound Component Logic', () => {
  it('normalizePiece handles strings and objects accurately', () => {
    expect(normalizePiece('wP')).toBe('wP');
    expect(normalizePiece('bK')).toBe('bK');
    expect(normalizePiece('P')).toBe('wP');
    expect(normalizePiece('k')).toBe('bK');
    expect(normalizePiece({ color: 'w', type: 'q' })).toBe('wQ');
    expect(normalizePiece({ color: 'b', type: 'n' })).toBe('bN');
    expect(normalizePiece(null)).toBe(null);
  });

  it('SoundManager correctly updates mute state and volume', () => {
    const sm = new SoundManager({ muted: false, volume: 0.5 });
    expect(sm.isMuted()).toBe(false);
    expect(sm.volume).toBe(0.5);

    sm.toggleMute();
    expect(sm.isMuted()).toBe(true);

    sm.setVolume(0.9);
    expect(sm.volume).toBe(0.9);

    sm.setVolume(1.5); // clamps to 1
    expect(sm.volume).toBe(1);
  });

  it('store allows updating pieceSet, boardTheme, and coordinates', () => {
    store.setPieceSet('merida');
    expect(store.getState().pieceSet).toBe('merida');

    store.setBoardTheme('ocean');
    expect(store.getState().boardTheme).toBe('ocean');

    store.setCoordinates(false);
    expect(store.getState().showCoordinates).toBe(false);

    store.toggleCoordinates();
    expect(store.getState().showCoordinates).toBe(true);

    // Reset back to defaults
    store.setPieceSet('cburnett');
    store.setBoardTheme('classic');
  });
});

describe('BoardRenderer Arrow & Annotation Logic', () => {
  let originalDocument;

  beforeEach(() => {
    originalDocument = globalThis.document;
    const createEl = () => ({
      innerHTML: '',
      className: '',
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      remove: () => {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
      },
      querySelectorAll: () => [],
      querySelector: () => ({
        innerHTML: '',
        appendChild: () => {},
        setAttribute: () => {}
      }),
      style: { setProperty: () => {}, removeProperty: () => {} }
    });

    globalThis.document = {
      createElement: createEl,
      createElementNS: createEl
    };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('initializes with default annotation and drawMode state', async () => {
    const { BoardRenderer } = await import('../src/core/board/index.js');
    const container = { innerHTML: '', appendChild: () => {} };
    const board = new BoardRenderer(container);

    expect(board.drawMode).toBe(null);
    expect(board.arrows).toEqual([]);
    expect(board.highlights.markedSquares.size).toBe(0);

    board.setDrawMode('arrow');
    expect(board.drawMode).toBe('arrow');
    board.setDrawMode(null);
    expect(board.drawMode).toBe(null);
  });

  it('addArrow adds, toggles, updates color, and clears arrows correctly', async () => {
    const { BoardRenderer } = await import('../src/core/board/index.js');
    const container = { innerHTML: '', appendChild: () => {} };
    const board = new BoardRenderer(container);

    // 1. Add amber arrow e2 -> e4
    board.addArrow('e2', 'e4');
    expect(board.arrows.length).toBe(1);
    expect(board.arrows[0]).toEqual({
      from: 'e2',
      to: 'e4',
      color: 'rgba(245, 158, 11, 0.9)',
      markerId: 'arrowhead-default'
    });

    // 2. Toggle off same arrow with same color
    board.addArrow('e2', 'e4', 'rgba(245, 158, 11, 0.9)', 'arrowhead-default');
    expect(board.arrows.length).toBe(0);

    // 3. Add green arrow e2 -> e4
    board.addArrow('e2', 'e4', 'rgba(34, 197, 94, 0.9)', 'arrowhead-green');
    expect(board.arrows.length).toBe(1);
    expect(board.arrows[0].markerId).toBe('arrowhead-green');

    // 4. Update existing arrow with red color
    board.addArrow('e2', 'e4', 'rgba(239, 68, 68, 0.9)', 'arrowhead-red');
    expect(board.arrows.length).toBe(1);
    expect(board.arrows[0].markerId).toBe('arrowhead-red');

    // 5. Add second arrow b1 -> c3 (knight move)
    board.addArrow('b1', 'c3', 'rgba(59, 130, 246, 0.9)', 'arrowhead-blue');
    expect(board.arrows.length).toBe(2);

    // 6. Clear all arrows
    board.clearArrows();
    expect(board.arrows.length).toBe(0);
  });

  it('markedSquares Map supports color highlights, toggles, and clearing', async () => {
    const { BoardRenderer } = await import('../src/core/board/index.js');
    const container = { innerHTML: '', appendChild: () => {} };
    const board = new BoardRenderer(container);

    board.highlights.markedSquares.set('e4', 'rgba(34, 197, 94, 0.45)');
    expect(board.highlights.markedSquares.has('e4')).toBe(true);
    expect(board.highlights.markedSquares.get('e4')).toBe('rgba(34, 197, 94, 0.45)');

    board.clearMarkedSquares();
    expect(board.highlights.markedSquares.size).toBe(0);
  });
});
