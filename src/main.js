// Gidi Hop: boots the game, asks start.ng who's playing, and runs the menu, HUD and game-over screens.
import { Game } from './game.js';
import { DEFAULT_STYLE } from './character.js';
import { START_NG, ASKED_GUEST, BACK_FROM_SIGN_IN, whoami, onUserChange, signIn, saveRun, getLeaderboard } from './platform.js';
import { getBest, saveBest, dailySeed, todayInLagos, getDailyBest, saveDailyBest } from './scores.js';
import { unlockAudio, toggleMute, isMuted, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// ?debug stays on for this tab, so it survives the trip to start.ng and back
const DEBUG = (() => {
  try {
    if (params.has('debug')) sessionStorage.setItem('gidi-hop:debug', '1');
    return sessionStorage.getItem('gidi-hop:debug') === '1';
  } catch {
    return params.has('debug');
  }
})();
const COVER = params.has('cover');
const seed = params.has('seed') ? Number(params.get('seed')) || 1 : undefined;

const ui = {
  menu: $('menu'), over: $('over'), boardScreen: $('board-screen'), pause: $('pause'), hud: $('hud'), chip: $('player-chip'),
};

let mode = 'free'; // 'free' (a new street every run) or 'daily' (today's street, the same for everyone)
const GAME_URL = 'https://gidi-hop.start.ng';

// ---------------------------------------------------------------- who's playing

const session = {
  user: null, // the signed-in start.ng player, or null
  guest: null, // start.ng's shared guest look, when start.ng sent one
  chose: ASKED_GUEST ? 'guest' : null, // 'guest' once the player picked "Play as guest"
  checked: !START_NG, // false until the first answer (or no answer) from start.ng
  reachable: !!START_NG,
};

const player = () => session.user ?? { name: 'Guest', style: session.guest?.style ?? DEFAULT_STYLE, face: session.guest?.face };
const playerKey = () => (session.user ? String(session.user.id) : 'guest');

// ---------------------------------------------------------------- the game

const game = new Game($('scene'), {
  seed,
  onUpdate: (run) => {
    $('hud-hops').textContent = run.hops;
    $('hud-coins').textContent = run.coins;
    if (run.hops > 0) hideHint();
  },
  onDeath: (result) => showGameOver(result),
  onEvent: (e) => {
    if (e.type === 'nearMiss') popup('Close one! +₦1', e.x, e.y);
  },
});
game.setStyle(player().style);

if (DEBUG) {
  window.gidi = { game, session, platform: { START_NG } };
  console.info('[gidi-hop] debug on: window.gidi.game, set gidi.game.invincible = true to stop dying');
}

// ---------------------------------------------------------------- menu

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${cls}`;
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
    onClick();
  });
  return b;
}

function renderPlayerChip() {
  const p = player();
  ui.chip.hidden = false;
  const face = $('player-face');
  if (p.face) face.src = p.face;
  else face.removeAttribute('src');
  $('player-name').textContent = p.name || 'Guest';
  $('player-account').textContent = session.user?.account ? `@${session.user.account}` : START_NG ? 'Not signed in' : 'Guest';
  $('chip-sign-in').hidden = !!session.user || !START_NG;
}

function renderMenu() {
  const buttons = $('menu-buttons');
  buttons.replaceChildren();
  const status = $('status');
  const note = $('note');
  const greeting = $('greeting');
  status.hidden = true;
  note.hidden = true;
  greeting.innerHTML = '';

  if (!session.checked) {
    status.hidden = false;
    status.textContent = 'Connecting to start.ng…';
  } else if (session.user) {
    greeting.textContent = `Welcome, ${session.user.name}!`;
    if (session.user.account) {
      const small = document.createElement('small');
      small.textContent = `@${session.user.account}`;
      greeting.append(small);
    }
    buttons.append(button('Play', 'primary', () => play('free')));
  } else if (!START_NG) {
    buttons.append(button('Play as guest', 'primary', () => play('free')));
    note.hidden = false;
    note.textContent = "Sign-in isn't available here, so you're playing as a guest. Play at gidi-hop.start.ng to sign in and join the leaderboard.";
  } else if (session.chose === 'guest') {
    greeting.textContent = 'Playing as Guest';
    buttons.append(button('Play', 'primary', () => play('free')), button('Sign in with start.ng', 'startng', signIn));
  } else {
    buttons.append(
      button('Sign in with start.ng', 'startng', signIn),
      button('Play as guest', 'primary', () => {
        session.chose = 'guest';
        play('free');
      }),
    );
    if (!session.reachable) {
      note.hidden = false;
      note.textContent = "Couldn't reach start.ng just now. You can still play as a guest.";
    }
  }

  $('daily-btn').hidden = !session.checked;
  const daily = getDailyBest(playerKey());
  $('daily-sub').textContent = `${prettyDay()} · same street for everyone${daily.hops ? ` · your best ${daily.hops}` : ''}`;

  const best = getBest(playerKey());
  $('menu-best').hidden = !best.hops;
  $('menu-best').textContent = `Your best: ${best.hops} hops · ₦${best.coins}`;
  $('open-board').hidden = !START_NG;
  renderPlayerChip();
}

function showScreen(name) {
  ui.menu.hidden = name !== 'menu';
  ui.over.hidden = name !== 'over';
  ui.boardScreen.hidden = name !== 'board';
  ui.pause.hidden = name !== 'pause';
  ui.hud.hidden = !['play', 'over', 'pause'].includes(name);
  $('pause-btn').hidden = name !== 'play';
  if (name !== 'play') hideHint(true);
}

/** "Fri 16 Oct" for today in Lagos. */
function prettyDay() {
  return new Date(`${todayInLagos()}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function play(nextMode = mode) {
  unlockAudio();
  mode = nextMode;
  if (!session.user && START_NG && !session.chose) session.chose = 'guest';
  showScreen('play');
  $('hud-daily').hidden = mode !== 'daily';
  game.start(mode === 'daily' ? dailySeed() : undefined);
  showHint();
}

// ---------------------------------------------------------------- hint, pop-ups, toast

let hintTimer = 0;
function showHint() {
  const hint = $('hint');
  hint.classList.remove('fade');
  hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hideHint(), 5000);
}

