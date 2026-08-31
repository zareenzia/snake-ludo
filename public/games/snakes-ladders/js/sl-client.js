/**
 * sl-client.js
 * Socket.io client for Snakes & Ladders multiplayer.
 * Manages: join/create → lobby → game → gameover flow.
 */

(function () {
  /* ── Socket connection ── */
  var socket = io({ reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
  var mySocketId = null;
  var currentRoom = null;   // room data from server
  var gameState = null;      // latest game state
  var myPlayerIdx = -1;
  var isRolling = false;

  socket.on('connect', function () {
    mySocketId = socket.id;
    // If we had a room, try reconnect
    if (currentRoom) {
      showToast('Reconnected!', 'info');
    }
  });

  /* ── DOM refs ── */
  var screens = {
    join: document.getElementById('screen-join'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    gameover: document.getElementById('screen-gameover'),
  };

  function showScreen(id) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('hidden', k !== id);
    });
  }

  /* ── JOIN / CREATE ── */
  var inputName = document.getElementById('input-name');
  var inputCode = document.getElementById('input-code');

  document.getElementById('btn-create').addEventListener('click', function () {
    var name = inputName.value.trim() || 'Host';
    socket.emit('sl:create-room', { name: name }, function (res) {
      if (res.ok) {
        showScreen('lobby');
      } else {
        showToast(res.error || 'Failed to create room', 'snake');
      }
    });
  });

  document.getElementById('btn-join').addEventListener('click', function () {
    var name = inputName.value.trim() || 'Player';
    var code = inputCode.value.trim().toUpperCase();
    if (!code) { showToast('Enter a room code', 'info'); return; }
    socket.emit('sl:join-room', { name: name, code: code }, function (res) {
      if (res.ok) {
        showScreen('lobby');
      } else {
        showToast(res.error || 'Could not join', 'snake');
      }
    });
  });

  /* ── LOBBY ── */
  socket.on('sl:room-update', function (room) {
    currentRoom = room;
    renderLobby(room);
  });

  function renderLobby(room) {
    document.getElementById('lobby-code').textContent = room.code;

    // Players list
    var html = '';
    for (var i = 0; i < room.players.length; i++) {
      var p = room.players[i];
      var isHost = p.id === room.hostId;
      var isMe = p.id === mySocketId;
      html += '<div class="lp-row">' +
        '<span class="lp-dot" style="background:' + p.color + ';color:' + p.color + '"></span>' +
        '<span class="lp-name">' + _esc(p.name) + (isMe ? ' (You)' : '') + '</span>';
      if (isHost) html += '<span class="lp-badge lp-host">Host</span>';
      if (!p.connected) html += '<span class="lp-badge lp-dc">DC</span>';
      else if (p.ready) html += '<span class="lp-badge lp-ready">Ready</span>';
      else html += '<span class="lp-badge lp-waiting">Waiting</span>';
      html += '</div>';
    }
    document.getElementById('lobby-players').innerHTML = html;

    // Settings (host can edit)
    var amHost = room.hostId === mySocketId;
    var sHtml = '<div class="setting-row"><label>' +
      '<input type="checkbox" id="set-exact" ' + (room.settings.exactFinish ? 'checked' : '') +
      (amHost ? '' : ' disabled') + '> Exact finish (must land on 100)</label></div>' +
      '<div class="setting-row"><label>' +
      '<input type="checkbox" id="set-extra6" ' + (room.settings.extraTurnOn6 ? 'checked' : '') +
      (amHost ? '' : ' disabled') + '> Extra turn on 6</label></div>';
    document.getElementById('lobby-settings').innerHTML = sHtml;

    // Bind settings changes
    var setExact = document.getElementById('set-exact');
    var setExtra6 = document.getElementById('set-extra6');
    if (amHost) {
      setExact.onchange = function () {
        socket.emit('sl:update-settings', { settings: { exactFinish: setExact.checked } });
      };
      setExtra6.onchange = function () {
        socket.emit('sl:update-settings', { settings: { extraTurnOn6: setExtra6.checked } });
      };
    }

    // Actions
    var me = room.players.find(function (p) { return p.id === mySocketId; });
    var actHtml = '';
    if (me) {
      var readyLabel = me.ready ? 'Not Ready' : 'Ready Up';
      actHtml += '<button class="btn btn-secondary" id="btn-ready">' + readyLabel + '</button>';
    }
    if (amHost) {
      actHtml += '<button class="btn btn-primary" id="btn-start-game">Start Game</button>';
    }
    actHtml += '<button class="btn btn-secondary" id="btn-leave-lobby">Leave</button>';
    document.getElementById('lobby-actions').innerHTML = actHtml;

    // Bind
    var btnReady = document.getElementById('btn-ready');
    if (btnReady) {
      btnReady.onclick = function () {
        socket.emit('sl:set-ready', { ready: !me.ready });
      };
    }
    var btnStart = document.getElementById('btn-start-game');
    if (btnStart) {
      btnStart.onclick = function () {
        socket.emit('sl:start-game', null, function (res) {
          if (!res.ok) {
            document.getElementById('lobby-msg').textContent = res.error || 'Cannot start';
          }
        });
      };
    }
    var btnLeave = document.getElementById('btn-leave-lobby');
    if (btnLeave) {
      btnLeave.onclick = function () {
        socket.emit('sl:leave-room');
        currentRoom = null; gameState = null;
        showScreen('join');
      };
    }
  }

  /* ── GAME START ── */
  socket.on('sl:game-started', function () {
    showScreen('game');
    SLBoard.init(document.getElementById('sl-canvas'));
    renderDots(1); // show initial dice
  });

  /* ── GAME STATE UPDATES ── */
  socket.on('sl:game-state', function (state) {
    gameState = state;
    // Find my player index
    if (currentRoom) {
      myPlayerIdx = currentRoom.players.findIndex(function (p) { return p.id === mySocketId; });
    }

    SLBoard.draw(state);
    renderTurnIndicator(state);

    // Enable/disable dice
    var diceBtn = document.getElementById('sl-dice-btn');
    var isMyTurn = state.currentPlayerIdx === myPlayerIdx && state.phase === 'playing';
    diceBtn.disabled = !isMyTurn || isRolling;
  });

  /* ── ROLL RESULT ── */
  socket.on('sl:roll-result', function (result) {
    // Animate dice
    animateDiceRoll(result.roll, function () {
      isRolling = false;
      var pName = gameState.players[result.playerIdx].colorName;
      showMsg(pName + ' rolled a ' + result.roll);

      // Animate token movement
      var fromSq = result.oldPos || 0;
      var toSq = result.snakeLadder ? result.snakeLadder.from : result.newPos;

      var movePromise;
      if (fromSq > 0 && toSq !== fromSq) {
        movePromise = SLBoard.animateToken(result.playerIdx, fromSq, toSq, 350);
      } else if (fromSq <= 0 && toSq > 0) {
        movePromise = SLBoard.animateToken(result.playerIdx, 1, toSq, 350);
      } else {
        movePromise = Promise.resolve();
      }

      movePromise.then(function () {
        // Snake/ladder jump
        if (result.snakeLadder) {
          var sl = result.snakeLadder;
          var type = sl.type;
          showToast(
            pName + (type === 'snake' ? ' hit a snake! ' + sl.from + '→' + sl.to
              : ' climbed a ladder! ' + sl.from + '→' + sl.to),
            type === 'snake' ? 'snake' : 'ladder'
          );
          return SLBoard.animateToken(result.playerIdx, sl.from, sl.to, 400);
        }
      }).then(function () {
        if (result.won) {
          showToast(pName + ' reached 100! 🏆', 'win');
        }
        if (result.extraTurn) {
          showToast(pName + ' gets an extra turn!', 'info');
        }
        // Redraw with final server state
        if (gameState) SLBoard.draw(gameState);
        // Re-enable dice if it's my turn
        if (gameState && gameState.currentPlayerIdx === myPlayerIdx && gameState.phase === 'playing') {
          document.getElementById('sl-dice-btn').disabled = false;
        }
      });
    });
  });

  /* ── TURN SKIPPED ── */
  socket.on('sl:turn-skipped', function (data) {
    if (gameState && gameState.players[data.playerIdx]) {
      showToast(gameState.players[data.playerIdx].colorName + "'s turn was skipped (timeout)", 'info');
    }
  });

  /* ── GAME OVER ── */
  socket.on('sl:game-over', function (data) {
    showScreen('gameover');
    var medals = ['🥇', '🥈', '🥉', '4th'];
    document.getElementById('go-title').innerHTML =
      '<span style="color:' + data.rankings[0].color + '">' + data.rankings[0].colorName + '</span> Wins!';
    var rHtml = '';
    for (var i = 0; i < data.rankings.length; i++) {
      var r = data.rankings[i];
      rHtml += '<div class="rank-row"><span class="rank-pos">' + (medals[i] || '') +
        '</span><span style="color:' + r.color + '">' + _esc(r.name) + ' (' + r.colorName + ')</span></div>';
    }
    document.getElementById('go-rankings').innerHTML = rHtml;
  });

  document.getElementById('btn-play-again').addEventListener('click', function () {
    socket.emit('sl:play-again');
    showScreen('lobby');
  });

  /* ── PLAYER DISCONNECT/RECONNECT ── */
  socket.on('sl:player-disconnected', function (data) {
    showToast(data.name + ' disconnected', 'snake');
  });
  socket.on('sl:player-reconnected', function (data) {
    showToast(data.name + ' reconnected', 'ladder');
  });

  /* ── ERROR ── */
  socket.on('sl:error', function (data) {
    showToast(data.message || 'Error', 'snake');
    showScreen('join');
    currentRoom = null; gameState = null;
  });

  /* ── DICE BUTTON ── */
  document.getElementById('sl-dice-btn').addEventListener('click', function () {
    if (isRolling) return;
    if (!gameState || gameState.currentPlayerIdx !== myPlayerIdx) return;
    isRolling = true;
    document.getElementById('sl-dice-btn').disabled = true;
    socket.emit('sl:roll-dice', null, function (res) {
      if (!res || !res.ok) {
        isRolling = false;
        document.getElementById('sl-dice-btn').disabled = false;
        if (res && res.error) showToast(res.error, 'info');
      }
      // else: wait for sl:roll-result broadcast
    });
  });

  /* ═══ UI HELPERS ═══ */

  function renderTurnIndicator(state) {
    var el = document.getElementById('sl-turn-indicator');
    if (!state || !state.players[state.currentPlayerIdx]) { el.innerHTML = ''; return; }
    var p = state.players[state.currentPlayerIdx];
    el.style.borderColor = p.color + '80';
    el.style.boxShadow = '0 0 20px ' + p.color + '30';
    el.innerHTML =
      '<span class="turn-dot" style="background:' + p.color + ';box-shadow:0 0 8px ' + p.color + '"></span>' +
      '<span style="color:' + p.color + '">' + p.colorName + '</span>' +
      "<span>'s turn</span>";
  }

  function showMsg(msg) {
    document.getElementById('sl-message').textContent = msg;
  }

  /* ── Dice rendering ── */
  var DOT_LAYOUTS = {
    1: [0,0,0,0,1,0,0,0,0], 2: [0,0,1,0,0,0,1,0,0],
    3: [0,0,1,0,1,0,1,0,0], 4: [1,0,1,0,0,0,1,0,1],
    5: [1,0,1,0,1,0,1,0,1], 6: [1,0,1,1,0,1,1,0,1],
  };

  function renderDots(value) {
    var el = document.getElementById('sl-dice-inner');
    var layout = DOT_LAYOUTS[value] || DOT_LAYOUTS[1];
    el.innerHTML = layout.map(function (v) {
      return v ? '<span class="dot"></span>' : '<span class="dot dot-hidden"></span>';
    }).join('');
  }

  function animateDiceRoll(finalValue, cb) {
    var face = document.getElementById('sl-dice-face');
    face.classList.remove('landed');
    face.classList.add('rolling');
    var ticks = 0;
    var interval = setInterval(function () {
      renderDots(Math.floor(Math.random() * 6) + 1);
      ticks++;
      if (ticks >= 12) {
        clearInterval(interval);
        renderDots(finalValue);
        face.classList.remove('rolling');
        face.classList.add('landed');
        setTimeout(function () { if (cb) cb(); }, 350);
      }
    }, 70);
  }

  /* ── Toast ── */
  function showToast(message, type) {
    var container = document.getElementById('toast-container');
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = message;
    container.appendChild(t);
    setTimeout(function () {
      t.classList.add('toast-out');
      setTimeout(function () { t.remove(); }, 300);
    }, 2500);
  }

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
