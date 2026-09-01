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
  var isAnimatingMove = false;  // true while any token animation is playing
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
    // Hide settings navbar during gameplay (game header has its own controls)
    var nav = document.getElementById('settings-navbar');
    if (nav) nav.style.display = (id === 'game') ? 'none' : '';
  }

  /* ══════════════════════════════════════
     JOIN / CREATE
     ══════════════════════════════════════ */
  var inputName = document.getElementById('input-name');
  var inputCode = document.getElementById('input-code');

  /* ── Color palette shared across both games ── */
  var COLOR_PALETTE = [
    { hex: '#e94560', name: 'Red' },
    { hex: '#0ead69', name: 'Green' },
    { hex: '#4d9de0', name: 'Blue' },
    { hex: '#f5c542', name: 'Yellow' },
  ];
  var selectedColor = '#e94560';
  var selectedAIColor = '#4d9de0';

  /* ── Avatar / Emoji system ── */
  var AVATARS = [
    { id: 'smiley', label: '😊 Smiley', neutral: '😊', cry: '😭', mock: '🤣', cool: '😎', scared: '😰', win: '🥳' },
    { id: 'cat',    label: '🐱 Cat',    neutral: '🐱', cry: '😿', mock: '😹', cool: '😼', scared: '🙀', win: '😸' },
  ];
  var selectedAvatar = 'smiley';

  function getAvatar(id) {
    for (var i = 0; i < AVATARS.length; i++) { if (AVATARS[i].id === id) return AVATARS[i]; }
    return AVATARS[0];
  }

  function renderEmojiPicker(containerId, selected, onSelect) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < AVATARS.length; i++) {
      var av = AVATARS[i];
      var btn = document.createElement('div');
      btn.className = 'emoji-option' + (av.id === selected ? ' selected' : '');
      btn.textContent = av.neutral;
      btn.title = av.label;
      (function(avId) {
        btn.addEventListener('click', function() { onSelect(avId); });
      })(av.id);
      container.appendChild(btn);
    }
  }

  function refreshEmojiPickers() {
    renderEmojiPicker('settings-player-emoji', selectedAvatar, function(id) {
      selectedAvatar = id;
      refreshEmojiPickers();
    });
    renderEmojiPicker('modal-player-emoji', selectedAvatar, function(id) {
      selectedAvatar = id;
      refreshEmojiPickers();
    });
  }
  refreshEmojiPickers();

  function renderSwatches(containerId, selected, onSelect, excluded) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < COLOR_PALETTE.length; i++) {
      var c = COLOR_PALETTE[i];
      var swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = c.hex;
      swatch.title = c.name;
      if (c.hex === selected) swatch.classList.add('selected');
      if (excluded && excluded.indexOf(c.hex) !== -1) swatch.classList.add('taken');
      (function(hex) {
        swatch.addEventListener('click', function() { onSelect(hex); });
      })(c.hex);
      container.appendChild(swatch);
    }
  }

  function refreshJoinSwatches() {
    renderSwatches('join-color-picker', selectedColor, function(hex) {
      if (hex === selectedAIColor) return;
      selectedColor = hex;
      refreshJoinSwatches();
    }, [selectedAIColor]);
    renderSwatches('join-ai-color-picker', selectedAIColor, function(hex) {
      if (hex === selectedColor) return;
      selectedAIColor = hex;
      refreshJoinSwatches();
    }, [selectedColor]);
  }
  refreshJoinSwatches();

  /* Settings navbar toggle */
  var settingsToggle = document.getElementById('settings-nav-toggle');
  var settingsPanel = document.getElementById('settings-nav-panel');
  if (settingsToggle && settingsPanel) {
    settingsToggle.addEventListener('click', function () {
      settingsPanel.classList.toggle('open');
      settingsToggle.classList.toggle('active');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.settings-navbar')) {
        settingsPanel.classList.remove('open');
        settingsToggle.classList.remove('active');
      }
    });
  }

  /* Help modal toggle */
  var helpModal = document.getElementById('help-modal');
  var helpToggle = document.getElementById('help-toggle');
  if (helpToggle && helpModal) {
    helpToggle.addEventListener('click', function () {
      helpModal.style.display = helpModal.style.display === 'flex' ? 'none' : 'flex';
    });
    document.getElementById('help-close').addEventListener('click', function () {
      helpModal.style.display = 'none';
    });
    document.getElementById('help-got-it').addEventListener('click', function () {
      helpModal.style.display = 'none';
    });
    helpModal.addEventListener('click', function (e) {
      if (e.target === helpModal) helpModal.style.display = 'none';
    });
  }

  document.getElementById('btn-create').addEventListener('click', function () {
    var settingsName = document.getElementById('settings-player-name');
    var name = (settingsName && settingsName.value.trim()) || inputName.value.trim() || 'Host';
    socket.emit('sl:create-room', { name: name, color: selectedColor, avatar: selectedAvatar }, function (res) {
      if (res.ok) showScreen('lobby');
      else showToast(res.error || 'Failed to create room', 'snake');
    });
  });

  document.getElementById('btn-join').addEventListener('click', function () {
    var settingsName = document.getElementById('settings-player-name');
    var name = (settingsName && settingsName.value.trim()) || inputName.value.trim() || 'Player';
    var code = inputCode.value.trim().toUpperCase();
    if (!code) { showToast('Enter a room code', 'info'); return; }
    socket.emit('sl:join-room', { name: name, code: code, color: selectedColor, avatar: selectedAvatar }, function (res) {
      if (res.ok) showScreen('lobby');
      else showToast(res.error || 'Could not join', 'snake');
    });
  });

  /* Quick Play vs AI — skip lobby, jump straight into a game */
  /* ── Quick Play vs AI — show color modal first ── */
  var colorModal = document.getElementById('color-modal');

  function refreshModalSwatches() {
    renderSwatches('modal-color-picker', selectedColor, function(hex) {
      if (hex === selectedAIColor) return;
      selectedColor = hex;
      refreshModalSwatches();
      refreshJoinSwatches();
    }, [selectedAIColor]);
    renderSwatches('modal-ai-color-picker', selectedAIColor, function(hex) {
      if (hex === selectedColor) return;
      selectedAIColor = hex;
      refreshModalSwatches();
      refreshJoinSwatches();
    }, [selectedColor]);
  }

  document.getElementById('btn-quick-ai').addEventListener('click', function () {
    /* Sync name fields from settings navbar to modal */
    var settingsPlayerName = document.getElementById('settings-player-name');
    var settingsBotName = document.getElementById('settings-bot-name');
    var modalPlayerName = document.getElementById('modal-player-name');
    var modalBotName = document.getElementById('modal-bot-name');
    if (settingsPlayerName && modalPlayerName) modalPlayerName.value = settingsPlayerName.value;
    if (settingsBotName && modalBotName) modalBotName.value = settingsBotName.value;
    refreshModalSwatches();
    colorModal.style.display = 'flex';
  });

  document.getElementById('modal-cancel').addEventListener('click', function () {
    colorModal.style.display = 'none';
  });

  colorModal.addEventListener('click', function (e) {
    if (e.target === colorModal) colorModal.style.display = 'none';
  });

  document.getElementById('modal-start').addEventListener('click', function () {
    colorModal.style.display = 'none';
    var modalPlayerName = document.getElementById('modal-player-name');
    var modalBotName = document.getElementById('modal-bot-name');
    var name = (modalPlayerName && modalPlayerName.value.trim()) || inputName.value.trim() || 'Player';
    var botName = (modalBotName && modalBotName.value.trim()) || 'Bot Alpha';
    socket.emit('sl:quick-ai', { name: name, color: selectedColor, aiColor: selectedAIColor, aiName: botName, avatar: selectedAvatar }, function (res) {
      if (res && res.ok) {
        showScreen('game');
      } else {
        showToast((res && res.error) || 'Failed to start', 'snake');
      }
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
    var amHost = room.hostId === mySocketId;

    var html = '';
    for (var i = 0; i < room.players.length; i++) {
      var p = room.players[i];
      var isHost = p.id === room.hostId;
      var isMe = p.id === mySocketId;
      html += '<div class="lp-row">' +
        '<span class="lp-dot" style="background:' + p.color + ';color:' + p.color + '"></span>' +
        '<span class="lp-name">' + _esc(p.name) + (isMe ? ' (You)' : '') + (p.isAI ? ' 🤖' : '') + '</span>';
      // Color change button (for self, or host can change AI colors)
      if (isMe || (amHost && p.isAI)) {
        html += '<span class="lp-color-btn" style="background:' + p.color + '" data-color-for="' + p.id + '" data-is-ai="' + (p.isAI ? '1' : '0') + '" title="Change color"></span>';
      }
      if (isHost) html += '<span class="lp-badge lp-host">Host</span>';
      if (!p.connected && !p.isAI) html += '<span class="lp-badge lp-dc">DC</span>';
      else if (p.isAI) html += '<span class="lp-badge lp-ready">AI</span>';
      else if (p.ready) html += '<span class="lp-badge lp-ready">Ready</span>';
      else html += '<span class="lp-badge lp-waiting">Waiting</span>';
      html += '</div>';
    }
    document.getElementById('lobby-players').innerHTML = html;

    // Attach color change button handlers
    var takenColors = room.players.map(function(p) { return p.color; });
    var colorBtns = document.querySelectorAll('.lp-color-btn');
    for (var ci = 0; ci < colorBtns.length; ci++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          // Toggle dropdown
          var existing = btn.parentElement.querySelector('.lp-color-dropdown');
          if (existing) { existing.remove(); return; }
          // Close any open dropdowns
          document.querySelectorAll('.lp-color-dropdown').forEach(function(d) { d.remove(); });
          var dd = document.createElement('div');
          dd.className = 'lp-color-dropdown';
          var playerId = btn.getAttribute('data-color-for');
          var isAI = btn.getAttribute('data-is-ai') === '1';
          for (var pi = 0; pi < COLOR_PALETTE.length; pi++) {
            var sc = document.createElement('div');
            sc.className = 'color-swatch';
            sc.style.background = COLOR_PALETTE[pi].hex;
            sc.title = COLOR_PALETTE[pi].name;
            if (takenColors.indexOf(COLOR_PALETTE[pi].hex) !== -1 && COLOR_PALETTE[pi].hex !== btn.style.backgroundColor) {
              sc.classList.add('taken');
            }
            (function(hex) {
              sc.addEventListener('click', function() {
                if (isAI) {
                  socket.emit('sl:change-ai-color', { aiId: playerId, color: hex });
                } else {
                  socket.emit('sl:change-color', { color: hex });
                }
                dd.remove();
              });
            })(COLOR_PALETTE[pi].hex);
            dd.appendChild(sc);
          }
          btn.style.position = 'relative';
          btn.appendChild(dd);
        });
      })(colorBtns[ci]);
    }

    // Settings
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
  /* ══════════════════════════════════════
     PLAYER EMOJI REACTION FACES
     ══════════════════════════════════════ */
  var FACE_NEUTRAL = '😊';
  var FACE_AI_NEUTRAL = '🤖';
  var FACE_CRY     = '😭';
  var FACE_LAUGH   = '😂';
  var FACE_MOCK    = '🤣';
  var FACE_SCARED  = '😰';
  var FACE_COOL    = '😎';
  var FACE_WIN     = '🥳';
  var FACE_AI_CRY  = '🤖';
  var FACE_AI_MOCK = '🤖';
  var FACE_AI_WIN  = '🤖';

  var TAUNT_MESSAGES = [
    'Haha! Loser!', 'Get rekt! 😂', 'Byeee! 👋',
    'Down you go!', 'Enjoy the slide! 🐍', 'LOL noob!',
    'Slippery! 😏', 'Oopsie! 💀',
  ];
  var CRY_MESSAGES = [
    'Nooo! 😭', 'Why me!?', 'So unfair!',
    'I hate snakes!', 'Ugh...', 'This game is rigged!',
  ];
  var CELEBRATE_MESSAGES = [
    'Woohoo! 🎉', 'To the top!', 'Easy! 😎',
    'See ya below!', 'Let\'s gooo!', 'I\'m flying! 🚀',
  ];
  var JEALOUS_MESSAGES = [
    'Lucky... 😒', 'Whatever...', 'Show off!',
    'That was MY ladder!', 'Hmph! 😤',
  ];

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function renderPlayerFaces() {
    var container = document.getElementById('player-faces');
    if (!container || !gameState) return;
    container.innerHTML = '';
    for (var i = 0; i < gameState.players.length; i++) {
      var p = gameState.players[i];
      var av = p.isAI ? null : getAvatar(p.avatar || 'smiley');
      var neutralEmoji = p.isAI ? FACE_AI_NEUTRAL : (av ? av.neutral : FACE_NEUTRAL);
      var isCurrent = (i === gameState.currentPlayerIndex);
      var div = document.createElement('div');
      div.className = 'pface' + (p.isAI ? ' is-ai' : '') + (isCurrent ? ' is-current' : '');
      div.id = 'pface-' + i;
      div.setAttribute('data-is-ai', p.isAI ? '1' : '0');
      div.setAttribute('data-avatar', p.avatar || (p.isAI ? 'robot' : 'smiley'));
      div.style.setProperty('--pface-color', p.color);
      div.style.setProperty('--pface-glow', p.color + '44');
      div.innerHTML =
        '<div class="pface-emoji" id="pface-emoji-' + i + '">' + neutralEmoji + '</div>' +
        '<div class="pface-name" style="color:' + p.color + '">' + (p.name || p.colorName) + '</div>' +
        '<div class="pface-badge">' + (p.isAI ? '🤖 BOT' : '👤 PLAYER') + '</div>' +
        '<div class="pface-bubble" id="pface-bubble-' + i + '"></div>';
      container.appendChild(div);
    }
  }

  /* Update face card highlight for current player */
  function updateFaceHighlight(state) {
    if (!state || !state.players) return;
    for (var i = 0; i < state.players.length; i++) {
      var el = document.getElementById('pface-' + i);
      if (el) {
        if (i === state.currentPlayerIndex) el.classList.add('is-current');
        else el.classList.remove('is-current');
      }
    }
  }

  function setFaceReaction(playerIdx, emoji, animClass, bubbleText) {
    var emojiEl = document.getElementById('pface-emoji-' + playerIdx);
    var bubbleEl = document.getElementById('pface-bubble-' + playerIdx);
    if (!emojiEl) return;

    emojiEl.textContent = emoji;
    emojiEl.classList.remove('anim-cry', 'anim-laugh', 'anim-mock', 'anim-bounce');
    void emojiEl.offsetWidth;
    if (animClass) emojiEl.classList.add(animClass);

    if (bubbleEl && bubbleText) {
      bubbleEl.textContent = bubbleText;
      bubbleEl.classList.add('show');
    }
    // No timeout — expression persists until next roll resets all faces
  }

  /** Reset all player faces to neutral (called at start of each new roll) */
  /** Helper: get the neutral emoji for a player by index */
  function getNeutralEmoji(playerIdx) {
    var pface = document.getElementById('pface-' + playerIdx);
    if (!pface) return FACE_NEUTRAL;
    var isAI = pface.getAttribute('data-is-ai') === '1';
    if (isAI) return FACE_AI_NEUTRAL;
    var avId = pface.getAttribute('data-avatar') || 'smiley';
    var av = getAvatar(avId);
    return av ? av.neutral : FACE_NEUTRAL;
  }

  function resetAllFaces() {
    if (!gameState) return;
    for (var i = 0; i < gameState.players.length; i++) {
      var emojiEl = document.getElementById('pface-emoji-' + i);
      var bubbleEl = document.getElementById('pface-bubble-' + i);
      if (emojiEl) {
        emojiEl.textContent = getNeutralEmoji(i);
        emojiEl.classList.remove('anim-cry', 'anim-laugh', 'anim-mock', 'anim-bounce');
      }
      if (bubbleEl) bubbleEl.classList.remove('show');
    }
  }

  /** Get the reaction emoji for a player based on their avatar */
  function getReactionEmoji(playerIdx, reactionType) {
    var pface = document.getElementById('pface-' + playerIdx);
    if (!pface) return FACE_NEUTRAL;
    var isAI = pface.getAttribute('data-is-ai') === '1';
    if (isAI) return FACE_AI_NEUTRAL;
    var avId = pface.getAttribute('data-avatar') || 'smiley';
    var av = getAvatar(avId);
    if (!av) return FACE_NEUTRAL;
    return av[reactionType] || av.neutral;
  }

  function triggerSnakeReaction(playerIdx) {
    setFaceReaction(playerIdx, getReactionEmoji(playerIdx, 'cry'), 'anim-cry', pickRandom(CRY_MESSAGES));
    if (gameState) {
      for (var i = 0; i < gameState.players.length; i++) {
        if (i !== playerIdx) {
          setFaceReaction(i, getReactionEmoji(i, 'mock'), 'anim-mock', pickRandom(TAUNT_MESSAGES));
        }
      }
    }
  }

  function triggerLadderReaction(playerIdx) {
    setFaceReaction(playerIdx, getReactionEmoji(playerIdx, 'cool'), 'anim-laugh', pickRandom(CELEBRATE_MESSAGES));
    if (gameState) {
      for (var i = 0; i < gameState.players.length; i++) {
        if (i !== playerIdx) {
          setFaceReaction(i, getReactionEmoji(i, 'scared'), 'anim-bounce', pickRandom(JEALOUS_MESSAGES));
        }
      }
    }
  }

  function triggerWinReaction(playerIdx) {
    setFaceReaction(playerIdx, getReactionEmoji(playerIdx, 'win'), 'anim-laugh', 'I WON! 🏆');
    if (gameState) {
      for (var i = 0; i < gameState.players.length; i++) {
        if (i !== playerIdx) {
          setFaceReaction(i, getReactionEmoji(i, 'cry'), 'anim-cry', 'GG... 😢');
        }
      }
    }
  }

  socket.on('sl:game-started', function () {
    showScreen('game');
    SLBoard.init(document.getElementById('sl-canvas'));
    playerLastRoll = {};
    document.getElementById('move-log').innerHTML = '';
    addLog('Game started!', '#4d9de0', 'info');
    // Render faces after a short delay so gameState is available
    setTimeout(function () { renderPlayerFaces(); }, 300);
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
    // Save non-position data always, but guard board redraw during animations
    var wasAnimating = isAnimatingMove || SLBoard.isAnimating();
    if (wasAnimating && gameState) {
      // Preserve the positions we're currently animating — update everything else
      for (var i = 0; i < state.players.length; i++) {
        state.players[i].position = gameState.players[i].position;
      }
    }
    gameState = state;
    if (currentRoom) {
      myPlayerIdx = currentRoom.players.findIndex(function (p) { return p.id === mySocketId; });
    }
    if (!wasAnimating) {
      SLBoard.draw(state);
    }
    renderTurnIndicator(state);
    renderPlayerDice(state);
    updateFaceHighlight(state);
  });

  /* ══════════════════════════════════════
     ROLL RESULT
     ══════════════════════════════════════ */
  socket.on('sl:roll-result', function (result) {
    // Reset all emoji faces from previous roll's reactions
    resetAllFaces();
    isAnimatingMove = true;  // Block further rolls until animation chain finishes
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
        movePromise = SLBoard.animateToken(result.playerIdx, fromSq, toSq);
      } else if (fromSq <= 0 && toSq > 0) {
        movePromise = SLBoard.animateToken(result.playerIdx, 1, toSq);
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
          // Trigger emoji reactions!
          if (sl.type === 'snake') {
            triggerSnakeReaction(result.playerIdx);
          } else {
            triggerLadderReaction(result.playerIdx);
          }
          return SLBoard.animateSnakeLadder(result.playerIdx, sl.from, sl.to, sl.type);
        }
      }).then(function () {
        isAnimatingMove = false;  // Unlock — animation chain complete
        // Update local gameState with final position so draw doesn't snap back
        if (gameState && gameState.players[result.playerIdx]) {
          gameState.players[result.playerIdx].position = result.newPos;
        }
        if (result.collectedPowerup) {
          var puNames = { shield: '🛡️ Shield', double: '⚡ Double', reroll: '🎲 Reroll' };
          var puLabel = puNames[result.collectedPowerup] || result.collectedPowerup;
          addLog(pName + ' collected ' + puLabel + '!', pColor, 'info');
          showToast(pName + ' got ' + puLabel + '!', 'ladder');
          // Update local inventory
          if (gameState && gameState.inventory && gameState.inventory[result.playerIdx]) {
            gameState.inventory[result.playerIdx][result.collectedPowerup]++;
          }
          // Remove from local powerups array
          if (gameState && gameState.powerups) {
            gameState.powerups = gameState.powerups.filter(function (pu) { return pu.sq !== result.newPos; });
          }
        }
        if (result.won) {
          addLog('🏆 ' + pName + ' reached 100!', pColor, 'win');
          showToast(pName + ' reached 100! 🏆', 'win');
          triggerWinReaction(result.playerIdx);
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
    var container = document.getElementById('player-panels');
    if (!container) return;
    var html = '';
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      var isActive = state.currentPlayerIdx === i && state.phase === 'playing';
      var isMe = i === myPlayerIdx;
      var lastVal = playerLastRoll[i] || 1;
      var finished = state.finished && state.finished.indexOf(i) >= 0;
      var inv = state.inventory && state.inventory[i] ? state.inventory[i] : { shield: 0, double: 0, reroll: 0 };

      // Avatar info
      var av = p.isAI ? null : getAvatar(p.avatar || 'smiley');
      var neutralEmoji = p.isAI ? FACE_AI_NEUTRAL : (av ? av.neutral : FACE_NEUTRAL);

      html += '<div class="pp-block' + (isActive ? ' pp-active' : '') + (finished ? ' pp-finished' : '') +
        '" id="pface-' + i + '" data-is-ai="' + (p.isAI ? '1' : '0') + '" data-avatar="' + (p.avatar || (p.isAI ? 'robot' : 'smiley')) + '"' +
        ' style="--pp-color:' + p.color + ';--pp-bg:' + p.color + '15;--pp-border:' + p.color +
        ';--pface-color:' + p.color + ';--pface-glow:' + p.color + '44">' +

        // Avatar row: emoji + name + badge
        '<div class="pp-avatar-row">' +
        '<div class="pface-emoji" id="pface-emoji-' + i + '">' + neutralEmoji + '</div>' +
        '<div class="pp-info">' +
        '<span class="pp-name">' + _esc(p.name || p.colorName).toUpperCase() + '</span>' +
        (p.isAI ? '<span class="pp-tag">🤖 BOT</span>' : '<span class="pp-tag">👤 PLAYER</span>') +
        (finished ? '<span class="pp-tag pp-done">✓ DONE</span>' : '') +
        '</div>' +
        '<div class="pface-bubble" id="pface-bubble-' + i + '"></div>' +
        '</div>' +

        '<div class="pp-body">' +

        '<div class="pp-dice-area">' +
        '<div class="dice-scene" id="dice-scene-' + i + '">' +
        '<div class="dice-cube" id="dice-cube-' + i + '" style="' + _cubeTransform(lastVal) + '">' +
        _cubeFacesHtml() +
        '</div></div>' +
        '<div class="pp-sq">Sq ' + (p.position || 0) + '</div>' +
        '</div>' +

        '<div class="pp-powers">' +
        '<div class="pp-pw"><span class="pp-pw-icon">🛡️</span><span class="pp-pw-ct">' + inv.shield + '</span></div>' +
        '<div class="pp-pw"><span class="pp-pw-icon">⚡</span><span class="pp-pw-ct">' + inv.double + '</span></div>' +
        '<div class="pp-pw"><span class="pp-pw-icon">🎲</span><span class="pp-pw-ct">' + inv.reroll + '</span></div>' +
        '</div>' +

        '</div>';

      if (isActive && isMe) {
        html += '<button class="pp-roll-btn" id="pdice-btn-' + i + '" style="background:' + p.color + '">Roll 🎲</button>';
      } else if (isActive) {
        html += '<div class="pp-waiting" style="color:' + p.color + '">Rolling...</div>';
      }

      html += '</div>';
    }
    container.innerHTML = html;

    for (var j = 0; j < state.players.length; j++) {
      var btn = document.getElementById('pdice-btn-' + j);
      if (btn) {
        btn.disabled = isRolling || isAnimatingMove;
        btn.addEventListener('click', handleDiceClick);
      }
    }
  }

  /** Generate all 6 cube face divs */
  function _cubeFacesHtml() {
    var html = '';
    for (var f = 1; f <= 6; f++) {
      html += '<div class="dice-face-3d dice-face-' + f + '"><div class="dice-dots">' +
        _dotsHtml(f) + '</div></div>';
    }
    return html;
  }

  /** CSS transform to show a specific face value */
  var FACE_ROTATIONS = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(0deg) rotateY(-90deg)',
    3: 'rotateX(-90deg) rotateY(0deg)',
    4: 'rotateX(90deg) rotateY(0deg)',
    5: 'rotateX(0deg) rotateY(90deg)',
    6: 'rotateX(0deg) rotateY(180deg)',
  };
  function _cubeTransform(val) {
    return 'transform: ' + (FACE_ROTATIONS[val] || FACE_ROTATIONS[1]) + ';';
  }

  function _dotsHtml(value) {
    var layout = DOT_LAYOUTS[value] || DOT_LAYOUTS[0];
    return layout.map(function (v) {
      return v ? '<span class="dot"></span>' : '<span class="dot dot-hidden"></span>';
    }).join('');
  }

  function handleDiceClick() {
    if (isRolling || isAnimatingMove) return;
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
    var cube = document.getElementById('dice-cube-' + playerIdx);
    if (!cube) { if (cb) cb(); return; }

    // Add rolling class for 1 second tumble
    cube.classList.add('dice-rolling');
    cube.style.transform = '';

    // After 1 second, stop and show result face
    setTimeout(function () {
      cube.classList.remove('dice-rolling');
      cube.style.transition = 'transform 0.4s cubic-bezier(0.2,0.8,0.3,1.2)';
      cube.style.transform = FACE_ROTATIONS[finalValue] || FACE_ROTATIONS[1];
      // Wait for settle transition
      setTimeout(function () {
        cube.style.transition = '';
        if (cb) cb();
      }, 450);
    }, 1000);
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
    el.style.setProperty('--turn-color', p.color + '40');
    var isMe = (state.currentPlayerIdx === myPlayerIdx);
    var label = isMe ? 'Your' : (p.colorName + "'s");
    el.innerHTML =
      '<span class="turn-dot" style="background:' + p.color + ';box-shadow:0 0 8px ' + p.color + '"></span>' +
      '<span style="color:' + p.color + '">' + label + '</span>' +
      "<span> turn</span>";
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
