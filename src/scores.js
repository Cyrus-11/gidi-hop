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
