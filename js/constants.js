/**
 * constants.js
 * ─────────────────────────────────────────────
 * All game constants: colors, board dimensions,
 * path coordinates, snake/ladder definitions,
 * safe-zone indices, and home-stretch info.
 *
 * PATH MODEL
 * ──────────
 * The 15×15 board has a cross-shaped track with 4 corner home bases.
 *   • Center 3×3 (rows 6-8, cols 6-8) = HOME destination
 *   • Corner quadrants (6×6 each) = colored home bases
 *   • The track has 52 squares (indices 0-51) running clockwise
 *
 * Each color has:
 *   start     – path index where token enters after rolling a 6
 *   homeEntry – last track index before turning into 5-square home stretch
 *   Full lap distance = 51 for every color
 *
 * Token journey: base → track (51 squares) → homeStretch (5) → home (exact roll)
 *   Total distance to finish = 51 + 5 + 1 = 57
 *
 * Snakes & ladders are keyed by path index:
 *   snakes[headIndex]  = tailIndex   (move down)
 *   ladders[baseIndex] = topIndex    (move up)
 */

const BOARD_SIZE   = 15;
const PATH_LENGTH  = 52;
const HOME_STRETCH = 5;

/* ── Player colors ── */
const COLORS = ['red', 'green', 'yellow', 'blue'];
const COLOR_HEX = {
  red:    '#e94560',
  green:  '#0ead69',
  yellow: '#f5c542',
  blue:   '#4d9de0',
};
const COLOR_LIGHT = {
  red:    '#fdd',
  green:  '#d4fce4',
  yellow: '#fff8d6',
  blue:   '#d6ecfa',
};

/**
 * 52-square clockwise track coordinates (row, col).
 *
 * Layout on the 15×15 grid (cross-shaped path):
 *   Segment 0-12  : RED side    – up col 6, left along row 8, turn at (7,0), right along row 6
 *   Segment 13-25 : BLUE side   – up col 6, across top, down col 8
 *   Segment 26-38 : GREEN side  – right along row 6, down col 8→row 8 right, turn at (7,14)
 *   Segment 39-51 : YELLOW side – left along row 8, up col 8→down bottom, turn at (14,7)
 */
const PATH_COORDS = [
  // ── Segment 0-12 (RED enters here, path goes up-left then right) ──
  {r:13, c:6},  //  0  ★ RED START / safe
  {r:12, c:6},  //  1
  {r:11, c:6},  //  2
  {r:10, c:6},  //  3
  {r: 9, c:6},  //  4
  {r: 8, c:5},  //  5
  {r: 8, c:4},  //  6
  {r: 8, c:3},  //  7
  {r: 8, c:2},  //  8  ★ safe
  {r: 8, c:1},  //  9
  {r: 8, c:0},  // 10
  {r: 7, c:0},  // 11
  {r: 6, c:0},  // 12

  // ── Segment 13-25 (BLUE enters here, path goes right then up-right-down) ──
  {r: 6, c:1},  // 13  ★ BLUE START / safe
  {r: 6, c:2},  // 14
  {r: 6, c:3},  // 15
  {r: 6, c:4},  // 16
  {r: 6, c:5},  // 17
  {r: 5, c:6},  // 18
  {r: 4, c:6},  // 19
  {r: 3, c:6},  // 20
  {r: 2, c:6},  // 21  ★ safe
  {r: 1, c:6},  // 22
  {r: 0, c:6},  // 23
  {r: 0, c:7},  // 24
  {r: 0, c:8},  // 25

  // ── Segment 26-38 (GREEN enters here, path goes down then right-down-left) ──
  {r: 1, c:8},  // 26  ★ GREEN START / safe
  {r: 2, c:8},  // 27
  {r: 3, c:8},  // 28
  {r: 4, c:8},  // 29
  {r: 5, c:8},  // 30
  {r: 6, c:9},  // 31
  {r: 6, c:10}, // 32
  {r: 6, c:11}, // 33
  {r: 6, c:12}, // 34  ★ safe
  {r: 6, c:13}, // 35
  {r: 6, c:14}, // 36
  {r: 7, c:14}, // 37
  {r: 8, c:14}, // 38

  // ── Segment 39-51 (YELLOW enters here, path goes left then down-left-up) ──
  {r: 8, c:13}, // 39  ★ YELLOW START / safe
  {r: 8, c:12}, // 40
  {r: 8, c:11}, // 41
  {r: 8, c:10}, // 42
  {r: 8, c:9},  // 43
  {r: 9, c:8},  // 44
  {r:10, c:8},  // 45
  {r:11, c:8},  // 46
  {r:12, c:8},  // 47  ★ safe
  {r:13, c:8},  // 48
  {r:14, c:8},  // 49
  {r:14, c:7},  // 50
  {r:14, c:6},  // 51  → wraps to 0 at (13,6)
];

