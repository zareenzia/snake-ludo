/**
 * room-manager.js
 * In-memory room/lobby storage for Snakes & Ladders multiplayer.
 *
 * Room lifecycle: create → join → ready → start → playing → ended
 * Each room has: code, host, players[], settings, gameState
 */
const crypto = require('crypto');

class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /** Generate a short unique room code */
  _genCode() {
    let code;
    do {
      code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    } while (this.rooms.has(code));
    return code;
  }

  /** Create a new room; returns the room object */
  createRoom(hostSocketId, hostName) {
    const code = this._genCode();
    const room = {
      code,
      hostId: hostSocketId,
      phase: 'lobby', // lobby | playing | ended
      players: [],
      settings: {
        exactFinish: true,    // must land exactly on 100
        extraTurnOn6: true,   // rolling 6 = extra turn
        maxConsecutive6: 3,
        turnTimerSec: 0,      // 0 = disabled
      },
      gameState: null,
      createdAt: Date.now(),
    };
    this._addPlayer(room, hostSocketId, hostName);
    this.rooms.set(code, room);
    return room;
  }

  /** Add a player to a room's player list */
  _addPlayer(room, socketId, name, isAI) {
    const PLAYER_COLORS = ['#e94560', '#0ead69', '#f5c542', '#4d9de0'];
    const idx = room.players.length;
    room.players.push({
      id: socketId,
      name: name || ('Player ' + (idx + 1)),
      color: PLAYER_COLORS[idx] || '#aaa',
      colorName: ['Red', 'Green', 'Yellow', 'Blue'][idx] || 'Gray',
      ready: !!isAI,       // AI is always ready
      connected: true,
      position: 0,
      isAI: !!isAI,
    });
  }

  /** Add an AI player to the room (host only) */
  addAI(code, hostId) {
    const room = this.rooms.get(code);
    if (!room || room.hostId !== hostId) return null;
    if (room.phase !== 'lobby') return null;
    if (room.players.length >= 4) return null;
    const aiId = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const aiNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta'];
    this._addPlayer(room, aiId, aiNames[room.players.length - 1] || 'Bot', true);
    return room;
  }

  /** Join an existing room; returns room or null */
  joinRoom(code, socketId, playerName) {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.phase !== 'lobby') return null;
    if (room.players.length >= 4) return null;
    if (room.players.find(p => p.id === socketId)) return room; // already in
    this._addPlayer(room, socketId, playerName);
    return room;
  }

  /** Reconnect a disconnected player */
  reconnectPlayer(code, socketId, oldSocketId) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = room.players.find(p => p.id === oldSocketId);
    if (!player) return null;
    player.id = socketId;
    player.connected = true;
    return room;
  }

  /** Toggle ready status */
  setReady(code, socketId, ready) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = room.players.find(p => p.id === socketId);
    if (player) player.ready = ready;
    return room;
  }

  /** Kick a player (host only) */
  kickPlayer(code, hostId, targetId) {
    const room = this.rooms.get(code);
    if (!room || room.hostId !== hostId) return null;
    room.players = room.players.filter(p => p.id !== targetId);
    return room;
  }

  /** Update room settings (host only) */
  updateSettings(code, hostId, settings) {
    const room = this.rooms.get(code);
    if (!room || room.hostId !== hostId) return null;
    Object.assign(room.settings, settings);
    return room;
  }

  /** Mark player as disconnected */
  disconnectPlayer(socketId) {
    for (const [code, room] of this.rooms) {
      const player = room.players.find(p => p.id === socketId);
      if (player) {
        player.connected = false;
        // If all disconnected, clean up after a timeout
        if (room.players.every(p => !p.connected)) {
          setTimeout(() => {
            if (room.players.every(p => !p.connected)) {
              this.rooms.delete(code);
            }
          }, 60000);
        }
        // If host left lobby, transfer host
        if (room.hostId === socketId && room.phase === 'lobby') {
          const nextHost = room.players.find(p => p.connected && p.id !== socketId);
          if (nextHost) room.hostId = nextHost.id;
        }
        return { room, player };
      }
    }
    return null;
  }

  getRoom(code) { return this.rooms.get(code) || null; }

  /** Remove a room */
  deleteRoom(code) { this.rooms.delete(code); }
}

module.exports = RoomManager;
