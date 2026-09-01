/**
 * sl-board.js
 * 10×10 boustrophedon Snakes & Ladders board renderer.
 * Draws: numbered grid, snakes (curved), ladders (rungs), player tokens.
 */

var SLBoard = (function () {
  var canvas, ctx, cellPx, boardPx;
  var ROWS = 10, COLS = 10;
  var _animations = [];
  var _gameState = null;
  var _animatingPlayers = {};  // playerIdx → true while animating

  var PLAYER_COLORS_LIGHT = {
    '#e94560': '#ffb3c1', '#0ead69': '#a8f0c6',
    '#f5c542': '#ffe69a', '#4d9de0': '#a8d4f0',
  };

  function init(canvasEl) {
    canvas = canvasEl;
    _resize();
    window.addEventListener('resize', function () { _resize(); draw(_gameState); });
  }

  function _resize() {
    var maxW = Math.min(window.innerWidth - 24, window.innerHeight - 280, 560);
    cellPx = Math.floor(maxW / COLS);
    boardPx = cellPx * COLS;
    canvas.width = boardPx;
    canvas.height = boardPx;
    ctx = canvas.getContext('2d');
  }

  /** Convert square number (1-100) to pixel center {x, y} */
  function sqToPixel(sq) {
    var pos = sq - 1;
    var row = Math.floor(pos / COLS);  // 0 = bottom row
    var col = pos % COLS;
    // Boustrophedon: odd rows go right-to-left
    if (row % 2 === 1) col = COLS - 1 - col;
    // Flip Y so row 0 is at bottom
    var drawRow = ROWS - 1 - row;
    return { x: col * cellPx + cellPx / 2, y: drawRow * cellPx + cellPx / 2 };
  }

  function sqToCell(sq) {
    var pos = sq - 1;
    var row = Math.floor(pos / COLS);
    var col = pos % COLS;
    if (row % 2 === 1) col = COLS - 1 - col;
    var drawRow = ROWS - 1 - row;
    return { col: col, row: drawRow };
  }

  /* ── Main draw ── */
  function draw(state) {
    _gameState = state;
    _resize();
    _drawBackground();
    _drawGrid(state);
    if (state) {
      _drawLadders(state.ladders);
      _drawSnakes(state.snakes);
      _drawTokens(state);
    }
  }

  function _drawBackground() {
    var grad = ctx.createLinearGradient(0, 0, boardPx, boardPx);
    grad.addColorStop(0, '#f5f0e8');
    grad.addColorStop(1, '#e8e0d0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, boardPx, boardPx);
  }

  function _drawGrid(state) {
    for (var sq = 1; sq <= 100; sq++) {
      var c = sqToCell(sq);
      var x = c.col * cellPx, y = c.row * cellPx;

      // Alternating cell colors
      var light = (c.col + c.row) % 2 === 0;
      ctx.fillStyle = light ? '#fafafa' : '#eee8dd';
      _roundRect(x + 1.5, y + 1.5, cellPx - 3, cellPx - 3, 4);
      ctx.fill();

      // Subtle border
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.8;
      _roundRect(x + 1.5, y + 1.5, cellPx - 3, cellPx - 3, 4);
      ctx.stroke();

      // Number
      ctx.fillStyle = sq === 100 ? '#0ead69' : '#999';
      ctx.font = (sq === 100 ? '800 ' : '700 ') + (cellPx * 0.24) + 'px Nunito, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sq, x + cellPx / 2, y + cellPx / 2);
    }

    // Highlight square 100
    var c100 = sqToCell(100);
    ctx.fillStyle = 'rgba(14, 173, 105, 0.12)';
    _roundRect(c100.col * cellPx + 1.5, c100.row * cellPx + 1.5, cellPx - 3, cellPx - 3, 4);
    ctx.fill();
  }

  /* ── Ladders ── */
  function _drawLadders(ladders) {
    if (!ladders) return;
    for (var i = 0; i < ladders.length; i++) {
      var l = ladders[i];
      var from = sqToPixel(l.start), to = sqToPixel(l.end);
      _drawLadderGraphic(from.x, from.y, to.x, to.y);
    }
  }

  function _drawLadderGraphic(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / len, ny = dx / len;
    var gap = cellPx * 0.18;

    ctx.save();
    ctx.lineCap = 'round';

    // Rails
    var woodGrad = ctx.createLinearGradient(x1, y1, x2, y2);
    woodGrad.addColorStop(0, '#b07c4f');
    woodGrad.addColorStop(0.5, '#d4a56a');
    woodGrad.addColorStop(1, '#b07c4f');
    ctx.strokeStyle = woodGrad; ctx.lineWidth = cellPx * 0.07;
    ctx.beginPath(); ctx.moveTo(x1 + nx * gap, y1 + ny * gap); ctx.lineTo(x2 + nx * gap, y2 + ny * gap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 - nx * gap, y1 - ny * gap); ctx.lineTo(x2 - nx * gap, y2 - ny * gap); ctx.stroke();

    // Rungs
    var count = Math.max(3, Math.round(len / (cellPx * 0.6)));
    ctx.strokeStyle = '#c49a62'; ctx.lineWidth = cellPx * 0.045;
    for (var j = 1; j < count; j++) {
      var t = j / count;
      var rx = x1 + dx * t, ry = y1 + dy * t;
      ctx.beginPath();
      ctx.moveTo(rx + nx * gap, ry + ny * gap);
      ctx.lineTo(rx - nx * gap, ry - ny * gap);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── Snakes ── */
  function _drawSnakes(snakes) {
    if (!snakes) return;
    for (var i = 0; i < snakes.length; i++) {
      var s = snakes[i];
      var from = sqToPixel(s.start), to = sqToPixel(s.end);
      _drawSnakeCurve(from.x, from.y, to.x, to.y);
    }
  }

  function _drawSnakeCurve(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / len * cellPx * 0.9;
    var ny = dx / len * cellPx * 0.9;
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + nx, y1 + ny, mx - nx, my - ny, mx, my);
    ctx.bezierCurveTo(mx + nx, my + ny, x2 - nx, y2 - ny, x2, y2);

    ctx.strokeStyle = 'rgba(233, 69, 96, 0.45)';
    ctx.lineWidth = cellPx * 0.18; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 130, 150, 0.3)';
    ctx.lineWidth = cellPx * 0.06; ctx.stroke();

    // Head
    ctx.beginPath(); ctx.arc(x1, y1, cellPx * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 30, 50, 0.75)'; ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x1 - 2.5, y1 - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x1 + 2.5, y1 - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x1 - 2.5, y1 - 2, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x1 + 2.5, y1 - 2, 1, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  /* Track where each player visually is during step-by-step animation */
  var _visualPositions = {};
  var _pixelAnimations = {};  // playerIdx → {x, y} for pixel-based animation (snake/ladder)

  /* ── Tokens ── */
  function _drawTokens(state) {
    if (!state || !state.players) return;
    var stacked = {};

    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];

      // Check animation
      var anim = null;
      for (var a = 0; a < _animations.length; a++) {
        if (_animations[a].playerIdx === i) { anim = _animations[a]; break; }
      }

      var px, py;
      if (_pixelAnimations[i]) {
        // Pixel-based animation (following snake/ladder curve)
        px = _pixelAnimations[i].x;
        py = _pixelAnimations[i].y;
      } else if (anim) {
        // Actively sliding between two squares
        var t = _easeOutCubic(anim.progress);
        var from = sqToPixel(anim.fromSq || 1);
        var to = sqToPixel(anim.toSq || 1);
        px = from.x + (to.x - from.x) * t;
        py = from.y + (to.y - from.y) * t;
      } else if (_visualPositions[i] !== undefined && _visualPositions[i] > 0) {
        // Paused at intermediate square during step-by-step animation
        var vpos = sqToPixel(_visualPositions[i]);
        px = vpos.x; py = vpos.y;
      } else {
        // No animation — use server position
        if (p.position <= 0) continue;
        var pos = sqToPixel(p.position);
        px = pos.x; py = pos.y;
      }

      // Stack offset
      var key = Math.round(px / cellPx) + ',' + Math.round(py / cellPx);
      stacked[key] = (stacked[key] || 0);
      var off = stacked[key]; stacked[key]++;
      var offX = (off % 2) * cellPx * 0.2 - cellPx * 0.1;
      var offY = Math.floor(off / 2) * cellPx * 0.2 - cellPx * 0.1;

      _drawPawn(px + offX, py + offY, p.color, i + 1, state.currentPlayerIdx === i);
    }
  }

  function _drawPawn(cx, cy, color, num, active) {
    var rad = cellPx * 0.28;
    ctx.save();

    // Shadow
    ctx.beginPath(); ctx.arc(cx + 1.5, cy + 2.5, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();

    // Active glow
    if (active) {
      ctx.beginPath(); ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
      ctx.fillStyle = color + '40'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Body gradient
    var grad = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
    var light = PLAYER_COLORS_LIGHT[color] || '#fff';
    grad.addColorStop(0, light);
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, _darken(color, 30));
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();

    // Rim + shine
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, rad - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - rad * 0.2, cy - rad * 0.25, rad * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();

    // Number
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + (cellPx * 0.24) + 'px Nunito, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(num, cx, cy + 1);
    ctx.restore();
  }

  /* ── Animation (step-by-step with pause at each square) ── */
  function animateToken(playerIdx, fromSq, toSq) {
    return new Promise(function (resolve) {
      if (fromSq <= 0) fromSq = 1;
      if (toSq <= 0) toSq = 1;
      if (fromSq === toSq) { resolve(); return; }

      var direction = toSq > fromSq ? 1 : -1;
      var steps = Math.abs(toSq - fromSq);
      var currentStep = 0;
      var SLIDE_MS = 150;  // time to slide between squares
      var PAUSE_MS = 250;  // pause at each square

      // Lock visual position so _drawTokens doesn't jump to server position
      _visualPositions[playerIdx] = fromSq;
      _animatingPlayers[playerIdx] = true;

      function doStep() {
        currentStep++;
        var targetSq = fromSq + currentStep * direction;
        var prevSq = targetSq - direction;

        // Animate slide from prevSq to targetSq
        var anim = { playerIdx: playerIdx, fromSq: prevSq, toSq: targetSq, progress: 0 };
        _animations.push(anim);
        var start = performance.now();

        function tick(now) {
          anim.progress = Math.min(1, (now - start) / SLIDE_MS);
          draw(_gameState);
          if (anim.progress < 1) {
            requestAnimationFrame(tick);
          } else {
            // Remove slide animation, update visual position
            _animations = _animations.filter(function (a) { return a !== anim; });
            _visualPositions[playerIdx] = targetSq;
            draw(_gameState);

            if (currentStep < steps) {
              // Pause at this square, then continue
              setTimeout(doStep, PAUSE_MS);
            } else {
              // Done — release visual lock
              delete _visualPositions[playerIdx];
              delete _animatingPlayers[playerIdx];
              draw(_gameState);
              resolve();
            }
          }
        }
        requestAnimationFrame(tick);
      }

      doStep();
    });
  }

  /**
   * Animate token along a snake or ladder curve (follows the drawn path).
   * For ladders: straight line along the rails.
   * For snakes: S-curve matching the drawn bezier.
   */
  function animateSnakeLadder(playerIdx, fromSq, toSq, type) {
    return new Promise(function (resolve) {
      if (fromSq <= 0 || toSq <= 0 || fromSq === toSq) { resolve(); return; }

      _animatingPlayers[playerIdx] = true;
      _visualPositions[playerIdx] = fromSq;

      var p1 = sqToPixel(fromSq);
      var p2 = sqToPixel(toSq);
      var DURATION = 600; // ms for the full slide

      // Build the path points based on type
      // Snake: S-curve with same control points as _drawSnakeCurve
      // Ladder: straight line (same as the rail)
      var isSnake = (type === 'snake');

      // Snake curve control points (matching _drawSnakeCurve)
      var dx = p2.x - p1.x, dy = p2.y - p1.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var nx = -dy / len * cellPx * 0.9;
      var ny = dx / len * cellPx * 0.9;
      var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;

      // Sample points along path for smooth interpolation
      function getPointAtT(t) {
        if (!isSnake) {
          // Ladder: straight line
          return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t
          };
        }
        // Snake: two joined bezier segments (0→0.5 and 0.5→1)
        if (t <= 0.5) {
          var st = t * 2; // 0→1 within first half
          return _cubicBezier(
            p1.x, p1.y,
            p1.x + nx, p1.y + ny,
            mx - nx, my - ny,
            mx, my,
            st
          );
        } else {
          var st = (t - 0.5) * 2; // 0→1 within second half
          return _cubicBezier(
            mx, my,
            mx + nx, my + ny,
            p2.x - nx, p2.y - ny,
            p2.x, p2.y,
            st
          );
        }
      }

      var start = performance.now();

      function tick(now) {
        var elapsed = now - start;
        var progress = Math.min(1, elapsed / DURATION);
        var eased = _easeInOutCubic(progress);

        var pt = getPointAtT(eased);
        _pixelAnimations[playerIdx] = { x: pt.x, y: pt.y };
        draw(_gameState);

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          // Done
          delete _pixelAnimations[playerIdx];
          delete _visualPositions[playerIdx];
          delete _animatingPlayers[playerIdx];
          draw(_gameState);
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });
  }

  /** Evaluate cubic bezier at parameter t */
  function _cubicBezier(x0, y0, x1, y1, x2, y2, x3, y3, t) {
    var u = 1 - t;
    var uu = u * u, uuu = uu * u;
    var tt = t * t, ttt = tt * t;
    return {
      x: uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3,
      y: uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3
    };
  }

  function _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function _easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function _roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function _darken(hex, amt) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, r - amt); g = Math.max(0, g - amt); b = Math.max(0, b - amt);
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  function getCellFromPixel(px, py) {
    return { col: Math.floor(px / cellPx), row: Math.floor(py / cellPx) };
  }

  function isAnimating() {
    for (var k in _animatingPlayers) { return true; }
    return false;
  }

  return { init: init, draw: draw, animateToken: animateToken, animateSnakeLadder: animateSnakeLadder, isAnimating: isAnimating, sqToPixel: sqToPixel, getCellPx: function () { return cellPx; } };
})();