/**
 * Per-color configuration.
 *
 * homeStretch: 5 squares leading from the track into the center.
 *   Red   enters from left  → row 7, cols 1-5
 *   Blue  enters from top   → col 7, rows 1-5
 *   Green enters from right → row 7, cols 13-9
 *   Yellow enters from bottom → col 7, rows 13-9
 */
const PLAYER_CONFIG = {
  red: {
    start: 0,
    homeEntry: 51,
    baseCoords: [{r:10,c:1},{r:10,c:3},{r:12,c:1},{r:12,c:3}],
    homeStretch: [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}],
  },
  blue: {
    start: 13,
    homeEntry: 12,
    baseCoords: [{r:1,c:1},{r:1,c:3},{r:3,c:1},{r:3,c:3}],
    homeStretch: [{r:1,c:7},{r:2,c:7},{r:3,c:7},{r:4,c:7},{r:5,c:7}],
  },
  green: {
    start: 26,
    homeEntry: 25,
    baseCoords: [{r:1,c:10},{r:1,c:12},{r:3,c:10},{r:3,c:12}],
    homeStretch: [{r:7,c:13},{r:7,c:12},{r:7,c:11},{r:7,c:10},{r:7,c:9}],
  },
  yellow: {
    start: 39,
    homeEntry: 38,
    baseCoords: [{r:10,c:10},{r:10,c:12},{r:12,c:10},{r:12,c:12}],
    homeStretch: [{r:13,c:7},{r:12,c:7},{r:11,c:7},{r:10,c:7},{r:9,c:7}],
  },
};

/* ── Safe zones (star squares): start positions + midpoints ── */
const SAFE_ZONES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/* ── Snakes: head → tail  (6 snakes) ── */
const SNAKES = {
  7:  2,    // (8,3)  → (12,6)
  19: 10,   // (4,6)  → (8,0)
  28: 14,   // (3,8)  → (6,2)
  36: 24,   // (6,14) → (0,7)
  46: 33,   // (11,8) → (6,11)
  50: 41,   // (14,7) → (8,11)
};

/* ── Ladders: base → top  (6 ladders) ── */
const LADDERS = {
  3:  11,   // (10,6) → (7,0)
  9:  18,   // (8,1)  → (5,6)
  16: 25,   // (6,4)  → (0,8)
  22: 31,   // (1,6)  → (6,9)
  30: 42,   // (5,8)  → (8,10)
  35: 48,   // (6,13) → (13,8)
};

/* ── Home-base quadrant bounding boxes (for colored background zones) ── */
const HOME_ZONES = {
  red:    { r1:9,  c1:0, r2:14, c2:5  },  // bottom-left
  blue:   { r1:0,  c1:0, r2:5,  c2:5  },  // top-left
  green:  { r1:0,  c1:9, r2:5,  c2:14 },  // top-right
  yellow: { r1:9,  c1:9, r2:14, c2:14 },  // bottom-right
};

/* Center home area (3×3) */
const CENTER = { r1:6, c1:6, r2:8, c2:8 };
