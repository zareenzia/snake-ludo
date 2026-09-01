/**
 * socket-handlers.js
 * Registers all Socket.io event handlers for the S&L multiplayer.
 *
 * Events from client → server:
 *   sl:create-room, sl:join-room, sl:set-ready, sl:update-settings,
 *   sl:kick-player, sl:start-game, sl:roll-dice, sl:leave-room
 *
 * Events from server → client:
 *   sl:room-update, sl:game-started, sl:roll-result, sl:game-state,
 *   sl:turn-skipped, sl:game-over, sl:error, sl:player-disconnected,
 *   sl:player-reconnected
 */
const SLGameEngine = require('./sl-game-engine');

/** Rate limit: track last roll time per socket */
const lastRollTime = new Map();
const ROLL_COOLDOWN_MS = 800;

function registerSocketHandlers(io, socket, roomManager) {
  // Track which room this socket belongs to
  let currentRoomCode = null;

  /** Utility: broadcast room state to all players in the room */
  function broadcastRoomUpdate(room) {
    const data = {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      settings: room.settings,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        colorName: p.colorName,
        ready: p.ready,
        connected: p.connected,
        isAI: !!p.isAI,
        avatar: p.avatar || (p.isAI ? 'robot' : 'smiley'),
      })),
    };
    io.to(room.code).emit('sl:room-update', data);
  }

  /** Utility: broadcast game state */
  function broadcastGameState(room) {
    if (!room.gameState) return;
    const state = SLGameEngine.getClientState(room.gameState, room.players);
    io.to(room.code).emit('sl:game-state', state);
  }

  // ── Create room ──
  socket.on('sl:create-room', (data, ack) => {
    const room = roomManager.createRoom(socket.id, data.name || 'Host');
    if (data.color) roomManager.changeColor(room.code, socket.id, data.color);
    // Set avatar
    const player = room.players.find(p => p.id === socket.id);
    if (player && data.avatar) player.avatar = data.avatar;
    socket.join(room.code);
    currentRoomCode = room.code;
    if (ack) ack({ ok: true, code: room.code });
    broadcastRoomUpdate(room);
  });

  // ── Join room ──
  socket.on('sl:join-room', (data, ack) => {
    const code = (data.code || '').toUpperCase().trim();
    const room = roomManager.joinRoom(code, socket.id, data.name || 'Player');
    if (!room) {
      if (ack) ack({ ok: false, error: 'Room not found, full, or already started.' });
      return;
    }
    if (data.color) roomManager.changeColor(code, socket.id, data.color);
    const player = room.players.find(p => p.id === socket.id);
    if (player && data.avatar) player.avatar = data.avatar;
    socket.join(code);
    currentRoomCode = code;
    if (ack) ack({ ok: true, code });
    broadcastRoomUpdate(room);
  });

  // ── Set ready status ──
  socket.on('sl:set-ready', (data) => {
    if (!currentRoomCode) return;
    const room = roomManager.setReady(currentRoomCode, socket.id, !!data.ready);
    if (room) broadcastRoomUpdate(room);
  });

  // ── Update settings (host only) ──
  socket.on('sl:update-settings', (data) => {
    if (!currentRoomCode) return;
    const room = roomManager.updateSettings(currentRoomCode, socket.id, data.settings || {});
    if (room) broadcastRoomUpdate(room);
  });

  // ── Kick player (host only) ──
  socket.on('sl:kick-player', (data) => {
    if (!currentRoomCode) return;
    const room = roomManager.kickPlayer(currentRoomCode, socket.id, data.targetId);
    if (room) {
      // Force kicked socket to leave
      const kickedSocket = io.sockets.sockets.get(data.targetId);
      if (kickedSocket) {
        kickedSocket.leave(currentRoomCode);
        kickedSocket.emit('sl:error', { message: 'You were kicked from the room.' });
      }
      broadcastRoomUpdate(room);
    }
  });

  // ── Add AI player (host only) ──
  socket.on('sl:add-ai', (data) => {
    if (!currentRoomCode) return;
    const aiColor = (data && data.color) || undefined;
    const room = roomManager.addAI(currentRoomCode, socket.id, aiColor);
    if (room) broadcastRoomUpdate(room);
  });

  // ── Change own color ──
  socket.on('sl:change-color', (data) => {
    if (!currentRoomCode || !data || !data.color) return;
    const room = roomManager.changeColor(currentRoomCode, socket.id, data.color);
    if (room) broadcastRoomUpdate(room);
  });

  // ── Change AI color (host only) ──
  socket.on('sl:change-ai-color', (data) => {
    if (!currentRoomCode || !data || !data.aiId || !data.color) return;
    const room = roomManager.changeAIColor(currentRoomCode, socket.id, data.aiId, data.color);
    if (room) broadcastRoomUpdate(room);
  });

  // ── Quick Play vs AI — create room, add AI, auto-start in one step ──
  socket.on('sl:quick-ai', (data, ack) => {
    const name = (data && data.name) || 'Player';
    const playerColor = (data && data.color) || undefined;
    const aiColor = (data && data.aiColor) || undefined;
    const aiName = (data && data.aiName) || undefined;
    // Create room
    const room = roomManager.createRoom(socket.id, name);
    if (!room) { if (ack) ack({ ok: false, error: 'Failed to create room.' }); return; }
    if (playerColor) roomManager.changeColor(room.code, socket.id, playerColor);
    // Set player avatar
    const player = room.players.find(p => p.id === socket.id);
    if (player && data.avatar) player.avatar = data.avatar;
    currentRoomCode = room.code;
    socket.join(room.code);
    // Add AI opponent
    roomManager.addAI(room.code, socket.id, aiColor, aiName);
    roomManager.setReady(room.code, socket.id, true);
    // Start game immediately
    room.gameState = SLGameEngine.createGame(room.players, room.settings);
    room.phase = 'playing';
    broadcastRoomUpdate(room);
    io.to(room.code).emit('sl:game-started');
    // Notify clients of new randomized power-up positions for verification
    io.to(room.code).emit('sl:powerups', room.gameState.powerups);
    broadcastGameState(room);
    if (ack) ack({ ok: true, code: room.code });
    // If AI goes first, auto-roll
    scheduleAIRoll(room);
  });

  // ── Start game (host only, min 2 ready players) ──
  socket.on('sl:start-game', (_, ack) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') {
      if (ack) ack({ ok: false, error: 'Only the host can start from the lobby.' });
      return;
    }
    if (room.players.length < 2) {
      if (ack) ack({ ok: false, error: 'Need at least 2 players.' });
      return;
    }
    const readyCount = room.players.filter(p => p.ready).length;
    if (readyCount < room.players.length) {
      if (ack) ack({ ok: false, error: 'All players must be ready.' });
      return;
    }

    // Create game state
    room.gameState = SLGameEngine.createGame(room.players, room.settings);
    room.phase = 'playing';
    if (ack) ack({ ok: true });

    io.to(room.code).emit('sl:game-started');
    // Notify clients of new randomized power-up positions for verification
    io.to(room.code).emit('sl:powerups', room.gameState.powerups);
    broadcastGameState(room);

    // If first player is AI, auto-roll
    scheduleAIRoll(room);
  });

  /** Schedule an AI roll if the current player is AI */
  function scheduleAIRoll(room) {
    if (!room || !room.gameState || room.gameState.phase !== 'playing') return;
    const gs = room.gameState;
    const currentIdx = SLGameEngine.currentPlayerIndex(gs);
    const player = room.players[currentIdx];
    if (!player || !player.isAI) return;

    // Delay long enough for client animations to finish
    // (dice ~600ms + up to 6 steps × 400ms + snake/ladder 600ms ≈ 3600ms)
    setTimeout(() => {
      if (!room.gameState || room.gameState.phase !== 'playing') return;
      const checkIdx = SLGameEngine.currentPlayerIndex(room.gameState);
      if (checkIdx !== currentIdx) return; // turn already changed

      const result = SLGameEngine.processTurn(room.gameState);
      if (!result) return;

      io.to(room.code).emit('sl:roll-result', result);
      broadcastGameState(room);

      if (room.gameState.phase === 'ended') {
        io.to(room.code).emit('sl:game-over', {
          rankings: room.gameState.finished.map(idx => ({
            name: room.players[idx].name,
            color: room.players[idx].color,
            colorName: room.players[idx].colorName,
          })),
        });
        room.phase = 'ended';
      } else {
        // Chain: if the next player is also AI (or same AI got extra turn)
        scheduleAIRoll(room);
      }
    }, 4000);
  }

  // ── Roll dice ──
  socket.on('sl:roll-dice', (_, ack) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.gameState || room.gameState.phase !== 'playing') return;

    // Check it's this player's turn
    const gs = room.gameState;
    const currentIdx = SLGameEngine.currentPlayerIndex(gs);
    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx !== currentIdx) {
      if (ack) ack({ ok: false, error: 'Not your turn.' });
      return;
    }

    // Rate limit (double-click protection)
    const now = Date.now();
    const lastTime = lastRollTime.get(socket.id) || 0;
    if (now - lastTime < ROLL_COOLDOWN_MS) {
      if (ack) ack({ ok: false, error: 'Too fast, wait a moment.' });
      return;
    }
    lastRollTime.set(socket.id, now);

    // Process the turn
    const result = SLGameEngine.processTurn(gs);
    if (!result) return;

    if (ack) ack({ ok: true });

    // Broadcast roll result to all clients
    io.to(room.code).emit('sl:roll-result', result);

    // Broadcast updated state immediately (client guards against animation conflicts)
    broadcastGameState(room);

    // Check game over
    if (gs.phase === 'ended') {
      io.to(room.code).emit('sl:game-over', {
        rankings: gs.finished.map(idx => ({
          name: room.players[idx].name,
          color: room.players[idx].color,
          colorName: room.players[idx].colorName,
        })),
      });
      room.phase = 'ended';
    } else {
      // If next player is AI, schedule auto-roll
      scheduleAIRoll(room);
    }
  });

  // ── Leave room ──
  socket.on('sl:leave-room', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (room) {
      socket.leave(currentRoomCode);
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        roomManager.deleteRoom(currentRoomCode);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
        }
        broadcastRoomUpdate(room);
      }
    }
    currentRoomCode = null;
  });

  // ── Play again (host resets game in same room) ──
  socket.on('sl:play-again', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    room.phase = 'lobby';
    room.gameState = null;
    room.players.forEach(p => { p.ready = false; p.position = 0; });
    broadcastRoomUpdate(room);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    lastRollTime.delete(socket.id);
    const result = roomManager.disconnectPlayer(socket.id);
    if (result) {
      const { room, player } = result;
      io.to(room.code).emit('sl:player-disconnected', {
        name: player.name,
        color: player.color,
      });
      if (room.phase === 'playing') {
        // If it was their turn, auto-skip after a short delay
        const gs = room.gameState;
        if (gs && gs.phase === 'playing') {
          const currentIdx = SLGameEngine.currentPlayerIndex(gs);
          const playerIdx = room.players.findIndex(p => p.id === socket.id);
          if (playerIdx === currentIdx) {
            setTimeout(() => {
              // Re-check they're still disconnected
              const p = room.players.find(pp => pp.id === socket.id);
              if (p && !p.connected && gs.phase === 'playing') {
                const skip = SLGameEngine.skipTurn(gs);
                if (skip) {
                  io.to(room.code).emit('sl:turn-skipped', skip);
                  broadcastGameState(room);
                }
              }
            }, 5000);
          }
        }
      }
      broadcastRoomUpdate(room);
    }
  });
}

module.exports = { registerSocketHandlers };
