// Gidi Hop: boots the game, asks start.ng who's playing, and runs the menu, HUD and game-over screens.
import { Game } from './game.js';
import { DEFAULT_STYLE } from './character.js';
import { START_NG, ASKED_GUEST, whoami, onUserChange, signIn, saveRun, getLeaderboard } from './platform.js';
import { getBest, saveBest } from './scores.js';
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
  menu: $('menu'), over: $('over'), boardScreen: $('board-screen'), hud: $('hud'), chip: $('player-chip'),
};

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
  },
  onDeath: (result) => showGameOver(result),
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
    buttons.append(button('Play', 'primary', play));
  } else if (!START_NG) {
    buttons.append(button('Play as guest', 'primary', play));
    note.hidden = false;
    note.textContent = "Sign-in isn't available here, so you're playing as a guest. Play at gidi-hop.start.ng to sign in and join the leaderboard.";
  } else if (session.chose === 'guest') {
    greeting.textContent = 'Playing as Guest';
    buttons.append(button('Play', 'primary', play), button('Sign in with start.ng', 'startng', signIn));
  } else {
    buttons.append(
      button('Sign in with start.ng', 'startng', signIn),
      button('Play as guest', 'primary', () => {
        session.chose = 'guest';
        play();
      }),
    );
    if (!session.reachable) {
      note.hidden = false;
      note.textContent = "Couldn't reach start.ng just now. You can still play as a guest.";
    }
  }

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
  ui.hud.hidden = name !== 'play' && name !== 'over';
}

function play() {
  unlockAudio();
  showScreen('play');
  game.start();
}

function toMenu() {
  game.reset(seed);
  showScreen('menu');
  renderMenu();
}

// ---------------------------------------------------------------- game over & leaderboard

let overToken = 0;

async function showGameOver(result) {
  const token = ++overToken;
  showScreen('over');
  $('over-message').textContent = result.message;
  $('over-hops').textContent = result.hops;
  $('over-coins').textContent = result.coins;
  const improved = saveBest(playerKey(), result);
  const best = getBest(playerKey());
  $('over-best').innerHTML = '';
  if (improved && result.hops > 0) {
    const tag = document.createElement('span');
    tag.className = 'new-best';
    tag.textContent = 'New best!';
    $('over-best').append(tag);
    sfx.best();
  } else {
    $('over-best').textContent = `Best: ${best.hops} hops · ₦${best.coins}`;
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
  if (!ui.menu.hidden && (dir === 'forward' || e.code === 'Space' || e.code === 'Enter') && canPlayFromMenu()) {
    e.preventDefault();
    if (!session.user && START_NG && !session.chose) session.chose = 'guest';
    return play();
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
  if (game.state !== 'playing') return;
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

$('again').addEventListener('click', play);
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

async function connect() {
  showScreen('menu');
  renderMenu();
  if (!START_NG) return;
  const reply = await whoami();
  session.checked = true;
  if (reply) applyReply(reply);
  else session.reachable = false; // no answer: unknown, so offer both buttons
  renderMenu();

  onUserChange((next) => {
    session.reachable = true;
    applyReply(next);
    // mid-run the new look shows straight away; menus update now
    if (!ui.menu.hidden) renderMenu();
    else renderPlayerChip();
    if (!ui.over.hidden) $('over-sign-in').hidden = !!session.user;
  }, () => session.user?.id ?? null);
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
