/**
 * ui.js
 * ─────────────────────────────────────────────
 * DOM manipulation helpers: screen transitions,
 * message display, turn highlighting, and
 * token-selection click handling on the canvas.
 */

const UI = (() => {
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  function setTurnIndicator(player) {
    const el = document.getElementById('turn-indicator');
    el.innerHTML = `<span style="color:${COLOR_HEX[player.color]}">● ${player.color.toUpperCase()}</span>'s turn` +
      (player.type === 'ai' ? ' (AI)' : '');
  }

  function showMessage(msg) {
    const el = document.getElementById('message-area');
    el.textContent = msg;
  }

  function showVictory(player) {
    document.getElementById('winner-text').innerHTML =
      `🎉 <span style="color:${COLOR_HEX[player.color]}">${player.color.toUpperCase()}</span> wins! 🎉`;
    showScreen('victory-screen');
  }

  /**
   * Prompt user to click one of the movable tokens on the canvas.
   * Returns a Promise that resolves with the chosen token index.
   */
  function pickToken(player, movableIndices) {
    return new Promise(resolve => {
      if (movableIndices.length === 1) {
        resolve(movableIndices[0]);
        return;
      }

      showMessage(`Click a token to move: ${movableIndices.map(i => '#' + (i + 1)).join(', ')}`);

      const canvas = Board.getCanvas();
      function onClick(e) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const cell = Board.getCellFromPixel(px, py);

        // Find which movable token is at this cell
        const cfg = PLAYER_CONFIG[player.color];
        for (const ti of movableIndices) {
          const tok = player.tokens[ti];
          let tr, tc;
          if (tok.state === 'base') {
            const bp = cfg.baseCoords[ti]; tr = bp.r; tc = bp.c;
          } else if (tok.state === 'track') {
            const pp = PATH_COORDS[tok.pathIndex]; tr = pp.r; tc = pp.c;
          } else if (tok.state === 'homeStretch') {
            const hp = cfg.homeStretch[tok.homeStretchPos]; tr = hp.r; tc = hp.c;
          } else continue;

          if (cell.r === tr && cell.c === tc) {
            canvas.removeEventListener('click', onClick);
            resolve(ti);
            return;
          }
        }
      }
      canvas.addEventListener('click', onClick);
    });
  }

  return { showScreen, setTurnIndicator, showMessage, showVictory, pickToken };
})();
