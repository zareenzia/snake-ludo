/**
 * board.js
 * ─────────────────────────────────────────────
 * Modern canvas renderer for the 15×15 board:
 *   • Gradient-filled home-base quadrants with inner shadow rings
 *   • Rounded, softly shadowed track cells
 *   • Smooth SVG-style curved snakes and wood-style ladders
 *   • Glowing star safe-zone badges
 *   • 3D glossy pawn-style tokens with shadow
 *   • Animated token sliding between cells
 */

const Board = (() => {
  let canvas, ctx, cellPx;
  /* Animation state: array of {color, tokenIndex, fromR, fromC, toR, toC, progress} */
  let _animations = [];
  let _animCallback = null;
  let _gameState = null;

  function init(canvasEl) {
    canvas = canvasEl;
    _resize();
    window.addEventListener('resize', () => { _resize(); draw(_gameState); });
  }

  function _resize() {
    const maxW = Math.min(window.innerWidth - 24, 680);
    cellPx = Math.floor(maxW / BOARD_SIZE);
    canvas.width  = cellPx * BOARD_SIZE;
    canvas.height = cellPx * BOARD_SIZE;
    ctx = canvas.getContext('2d');
  }

  /* ── Colors with richer palette ── */
  const GRAD_COLORS = {
    red:    { a: '#ffe0e6', b: '#ffb3c1' },
    green:  { a: '#d4fce4', b: '#a8f0c6' },
    yellow: { a: '#fff8d6', b: '#ffe69a' },
    blue:   { a: '#d6ecfa', b: '#a8d4f0' },
  };
  const DARK_HEX = {
    red: '#c0354d', green: '#078a4e', yellow: '#d4a520', blue: '#357abd'
  };

  /* ── Main draw entry ── */
  function draw(gameState) {
    _gameState = gameState;
    _resize();
    // Board background
    ctx.fillStyle = '#e8e0d4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    _drawHomeZones();
    _drawTrack();
    _drawHomeStretches();
    _drawSafeSquares();
    _drawCenter();
    _drawSnakes();
    _drawLadders();
    _drawTokens(gameState);
  }

  /* ── Home base quadrants with gradient + inner ring ── */
  function _drawHomeZones() {
    for (const color of COLORS) {
      const z = HOME_ZONES[color];
      const x = z.c1 * cellPx, y = z.r1 * cellPx;
      const w = (z.c2 - z.c1 + 1) * cellPx, h = (z.r2 - z.r1 + 1) * cellPx;

      // Gradient fill
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, GRAD_COLORS[color].a);
      grad.addColorStop(1, GRAD_COLORS[color].b);
      ctx.fillStyle = grad;
      _roundRect(x + 2, y + 2, w - 4, h - 4, 12);
      ctx.fill();

      // Border
      ctx.strokeStyle = COLOR_HEX[color]; ctx.lineWidth = 2.5;
      _roundRect(x + 2, y + 2, w - 4, h - 4, 12);
      ctx.stroke();

      // Inner dock circle with inset shadow ring
      const cx = x + w / 2, cy = y + h / 2;
      const rad = cellPx * 1.7;

      // Outer ring shadow
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();
      ctx.restore();

      // White dock
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();

      // Inset shadow (top-left light, bottom-right dark)
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.arc(cx - 3, cy - 3, rad, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 3, cy + 3, rad, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();

      // Color ring
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.strokeStyle = COLOR_HEX[color]; ctx.lineWidth = 2.5; ctx.stroke();

      // Small dock positions
      const cfg = PLAYER_CONFIG[color];
      cfg.baseCoords.forEach(bp => {
        const dx = bp.c * cellPx + cellPx / 2;
        const dy = bp.r * cellPx + cellPx / 2;
        ctx.beginPath(); ctx.arc(dx, dy, cellPx * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_HEX[color] + '25';
        ctx.fill();
        ctx.strokeStyle = COLOR_HEX[color] + '55'; ctx.lineWidth = 1; ctx.stroke();
      });
    }
  }

  /* ── Track cells: rounded, slightly raised ── */
  function _drawTrack() {
    PATH_COORDS.forEach((p, i) => {
      const x = p.c * cellPx + 1.5, y = p.r * cellPx + 1.5;
      const s = cellPx - 3;

      // Cell shadow
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      _roundRect(x + 1, y + 1, s, s, 5); ctx.fill();

      // Cell background
      ctx.fillStyle = '#fafafa';
      _roundRect(x, y, s, s, 5); ctx.fill();

      // Subtle border
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.8;
      _roundRect(x, y, s, s, 5); ctx.stroke();

      // Index label (subtle)
      ctx.fillStyle = '#bbb';
      ctx.font = `600 ${cellPx * 0.22}px Nunito, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i, p.c * cellPx + cellPx / 2, p.r * cellPx + cellPx / 2);
    });
  }

  /* ── Safe zone cells: golden glow badge ── */
  function _drawSafeSquares() {
    SAFE_ZONES.forEach(i => {
      const p = PATH_COORDS[i];
      const cx = p.c * cellPx + cellPx / 2, cy = p.r * cellPx + cellPx / 2;
      const x = p.c * cellPx + 1.5, y = p.r * cellPx + 1.5;
      const s = cellPx - 3;

      // Golden glow background
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, cellPx * 0.55);
      glow.addColorStop(0, 'rgba(255, 215, 0, 0.35)');
      glow.addColorStop(1, 'rgba(255, 193, 7, 0.08)');
      ctx.fillStyle = glow;
      _roundRect(x, y, s, s, 5); ctx.fill();

      // Star icon
      _drawStar(cx, cy, cellPx * 0.2, cellPx * 0.1, 5, '#d4a017', '#ffd700');
    });
  }

  /* Draw a 5-pointed star */
  function _drawStar(cx, cy, outerR, innerR, points, stroke, fill) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }

  /* ── Home stretches: colored lane cells ── */
  function _drawHomeStretches() {
    for (const color of COLORS) {
      const cfg = PLAYER_CONFIG[color];
      cfg.homeStretch.forEach((p, idx) => {
        const x = p.c * cellPx + 1.5, y = p.r * cellPx + 1.5;
        const s = cellPx - 3;

        // Gradient cell
        const grad = ctx.createLinearGradient(x, y, x + s, y + s);
        grad.addColorStop(0, COLOR_HEX[color] + '40');
        grad.addColorStop(1, COLOR_HEX[color] + '20');
        ctx.fillStyle = grad;
        _roundRect(x, y, s, s, 5); ctx.fill();

        ctx.strokeStyle = COLOR_HEX[color] + '80'; ctx.lineWidth = 1.2;
        _roundRect(x, y, s, s, 5); ctx.stroke();

        // Arrow towards center (small triangle)
        const cx = p.c * cellPx + cellPx / 2;
        const cy = p.r * cellPx + cellPx / 2;
        ctx.fillStyle = COLOR_HEX[color] + '50';
        ctx.font = `${cellPx * 0.3}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('▸', cx, cy);
      });
    }
  }

  /* ── Center HOME: colored triangles with glow ── */
  function _drawCenter() {
    const { r1, c1, r2, c2 } = CENTER;
    const cx = ((c1 + c2 + 1) / 2) * cellPx;
    const cy = ((r1 + r2 + 1) / 2) * cellPx;
    const half = ((c2 - c1 + 1) / 2) * cellPx;

    // Glow behind center
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, half * 1.5);
    glow.addColorStop(0, 'rgba(255,255,255,0.3)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect((c1) * cellPx, (r1) * cellPx, (c2 - c1 + 1) * cellPx, (r2 - r1 + 1) * cellPx);

    // Triangles: top=blue, right=green, bottom=yellow, left=red
    const triColors = [
      { base: COLOR_HEX.blue, light: '#7fc4f5' },
      { base: COLOR_HEX.green, light: '#5fd89a' },
      { base: COLOR_HEX.yellow, light: '#ffe57a' },
      { base: COLOR_HEX.red, light: '#f5869a' },
    ];
    const points = [
      [[cx - half, cy - half], [cx + half, cy - half], [cx, cy]],
      [[cx + half, cy - half], [cx + half, cy + half], [cx, cy]],
      [[cx + half, cy + half], [cx - half, cy + half], [cx, cy]],
      [[cx - half, cy + half], [cx - half, cy - half], [cx, cy]],
    ];
    points.forEach((tri, i) => {
      const grad = ctx.createLinearGradient(tri[0][0], tri[0][1], tri[2][0], tri[2][1]);
      grad.addColorStop(0, triColors[i].light);
      grad.addColorStop(1, triColors[i].base);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(tri[0][0], tri[0][1]);
      ctx.lineTo(tri[1][0], tri[1][1]);
      ctx.lineTo(tri[2][0], tri[2][1]);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // HOME label
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${cellPx * 0.55}px Nunito, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4;
    ctx.fillText('HOME', cx, cy);
    ctx.shadowBlur = 0;
  }

  /* ── Snakes: smooth curved red paths with head/tail markers ── */
  function _drawSnakes() {
    for (const [head, tail] of Object.entries(SNAKES)) {
      const h = PATH_COORDS[head], t = PATH_COORDS[tail];
      _drawSnakeCurve(h, t);
    }
  }

  function _drawSnakeCurve(from, to) {
    const x1 = from.c * cellPx + cellPx / 2, y1 = from.r * cellPx + cellPx / 2;
    const x2 = to.c * cellPx + cellPx / 2,   y2 = to.r * cellPx + cellPx / 2;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    // Perpendicular offset for S-curve
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len * cellPx * 1.2;
    const ny = dx / len * cellPx * 1.2;

    // Body: thick semi-transparent gradient stroke
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(
      x1 + nx, y1 + ny,
      mx - nx, my - ny,
      mx, my
    );
    ctx.bezierCurveTo(
      mx + nx, my + ny,
      x2 - nx, y2 - ny,
      x2, y2
    );

    // Outer body shadow
    ctx.strokeStyle = 'rgba(200, 40, 60, 0.15)';
    ctx.lineWidth = cellPx * 0.38; ctx.lineCap = 'round'; ctx.stroke();

    // Main body
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.55)';
    ctx.lineWidth = cellPx * 0.22; ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = 'rgba(255, 130, 150, 0.35)';
    ctx.lineWidth = cellPx * 0.08; ctx.stroke();
    ctx.restore();

    // Snake head (triangle)
    ctx.fillStyle = 'rgba(200, 30, 50, 0.8)';
    ctx.beginPath();
    ctx.arc(x1, y1, cellPx * 0.18, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x1 - 3, y1 - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x1 + 3, y1 - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x1 - 3, y1 - 2, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x1 + 3, y1 - 2, 1.2, 0, Math.PI * 2); ctx.fill();

    // Tail tip
    ctx.fillStyle = 'rgba(233, 69, 96, 0.5)';
    ctx.beginPath(); ctx.arc(x2, y2, cellPx * 0.1, 0, Math.PI * 2); ctx.fill();
  }

  /* ── Ladders: dual-rail with rungs ── */
  function _drawLadders() {
    for (const [base, top] of Object.entries(LADDERS)) {
      const b = PATH_COORDS[base], t = PATH_COORDS[top];
      _drawLadderGraphic(b, t);
    }
  }

  function _drawLadderGraphic(from, to) {
    const x1 = from.c * cellPx + cellPx / 2, y1 = from.r * cellPx + cellPx / 2;
    const x2 = to.c * cellPx + cellPx / 2,   y2 = to.r * cellPx + cellPx / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len, ny = dx / len;
    const railGap = cellPx * 0.22;

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Rail shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = cellPx * 0.12;
    _drawRail(x1, y1, x2, y2, nx, ny, railGap + 1);
    _drawRail(x1, y1, x2, y2, nx, ny, -(railGap + 1));

    // Rails (wood color)
    const woodGrad = ctx.createLinearGradient(x1, y1, x2, y2);
    woodGrad.addColorStop(0, '#b07c4f');
    woodGrad.addColorStop(0.5, '#d4a56a');
    woodGrad.addColorStop(1, '#b07c4f');
    ctx.strokeStyle = woodGrad; ctx.lineWidth = cellPx * 0.09;
    _drawRail(x1, y1, x2, y2, nx, ny, railGap);
    _drawRail(x1, y1, x2, y2, nx, ny, -railGap);

    // Rungs
    const rungCount = Math.max(3, Math.round(len / (cellPx * 0.7)));
    ctx.strokeStyle = '#c49a62'; ctx.lineWidth = cellPx * 0.06;
    for (let i = 1; i < rungCount; i++) {
      const t = i / rungCount;
      const rx = x1 + dx * t, ry = y1 + dy * t;
      ctx.beginPath();
      ctx.moveTo(rx + nx * railGap, ry + ny * railGap);
      ctx.lineTo(rx - nx * railGap, ry - ny * railGap);
      ctx.stroke();
    }

    // Highlight on left rail
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = cellPx * 0.03;
    _drawRail(x1, y1, x2, y2, nx, ny, railGap - 2);

    ctx.restore();
  }

  function _drawRail(x1, y1, x2, y2, nx, ny, offset) {
    ctx.beginPath();
    ctx.moveTo(x1 + nx * offset, y1 + ny * offset);
    ctx.lineTo(x2 + nx * offset, y2 + ny * offset);
    ctx.stroke();
  }

  /* ── Token rendering: 3D glossy pawns ── */
  function _drawTokens(state) {
    if (!state) return;
    const stacked = {};

    // Collect all token positions (including animations)
    const animMap = {};
    _animations.forEach(a => { animMap[a.color + '_' + a.tokenIndex] = a; });

    for (const player of state.players) {
      const color = player.color;
      const cfg = PLAYER_CONFIG[color];

      player.tokens.forEach((tok, ti) => {
        let r, c;
        const animKey = color + '_' + ti;
        const anim = animMap[animKey];

        if (anim) {
          // Interpolate position
          const t = _easeOutBack(anim.progress);
          r = anim.fromR + (anim.toR - anim.fromR) * t;
          c = anim.fromC + (anim.toC - anim.fromC) * t;
        } else if (tok.state === 'base') {
          const bp = cfg.baseCoords[ti]; r = bp.r; c = bp.c;
        } else if (tok.state === 'home') {
          r = 7; c = 7;
        } else if (tok.state === 'homeStretch') {
          const hp = cfg.homeStretch[tok.homeStretchPos]; r = hp.r; c = hp.c;
        } else {
          const pp = PATH_COORDS[tok.pathIndex]; r = pp.r; c = pp.c;
        }

        // Stack offset
        const key = Math.round(r) + ',' + Math.round(c);
        stacked[key] = (stacked[key] || 0);
        const off = stacked[key]; stacked[key]++;
        const offX = (off % 2) * cellPx * 0.24 - cellPx * 0.12;
        const offY = Math.floor(off / 2) * cellPx * 0.24 - cellPx * 0.12;

        const cx = c * cellPx + cellPx / 2 + offX;
        const cy = r * cellPx + cellPx / 2 + offY;

        _drawPawn(cx, cy, color, ti + 1, state.currentPlayerIndex === state.players.indexOf(player));
      });
    }
  }

  function _drawPawn(cx, cy, color, num, isActive) {
    const rad = cellPx * 0.32;
    const hex = COLOR_HEX[color];

    ctx.save();

    // Drop shadow
    ctx.beginPath(); ctx.arc(cx + 1.5, cy + 2.5, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();

    // Active player glow
    if (isActive) {
      ctx.beginPath(); ctx.arc(cx, cy, rad + 5, 0, Math.PI * 2);
      ctx.fillStyle = hex + '40'; ctx.fill();
      ctx.strokeStyle = hex; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Main body gradient (3D look)
    const bodyGrad = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
    bodyGrad.addColorStop(0, _lighten(hex, 40));
    bodyGrad.addColorStop(0.6, hex);
    bodyGrad.addColorStop(1, _darken(hex, 30));
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad; ctx.fill();

    // Rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, rad - 1, 0, Math.PI * 2); ctx.stroke();

    // Shine spot
    ctx.beginPath(); ctx.arc(cx - rad * 0.2, cy - rad * 0.25, rad * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();

    // Number
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${cellPx * 0.28}px Nunito, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 2;
    ctx.fillText(num, cx, cy + 1);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  /* ── Animation helpers ── */
  function animateToken(color, tokenIndex, fromR, fromC, toR, toC, duration) {
    return new Promise(resolve => {
      const anim = { color, tokenIndex, fromR, fromC, toR, toC, progress: 0 };
      _animations.push(anim);
      const start = performance.now();
      function tick(now) {
        anim.progress = Math.min(1, (now - start) / duration);
        draw(_gameState);
        if (anim.progress < 1) {
          requestAnimationFrame(tick);
        } else {
          _animations = _animations.filter(a => a !== anim);
          draw(_gameState);
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  function _easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /* ── Utility: rounded rect path ── */
  function _roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function _lighten(hex, amt) {
    let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }

  function _darken(hex, amt) {
    let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.max(0, r - amt); g = Math.max(0, g - amt); b = Math.max(0, b - amt);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }

  /* Return cell coords {r,c} from pixel click pos */
  function getCellFromPixel(px, py) {
    return { r: Math.floor(py / cellPx), c: Math.floor(px / cellPx) };
  }

  /**
   * Get pixel center of a token's current cell for animation.
   */
  function getTokenCoords(player, tokenIndex) {
    const tok = player.tokens[tokenIndex];
    const cfg = PLAYER_CONFIG[player.color];
    if (tok.state === 'base') return cfg.baseCoords[tokenIndex];
    if (tok.state === 'home') return { r: 7, c: 7 };
    if (tok.state === 'homeStretch') return cfg.homeStretch[tok.homeStretchPos];
    return PATH_COORDS[tok.pathIndex];
  }

  return {
    init, draw, getCellFromPixel, animateToken, getTokenCoords,
    getCanvas: () => canvas, getCellPx: () => cellPx
  };
})();
