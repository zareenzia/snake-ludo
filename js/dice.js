/**
 * dice.js
 * ─────────────────────────────────────────────
 * Dice rolling logic with a simple animation.
 * Exports Dice.roll() → Promise<number> (1-6)
 */

const Dice = (() => {
  const resultEl = () => document.getElementById('dice-result');
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];

  /**
   * Animate dice and resolve with final value (1-6).
   */
  function roll() {
    return new Promise(resolve => {
      const el = resultEl();
      let ticks = 0;
      const interval = setInterval(() => {
        const rand = Math.floor(Math.random() * 6);
        el.textContent = faces[rand];
        el.style.transform = `rotate(${rand * 60}deg) scale(1.4)`;
        ticks++;
        if (ticks >= 10) {
          clearInterval(interval);
          const value = Math.floor(Math.random() * 6) + 1;
          el.textContent = faces[value - 1];
          el.style.transform = 'rotate(0) scale(1.6)';
          setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
          resolve(value);
        }
      }, 80);
    });
  }

  return { roll };
})();
