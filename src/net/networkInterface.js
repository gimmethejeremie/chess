/**
 * Abstract interface for multiplayer networking.
 * Decouples game logic from the specific transport (Firebase Realtime Database, Mock, WebSocket, WebRTC).
 */

export class NetworkAdapter {
  /**
   * Connect and authenticate anonymously or with credentials
   * @returns {Promise<{ uid: string }>}
   */
  async connect() {
    throw new Error('Not implemented: connect()');
  }

  /**
   * Get current authenticated user ID
   * @returns {string|null}
   */
  getUserId() {
    throw new Error('Not implemented: getUserId()');
  }

  /**
   * Create a new online game room
   * @param {Object} options
   * @param {'white'|'black'|'random'} [options.hostColor='random']
   * @param {string} [options.timeControl='5+0']
   * @param {Object} [options.customTime]
   * @returns {Promise<{ roomId: string, role: 'white'|'black', roomState: Object }>}
   */
  async createRoom(options) {
    throw new Error('Not implemented: createRoom()');
  }

  /**
   * Join an existing game room
   * @param {string} roomId
   * @returns {Promise<{ roomId: string, role: 'white'|'black'|'spectator', roomState: Object }>}
   */
  async joinRoom(roomId) {
    throw new Error('Not implemented: joinRoom()');
  }

  /**
   * Send a validated chess move to the room
   * @param {string} roomId
   * @param {Object} moveData
   * @param {string} moveData.san
   * @param {string} moveData.from
   * @param {string} moveData.to
   * @param {string} [moveData.promotion]
   * @param {string} moveData.fen
   * @param {number} moveData.whiteRemainingMs
   * @param {number} moveData.blackRemainingMs
   * @returns {Promise<void>}
   */
  async sendMove(roomId, moveData) {
    throw new Error('Not implemented: sendMove()');
  }

  /**
   * Claim victory / draw on timeout using a concurrency-safe transaction
   * @param {string} roomId
   * @param {Object} data
   * @param {'w'|'b'} data.flaggedColor
   * @param {string} data.reason
   * @param {string} data.result
   * @returns {Promise<void>}
   */
  async claimTimeout(roomId, data) {
    throw new Error('Not implemented: claimTimeout()');
  }

  /**
   * Resign active game
   * @param {string} roomId
   * @param {'white'|'black'} playerColor
   * @returns {Promise<void>}
   */
  async resign(roomId, playerColor) {
    throw new Error('Not implemented: resign()');
  }

  /**
   * Offer draw to opponent
   * @param {string} roomId
   * @param {'white'|'black'} playerColor
   * @returns {Promise<void>}
   */
  async offerDraw(roomId, playerColor) {
    throw new Error('Not implemented: offerDraw()');
  }

  /**
   * Accept offered draw
   * @param {string} roomId
   * @returns {Promise<void>}
   */
  async acceptDraw(roomId) {
    throw new Error('Not implemented: acceptDraw()');
  }

  /**
   * Decline offered draw
   * @param {string} roomId
   * @returns {Promise<void>}
   */
  async declineDraw(roomId) {
    throw new Error('Not implemented: declineDraw()');
  }

  /**
   * Start rematch with swapped player colors
   * @param {string} roomId
   * @returns {Promise<void>}
   */
  async rematch(roomId) {
    throw new Error('Not implemented: rematch()');
  }

  /**
   * Subscribe to room state updates
   * @param {string} roomId
   * @param {Function} callback
   * @returns {() => void} Unsubscribe function
   */
  onState(roomId, callback) {
    throw new Error('Not implemented: onState()');
  }

  /**
   * Subscribe to players presence status
   * @param {string} roomId
   * @param {Function} callback
   * @returns {() => void} Unsubscribe function
   */
  onPresence(roomId, callback) {
    throw new Error('Not implemented: onPresence()');
  }

  /**
   * Leave room and clean up listeners/presence
   * @param {string} roomId
   * @returns {Promise<void>}
   */
  async leaveRoom(roomId) {
    throw new Error('Not implemented: leaveRoom()');
  }

  /**
   * Get server time offset in ms
   * @returns {number}
   */
  getServerTimeOffset() {
    return 0;
  }

  /**
   * Get estimated server timestamp in ms
   * @returns {number}
   */
  getServerTime() {
    return Date.now() + this.getServerTimeOffset();
  }
}
