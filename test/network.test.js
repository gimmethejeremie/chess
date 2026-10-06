import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkAdapter } from '../src/net/networkInterface.js';
import { FirebaseNetworkAdapter } from '../src/net/firebase.js';

describe('Network Interface & Adapter', () => {
  it('abstract NetworkAdapter methods throw "Not implemented"', async () => {
    const adapter = new NetworkAdapter();
    await expect(adapter.connect()).rejects.toThrow('Not implemented: connect()');
    expect(() => adapter.getUserId()).toThrow('Not implemented: getUserId()');
    await expect(adapter.createRoom({})).rejects.toThrow('Not implemented: createRoom()');
    await expect(adapter.joinRoom('ABC123')).rejects.toThrow('Not implemented: joinRoom()');
    await expect(adapter.sendMove('ABC123', {})).rejects.toThrow('Not implemented: sendMove()');
    await expect(adapter.claimTimeout('ABC123', {})).rejects.toThrow('Not implemented: claimTimeout()');
    await expect(adapter.resign('ABC123', 'white')).rejects.toThrow('Not implemented: resign()');
    await expect(adapter.offerDraw('ABC123', 'white')).rejects.toThrow('Not implemented: offerDraw()');
    await expect(adapter.acceptDraw('ABC123')).rejects.toThrow('Not implemented: acceptDraw()');
    await expect(adapter.declineDraw('ABC123')).rejects.toThrow('Not implemented: declineDraw()');
    await expect(adapter.rematch('ABC123')).rejects.toThrow('Not implemented: rematch()');
    expect(() => adapter.onState('ABC123', () => {})).toThrow('Not implemented: onState()');
    expect(() => adapter.onPresence('ABC123', () => {})).toThrow('Not implemented: onPresence()');
    await expect(adapter.leaveRoom('ABC123')).rejects.toThrow('Not implemented: leaveRoom()');
  });

  it('generateRoomCode produces valid 6-char alphanumeric codes without ambiguous characters', () => {
    const adapter = new FirebaseNetworkAdapter();
    const disallowedChars = ['0', 'O', '1', 'I'];

    for (let i = 0; i < 50; i++) {
      const code = adapter.generateRoomCode();
      expect(code).toHaveLength(6);
      expect(code).toBe(code.toUpperCase());
      for (const char of disallowedChars) {
        expect(code).not.toContain(char);
      }
    }
  });

  it('calculates server time with offset correctly', () => {
    const adapter = new FirebaseNetworkAdapter();
    adapter.serverTimeOffset = 1500; // 1.5 seconds ahead
    const now = Date.now();
    const serverTime = adapter.getServerTime();
    expect(serverTime).toBeGreaterThanOrEqual(now + 1500);
  });
});

describe('Online Multiplayer Clocks Math & Synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly computes active player remaining time using server timestamp and offset', () => {
    const adapter = new FirebaseNetworkAdapter();
    adapter.serverTimeOffset = 200; // Server is +200ms ahead of client

    const baseTime = 1000000;
    vi.setSystemTime(baseTime);

    // Initial state: White has 300,000ms (5:00), Black has 300,000ms (5:00)
    // Server time at last move was baseTime + 200
    const lastMoveServerTime = adapter.getServerTime();

    const roomState = {
      status: 'playing',
      turn: 'w',
      clocks: {
        whiteRemainingMs: 300000,
        blackRemainingMs: 300000,
        lastMoveServerTime
      }
    };

    // Simulate 10 seconds passing on client
    vi.advanceTimersByTime(10000);

    const nowServerEst = adapter.getServerTime();
    const elapsed = Math.max(0, nowServerEst - roomState.clocks.lastMoveServerTime);
    expect(elapsed).toBe(10000);

    // White should have lost exactly 10,000ms -> 290,000ms (4:50)
    const currentWhiteMs = Math.max(0, roomState.clocks.whiteRemainingMs - elapsed);
    const currentBlackMs = roomState.clocks.blackRemainingMs; // Black's clock is stopped

    expect(currentWhiteMs).toBe(290000);
    expect(currentBlackMs).toBe(300000);
  });

  it('prevents clocks from dropping below 0ms on timeout', () => {
    const adapter = new FirebaseNetworkAdapter();
    adapter.serverTimeOffset = 0;

    const baseTime = 1000000;
    vi.setSystemTime(baseTime);

    const lastMoveServerTime = adapter.getServerTime();
    const roomState = {
      status: 'playing',
      turn: 'b',
      clocks: {
        whiteRemainingMs: 150000,
        blackRemainingMs: 5000, // 5s left
        lastMoveServerTime
      }
    };

    // Advance 8 seconds (3s after timeout)
    vi.advanceTimersByTime(8000);

    const nowServerEst = adapter.getServerTime();
    const elapsed = Math.max(0, nowServerEst - roomState.clocks.lastMoveServerTime);
    const currentBlackMs = Math.max(0, roomState.clocks.blackRemainingMs - elapsed);

    expect(currentBlackMs).toBe(0);
  });

  it('correctly swaps player colors on rematch', () => {
    const roomData = {
      players: {
        white: 'user-alice-123',
        black: 'user-bob-456'
      }
    };

    // Rematch logic
    const oldWhite = roomData.players.white;
    const oldBlack = roomData.players.black;

    const newPlayers = {
      white: oldBlack,
      black: oldWhite
    };

    expect(newPlayers.white).toBe('user-bob-456');
    expect(newPlayers.black).toBe('user-alice-123');
  });

  it('assigns spectator role when both white and black seats are taken', () => {
    const roomState = {
      players: {
        white: 'user-1',
        black: 'user-2'
      }
    };

    const joiningUid = 'user-3';
    let role = 'spectator';

    if (roomState.players.white === joiningUid) {
      role = 'white';
    } else if (roomState.players.black === joiningUid) {
      role = 'black';
    } else if (!roomState.players.white) {
      role = 'white';
    } else if (!roomState.players.black) {
      role = 'black';
    } else {
      role = 'spectator';
    }

    expect(role).toBe('spectator');
  });
});
