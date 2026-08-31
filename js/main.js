/**
 * main.js
 * ─────────────────────────────────────────────
 * Entry point: wires up the setup form, starts
 * the game loop, coordinates dice → animate → move → draw.
 * Now includes token slide animations and toast events.
 */

(function () {
  const playerCountEl = document.getElementById('player-count');
  const playerTypesEl = document.getElementById('player-types');
  const startBtn      = document.getElementById('start-btn');
  const diceBtn       = document.getElementById('dice-btn');
  const restartBtn    = document.getElementById('restart-btn');

  /* ── Setup screen ── */
  function renderPlayerTypeSelectors() {
    const n = parseInt(playerCountEl.value, 10);
    playerTypesEl.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const color = COLORS[i];
      const lbl = document.createElement('label');
      lbl.innerHTML =
        '<span class="color-dot" style="background:' + COLOR_HEX[color] + '; color:' + COLOR_HEX[color] + '"></span>' +
        '<strong>' + color.toUpperCase() + '</strong>' +
        '<select data-player="' + i + '">' +
        '  <option value="human">Human</option>' +
        '  <option value="ai">AI</option>' +
        '</select>';
      playerTypesEl.appendChild(lbl);
    }
  }

  playerCountEl.addEventListener('change', renderPlayerTypeSelectors);
  renderPlayerTypeSelectors();

  startBtn.addEventListener('click', function() {
    var n = parseInt(playerCountEl.value, 10);
    var players = [];
    for (var i = 0; i < n; i++) {
      var sel = playerTypesEl.querySelector('[data-player="' + i + '"]');
      players.push(createPlayer(COLORS[i], sel.value));
    }
    startGame(players);
  });

  restartBtn.addEventListener('click', function() { UI.showScreen('setup-screen'); });

  /* ── Game loop ── */
  var rolling = false;

  function startGame(players) {
    Board.init(document.getElementById('board-canvas'));
    Game.start(players);
    UI.showScreen('game-screen');
    Board.draw(Game.getState());
    beginTurn();
  }

  function beginTurn() {
    var player = Game.currentPlayer();
    UI.setTurnIndicator(player);
    UI.showMessage('');
    Board.draw(Game.getState());

    if (player.type === 'ai') {
      diceBtn.disabled = true;
      setTimeout(function() { aiTurn(); }, 600);
    } else {
      diceBtn.disabled = false;
    }
  }

  diceBtn.addEventListener('click', async function() {
    if (rolling) return;
    rolling = true;
    diceBtn.disabled = true;
    await humanTurn();
    rolling = false;
  });

  async function humanTurn() {
    var roll = await Dice.roll();
    UI.showMessage('Rolled a ' + roll);

    var movable = Game.getMovableTokens(roll);
    if (movable.length === 0) {
      UI.showMessage('Rolled ' + roll + ' — no moves available.');
      await delay(800);
      Game.nextTurn(false);
      beginTurn();
      return;
    }

    var chosen = await UI.pickToken(Game.currentPlayer(), movable);
    await executeMove(chosen, roll);
  }

  async function aiTurn() {
    var roll = await Dice.roll();
    UI.showMessage('AI rolled a ' + roll);

    var movable = Game.getMovableTokens(roll);
    if (movable.length === 0) {
      UI.showMessage('AI rolled ' + roll + ' — no moves.');
      await delay(800);
      Game.nextTurn(false);
      beginTurn();
      return;
    }

    // Simple AI: prefer leaving base on 6, else move the furthest token
    var chosen;
    var player = Game.currentPlayer();
    var baseTokens = movable.filter(function(i) { return player.tokens[i].state === 'base'; });
    if (roll === 6 && baseTokens.length > 0) {
      chosen = baseTokens[0];
    } else {
      chosen = movable.reduce(function(best, i) {
        return player.tokens[i].distanceTravelled > player.tokens[best].distanceTravelled ? i : best;
      }, movable[0]);
    }

    await delay(400);
    await executeMove(chosen, roll);
  }

  /**
   * Execute a move with animation and toasts.
   */
  async function executeMove(chosen, roll) {
    var player = Game.currentPlayer();
    var color = player.color;

    // Capture position BEFORE the move
    var fromCoords = Board.getTokenCoords(player, chosen);

    // Apply game logic
    var result = Game.moveToken(chosen, roll);

    // Capture position AFTER the move
    var toCoords = Board.getTokenCoords(player, chosen);

    // Animate the token sliding to its new position
    if (fromCoords.r !== toCoords.r || fromCoords.c !== toCoords.c) {
      await Board.animateToken(color, chosen, fromCoords.r, fromCoords.c, toCoords.r, toCoords.c, 350);
    }

    Board.draw(Game.getState());

    // Show events as toasts
    if (result.events.length) {
      UI.showMessage(result.events.join(' | '));
      for (var i = 0; i < result.events.length; i++) {
        var evt = result.events[i];
        if (evt.indexOf('Snake') >= 0 || evt.indexOf('🐍') >= 0) {
          UI.showToast(evt, 'snake');
        } else if (evt.indexOf('Ladder') >= 0 || evt.indexOf('🪜') >= 0) {
          UI.showToast(evt, 'ladder');
        } else if (evt.indexOf('Captured') >= 0 || evt.indexOf('💥') >= 0) {
          UI.showToast(evt, 'capture');
        } else if (evt.indexOf('HOME') >= 0 || evt.indexOf('🏠') >= 0) {
          UI.showToast(evt, 'home');
        }
      }
    }

    // Win check
    var winner = Game.checkWin();
    if (winner) { await delay(600); UI.showVictory(winner); return; }

    await delay(450);
    Game.nextTurn(roll === 6);
    beginTurn();
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
})();