function hideHint(now = false) {
  const hint = $('hint');
  if (hint.hidden) return;
  clearTimeout(hintTimer);
  if (now) {
    hint.hidden = true;
    return;
  }
  hint.classList.add('fade');
  hintTimer = setTimeout(() => (hint.hidden = true), 400);
}

function popup(text, x, y) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  $('popups').append(el);
  setTimeout(() => el.remove(), 1200);
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

// ---------------------------------------------------------------- pause

function pauseGame() {
  if (!game.pause()) return;
  showScreen('pause');
}

function resumeGame() {
  if (ui.pause.hidden) return;
  showScreen('play');
  game.resume();
}

// pause by itself when the player switches tabs or apps
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && game.state === 'playing' && !game.paused) pauseGame();
});

function toMenu() {
  game.resume();
  game.reset(seed);
  showScreen('menu');
  renderMenu();
}

// ---------------------------------------------------------------- game over & leaderboard

let overToken = 0;
let lastResult = null;

async function shareScore() {
  if (!lastResult) return;
  const { hops, coins } = lastResult;
  const where = lastResult.mode === 'daily' ? ` on the Daily Street (${prettyDay()})` : '';
  const text = `I hopped ${hops} rows across Lagos${where} in Gidi Hop 🚌 and grabbed ₦${coins}. Can you beat me?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Gidi Hop', text, url: GAME_URL });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return; // the player closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(`${text} ${GAME_URL}`);
    toast('Copied! Paste it anywhere 📋');
  } catch {
    toast("Couldn't copy. Your browser blocked it.");
  }
}

async function showGameOver(result) {
  const token = ++overToken;
  showScreen('over');
  lastResult = { ...result, mode };
  $('over-message').textContent = result.message;
  $('over-hops').textContent = result.hops;
  $('over-coins').textContent = result.coins;
  $('over-mode').hidden = mode !== 'daily';
  $('over-mode').textContent = `📅 DAILY STREET · ${prettyDay().toUpperCase()}`;
  const daily = mode === 'daily';
  const improvedAll = saveBest(playerKey(), result);
  const improved = daily ? saveDailyBest(playerKey(), result) : improvedAll;
  const best = daily ? getDailyBest(playerKey()) : getBest(playerKey());
  $('over-best').innerHTML = '';
  if (improved && result.hops > 0) {
    const tag = document.createElement('span');
    tag.className = 'new-best';
    tag.textContent = daily ? "Today's best!" : 'New best!';
    $('over-best').append(tag);
    sfx.best();
  } else {
    $('over-best').textContent = `${daily ? "Today's best" : 'Best'}: ${best.hops} hops · ₦${best.coins}`;
  }
  $('over-rank').textContent = '';
  $('over-sign-in').hidden = !!session.user || !START_NG;
  const board = $('over-board');
  board.hidden = true;
  if (!START_NG) return;

  if (session.user) {
    $('over-rank').textContent = 'Saving your run…';
    const saved = await saveRun({ hops: result.hops, coins: result.coins });
    if (token !== overToken) return;
    if (saved.error) $('over-rank').textContent = saved.error;
    else $('over-rank').textContent = saved.improved ? `New start.ng best! You're #${saved.rank}` : `Your start.ng best: ${saved.stats?.hops ?? saved.best} hops (#${saved.rank})`;
  } else {
    $('over-rank').textContent = 'Sign in to put your runs on the leaderboard.';
  }
  const entries = await getLeaderboard(10);
  if (token !== overToken) return;
  if (entries) {
    board.hidden = false;
    renderBoard(board, entries);
  }
}

