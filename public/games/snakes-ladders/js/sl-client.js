/**
 * sl-client.js
 * Socket.io client for Snakes & Ladders multiplayer.
 * Features: per-player dice, persistent move log, exit/restart,
 *           AI support, optimized connection.
 */

(function () {
  /* ── Socket connection (deferred until needed for faster page load) ── */
  var socket = io({
    reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],  // prefer WS for speed
  });
  var mySocketId = null;
  var currentRoom = null;
  var gameState = null;
  var myPlayerIdx = -1;
  var isRolling = false;
  var playerLastRoll = {};  // playerIdx → last dice value

  socket.on('connect', function () {
    mySocketId = socket.id;
    if (currentRoom) showToast('Reconnected!', 'info');
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

  /* ══════════════════════════════════════
     JOIN / CREATE
     ══════════════════════════════════════ */
  var inputName = document.getElementById('input-name');
  var inputCode = document.getElementById('input-code');

  document.getElementById('btn-create').addEventListener('click', function () {
    var name = inputName.value.trim() || 'Host';
    socket.emit('sl:create-room', { name: name }, function (res) {
      if (res.ok) showScreen('lobby');
      else showToast(res.error || 'Failed to create room', 'snake');
    });
  });

  document.getElementById('btn-join').addEventListener('click', function () {
    var name = inputName.value.trim() || 'Player';
    var code = inputCode.value.trim().toUpperCase();
    if (!code) { showToast('Enter a room code', 'info'); return; }
    socket.emit('sl:join-room', { name: name, code: code }, function (res) {
      if (res.ok) showScreen('lobby');
      else showToast(res.error || 'Could not join', 'snake');
    });
  });

  /* ══════════════════════════════════════
     LOBBY (with AI button)
     ══════════════════════════════════════ */
  socket.on('sl:room-update', function (room) {
    currentRoom = room;
    renderLobby(room);
  });

  function renderLobby(room) {
    document.getElementById('lobby-code').textContent = room.code;

    var html = '';
    for (var i = 0; i < room.players.length; i++) {
      var p = room.players[i];
      var isHost = p.id === room.hostId;
      var isMe = p.id === mySocketId;
      html += '<div class="lp-row">' +
        '<span class="lp-dot" style="background:' + p.color + ';color:' + p.color + '"></span>' +
        '<span class="lp-name">' + _esc(p.name) + (isMe ? ' (You)' : '') + (p.isAI ? ' 🤖' : '') + '</span>';
      if (isHost) html += '<span class="lp-badge lp-host">Host</span>';
      if (!p.connected && !p.isAI) html += '<span class="lp-badge lp-dc">DC</span>';
      else if (p.isAI) html += '<span class="lp-badge lp-ready">AI</span>';
      else if (p.ready) html += '<span class="lp-badge lp-ready">Ready</span>';
      else html += '<span class="lp-badge lp-waiting">Waiting</span>';
      html += '</div>';
    }
    document.getElementById('lobby-players').innerHTML = html;

    // Settings
    var amHost = room.hostId === mySocketId;
    var sHtml = '<div class="setting-row"><label>' +
      '<input type="checkbox" id="set-exact" ' + (room.settings.exactFinish ? 'checked' : '') +
      (amHost ? '' : ' disabled') + '> Exact finish (must land on 100)</label></div>' +
      '<div class="setting-row"><label>' +
      '<input type="checkbox" id="set-extra6" ' + (room.settings.extraTurnOn6 ? 'checked' : '') +
      (amHost ? '' : ' disabled') + '> Extra turn on 6</label></div>';
    document.getElementById('lobby-settings').innerHTML = sHtml;

    if (amHost) {
      var setExact = document.getElementById('set-exact');
      var setExtra6 = document.getElementById('set-extra6');
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
    // AI button (host only, max 4 players)
    if (amHost && room.players.length < 4) {
      actHtml += '<button class="btn btn-secondary" id="btn-add-ai">🤖 Add AI</button>';
    }
    if (amHost) {
      actHtml += '<button class="btn btn-primary" id="btn-start-game">Start Game</button>';
    }
    actHtml += '<button class="btn btn-secondary" id="btn-leave-lobby">Leave</button>';
    document.getElementById('lobby-actions').innerHTML = actHtml;

    // Bind
    var btnReady = document.getElementById('btn-ready');
    if (btnReady) btnReady.onclick = function () { socket.emit('sl:set-ready', { ready: !me.ready }); };

    var btnAddAI = document.getElementById('btn-add-ai');
    if (btnAddAI) btnAddAI.onclick = function () { socket.emit('sl:add-ai'); };

    var btnStart = document.getElementById('btn-start-game');
    if (btnStart) btnStart.onclick = function () {
      socket.emit('sl:start-game', null, function (res) {
        if (!res.ok) document.getElementById('lobby-msg').textContent = res.error || 'Cannot start';
      });
    };
    var btnLeave = document.getElementById('btn-leave-lobby');
    if (btnLeave) btnLeave.onclick = function () {
      socket.emit('sl:leave-room'); currentRoom = null; gameState = null; showScreen('join');
    };
  }

  /* ══════════════════════════════════════
     GAME START
     ══════════════════════════════════════ */
  socket.on('sl:game-started', function () {
    showScreen('game');
    SLBoard.init(document.getElementById('sl-canvas'));
    playerLastRoll = {};
    document.getElementById('move-log').innerHTML = '';
    addLog('Game started!', '#4d9de0', 'info');
  });

  /* ── Exit / Restart buttons ── */
  document.getElementById('btn-exit-game').addEventListener('click', function () {
    if (confirm('Leave this game?')) {
      socket.emit('sl:leave-room'); currentRoom = null; gameState = null; showScreen('join');
    }
  });
  document.getElementById('btn-restart-game').addEventListener('click', function () {
    if (confirm('Restart game? (Host only)')) {
      socket.emit('sl:play-again'); showScreen('lobby');
    }
  });

  /* ══════════════════════════════════════
     GAME STATE UPDATES
     ══════════════════════════════════════ */
  socket.on('sl:game-state', function (state) {
    gameState = state;
    if (currentRoom) {
      myPlayerIdx = currentRoom.players.findIndex(function (p) { return p.id === mySocketId; });
    }
    SLBoard.draw(state);
    renderTurnIndicator(state);
    renderPlayerDice(state);
  });

  /* ══════════════════════════════════════
     ROLL RESULT
     ══════════════════════════════════════ */
  socket.on('sl:roll-result', function (result) {
    var pName = gameState ? gameState.players[result.playerIdx].colorName : 'Player';
    var pColor = gameState ? gameState.players[result.playerIdx].color : '#aaa';

    playerLastRoll[result.playerIdx] = result.roll;

    // Animate this player's dice
    animatePlayerDice(result.playerIdx, result.roll, function () {
      isRolling = false;

      // Add to move log
      var logMsg = pName + ' rolled ' + result.roll;
      if (result.newPos === result.oldPos && result.oldPos > 0) {
        logMsg += ' (can\'t move)';
      } else {
        logMsg += ' → sq ' + result.newPos;
      }
      addLog(logMsg, pColor, '');

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
        if (result.snakeLadder) {
          var sl = result.snakeLadder;
          var slMsg = pName + (sl.type === 'snake'
            ? ' 🐍 snake! ' + sl.from + '→' + sl.to
            : ' 🪜 ladder! ' + sl.from + '→' + sl.to);
          addLog(slMsg, pColor, sl.type === 'snake' ? 'snake' : 'ladder');
          showToast(slMsg, sl.type === 'snake' ? 'snake' : 'ladder');
          return SLBoard.animateToken(result.playerIdx, sl.from, sl.to, 400);
        }
      }).then(function () {
        if (result.won) {
          addLog('🏆 ' + pName + ' reached 100!', pColor, 'win');
          showToast(pName + ' reached 100! 🏆', 'win');
        }
        if (result.extraTurn) {
          addLog(pName + ' gets extra turn (rolled 6)', pColor, 'info');
          showToast(pName + ' gets an extra turn!', 'info');
        }
        if (gameState) {
          SLBoard.draw(gameState);
          renderPlayerDice(gameState);
        }
      });
    });
  });

  /* ── TURN SKIPPED ── */
  socket.on('sl:turn-skipped', function (data) {
    if (gameState && gameState.players[data.playerIdx]) {
      var name = gameState.players[data.playerIdx].colorName;
      addLog(name + '\'s turn skipped (timeout)', '#889', 'info');
      showToast(name + '\'s turn was skipped', 'info');
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
    socket.emit('sl:play-again'); showScreen('lobby');
  });

  /* ── DISCONNECT ── */
  socket.on('sl:player-disconnected', function (data) {
    addLog(data.name + ' disconnected', '#e94560', 'info');
    showToast(data.name + ' disconnected', 'snake');
  });
  socket.on('sl:player-reconnected', function (data) {
    addLog(data.name + ' reconnected', '#0ead69', 'info');
    showToast(data.name + ' reconnected', 'ladder');
  });
  socket.on('sl:error', function (data) {
    showToast(data.message || 'Error', 'snake');
    showScreen('join'); currentRoom = null; gameState = null;
  });

  /* ══════════════════════════════════════
     PER-PLAYER DICE
     ══════════════════════════════════════ */
  var DOT_LAYOUTS = {
    0: [0,0,0,0,0,0,0,0,0],
    1: [0,0,0,0,1,0,0,0,0], 2: [0,0,1,0,0,0,1,0,0],
    3: [0,0,1,0,1,0,1,0,0], 4: [1,0,1,0,0,0,1,0,1],
    5: [1,0,1,0,1,0,1,0,1], 6: [1,0,1,1,0,1,1,0,1],
  };

  function renderPlayerDice(state) {
    if (!state || !state.players) return;
    var row = document.getElementById('player-dice-row');
    var html = '';
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      var isActive = state.currentPlayerIdx === i && state.phase === 'playing';
      var isMe = i === myPlayerIdx;
      var lastVal = playerLastRoll[i] || 0;
      var finished = state.finished && state.finished.indexOf(i) >= 0;

      html += '<div class="pdice-card ' + (isActive ? 'active' : 'inactive') +
        '" style="--pc-color:' + p.color + ';--pc-color-glow:' + p.color + '40">' +
        '<div class="pdice-name" style="color:' + p.color + '">' +
        _esc(p.colorName) + (p.name ? '' : '') +
        (finished ? ' ✓' : '') +
        '</div>' +
        '<div class="pdice-face" id="pdice-face-' + i + '">' +
        '<div class="pdice-inner" id="pdice-inner-' + i + '">' +
        _dotsHtml(lastVal) +
        '</div></div>';

      // Position indicator
      html += '<div class="pdice-pos">Sq: ' + (p.position || 0) + '</div>';

      // Roll button only for active player who is me (or show disabled for others)
      if (isActive && isMe) {
        html += '<button class="pdice-btn" id="pdice-btn-' + i + '">Roll 🎲</button>';
      } else if (isActive) {
        html += '<div class="pdice-pos" style="color:' + p.color + '">Rolling...</div>';
      }

      html += '</div>';
    }
    row.innerHTML = html;

    // Bind the roll button if it's my turn
    for (var j = 0; j < state.players.length; j++) {
      var btn = document.getElementById('pdice-btn-' + j);
      if (btn) {
        btn.disabled = isRolling;
        btn.addEventListener('click', handleDiceClick);
      }
    }
  }

  function _dotsHtml(value) {
    var layout = DOT_LAYOUTS[value] || DOT_LAYOUTS[0];
    return layout.map(function (v) {
      return v ? '<span class="dot"></span>' : '<span class="dot dot-hidden"></span>';
    }).join('');
  }

  function handleDiceClick() {
    if (isRolling) return;
    if (!gameState || gameState.currentPlayerIdx !== myPlayerIdx) return;
    isRolling = true;
    // Disable button immediately
    var btn = document.getElementById('pdice-btn-' + myPlayerIdx);
    if (btn) btn.disabled = true;

    socket.emit('sl:roll-dice', null, function (res) {
      if (!res || !res.ok) {
        isRolling = false;
        if (btn) btn.disabled = false;
        if (res && res.error) showToast(res.error, 'info');
      }
    });
  }

  function animatePlayerDice(playerIdx, finalValue, cb) {
    var face = document.getElementById('pdice-face-' + playerIdx);
    var inner = document.getElementById('pdice-inner-' + playerIdx);
    if (!face || !inner) { if (cb) cb(); return; }

    face.classList.remove('landed');
    face.classList.add('rolling');
    var ticks = 0;
    var interval = setInterval(function () {
      inner.innerHTML = _dotsHtml(Math.floor(Math.random() * 6) + 1);
      ticks++;
      if (ticks >= 10) {
        clearInterval(interval);
        inner.innerHTML = _dotsHtml(finalValue);
        face.classList.remove('rolling');
        face.classList.add('landed');
        setTimeout(function () { if (cb) cb(); }, 300);
      }
    }, 60);
  }

  /* ══════════════════════════════════════
     MOVE LOG (persistent, chat-box style)
     ══════════════════════════════════════ */
  function addLog(message, color, type) {
    var log = document.getElementById('move-log');
    var entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ' log-' + type : '');
    entry.innerHTML = '<span style="color:' + (color || '#aab') + '">' + message + '</span>';
    log.appendChild(entry);
    // Auto-scroll to bottom
    log.scrollTop = log.scrollHeight;
  }

  /* ══════════════════════════════════════
     UI HELPERS
     ══════════════════════════════════════ */
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
