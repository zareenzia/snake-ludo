/**
 * board.js
 * ─────────────────────────────────────────────
 * Renders the 15×15 board on a <canvas>:
 *   • Colored home-base quadrants
 *   • The 52-square track with numbering
 *   • Star (safe) squares
 *   • Snakes (red curves) and ladders (green bars)
 *   • Home-stretch lanes and the center home area
 *   • All player tokens at their current positions
 */

const Board = (() => {
  let canvas, ctx, cellPx;

  function init(canvasEl) {
    canvas = canvasEl;
    _resize();
    window.addEventListener('resize', () => { _resize(); });
  }

  function _resize() {
    const maxW = Math.min(window.innerWidth - 20, 700);
    cellPx = Math.floor(maxW / BOARD_SIZE);
    canvas.width  = cellPx * BOARD_SIZE;
    canvas.height = cellPx * BOARD_SIZE;
    ctx = canvas.getContext('2d');
  }

  /* ── Main draw entry ── */
  function draw(gameState) {
    _resize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _drawGrid();
    _drawHomeZones();
    _drawCenter();
    _drawTrack();
    _drawSafeSquares();
    _drawHomeStretches();
    _drawSnakes();
    _drawLadders();
    _drawTokens(gameState);
  }

  function _drawGrid() {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= BOARD_SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(i * cellPx, 0); ctx.lineTo(i * cellPx, BOARD_SIZE * cellPx); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cellPx); ctx.lineTo(BOARD_SIZE * cellPx, i * cellPx); ctx.stroke();
    }
  }

  function _drawHomeZones() {
    for (const color of COLORS) {
      const z = HOME_ZONES[color];
      ctx.fillStyle = COLOR_LIGHT[color];
      ctx.fillRect(z.c1 * cellPx, z.r1 * cellPx, (z.c2 - z.c1 + 1) * cellPx, (z.r2 - z.r1 + 1) * cellPx);
      ctx.strokeStyle = COLOR_HEX[color]; ctx.lineWidth = 2;
      ctx.strokeRect(z.c1 * cellPx, z.r1 * cellPx, (z.c2 - z.c1 + 1) * cellPx, (z.r2 - z.r1 + 1) * cellPx);

      // Draw inner circle area for base tokens
      const cx = ((z.c1 + z.c2 + 1) / 2) * cellPx;
      const cy = ((z.r1 + z.r2 + 1) / 2) * cellPx;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx, cy, cellPx * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COLOR_HEX[color]; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function _drawCenter() {
    const { r1, c1, r2, c2 } = CENTER;
    // Draw colored triangles pointing to center
    const cx = ((c1 + c2 + 1) / 2) * cellPx;
    const cy = ((r1 + r2 + 1) / 2) * cellPx;
    const half = ((c2 - c1 + 1) / 2) * cellPx;

    const triColors = [COLOR_HEX.blue, COLOR_HEX.green, COLOR_HEX.yellow, COLOR_HEX.red];
    const points = [
      // top triangle
      [[cx - half, cy - half], [cx + half, cy - half], [cx, cy]],
      // right
      [[cx + half, cy - half], [cx + half, cy + half], [cx, cy]],
      // bottom
      [[cx + half, cy + half], [cx - half, cy + half], [cx, cy]],
      // left
      [[cx - half, cy + half], [cx - half, cy - half], [cx, cy]],
    ];
    points.forEach((tri, i) => {
      ctx.fillStyle = triColors[i];
      ctx.beginPath(); ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    });

    // "HOME" label
    ctx.fillStyle = '#fff'; ctx.font = `bold ${cellPx * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HOME', cx, cy);
  }

  function _drawTrack() {
    ctx.font = `${cellPx * 0.28}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    PATH_COORDS.forEach((p, i) => {
      const x = p.c * cellPx, y = p.r * cellPx;
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
      ctx.fillStyle = '#888';
      ctx.fillText(i, x + cellPx / 2, y + cellPx / 2);
    });
  }

  function _drawSafeSquares() {
    SAFE_ZONES.forEach(i => {
      const p = PATH_COORDS[i];
      const cx = p.c * cellPx + cellPx / 2, cy = p.r * cellPx + cellPx / 2;
      ctx.fillStyle = '#ffd36944';
      ctx.fillRect(p.c * cellPx + 1, p.r * cellPx + 1, cellPx - 2, cellPx - 2);
      ctx.fillStyle = '#b8860b'; ctx.font = `bold ${cellPx * 0.45}px sans-serif`;
      ctx.fillText('★', cx, cy);
    });
  }

  function _drawHomeStretches() {
    for (const color of COLORS) {
      const cfg = PLAYER_CONFIG[color];
      cfg.homeStretch.forEach((p) => {
        ctx.fillStyle = COLOR_HEX[color] + '55';
        ctx.fillRect(p.c * cellPx + 1, p.r * cellPx + 1, cellPx - 2, cellPx - 2);
        ctx.strokeStyle = COLOR_HEX[color]; ctx.lineWidth = 1;
        ctx.strokeRect(p.c * cellPx + 1, p.r * cellPx + 1, cellPx - 2, cellPx - 2);
      });
    }
  }

  function _drawSnakes() {
    for (const [head, tail] of Object.entries(SNAKES)) {
      const h = PATH_COORDS[head], t = PATH_COORDS[tail];
      _drawConnection(h, t, '#e94560', '🐍');
    }
  }

  function _drawLadders() {
    for (const [base, top] of Object.entries(LADDERS)) {
      const b = PATH_COORDS[base], t = PATH_COORDS[top];
      _drawConnection(b, t, '#0ead69', '🪜');
    }
  }

  function _drawConnection(from, to, color, emoji) {
    const x1 = from.c * cellPx + cellPx / 2, y1 = from.r * cellPx + cellPx / 2;
    const x2 = to.c * cellPx + cellPx / 2,   y2 = to.r * cellPx + cellPx / 2;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    // Emoji at start
    ctx.font = `${cellPx * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x1, y1 - cellPx * 0.35);
  }

  /* ── Draw all tokens ── */
  function _drawTokens(state) {
    if (!state) return;
    const stacked = {}; // key "r,c" → count for offset

    for (const player of state.players) {
      const color = player.color;
      const cfg = PLAYER_CONFIG[color];

      player.tokens.forEach((tok, ti) => {
        let r, c;
        if (tok.state === 'base') {
          const bp = cfg.baseCoords[ti];
          r = bp.r; c = bp.c;
        } else if (tok.state === 'home') {
          // Already home — draw small in center
          r = 7; c = 7;
        } else if (tok.state === 'homeStretch') {
          const hp = cfg.homeStretch[tok.homeStretchPos];
          r = hp.r; c = hp.c;
        } else { // 'track'
          const pp = PATH_COORDS[tok.pathIndex];
          r = pp.r; c = pp.c;
        }

        // Stack offset
        const key = r + ',' + c;
        stacked[key] = (stacked[key] || 0);
        const off = stacked[key];
        stacked[key]++;
        const offX = (off % 2) * cellPx * 0.28 - cellPx * 0.14;
        const offY = Math.floor(off / 2) * cellPx * 0.28 - cellPx * 0.14;

        const cx = c * cellPx + cellPx / 2 + offX;
        const cy = r * cellPx + cellPx / 2 + offY;
        const rad = cellPx * 0.28;

        // Glow for current player
        if (state.currentPlayerIndex === state.players.indexOf(player)) {
          ctx.shadowColor = COLOR_HEX[color]; ctx.shadowBlur = 8;
        }
        ctx.fillStyle = COLOR_HEX[color];
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.shadowBlur = 0;

        // Token number
        ctx.fillStyle = '#fff'; ctx.font = `bold ${cellPx * 0.26}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ti + 1, cx, cy);
      });
    }
  }

  /* Return cell coords {r,c} from pixel click pos */
  function getCellFromPixel(px, py) {
    return { r: Math.floor(py / cellPx), c: Math.floor(px / cellPx) };
  }

  return { init, draw, getCellFromPixel, getCanvas: () => canvas, getCellPx: () => cellPx };
})();
