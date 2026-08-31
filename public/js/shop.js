/**
 * shop.js — Shop catalog and purchase logic
 */
var GameShop = (function () {

  var ITEMS = {
    /* ── Token Skins ── */
    token_default:  { name: 'Classic Pawn',   emoji: '⚪', price: 0,   type: 'token', desc: 'Default token' },
    token_crown:    { name: 'Crown',          emoji: '👑', price: 80,  type: 'token', desc: 'A royal golden crown' },
    token_diamond:  { name: 'Diamond',        emoji: '💎', price: 120, type: 'token', desc: 'Sparkling diamond token' },
    token_fire:     { name: 'Fire',           emoji: '🔥', price: 100, type: 'token', desc: 'Blazing hot token' },
    token_star:     { name: 'Star',           emoji: '⭐', price: 60,  type: 'token', desc: 'A shiny star' },
    token_rocket:   { name: 'Rocket',         emoji: '🚀', price: 150, type: 'token', desc: 'Zoom to the finish!' },
    token_skull:    { name: 'Skull',          emoji: '💀', price: 200, type: 'token', desc: 'Spooky skull token' },
    token_alien:    { name: 'Alien',          emoji: '👽', price: 180, type: 'token', desc: 'Out of this world!' },

    /* ── Dice Skins ── */
    dice_default:   { name: 'Classic Dice',   emoji: '🎲', price: 0,   type: 'dice', desc: 'Standard white dice' },
    dice_gold:      { name: 'Gold Dice',      emoji: '🟡', price: 100, type: 'dice', desc: 'Luxurious golden dice' },
    dice_neon:      { name: 'Neon Dice',      emoji: '💜', price: 120, type: 'dice', desc: 'Glowing neon dice' },
    dice_rainbow:   { name: 'Rainbow Dice',   emoji: '🌈', price: 150, type: 'dice', desc: 'Colorful rainbow dice' },
    dice_fire:      { name: 'Fire Dice',      emoji: '🔥', price: 130, type: 'dice', desc: 'Burning hot rolls!' },

    /* ── Power-ups ── */
    pu_shield:      { name: 'Snake Shield',   emoji: '🛡️', price: 50,  type: 'powerup', puType: 'shield',     desc: 'Block one snake! Stay safe.' },
    pu_double:      { name: 'Double Jump',    emoji: '⚡', price: 40,  type: 'powerup', puType: 'doubleJump', desc: 'Double your next dice roll value.' },
    pu_reroll:      { name: 'Reroll',         emoji: '🔄', price: 30,  type: 'powerup', puType: 'reroll',     desc: 'Don\'t like your roll? Try again!' },
  };

  var ACHIEVEMENTS = {
    first_win:       { name: 'First Victory',     emoji: '🏆', desc: 'Win your first game' },
    ten_wins:        { name: 'Champion',           emoji: '🥇', desc: 'Win 10 games' },
    ten_games:       { name: 'Dedicated Player',   emoji: '🎮', desc: 'Play 10 games' },
    ladder_lover:    { name: 'Ladder Lover',       emoji: '🪜', desc: 'Climb 20 ladders' },
    lucky_roller:    { name: 'Lucky Roller',       emoji: '🎯', desc: 'Roll thirty 6s' },
    serial_capturer: { name: 'Serial Capturer',    emoji: '💥', desc: 'Capture 10 opponents in Ludo' },
    level_5:         { name: 'Rising Star',        emoji: '⭐', desc: 'Reach level 5' },
    level_10:        { name: 'Veteran',            emoji: '🌟', desc: 'Reach level 10' },
    rich:            { name: 'Moneybags',          emoji: '💰', desc: 'Have 500+ coins' },
  };

  function buyItem(itemId) {
    var item = ITEMS[itemId];
    if (!item) return { ok: false, error: 'Item not found' };
    if (GameProfile.hasItem(itemId)) return { ok: false, error: 'Already owned' };

    if (item.type === 'powerup') {
      if (!GameProfile.spendCoins(item.price)) return { ok: false, error: 'Not enough coins' };
      GameProfile.addPowerUp(item.puType, 1);
      return { ok: true, msg: 'Bought ' + item.name + '!' };
    }

    if (!GameProfile.spendCoins(item.price)) return { ok: false, error: 'Not enough coins' };
    GameProfile.ownItem(itemId);
    return { ok: true, msg: 'Unlocked ' + item.name + '!' };
  }

  function getItemsByType(type) {
    var result = [];
    for (var id in ITEMS) {
      if (ITEMS[id].type === type) result.push({ id: id, data: ITEMS[id] });
    }
    return result;
  }

  return {
    ITEMS: ITEMS,
    ACHIEVEMENTS: ACHIEVEMENTS,
    buyItem: buyItem,
    getItemsByType: getItemsByType,
  };
})();
