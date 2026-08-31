/**
 * dice.js
 * ─────────────────────────────────────────────
 * 3D-style dice with dot patterns and tumble animation.
 * Exports Dice.roll() → Promise<number> (1-6)
 */

const Dice = (() => {
  const faceEl = () => document.getElementById('dice-face');
  const innerEl = () => document.getElementById('dice-inner');

  /* Dot layout for each face (3×3 grid, 1=dot, 0=empty) */
  const DOT_LAYOUTS = {
    1: [0,0,0, 0,1,0, 0,0,0],
    2: [0,0,1, 0,0,0, 1,0,0],
    3: [0,0,1, 0,1,0, 1,0,0],
    4: [1,0,1, 0,0,0, 1,0,1],
    5: [1,0,1, 0,1,0, 1,0,1],
    6: [1,0,1, 1,0,1, 1,0,1],
  };

  function _renderDots(value) {
    const el = innerEl();
    const layout = DOT_LAYOUTS[value];
    el.innerHTML = layout.map(v =>
      v ? '<span class="dot"></span>' : '<span class="dot hidden"></span>'
    ).join('');
  }

  // Show initial face
  setTimeout(() => _renderDots(1), 0);

  /**
   * Animate dice tumble then resolve with final value (1-6).
   */
  function roll() {
    return new Promise(resolve => {
      const face = faceEl();
      face.classList.remove('landed');
      face.classList.add('rolling');

      let ticks = 0;
      const interval = setInterval(() => {
        _renderDots(Math.floor(Math.random() * 6) + 1);
        ticks++;
        if (ticks >= 12) {
          clearInterval(interval);
          const value = Math.floor(Math.random() * 6) + 1;
          _renderDots(value);
          face.classList.remove('rolling');
          face.classList.add('landed');
          resolve(value);
        }
      }, 70);
    });
  }

  return { roll };
})();
