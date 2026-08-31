/**
 * main.js
 * ─────────────────────────────────────────────
 * Entry point: wires up the setup form, starts
 * the game loop, and coordinates dice → move → draw.
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
        `<span class="color-dot" style="background:${COLOR_HEX[color]}"></span>` +
        `${color.toUpperCase()}: ` +
        `<select data-player="${i}">` +
        `  <option value="human">Human</option>` +
        `  <option value="ai">AI</option>` +
        `</select>`;
      playerTypesEl.appendChild(lbl);
    }
  }

  playerCountEl.addEventListener('change', renderPlayerTypeSelectors);
  renderPlayerTypeSelectors();

  startBtn.addEventListener('click', () => {
    const n = parseInt(playerCountEl.value, 10);
    const players = [];
    for (let i = 0; i < n; i++) {
      const sel = playerTypesEl.querySelector(`[data-player="${i}"]`);
      players.push(createPlayer(COLORS[i], sel.value));
    }
    startGame(players);
  });

  restartBtn.addEventListener('click', () => UI.showScreen('setup-screen'));

  /* ── Game loop ── */
  let rolling = false;

  function startGame(players) {
    Board.init(document.getElementById('board-canvas'));
    Game.start(players);
    UI.showScreen('game-screen');
    Board.draw(Game.getState());
    beginTurn();
  }

  function beginTurn() {
    const player = Game.currentPlayer();
    UI.setTurnIndicator(player);
    UI.showMessage('');
    Board.draw(Game.getState());

    if (player.type === 'ai') {
      diceBtn.disabled = true;
      setTimeout(() => aiTurn(), 600);
    } else {
      diceBtn.disabled = false;
    }
  }

  diceBtn.addEventListener('click', async () => {
    if (rolling) return;
    rolling = true;
    diceBtn.disabled = true;
    await humanTurn();
    rolling = false;
  });

  async function humanTurn() {
    const roll = await Dice.roll();
    UI.showMessage(`Rolled a ${roll}`);

    const movable = Game.getMovableTokens(roll);
    if (movable.length === 0) {
      UI.showMessage(`Rolled ${roll} — no moves available.`);
      await delay(800);
      Game.nextTurn(false);
      beginTurn();
      return;
    }

    const chosen = await UI.pickToken(Game.currentPlayer(), movable);
    const result = Game.moveToken(chosen, roll);
    Board.draw(Game.getState());
    if (result.events.length) UI.showMessage(result.events.join(' | '));

    // Win check
    const winner = Game.checkWin();
    if (winner) { await delay(600); UI.showVictory(winner); return; }

    await delay(500);
    Game.nextTurn(roll === 6);
    beginTurn();
  }

  async function aiTurn() {
    const roll = await Dice.roll();
    UI.showMessage(`AI rolled a ${roll}`);

    const movable = Game.getMovableTokens(roll);
    if (movable.length === 0) {
      UI.showMessage(`AI rolled ${roll} — no moves.`);
      await delay(800);
      Game.nextTurn(false);
      beginTurn();
      return;
    }

    // Simple AI: prefer leaving base on 6, else move the furthest token
    let chosen;
    const player = Game.currentPlayer();
    const baseTokens = movable.filter(i => player.tokens[i].state === 'base');
    if (roll === 6 && baseTokens.length > 0) {
      chosen = baseTokens[0];
    } else {
      // Pick the token with the most distance
      chosen = movable.reduce((best, i) =>
        player.tokens[i].distanceTravelled > player.tokens[best].distanceTravelled ? i : best,
        movable[0]
      );
    }

    await delay(400);
    const result = Game.moveToken(chosen, roll);
    Board.draw(Game.getState());
    if (result.events.length) UI.showMessage(result.events.join(' | '));

    const winner = Game.checkWin();
    if (winner) { await delay(600); UI.showVictory(winner); return; }

    await delay(600);
    Game.nextTurn(roll === 6);
    beginTurn();
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
