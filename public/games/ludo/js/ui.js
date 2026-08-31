/**
 * ui.js
 * ─────────────────────────────────────────────
 * DOM helpers: screen transitions, modern turn banner,
 * toast notification popups, and token-selection clicks.
 */

const UI = (() => {
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  /* ── Turn indicator: styled pill badge with dot + label ── */
  function setTurnIndicator(player) {
    const el = document.getElementById('turn-indicator');
    const hex = COLOR_HEX[player.color];
    el.style.borderColor = hex + '80';
    el.style.boxShadow = `0 0 20px ${hex}30, inset 0 0 12px ${hex}10`;
    el.innerHTML =
      `<span class="turn-dot" style="background:${hex}; box-shadow:0 0 8px ${hex}"></span>` +
      `<span class="turn-label" style="color:${hex}">${player.color}</span>` +
      `<span class="turn-label">'s turn</span>` +
      (player.type === 'ai' ? `<span class="turn-type">(AI)</span>` : '');
  }

  function showMessage(msg) {
    document.getElementById('message-area').textContent = msg;
  }

  /* ── Toast notifications ── */
  function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  /* ── Victory screen ── */
  function showVictory(player) {
    const hex = COLOR_HEX[player.color];
    document.getElementById('winner-text').innerHTML =
      `<span style="color:${hex}">${player.color.toUpperCase()}</span> Wins!`;
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

      showMessage('Click a token to move: ' + movableIndices.map(function(i) { return '#' + (i + 1); }).join(', '));

      const canvas = Board.getCanvas();
      function onClick(e) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const cell = Board.getCellFromPixel(px, py);

        const cfg = PLAYER_CONFIG[player.color];
        for (let j = 0; j < movableIndices.length; j++) {
          var ti = movableIndices[j];
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

  return { showScreen, setTurnIndicator, showMessage, showToast, showVictory, pickToken };
})();
