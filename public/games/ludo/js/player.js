/**
 * player.js
 * ─────────────────────────────────────────────
 * Player and Token data models.
 *
 * Token states:
 *   'base'        – sitting in the home base (not yet on track)
 *   'track'       – on the main 52-square path; pathIndex = 0..51
 *   'homeStretch' – on the 5-square home column; homeStretchPos = 0..4
 *   'home'        – reached the center (finished)
 *
 * A token's absolute distance travelled is tracked so we know
 * when it should turn into the home stretch.
 */

/**
 * Create a token object.
 */
function createToken(id) {
  return {
    id,
    state: 'base',      // base | track | homeStretch | home
    pathIndex: -1,       // current index on PATH_COORDS (0-51) when state=track
    homeStretchPos: -1,  // 0-4 when in home stretch
    distanceTravelled: 0 // total squares moved on the track (max ~56 to reach home)
  };
}

/**
 * Create a player object.
 * @param {string} color – one of COLORS
 * @param {string} type  – 'human' | 'ai'
 */
function createPlayer(color, type) {
  return {
    color,
    type,
    tokens: [createToken(0), createToken(1), createToken(2), createToken(3)],
  };
}

/**
 * Returns how many squares a color must travel on the
 * track before entering its home stretch.
 * (A full lap from start back to homeEntry = 51 squares)
 */
function fullLapDistance(color) {
  const cfg = PLAYER_CONFIG[color];
  // Distance from start around the track to homeEntry (inclusive)
  // E.g., red: start=0, homeEntry=51 → 51 squares on track,
  //        then 5 home stretch + 1 to enter home = 57 total to finish.
  let d = cfg.homeEntry - cfg.start;
  if (d < 0) d += PATH_LENGTH;
  return d; // squares on the main track before entering home stretch
}
