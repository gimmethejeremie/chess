/**
 * Firebase Realtime Database & Anonymous Auth Implementation of NetworkAdapter.
 * Modular Firebase v9+ / v10+ SDK.
 * Features:
 * - Anonymous Auth with session persistence
 * - Room creation with short 6-char codes & role assignment (White, Black, Spectator)
 * - Move validation, FEN updates, and drift-free server timestamp clock sync (.info/serverTimeOffset)
 * - Atomic timeout claim using runTransaction()
 * - Presence management (.info/connected + onDisconnect)
 * - Resign, Draw offer/accept/decline, Rematch with swapped colors
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  off,
  runTransaction,
  serverTimestamp,
  onDisconnect
} from 'firebase/database';
import { NetworkAdapter } from './networkInterface.js';

export class FirebaseNetworkAdapter extends NetworkAdapter {
  constructor() {
    super();

    let custom = null;
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('chess_firebase_custom_config') : null;
      if (stored) custom = JSON.parse(stored);
    } catch (_) {}

    this.config = {
      apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || custom?.apiKey || '',
      authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || custom?.authDomain || '',
      databaseURL: import.meta.env?.VITE_FIREBASE_DATABASE_URL || custom?.databaseURL || '',
      projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || custom?.projectId || '',
      storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || custom?.storageBucket || '',
      messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || custom?.messagingSenderId || '',
      appId: import.meta.env?.VITE_FIREBASE_APP_ID || custom?.appId || '',
      measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || custom?.measurementId || ''
    };

    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;

    this.serverTimeOffset = 0;
    this.activeRoomId = null;
    this.currentRole = null; // 'white' | 'black' | 'spectator'

    // Active listeners maps: roomId -> Function
    this.stateListeners = new Map();
    this.presenceListeners = new Map();
  }

  isConfigured() {
    return Boolean(this.config.apiKey && this.config.databaseURL);
  }

  getCustomConfig() {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('chess_firebase_custom_config') : null;
      return stored ? JSON.parse(stored) : null;
    } catch (_) {
      return null;
    }
  }

  setCustomConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    try {
      localStorage.setItem('chess_firebase_custom_config', JSON.stringify(cfg));
    } catch (_) {}

    this.config = {
      ...this.config,
      ...cfg
    };

    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;
  }

  clearCustomConfig() {
    try {
      localStorage.removeItem('chess_firebase_custom_config');
    } catch (_) {}

    this.config = {
      apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || '',
      authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || '',
      databaseURL: import.meta.env?.VITE_FIREBASE_DATABASE_URL || '',
      projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env?.VITE_FIREBASE_APP_ID || '',
      measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || ''
    };

    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;
  }

  /**
   * Initialize Firebase app, Anonymous Auth, and server time offset listener
   */
  async connect() {
    if (!this.config.apiKey || !this.config.databaseURL) {
      throw new Error(
        'Missing Firebase credentials. Please configure VITE_FIREBASE_API_KEY and VITE_FIREBASE_DATABASE_URL in .env'
      );
    }

    if (!this.app) {
      this.app = getApps().length === 0 ? initializeApp(this.config) : getApp();
      this.auth = getAuth(this.app);
      this.db = getDatabase(this.app);

      // Listen for server time offset to correct local clock drift
      const offsetRef = ref(this.db, '.info/serverTimeOffset');
      onValue(offsetRef, (snap) => {
        this.serverTimeOffset = snap.val() || 0;
      });
    }

    // Authenticate anonymously
    if (!this.currentUser) {
      const userCredential = await signInAnonymously(this.auth);
      this.currentUser = userCredential.user;
    }

    return { uid: this.currentUser.uid };
  }

  getUserId() {
    return this.currentUser?.uid || null;
  }

  getServerTimeOffset() {
    return this.serverTimeOffset;
  }

  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Generate a friendly 6-character room code (e.g., K7N2P9)
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars (0/O, 1/I)
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new online game room
   */
  async createRoom({ hostColor = 'random', timeControl = '5+0', customTime = null } = {}) {
    await this.connect();
    const uid = this.currentUser.uid;
    const roomId = this.generateRoomCode();

    // Determine host color
    let assignedHostColor = hostColor;
    if (assignedHostColor === 'random') {
      assignedHostColor = Math.random() < 0.5 ? 'white' : 'black';
    }

    const initialMs = customTime ? customTime.initialMinutes * 60000 : 300000;
    const incrementMs = customTime ? customTime.incrementSeconds * 1000 : 0;
    const incType = customTime ? customTime.type : 'fischer';

    const roomState = {
      id: roomId,
      creator: uid,
      createdAt: serverTimestamp(),
      status: 'waiting', // 'waiting' | 'playing' | 'ended'
      timeControl: {
        presetId: timeControl,
        initialMs,
        incrementMs,
        type: incType
      },
      players: {
        white: assignedHostColor === 'white' ? uid : null,
        black: assignedHostColor === 'black' ? uid : null
      },
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      moves: [],
      clocks: {
        whiteRemainingMs: initialMs,
        blackRemainingMs: initialMs,
        lastMoveServerTime: null
      },
      drawOffer: null,
      result: null,
      reason: null
    };

    const roomRef = ref(this.db, `rooms/${roomId}`);
    await set(roomRef, roomState);

    this.activeRoomId = roomId;
    this.currentRole = assignedHostColor;

    this.setupPresence(roomId, uid);

    return {
      roomId,
      role: assignedHostColor,
      roomState
    };
  }

  /**
   * Join an existing game room (as second player or spectator)
   */
  async joinRoom(roomId) {
    await this.connect();
    const uid = this.currentUser.uid;
    const cleanRoomId = roomId.trim().toUpperCase();
    const roomRef = ref(this.db, `rooms/${cleanRoomId}`);

    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${cleanRoomId}" not found. Please verify the room code.`);
    }

    const roomState = snapshot.val();
    let role = 'spectator';

    // If already one of the players (e.g. on page refresh)
    if (roomState.players?.white === uid) {
      role = 'white';
    } else if (roomState.players?.black === uid) {
      role = 'black';
    } else if (!roomState.players?.white) {
      // White seat available
      role = 'white';
      await update(ref(this.db, `rooms/${cleanRoomId}/players`), { white: uid });
    } else if (!roomState.players?.black) {
      // Black seat available
      role = 'black';
      await update(ref(this.db, `rooms/${cleanRoomId}/players`), { black: uid });
    } else {
      // Both seats filled -> Spectator
      role = 'spectator';
    }

    // If both players are seated and status was waiting, start the match
    const updatedSnap = await get(roomRef);
    const updatedState = updatedSnap.val();
    if (
      updatedState.status === 'waiting' &&
      updatedState.players?.white &&
      updatedState.players?.black
    ) {
      await update(roomRef, {
        status: 'playing',
        'clocks/lastMoveServerTime': serverTimestamp()
      });
    }

    this.activeRoomId = cleanRoomId;
    this.currentRole = role;

    this.setupPresence(cleanRoomId, uid);

    return {
      roomId: cleanRoomId,
      role,
      roomState: updatedState
    };
  }

  /**
   * Send a move to the room
   */
  async sendMove(
    roomId,
    {
      san,
      from,
      to,
      promotion = null,
      fen,
      whiteRemainingMs,
      blackRemainingMs,
      status = 'playing',
      result = null,
      reason = null
    }
  ) {
    if (!this.activeRoomId) return;

    const roomRef = ref(this.db, `rooms/${roomId}`);
    const nextTurn = fen.split(' ')[1] || 'w';

    const moveObj = {
      san,
      from,
      to,
      promotion: promotion || '',
      serverTime: serverTimestamp()
    };

    const snap = await get(ref(this.db, `rooms/${roomId}/moves`));
    const moves = snap.val() || [];
    moves.push(moveObj);

    const updateData = {
      fen,
      turn: nextTurn,
      moves,
      status,
      drawOffer: null,
      clocks: {
        whiteRemainingMs,
        blackRemainingMs,
        lastMoveServerTime: status === 'ended' ? null : serverTimestamp()
      }
    };

    if (result) updateData.result = result;
    if (reason) updateData.reason = reason;

    await update(roomRef, updateData);
  }

  /**
   * Concurrency-safe timeout claim using runTransaction()
   */
  async claimTimeout(roomId, { flaggedColor, reason, result }) {
    const roomRef = ref(this.db, `rooms/${roomId}`);

    await runTransaction(roomRef, (currentData) => {
      if (!currentData) return currentData;
      // If already ended, do not overwrite
      if (currentData.status === 'ended' || currentData.result) {
        return; // Abort
      }

      currentData.status = 'ended';
      currentData.result = result;
      currentData.reason = reason;
      return currentData;
    });
  }

  /**
   * Resign active game
   */
  async resign(roomId, playerColor) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const winner = playerColor === 'white' ? 'Black' : 'White';
    const result = winner === 'White' ? '1-0' : '0-1';
    const reason = `${playerColor === 'white' ? 'White' : 'Black'} resigned`;

    await update(roomRef, {
      status: 'ended',
      result,
      reason
    });
  }

  /**
   * Offer draw
   */
  async offerDraw(roomId, playerColor) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    await update(roomRef, {
      drawOffer: playerColor
    });
  }

  /**
   * Accept draw
   */
  async acceptDraw(roomId) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    await update(roomRef, {
      status: 'ended',
      result: '1/2-1/2',
      reason: 'Draw by mutual agreement',
      drawOffer: null
    });
  }

  /**
   * Decline draw
   */
  async declineDraw(roomId) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    await update(roomRef, {
      drawOffer: null
    });
  }

  /**
   * Rematch with swapped colors
   */
  async rematch(roomId) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const snap = await get(roomRef);
    if (!snap.exists()) return;

    const data = snap.val();
    const oldWhite = data.players?.white || null;
    const oldBlack = data.players?.black || null;

    const initialMs = data.timeControl?.initialMs || 300000;

    await update(roomRef, {
      status: 'playing',
      players: {
        white: oldBlack, // Swap colors!
        black: oldWhite
      },
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      moves: [],
      clocks: {
        whiteRemainingMs: initialMs,
        blackRemainingMs: initialMs,
        lastMoveServerTime: serverTimestamp()
      },
      drawOffer: null,
      result: null,
      reason: null
    });
  }

  /**
   * Subscribe to room state updates
   */
  onState(roomId, callback) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const listener = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      }
    });

    this.stateListeners.set(roomId, listener);
    return () => {
      off(roomRef, 'value', listener);
      this.stateListeners.delete(roomId);
    };
  }

  /**
   * Setup user presence (.info/connected and onDisconnect)
   */
  setupPresence(roomId, uid) {
    const connectedRef = ref(this.db, '.info/connected');
    const myPresenceRef = ref(this.db, `rooms/${roomId}/presence/${uid}`);

    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(myPresenceRef).set({
          online: false,
          lastSeen: serverTimestamp()
        });

        set(myPresenceRef, {
          online: true,
          lastSeen: serverTimestamp()
        });
      }
    });
  }

  /**
   * Subscribe to room players presence
   */
  onPresence(roomId, callback) {
    const presenceRef = ref(this.db, `rooms/${roomId}/presence`);
    const listener = onValue(presenceRef, (snapshot) => {
      callback(snapshot.val() || {});
    });

    this.presenceListeners.set(roomId, listener);
    return () => {
      off(presenceRef, 'value', listener);
      this.presenceListeners.delete(roomId);
    };
  }

  /**
   * Leave room
   */
  async leaveRoom(roomId) {
    if (this.currentUser && roomId) {
      const myPresenceRef = ref(this.db, `rooms/${roomId}/presence/${this.currentUser.uid}`);
      await set(myPresenceRef, { online: false, lastSeen: serverTimestamp() });
    }

    if (this.stateListeners.has(roomId)) {
      const listener = this.stateListeners.get(roomId);
      off(ref(this.db, `rooms/${roomId}`), 'value', listener);
      this.stateListeners.delete(roomId);
    }

    this.activeRoomId = null;
    this.currentRole = null;
  }
}

export const firebaseAdapter = new FirebaseNetworkAdapter();
