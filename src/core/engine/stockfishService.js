/**
 * Stockfish Engine Service
 * Manages background Web Worker running Stockfish UCI chess engine,
 * with graceful fallback to client-side minimax engine (ai.js) for
 * offline environments, unsupported browsers, or test runners.
 */
import { Chess } from 'chess.js';
import { getBestMove as fallbackGetBestMove, evaluateBoard as fallbackEvaluateBoard } from './ai.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';

export class StockfishService {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.isInitializing = false;
    this.initPromise = null;
    this.currentResolver = null;
    this.currentRejecter = null;
    this.currentEvalResolver = null;
    this.lastInfoScore = null;
    this.lastInfoMate = null;
    this.lastInfoDepth = null;
    this.lastInfoPv = null;
    this.engineName = 'Stockfish';
    this.searchTimeoutId = null;
  }

  /**
   * Check if Web Workers and browser environment are available
   * @returns {boolean}
   */
  isSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof window.Worker !== 'undefined' &&
      typeof window.location !== 'undefined'
    );
  }

  /**
   * Initialize Stockfish Worker
   * @returns {Promise<boolean>} Resolves true if worker initialized, false if fallback
   */
  async init() {
    if (this.isReady) return true;
    if (this.isInitializing) return this.initPromise;

    if (!this.isSupported()) {
      return false;
    }

    this.isInitializing = true;
    this.initPromise = new Promise((resolve) => {
      try {
        const cleanBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
        const wasmSupported =
          typeof WebAssembly === 'object' &&
          typeof WebAssembly.validate === 'function' &&
          WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));

        const workerFile = wasmSupported ? 'stockfish.wasm.js' : 'stockfish.js';
        const workerUrl = `${cleanBase}stockfish/${workerFile}`;

        this.worker = new Worker(workerUrl);

        const initTimeout = setTimeout(() => {
          if (!this.isReady) {
            console.warn('[Stockfish] Worker init timed out, falling back to built-in engine.');
            this.terminate();
            this.isInitializing = false;
            resolve(false);
          }
        }, 3500);

        this.worker.onmessage = (event) => {
          const line = typeof event.data === 'string' ? event.data : '';
          this.handleWorkerMessage(line);

          if (line === 'readyok' || line.includes('readyok')) {
            clearTimeout(initTimeout);
            this.isReady = true;
            this.isInitializing = false;
            resolve(true);
          }
        };

        this.worker.onerror = (err) => {
          console.warn('[Stockfish] Worker error, falling back:', err);
          clearTimeout(initTimeout);
          this.terminate();
          this.isInitializing = false;
          resolve(false);
        };

        // Handshake
        this.worker.postMessage('uci');
        this.worker.postMessage('isready');
      } catch (err) {
        console.warn('[Stockfish] Failed to instantiate worker:', err);
        this.terminate();
        this.isInitializing = false;
        resolve(false);
      }
    });

    return this.initPromise;
  }

  /**
   * Process raw message from Stockfish UCI worker
   * @param {string} line
   */
  handleWorkerMessage(line) {
    if (!line) return;

    if (line.startsWith('id name ')) {
      this.engineName = line.substring(8).trim();
    }

    // Parse info depth X score cp Y / mate Z pv ...
    if (line.startsWith('info ') && line.includes('score ')) {
      const depthMatch = line.match(/depth\s+(\d+)/);
      if (depthMatch) {
        this.lastInfoDepth = parseInt(depthMatch[1], 10);
      }

      const cpMatch = line.match(/score\s+cp\s+(-?\d+)/);
      if (cpMatch) {
        this.lastInfoScore = parseInt(cpMatch[1], 10);
        this.lastInfoMate = null;
      }

      const mateMatch = line.match(/score\s+mate\s+(-?\d+)/);
      if (mateMatch) {
        this.lastInfoMate = parseInt(mateMatch[1], 10);
        this.lastInfoScore = this.lastInfoMate > 0 ? 30000 : -30000;
      }

      const pvMatch = line.match(/pv\s+([a-h1-8qrbn\s]+)/);
      if (pvMatch) {
        this.lastInfoPv = pvMatch[1].trim().split(/\s+/);
      }
    }

    // Parse bestmove <move>
    if (line.startsWith('bestmove ')) {
      if (this.searchTimeoutId) {
        clearTimeout(this.searchTimeoutId);
        this.searchTimeoutId = null;
      }

      const parts = line.split(/\s+/);
      const moveStr = parts[1];

      let parsedMove = null;
      if (moveStr && moveStr !== '(none)') {
        parsedMove = {
          from: moveStr.substring(0, 2),
          to: moveStr.substring(2, 4),
          promotion: moveStr.length > 4 ? moveStr[4].toLowerCase() : undefined
        };
      }

      const result = {
        bestMove: parsedMove,
        score: this.lastInfoScore,
        mate: this.lastInfoMate,
        depth: this.lastInfoDepth,
        pv: this.lastInfoPv
      };

      if (this.currentResolver) {
        const resolver = this.currentResolver;
        this.currentResolver = null;
        this.currentRejecter = null;
        resolver(result);
      }

      if (this.currentEvalResolver) {
        const evalResolver = this.currentEvalResolver;
        this.currentEvalResolver = null;
        evalResolver(result);
      }
    }
  }

  /**
   * Set Stockfish skill level (0 to 20)
   * @param {number} level 1: Beginner (Skill 0), 2: Intermediate (Skill 6), 3: Master (Skill 20)
   */
  setSkillLevel(level = 2) {
    if (!this.isReady || !this.worker) return;

    let skill = 6;
    if (level === 1) skill = 0;
    else if (level === 2) skill = 6;
    else if (level >= 3) skill = 20;

    this.worker.postMessage(`setoption name Skill Level value ${skill}`);
  }

  /**
   * Calculate best move for given FEN position
   * @param {string} fen Board FEN
   * @param {object} options
   * @param {number} [options.level=2] 1: Beginner, 2: Intermediate, 3: Master
   * @param {number} [options.depth] Search depth override
   * @param {number} [options.movetime] Search time in ms override
   * @returns {Promise<{ from: string, to: string, promotion?: string, score?: number, mate?: number }>}
   */
  async getBestMove(fen, options = {}) {
    const { level = 2, depth, movetime } = options;

    // Check if worker is ready or can be initialized
    if (!this.isReady) {
      await this.init();
    }

    // Fallback if worker not available
    if (!this.isReady || !this.worker) {
      const chess = new Chess(fen);
      return fallbackGetBestMove(chess, level);
    }

    return new Promise((resolve) => {
      this.lastInfoScore = null;
      this.lastInfoMate = null;
      this.lastInfoDepth = null;
      this.lastInfoPv = null;

      // Determine search parameters based on difficulty level
      this.setSkillLevel(level);

      let searchDepth = depth;
      let searchMovetime = movetime;

      if (!searchDepth && !searchMovetime) {
        if (level === 1) {
          searchDepth = 2;
          searchMovetime = 250;
        } else if (level === 2) {
          searchDepth = 5;
          searchMovetime = 600;
        } else {
          searchDepth = 10;
          searchMovetime = 1200;
        }
      }

      this.currentResolver = ({ bestMove, score, mate }) => {
        if (!bestMove) {
          // If Stockfish returned (none), fallback to legal move
          const chess = new Chess(fen);
          resolve(fallbackGetBestMove(chess, level));
          return;
        }

        // Stockfish scores are relative to side to move. Normalize to White-relative:
        const turn = fen.split(' ')[1] || 'w';
        const normalizedScore = score !== null && score !== undefined
          ? (turn === 'w' ? score : -score)
          : (turn === 'w' ? 0 : 0);

        resolve({
          from: bestMove.from,
          to: bestMove.to,
          promotion: bestMove.promotion || 'q',
          score: normalizedScore,
          mate: mate !== null && mate !== undefined ? (turn === 'w' ? mate : -mate) : undefined
        });
      };

      // Safety timeout: 4 seconds maximum before fallback
      this.searchTimeoutId = setTimeout(() => {
        if (this.currentResolver) {
          console.warn('[Stockfish] Search timed out, fallback to internal engine.');
          this.stop();
          const chess = new Chess(fen);
          resolve(fallbackGetBestMove(chess, level));
        }
      }, 4000);

      this.worker.postMessage('stop');
      this.worker.postMessage(`position fen ${fen}`);

      if (searchDepth && !searchMovetime) {
        this.worker.postMessage(`go depth ${searchDepth}`);
      } else if (searchMovetime) {
        this.worker.postMessage(`go movetime ${searchMovetime}`);
      } else {
        this.worker.postMessage('go depth 6');
      }
    });
  }

  /**
   * Evaluate a position statically or with shallow depth
   * @param {string} fen Board FEN
   * @param {number} [depth=8] Search depth
   * @returns {Promise<{ scoreCp: number, mate?: number, bestMove?: object }>} Score from White perspective
   */
  async evaluatePosition(fen, depth = 8) {
    if (!this.isReady) {
      await this.init();
    }

    if (!this.isReady || !this.worker) {
      const chess = new Chess(fen);
      const score = fallbackEvaluateBoard(chess);
      return { scoreCp: score };
    }

    return new Promise((resolve) => {
      this.lastInfoScore = 0;
      this.lastInfoMate = null;
      this.lastInfoDepth = 0;

      this.currentEvalResolver = ({ bestMove, score, mate }) => {
        const turn = fen.split(' ')[1] || 'w';
        const finalScore = score !== null && score !== undefined
          ? (turn === 'w' ? score : -score)
          : 0;

        resolve({
          scoreCp: finalScore,
          mate: mate !== null && mate !== undefined ? (turn === 'w' ? mate : -mate) : undefined,
          bestMove
        });
      };

      // Safety timeout
      const evalTimeout = setTimeout(() => {
        if (this.currentEvalResolver) {
          this.stop();
          const chess = new Chess(fen);
          resolve({ scoreCp: fallbackEvaluateBoard(chess) });
        }
      }, 2500);

      const prevResolver = this.currentEvalResolver;
      this.currentEvalResolver = (res) => {
        clearTimeout(evalTimeout);
        prevResolver(res);
      };

      this.worker.postMessage('stop');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  /**
   * Send stop command to halt search
   */
  stop() {
    if (this.worker && this.isReady) {
      try {
        this.worker.postMessage('stop');
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Terminate active worker
   */
  terminate() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore
      }
      this.worker = null;
    }
    this.isReady = false;
    this.isInitializing = false;
    this.initPromise = null;
  }
}

// Global singleton instance
export const stockfishService = new StockfishService();
