/**
 * game.js
 * ─────────────────────────────────────────────
 * Core game logic: turn flow, movement rules,
 * captures, snake/ladder effects, win detection.
 *
 * Exports the Game singleton with:
 *   Game.start(players)
 *   Game.getState()
 *   Game.getMovableTokens(roll)
 *   Game.moveToken(tokenIndex, roll)  → { events[] }
 *   Game.nextTurn(rolled6)
 *   Game.checkWin() → winning player or null
 */

const Game = (() => {
  let state; // { players[], currentPlayerIndex, diceValue, gameOver }

  function start(players) {
    state = {
      players,
      currentPlayerIndex: 0,
      diceValue: null,
      gameOver: false,
    };
  }

  function getState() { return state; }

  function currentPlayer() { return state.players[state.currentPlayerIndex]; }

  /**
   * Which token indices (0-3) can legally move with this dice roll?
   */
  function getMovableTokens(roll) {
    const player = currentPlayer();
    const cfg = PLAYER_CONFIG[player.color];
    const lap = fullLapDistance(player.color);
    const movable = [];

    player.tokens.forEach((tok, i) => {
      if (tok.state === 'home') return; // already finished

      if (tok.state === 'base') {
        // Can only leave base on a 6
        if (roll === 6) movable.push(i);
        return;
      }

      if (tok.state === 'track') {
        const newDist = tok.distanceTravelled + roll;
        // Can we stay on track, enter home stretch, or overshoot?
        if (newDist <= lap) {
          movable.push(i); // still on track
        } else if (newDist <= lap + HOME_STRETCH) {
          movable.push(i); // enters home stretch
        } else if (newDist === lap + HOME_STRETCH + 1) {
          movable.push(i); // exact roll to reach HOME
        }
        // else overshoot — can't move
        return;
      }

      if (tok.state === 'homeStretch') {
        const newPos = tok.homeStretchPos + roll;
        if (newPos < HOME_STRETCH) {
          movable.push(i); // advance within home stretch
        } else if (newPos === HOME_STRETCH) {
          movable.push(i); // exact to home
        }
        // else overshoot
        return;
      }
    });

    return movable;
  }

  /**
   * Execute a move for the current player's token.
   * Returns { events: string[] } describing what happened.
   */
  function moveToken(tokenIndex, roll) {
    const player = currentPlayer();
    const tok = player.tokens[tokenIndex];
    const cfg = PLAYER_CONFIG[player.color];
    const lap = fullLapDistance(player.color);
    const events = [];

    if (tok.state === 'base' && roll === 6) {
      // Move token onto the track at start position
      tok.state = 'track';
      tok.pathIndex = cfg.start;
      tok.distanceTravelled = 0;
      events.push(`Token ${tokenIndex + 1} enters the track!`);
      // Check for capture at start
      _checkCapture(player, tok, events);
      return { events };
    }

    if (tok.state === 'track') {
      const newDist = tok.distanceTravelled + roll;

      if (newDist <= lap) {
        // Normal track movement
        tok.pathIndex = (cfg.start + newDist) % PATH_LENGTH;
        tok.distanceTravelled = newDist;
        events.push(`Token ${tokenIndex + 1} moves to square ${tok.pathIndex}`);

        // Snake or ladder?
        if (SNAKES[tok.pathIndex] !== undefined) {
          const oldIdx = tok.pathIndex;
          tok.pathIndex = SNAKES[oldIdx];
          // Recalc distance
          let nd = tok.pathIndex - cfg.start;
          if (nd < 0) nd += PATH_LENGTH;
          tok.distanceTravelled = nd;
          events.push(`🐍 Snake! Slides from ${oldIdx} down to ${tok.pathIndex}`);
        } else if (LADDERS[tok.pathIndex] !== undefined) {
          const oldIdx = tok.pathIndex;
          tok.pathIndex = LADDERS[oldIdx];
          let nd = tok.pathIndex - cfg.start;
          if (nd < 0) nd += PATH_LENGTH;
          tok.distanceTravelled = nd;
          events.push(`🪜 Ladder! Climbs from ${oldIdx} up to ${tok.pathIndex}`);
        }

        _checkCapture(player, tok, events);
      } else if (newDist <= lap + HOME_STRETCH) {
        // Enter home stretch
        tok.state = 'homeStretch';
        tok.homeStretchPos = newDist - lap - 1; // 0-indexed
        tok.distanceTravelled = newDist;
        events.push(`Token ${tokenIndex + 1} enters the home stretch! (pos ${tok.homeStretchPos + 1}/${HOME_STRETCH})`);
      } else if (newDist === lap + HOME_STRETCH + 1) {
        // Exact roll → HOME
        tok.state = 'home';
        tok.distanceTravelled = newDist;
        events.push(`🏠 Token ${tokenIndex + 1} reaches HOME!`);
      }
      return { events };
    }

    if (tok.state === 'homeStretch') {
      const newPos = tok.homeStretchPos + roll;
      if (newPos < HOME_STRETCH) {
        tok.homeStretchPos = newPos;
        tok.distanceTravelled += roll;
        events.push(`Token ${tokenIndex + 1} advances in home stretch (pos ${newPos + 1}/${HOME_STRETCH})`);
      } else if (newPos === HOME_STRETCH) {
        tok.state = 'home';
        tok.distanceTravelled += roll;
        events.push(`🏠 Token ${tokenIndex + 1} reaches HOME!`);
      }
      return { events };
    }

    return { events };
  }

  /**
   * Capture logic: if an opponent token is on the same track square
   * and it's NOT a safe zone, send it back to base.
   */
  function _checkCapture(movingPlayer, movingToken, events) {
    if (movingToken.state !== 'track') return;
    if (SAFE_ZONES.has(movingToken.pathIndex)) return;

    for (const other of state.players) {
      if (other === movingPlayer) continue;
      for (const ot of other.tokens) {
        if (ot.state === 'track' && ot.pathIndex === movingToken.pathIndex) {
          ot.state = 'base';
          ot.pathIndex = -1;
          ot.distanceTravelled = 0;
          ot.homeStretchPos = -1;
          events.push(`💥 Captured ${other.color} token! Sent back to base.`);
        }
      }
    }
  }

  /**
   * Advance to the next player's turn. If rolled6, same player goes again.
   */
  function nextTurn(rolled6) {
    if (rolled6) return; // same player
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  }

  /**
   * Check if the current player has won (all 4 tokens home).
   */
  function checkWin() {
    for (const player of state.players) {
      if (player.tokens.every(t => t.state === 'home')) return player;
    }
    return null;
  }

  return { start, getState, currentPlayer, getMovableTokens, moveToken, nextTurn, checkWin };
})();