function renderBoard(el, entries) {
  el.replaceChildren();
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No runs yet. Be the first!';
    el.append(p);
    return;
  }
  const ol = document.createElement('ol');
  for (const e of entries) {
    const li = document.createElement('li');
    if (session.user && e.player_id === session.user.id) li.className = 'me';
    const cells = [
      ['r', `#${e.rank}`],
      ['dot', ''],
      ['n', e.name],
      ['s', `${e.stats?.hops ?? e.score} hops · ₦${e.stats?.coins ?? 0}`],
    ];
    for (const [cls, text] of cells) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      if (cls === 'dot') span.style.background = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#ccc';
      li.append(span);
    }
    ol.append(li);
  }
  el.append(ol);
}

async function openBoard() {
  showScreen('board');
  const list = $('board-list');
  list.textContent = 'Loading…';
  const entries = await getLeaderboard(10);
  if (entries) renderBoard(list, entries);
  else list.textContent = "Couldn't load the leaderboard just now.";
}

// ---------------------------------------------------------------- controls

const KEYS = {
  ArrowUp: 'forward', KeyW: 'forward',
  ArrowDown: 'back', KeyS: 'back',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') return setMute(toggleMute());
  const dir = KEYS[e.code];
  if (dir) e.preventDefault();
  if (e.repeat) return;
  unlockAudio();
  if (!ui.pause.hidden) {
    if (['KeyP', 'Escape', 'Space', 'Enter'].includes(e.code)) {
      e.preventDefault();
      resumeGame();
    }
    return;
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && game.state === 'playing') return pauseGame();
  if (!ui.menu.hidden && (dir === 'forward' || e.code === 'Space' || e.code === 'Enter') && canPlayFromMenu()) {
    e.preventDefault();
    return play('free');
  }
  if (!ui.over.hidden && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    return play();
  }
  if (dir && game.state === 'playing') game.move(dir);
});

