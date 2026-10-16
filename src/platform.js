// start.ng owns sign-in, players and the leaderboard. The game talks to it only through a
// hidden start.ng/connect page with postMessage, and never sees a password, email or token.
// Everything that touches start.ng lives in this file.

// Where start.ng lives, worked out from where this game is served.
function findStartNg() {
  const { hostname } = location;
  if (hostname.endsWith('.start.ng')) return 'https://start.ng';
  if (hostname.endsWith('.start.localhost')) return 'http://start.localhost:5173'; // local testing
  return null; // anywhere else (a file, plain localhost…) there's no start.ng: guests only
}

/** start.ng's address, or null when the game runs somewhere start.ng can't answer. */
export const START_NG = findStartNg();

/** The page opened with ?guest: the start.ng homepage already asked "sign in or guest?". */
export const ASKED_GUEST = new URLSearchParams(location.search).has('guest');

/** True when the player has just come back from signing in on start.ng. */
export const BACK_FROM_SIGN_IN = location.hash.includes('startng_session');

// After sign-in start.ng sends the player back with #startng_session=… in the address.
// The connect page doesn't need it, so tidy it away.
if (BACK_FROM_SIGN_IN) {
  history.replaceState(null, '', location.pathname + location.search);
}

let frame;
function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.title = 'start.ng connect';
    el.addEventListener('load', () => resolve(el), { once: true });
    el.addEventListener('error', reject, { once: true });
    document.body.append(el);
  });
  return frame;
}

// Sends a message to start.ng/connect and resolves to its reply, or undefined if start.ng
// isn't there or didn't answer in time.
async function ask(message, replyType, timeoutMs) {
  if (!START_NG) return undefined;
  let el;
  try {
    el = await connectFrame();
  } catch {
    return undefined;
  }
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    function onMessage(e) {
      // Only trust replies from start.ng, from our own frame, to this exact question.
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

/**
 * Who's playing. Resolves to { user, guest }: `user` is the signed-in player
 * ({ id, name, account, style, face }) or null, and `guest` is start.ng's shared guest look
 * ({ name, style, face }) when start.ng sent one. Resolves to undefined when start.ng didn't
 * answer: that means "unknown", never "signed out".
 */
export async function whoami() {
  if (!START_NG) return { user: null, guest: null };
  const reply = await ask({ type: 'startng:whoami' }, 'startng:user', 3000);
  if (!reply) return undefined;
  return { user: reply.user ?? null, guest: reply.guest ?? null };
}

/** The signed-in player, or null (also null when start.ng didn't answer). */
export async function getCurrentUser() {
  return (await whoami())?.user ?? null;
}

/**
 * Asks again when the player comes back to this tab or window, since they may have signed in
 * or out on start.ng. Calls fn({ user, guest }) only when the signed-in player changed;
 * checks that got no answer are ignored.
 */
export function onUserChange(fn, currentId = () => null) {
  let busy = false;
  const recheck = async () => {
    if (!START_NG || busy || document.visibilityState !== 'visible') return;
    busy = true;
    const reply = await whoami();
    busy = false;
    if (reply && (reply.user?.id ?? null) !== currentId()) fn(reply);
  };
  document.addEventListener('visibilitychange', recheck);
  addEventListener('focus', recheck);
}

/** Sends the player to start.ng to sign in; start.ng brings them back here afterwards. */
export function signIn() {
  if (!START_NG) return;
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

/**
 * Saves a signed-in player's run with exactly the stats in startng.json (whole numbers).
 * Resolves to { best, improved, rank, stats }, or { error } if it couldn't be saved.
 */
export async function saveRun(stats) {
  const clean = {};
  for (const [k, v] of Object.entries(stats)) clean[k] = Math.max(0, Math.min(1e9, Math.floor(v)));
  const reply = await ask({ type: 'startng:score', stats: clean }, 'startng:scoreSaved', 8000);
  if (!reply) return { error: "start.ng didn't answer" };
  return reply.ok ? reply.result : { error: reply.error || "Couldn't save your run" };
}

/** This game's top players: [{ rank, player_id, name, color, score, stats }], or null. */
export async function getLeaderboard(limit = 10) {
  const reply = await ask({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData', 8000);
  return reply?.ok ? reply.entries : null;
}
