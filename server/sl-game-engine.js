/**
 * sl-game-engine.js
 * Server-authoritative Snakes & Ladders game engine.
 *
 * The server owns: turn order, dice rolls (crypto RNG), positions,
 * snake/ladder resolution, and win detection.
 * Clients NEVER submit rolls or positions — only "roll" requests.
 */
const crypto = require('crypto');

/** Standard 10×10 snakes & ladders with 8 snakes and 8 ladders */
const DEFAULT_SNAKES = [
  { start: 99, end: 54 },
  { start: 70, end: 55 },
  { start: 52, end: 42 },
  { start: 25, end:  2 },
  { start: 95, end: 72 },
  { start: 47, end: 19 },
  { start: 63, end: 18 },
  { start: 87, end: 24 },
];
const DEFAULT_LADDERS = [
  { start:  1, end: 38 },
  { start:  4, end: 14 },
  { start:  8, end: 30 },
  { start: 21, end: 42 },
  { start: 28, end: 76 },
  { start: 50, end: 67 },
  { start: 71, end: 92 },
  { start: 80, end: 99 },
];

class SLGameEngine {
  /**
   * Initialize game state for a room.
   * @param {object[]} players - array of player objects from room
   * @param {object} settings - room settings
   * @returns {object} gameState
   */
  static createGame(players, settings) {
    // Build the snake/ladder lookup table
    const snakeLadderMap = {};
    DEFAULT_SNAKES.forEach(s => { snakeLadderMap[s.start] = { end: s.end, type: 'snake' }; });
    DEFAULT_LADDERS.forEach(l => { snakeLadderMap[l.start] = { end: l.end, type: 'ladder' }; });

    // Shuffle turn order
    const order = players.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }

    return {
      turnOrder: order,
      currentTurnIdx: 0,         // index into turnOrder
      positions: players.map(() => 0), // 0 = off-board, 1-100 = on board
      snakes: DEFAULT_SNAKES,
      ladders: DEFAULT_LADDERS,
      snakeLadderMap,
      settings: { ...settings },
      consecutive6: 0,
      finished: [],              // player indices in finish order
      phase: 'playing',          // playing | ended
      lastRoll: null,
      lastEvent: null,
      turnTimerExpires: 0,
    };
  }

  /** Get the player index whose turn it is */
  static currentPlayerIndex(gs) {
    return gs.turnOrder[gs.currentTurnIdx];
  }

  /** Secure dice roll (1-6) */
  static rollDice() {
    return crypto.randomInt(1, 7);
  }

  /**
   * Process a turn: roll dice, compute new position, apply snakes/ladders.
   * Returns { roll, playerIdx, oldPos, newPos, snakeLadder, extraTurn, won, event }
   */
  static processTurn(gs) {
    if (gs.phase !== 'playing') return null;

    const playerIdx = SLGameEngine.currentPlayerIndex(gs);
    const roll = SLGameEngine.rollDice();
    const oldPos = gs.positions[playerIdx];

    gs.lastRoll = roll;

    let newPos = oldPos + roll;
    let snakeLadder = null;
    let extraTurn = false;
    let won = false;

    // Overshoot rule
    if (newPos > 100) {
      if (gs.settings.exactFinish) {
        // Bounce back: can't move
        newPos = oldPos;
        gs.lastEvent = { type: 'overshoot', playerIdx, roll, oldPos, newPos };
      } else {
        newPos = 100;
      }
    }

    // Apply snake/ladder (only once, no chaining)
    if (newPos !== oldPos && gs.snakeLadderMap[newPos]) {
      const sl = gs.snakeLadderMap[newPos];
      snakeLadder = { type: sl.type, from: newPos, to: sl.end };
      newPos = sl.end;
    }

    gs.positions[playerIdx] = newPos;

    // Check win
    if (newPos === 100) {
      won = true;
      gs.finished.push(playerIdx);
      // Check if game should end (all but one finished)
      const stillPlaying = gs.positions.filter((p, i) =>
        p < 100 && !gs.finished.includes(i)
      ).length;
      if (stillPlaying <= 0) {
        gs.phase = 'ended';
      }
    }

    // Extra turn on 6
    if (roll === 6 && gs.settings.extraTurnOn6 && !won) {
      gs.consecutive6++;
      if (gs.consecutive6 >= gs.settings.maxConsecutive6) {
        // 3 consecutive 6s: lose turn, no extra
        gs.consecutive6 = 0;
        extraTurn = false;
      } else {
        extraTurn = true;
      }
    } else {
      gs.consecutive6 = 0;
    }

    // Advance turn
    if (!extraTurn) {
      SLGameEngine._advanceTurn(gs);
    }

    const result = {
      roll,
      playerIdx,
      oldPos: oldPos,
      newPos: gs.positions[playerIdx],
      snakeLadder,
      extraTurn,
      won,
    };

    gs.lastEvent = result;
    return result;
  }

  /** Advance to next player who hasn't finished */
  static _advanceTurn(gs) {
    gs.consecutive6 = 0;
    let attempts = 0;
    do {
      gs.currentTurnIdx = (gs.currentTurnIdx + 1) % gs.turnOrder.length;
      attempts++;
    } while (
      gs.finished.includes(gs.turnOrder[gs.currentTurnIdx]) &&
      attempts < gs.turnOrder.length
    );
  }

  /** Handle turn timeout (auto-skip) */
  static skipTurn(gs) {
    if (gs.phase !== 'playing') return null;
    const playerIdx = SLGameEngine.currentPlayerIndex(gs);
    SLGameEngine._advanceTurn(gs);
    return { type: 'timeout', playerIdx };
  }

  /** Get sanitized game state for clients */
  static getClientState(gs, players) {
    return {
      turnOrder: gs.turnOrder,
      currentPlayerIdx: SLGameEngine.currentPlayerIndex(gs),
      currentTurnIdx: gs.currentTurnIdx,
      positions: gs.positions,
      snakes: gs.snakes,
      ladders: gs.ladders,
      finished: gs.finished,
      phase: gs.phase,
      lastRoll: gs.lastRoll,
      lastEvent: gs.lastEvent,
      settings: gs.settings,
      players: players.map((p, i) => ({
        name: p.name,
        color: p.color,
        colorName: p.colorName,
        connected: p.connected,
        position: gs.positions[i],
        isAI: !!p.isAI,
        avatar: p.avatar || (p.isAI ? 'robot' : 'smiley'),
      })),
    };
  }
}

module.exports = SLGameEngine;
