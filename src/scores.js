// Small things kept in this browser only: the local best run per player and the mute setting.
// Anything other players should see (the leaderboard) lives on start.ng instead.
const PREFIX = 'gidi-hop:';

function read(key) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // storage blocked (private window etc.): the game works without it
  }
}

/** Best run in this browser for a start.ng user id, or 'guest': { hops, coins }. */
export function getBest(playerKey) {
  try {
    const best = JSON.parse(read(`best:${playerKey}`));
    return { hops: best?.hops | 0, coins: best?.coins | 0 };
  } catch {
    return { hops: 0, coins: 0 };
  }
}

/** Saves the run if it beats the local best (ranked by hops, then coins). Returns true if it did. */
export function saveBest(playerKey, run) {
  const best = getBest(playerKey);
  const better = run.hops > best.hops || (run.hops === best.hops && run.coins > best.coins);
  if (better) write(`best:${playerKey}`, JSON.stringify({ hops: run.hops, coins: run.coins }));
  return better;
}

export function getMuted() {
  return read('muted') === '1';
}

export function setMuted(muted) {
  write('muted', muted ? '1' : '0');
}

// ---- the daily street: everyone gets the same street for the day (Lagos time)

/** Today's date in Lagos as YYYY-MM-DD. */
export function todayInLagos(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A street seed from a date, the same in every browser. */
export function dailySeed(day = todayInLagos()) {
  let h = 2166136261;
  for (const ch of `gidi-hop:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1e9;
}

/** Best run on today's daily street in this browser: { hops, coins }. */
export function getDailyBest(playerKey, day = todayInLagos()) {
  return getBest(`${playerKey}:daily:${day}`);
}

export function saveDailyBest(playerKey, run, day = todayInLagos()) {
  return saveBest(`${playerKey}:daily:${day}`, run);
}
