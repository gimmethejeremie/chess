/**
 * Sound Manager for Chess Playground.
 * Supports playing move, capture, check, castle, game-end, low-time audio effects.
 * Handles browser audio caching, mute state, volume, and localStorage persistence.
 */
import { storage } from '../storage/index.js';

const SOUND_STORAGE_KEY = 'sound_muted';
const BASE_URL = import.meta.env?.BASE_URL || '/';

export class SoundManager {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.muted]
   * @param {number} [options.volume]
   */
  constructor({ muted, volume = 0.8 } = {}) {
    this.muted = muted !== undefined ? muted : Boolean(storage.get(SOUND_STORAGE_KEY, false));
    this.volume = volume;
    this.cache = new Map();
    this.soundFiles = {
      'move': `${BASE_URL}assets/sounds/move.mp3`,
      'capture': `${BASE_URL}assets/sounds/capture.mp3`,
      'check': `${BASE_URL}assets/sounds/check.mp3`,
      'castle': `${BASE_URL}assets/sounds/castle.mp3`,
      'game-end': `${BASE_URL}assets/sounds/game-end.mp3`,
      'low-time': `${BASE_URL}assets/sounds/low-time.mp3`
    };
  }

  /**
   * Play an audio sound effect
   * @param {'move'|'capture'|'check'|'castle'|'game-end'|'low-time'} name
   */
  play(name) {
    if (this.muted) return;
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

    const src = this.soundFiles[name];
    if (!src) {
      console.warn(`[SoundManager] Unknown sound: ${name}`);
      return;
    }

    try {
      // Use existing audio element or create new one
      let audio = this.cache.get(name);
      if (!audio) {
        audio = new Audio(src);
        this.cache.set(name, audio);
      } else {
        audio.currentTime = 0;
      }

      audio.volume = this.volume;
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch((err) => {
          // Gracefully ignore autoplay restrictions if audio is blocked before user gesture
          if (err.name !== 'NotAllowedError') {
            console.warn(`[SoundManager] Playback failed for "${name}":`, err);
          }
        });
      }
    } catch (err) {
      console.warn(`[SoundManager] Audio initialization error:`, err);
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    storage.set(SOUND_STORAGE_KEY, this.muted);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }
}

export const soundManager = new SoundManager();
