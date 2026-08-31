/**
 * profile.js — Shared gamification profile manager
 * Handles: coins, XP/level, owned items, power-ups, stats
 * Persisted in localStorage
 */
var GameProfile = (function () {
  var STORAGE_KEY = 'snake_ludo_profile';

  var DEFAULT = {
    name: 'Player',
    coins: 50,
    xp: 0,
    level: 1,
    stats: {
      gamesPlayed: 0, wins: 0, laddersClimbed: 0,
      snakesBitten: 0, sixesRolled: 0, captures: 0,
    },
    ownedItems: ['token_default', 'dice_default'],
    equipped: { token: 'token_default', dice: 'dice_default' },
    powerUps: { shield: 0, doubleJump: 0, reroll: 0 },
    achievements: [],
  };

  function xpForLevel(lvl) { return Math.floor(100 * Math.pow(1.4, lvl - 1)); }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        for (var k in DEFAULT) {
          if (typeof p[k] === 'undefined') p[k] = JSON.parse(JSON.stringify(DEFAULT[k]));
        }
        if (!p.stats) p.stats = {};
        for (var s in DEFAULT.stats) { if (typeof p.stats[s] === 'undefined') p.stats[s] = 0; }
        if (!p.powerUps) p.powerUps = {};
        for (var pw in DEFAULT.powerUps) { if (typeof p.powerUps[pw] === 'undefined') p.powerUps[pw] = 0; }
        return p;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT));
  }

  function save(profile) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) {}
  }

  var profile = load();
  var _listeners = [];

  function onEvent(fn) { _listeners.push(fn); }
  function _notify(type, data) {
    _listeners.forEach(function (fn) { try { fn(type, data); } catch (e) {} });
  }

  function addCoins(amount, reason) {
    profile.coins += amount;
    save(profile);
    _notify('coins', { amount: amount, total: profile.coins, reason: reason });
    return profile.coins;
  }

  function spendCoins(amount) {
    if (profile.coins < amount) return false;
    profile.coins -= amount;
    save(profile);
    return true;
  }

  function addXP(amount) {
    profile.xp += amount;
    var needed = xpForLevel(profile.level);
    var leveled = false;
    while (profile.xp >= needed) {
      profile.xp -= needed;
      profile.level++;
      needed = xpForLevel(profile.level);
      leveled = true;
    }
    save(profile);
    if (leveled) _notify('levelup', { level: profile.level });
    return { level: profile.level, xp: profile.xp, needed: needed, leveled: leveled };
  }

  function addStat(key, n) {
    if (typeof profile.stats[key] !== 'undefined') { profile.stats[key] += (n || 1); save(profile); }
  }

  function ownItem(id) {
    if (profile.ownedItems.indexOf(id) === -1) { profile.ownedItems.push(id); save(profile); }
  }
  function hasItem(id) { return profile.ownedItems.indexOf(id) !== -1; }
  function equipItem(slot, id) {
    if (hasItem(id)) { profile.equipped[slot] = id; save(profile); return true; }
    return false;
  }

  function addPowerUp(type, count) {
    if (typeof profile.powerUps[type] !== 'undefined') { profile.powerUps[type] += (count || 1); save(profile); }
  }
  function usePowerUp(type) {
    if (profile.powerUps[type] > 0) { profile.powerUps[type]--; save(profile); return true; }
    return false;
  }
  function getPowerUpCount(type) { return profile.powerUps[type] || 0; }

  function unlockAchievement(id) {
    if (profile.achievements.indexOf(id) === -1) {
      profile.achievements.push(id);
      save(profile);
      _notify('achievement', { id: id });
      return true;
    }
    return false;
  }

  var REWARDS = {
    WIN_SL:       { coins: 100, xp: 50,  reason: '🏆 Won Snakes & Ladders!' },
    WIN_LUDO:     { coins: 150, xp: 70,  reason: '🏆 Won Ludo!' },
    SECOND_PLACE: { coins: 50,  xp: 30,  reason: '🥈 2nd place' },
    THIRD_PLACE:  { coins: 25,  xp: 15,  reason: '🥉 3rd place' },
    CLIMB_LADDER: { coins: 10,  xp: 5,   reason: '🪜 Climbed a ladder' },
    HIT_SNAKE:    { coins: 2,   xp: 1,   reason: '🐍 Survived a snake' },
    ROLL_SIX:     { coins: 5,   xp: 3,   reason: '🎲 Rolled a 6!' },
    CAPTURE:      { coins: 15,  xp: 10,  reason: '💥 Captured opponent!' },
    GAME_PLAYED:  { coins: 10,  xp: 10,  reason: '🎮 Played a game' },
  };

  function giveReward(key) {
    var r = REWARDS[key];
    if (!r) return;
    addCoins(r.coins, r.reason);
    addXP(r.xp);
  }

  function checkAchievements() {
    var s = profile.stats;
    if (s.wins >= 1) unlockAchievement('first_win');
    if (s.wins >= 10) unlockAchievement('ten_wins');
    if (s.gamesPlayed >= 10) unlockAchievement('ten_games');
    if (s.laddersClimbed >= 20) unlockAchievement('ladder_lover');
    if (s.sixesRolled >= 30) unlockAchievement('lucky_roller');
    if (s.captures >= 10) unlockAchievement('serial_capturer');
    if (profile.level >= 5) unlockAchievement('level_5');
    if (profile.level >= 10) unlockAchievement('level_10');
    if (profile.coins >= 500) unlockAchievement('rich');
  }

  return {
    get: function () { return profile; },
    load: function () { profile = load(); return profile; },
    addCoins: addCoins, spendCoins: spendCoins,
    addXP: addXP, addStat: addStat,
    ownItem: ownItem, hasItem: hasItem, equipItem: equipItem,
    addPowerUp: addPowerUp, usePowerUp: usePowerUp, getPowerUpCount: getPowerUpCount,
    unlockAchievement: unlockAchievement, checkAchievements: checkAchievements,
    giveReward: giveReward, onEvent: onEvent, xpForLevel: xpForLevel,
    REWARDS: REWARDS,
  };
})();