function canPlayFromMenu() {
  return session.checked;
}

// tap to hop forward, swipe to hop any way
let touchStart = null;
const canvas = $('scene');
canvas.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  unlockAudio();
  if (game.state === 'menu') return game.wave();
  if (game.state !== 'playing' || game.paused) return;
  const dist = Math.hypot(dx, dy);
  if (dist < 24) return game.move('forward');
  if (Math.abs(dx) > Math.abs(dy)) game.move(dx > 0 ? 'right' : 'left');
  else game.move(dy < 0 ? 'forward' : 'back');
});

function setMute(muted) {
  $('mute').textContent = muted ? '🔇' : '🔊';
  $('mute').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}
$('mute').addEventListener('click', (e) => {
  e.stopPropagation();
  unlockAudio();
  setMute(toggleMute());
});
setMute(isMuted());

$('again').addEventListener('click', () => play());
$('share').addEventListener('click', shareScore);
$('daily-btn').addEventListener('click', () => play('daily'));
$('pause-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  pauseGame();
});
$('resume').addEventListener('click', resumeGame);
$('pause-menu').addEventListener('click', toMenu);
$('to-menu').addEventListener('click', toMenu);
$('over-sign-in').addEventListener('click', signIn);
$('chip-sign-in').addEventListener('click', signIn);
$('open-board').addEventListener('click', openBoard);
$('close-board').addEventListener('click', () => {
  showScreen('menu');
});

// ---------------------------------------------------------------- start.ng

function applyReply(reply) {
  const before = session.user?.id ?? null;
  session.user = reply.user;
  session.guest = reply.guest ?? session.guest;
  const after = session.user?.id ?? null;
  if (before !== after || !game.human) game.setStyle(player().style);
  if (!session.user && before !== null) session.chose = null; // signed out on start.ng: ask again
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Called whenever start.ng tells us who's playing (first check, retries, rechecks).
function onAnswer(reply) {
  session.reachable = true;
  session.checked = true;
  applyReply(reply);
  // mid-run the new look shows straight away; menus update now
  if (!ui.menu.hidden) renderMenu();
  else renderPlayerChip();
  if (!ui.over.hidden) $('over-sign-in').hidden = !!session.user;
}

async function connect() {
  showScreen('menu');
  renderMenu();
  if (!START_NG) return;
  if (BACK_FROM_SIGN_IN) $('status').textContent = 'Signing you in…';

  // The first answer. Just back from signing in, start.ng can take a moment to catch up,
  // so a "nobody" answer is checked again a few times before we believe it.
  // No answer at all is handled by the background retries below, so the menu never waits long.
  let reply = await whoami();
  for (let attempt = 1; BACK_FROM_SIGN_IN && reply && !reply.user && attempt < 4; attempt++) {
    await sleep(700 * attempt);
    reply = (await whoami()) ?? reply;
  }
  session.checked = true;
  if (reply) onAnswer(reply);
  else {
    session.reachable = false; // no answer: unknown, so offer both buttons
    renderMenu();
  }

  // Ask again when the player comes back to the tab (they may have signed in or out).
  onUserChange(onAnswer, () => session.user?.id ?? null);

  // start.ng hasn't answered at all yet (slow network): keep asking quietly in the background.
  for (let wait = 3000; !session.reachable && wait < 60000; wait *= 1.6) {
    await sleep(wait);
    const late = await whoami();
    if (late) onAnswer(late);
  }
}

// ---------------------------------------------------------------- cover picture (?cover)

function stageCover() {
  document.body.classList.add('cover');
  for (const el of [ui.menu, ui.over, ui.hud, ui.chip, $('mute')]) el.hidden = true;
  $('cover-title').hidden = false;
  game.stageCover?.();
}

if (COVER) stageCover();
else connect();
