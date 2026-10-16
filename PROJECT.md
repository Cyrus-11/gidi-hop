# Gidi Hop: project guide

Everything about how Gidi Hop works, how it's built, how to run and test it, and how it goes live on start.ng.

- **Live address:** <https://gidi-hop.start.ng>
- **Repo:** <https://github.com/Cyrus-11/gidi-hop> (public)
- **Built from:** the spec in `Context/game.md` (kept locally, not in the repo) and start.ng's docs at <https://start.ng/docs.md>

---

## 1. The game and its rules

Gidi Hop is a Crossy-Road-style hopper set on a busy Lagos ("Gidi") street, drawn in a bright low-poly look under warm late-afternoon sun.

- You start on the sidewalk and hop forward one tile at a time. **Your score (`hops`) is the furthest row you reach.**
- **₦ coins** float above some sidewalk and road tiles. A normal coin is worth 1 and a gold one is worth 5.
- **Ways to lose:**

| What happens | Message |
| --- | --- |
| Hit by a danfo | "Danfo don jam you!" |
| Hit by a keke | "Keke no dey brake o!" |
| Hit by an okada | "Okada knock you down!" |
| Hit by the train | "Train no dey wait for anybody!" |
| Land in the lagoon | "You fall inside lagoon!" |
| Land in the gutter | "Gutter swallow you!" |
| A canoe carries you off the side | "Canoe carry you comot!" |
| Fall more than ~4 rows behind the camera | "Agbero catch you. You too slow!" |

- The camera creeps forward on its own once you've hopped, so you can't stand still forever.
- You can't walk into stalls, palms, drums or generators, off the sides (columns −6 to 6), or back past the start.

### Lanes

| Lane | What's in it | Danger |
| --- | --- | --- |
| Sidewalk | Stalls with umbrellas, palms, water drums, generators, jerry cans; houses beyond the edges | None (a place to rest) |
| Road | One kind of vehicle per lane: danfo (long, slow), keke (medium) or okada (short, fast) | Getting hit |
| Gutter | Concrete drain with planks floating along it | Falling in |
| Lagoon | 1–3 lanes of teal water with canoes, flowing in alternate directions | Falling in, or drifting off |
| Rail | Track with crossing lights; the lights flash and a bell rings, then a train rushes through | Getting hit |

- Every 50 hops there's a guaranteed sidewalk with a green road sign (YABA, OSHODI, OJUELEGBA…).
- **Difficulty** grows from row 0 to row 250: faster traffic, more vehicles, longer road stretches, wider gaps on the water, fewer rest sidewalks, and a faster camera.

---

## 2. The characters

- **The player** is their own **start.ng character**, built from start.ng's own `src/three/human.ts` ([Cybertron-HNG/startng-fe](https://github.com/Cybertron-HNG/startng-fe), branch `dev`) ported to plain JavaScript in `src/character.js`. It uses every style field: `body`, `primaryColor` (top), `secondaryColor` (trousers or skirt), `skinColor`, `hairColor`, `hair`, `hat`, `accessory`. It's scaled to 0.6 so it stands about one tile tall.
  - Gidi Hop adds a **hop pose** (knees tucked, arms thrown up) on top of start.ng's idle animation (breathing, blinking, looking around).
  - On the menu the character faces you; click or tap them and they wave.
  - Death animations: flattened by vehicles, sinking in water, lifted away when caught.
  - Look parts from start.ng **can't be changed in the game**; players change them on start.ng.
- **Guests** use start.ng's shared guest look (`guest` in the `whoami` reply). If start.ng can't be reached at all, a built-in default is used (yellow top, cap).
- **Other people:** danfo conductors hanging out of the door, okada riders (some with passengers), keke drivers, and fishermen in some canoes. These are simple blocky figures and part of the scenery.

---

## 3. The start.ng setup

All start.ng code lives in **`src/platform.js`**. The game never sees a password, email or token.

| Piece | How it works |
| --- | --- |
| Where start.ng is | `*.start.ng` → `https://start.ng`; `*.start.localhost` → `http://start.localhost:5173`; anywhere else → `null` (guest only, with a note) |
| Who's playing | Hidden iframe `${START_NG}/connect`, then `postMessage({ type: 'startng:whoami', requestId })`. Replies are accepted only if `e.origin === START_NG`, `e.source` is that iframe, and the `requestId` matches. |
| No answer | After 3 seconds the result is "unknown", not "signed out". On first load the menu offers both buttons with a "Couldn't reach start.ng" note. A recheck that gets no answer changes nothing. |
| Ask again | On `visibilitychange` (tab visible) and window `focus`. The game reacts only when the signed-in player's id changes. |
| Sign in | `location.href = START_NG + '/?return_to=' + encodeURIComponent(location.origin + location.pathname)` |
| Coming back | `#startng_session=…` is removed from the address with `history.replaceState` |
| `?guest` | The start.ng homepage already asked, so the game goes straight to "Playing as Guest" with a Play button |
| Leaderboard | `startng.json` sets the columns `hops` (ranked first) and `coins`, both highest. At game over, signed-in players send `startng:score` with `{ stats: { hops, coins } }` (whole numbers clamped to 0–1,000,000,000). Everyone sees the top 10 from `startng:leaderboard`, with their own row highlighted by `player_id`. |
| Local data | `localStorage` (keys starting `gidi-hop:`): the best run per start.ng id (or `guest`) and the mute setting. Every read and write is wrapped in `try/catch`. |

### Menu states

| State | What the player sees |
| --- | --- |
| Checking | "Connecting to start.ng…" |
| Signed in | "Welcome, *name*!" with `@account`, and a Play button |
| Signed out | **Sign in with start.ng** and **Play as guest** |
| `?guest`, or after choosing guest | "Playing as Guest", with Play and a sign-in button |
| Not on start.ng | Play as guest, plus a note that sign-in isn't available here |

A chip in the top-left corner always shows the player's face picture, name, and `@account` (or "Not signed in"), with a Sign in button for guests.

---

## 4. The files

```
index.html        page, screens, three.js import map (three@0.160.0 from jsDelivr)
style.css         UI styles (Baloo 2 font from Google Fonts)
startng.json      leaderboard columns
cover.png         1600×1000 cover (16:10, 185 KB)
favicon.svg
README.md         short guide
PROJECT.md        this guide
src/
  main.js         boot, menus, controls, game over, leaderboard, ?debug, ?cover
  game.js         scene, camera, light, player, hopping, deaths, effects
  world.js        lanes, traffic, boats, trains, coins, difficulty, seeded randomness
  models.js       low-poly models
  character.js    start.ng character (ported human.ts) + hop pose + style defaults
  platform.js     start.ng connect page
  audio.js        Web Audio sound effects + mute
  scores.js       localStorage best + mute
```

Notes for changing things:

- **Tuning:** hop speed `HOP_TIME` and character size `CHAR_SCALE` are in `game.js`. The camera speed (`0.32 + d * 0.55` rows/s) and the "caught" distance (4.2 rows) are in `Game.step`. Lane mix and difficulty are in `World.planNext`, `fillTraffic` and `fillFloaters`.
- **Add a vehicle or prop:** add a builder to `models.js` (one unit is one tile, vehicles point along +x), then register it in `VEHICLES` or `PROPS`.
- **Add a place name** for the 50-hop signs: `PLACES` in `world.js`.
- **Sound:** every effect is a short function in `audio.js`. There are no audio files.

---

## 5. Running it locally

### Quick (guest only)

```sh
python3 -m http.server 8000
# http://localhost:8000
```

- `?debug` keeps debug mode on for the tab (it survives the trip to start.ng and back) and exposes `window.gidi` = `{ game, session }`. Try `gidi.game.invincible = true`.
- `?seed=123` gives the same street every run.
- `?cover` shows the cover scene (used to render `cover.png` at 1600×1000).

### With sign-in, before going live

Browsers only share start.ng's sign-in with the game when both are under the same parent domain, so serve the game on a `*.start.localhost` address:

| Service | URL |
| --- | --- |
| start.ng | `http://start.localhost:5173` |
| Game | `http://gidi-hop.start.localhost:8787` |

Either run start.ng locally (front end `Cybertron-HNG/startng-fe` on branch `dev`, back end `Cybertron-HNG/startng-be` with `CORS_ORIGINS` including `http://start.localhost:5173`, and the Worker from the `worker` branch with a local-only `wrangler.local.toml`; see `Context/game.md` §8), **or** use a small stand-in page at `start.localhost:5173/connect` that answers `startng:whoami`, `startng:score` and `startng:leaderboard` the way the docs describe. For a quick check, serving the game folder with `python3 -m http.server 8787` and opening `http://gidi-hop.start.localhost:8787` works, because Chrome sends `*.localhost` to your own computer.

Never open plain `localhost:8787` with the start.ng Worker running: with no game name in front, the request loops.

---

## 6. Putting it live and updating

1. Push to the public repo `Cyrus-11/gidi-hop`.
2. **Check:** `POST https://api.start.ng/games/check` with `{"repo_url":"https://github.com/Cyrus-11/gidi-hop","name":"gidi-hop"}`. A **200** means it would go live (read any warnings); a **422** lists every problem to fix.
3. **Publish:** `POST https://api.start.ng/games/publish` with the same body.
   - **202** (first time): open the `approve_url`, sign in to start.ng and say yes to "Put gidi-hop live?". The link works once and lasts 30 days.
   - **200** (already approved): the game is updated straight away.
4. **Updates:** after approval, every push to `main` updates `gidi-hop.start.ng` within a minute or two. If a push has a problem, the game stays on its last good version, and **Your games** on the start.ng profile shows why.

---

## 7. What was and wasn't tested

Tested in headless Chrome 1280×800, plus a 390×844 phone viewport with touch, using scripted browser tests.

**Gameplay (all passed)**
- Menu, Play as guest, hopping forward, HUD updates, game-over screen
- The back wall stops you at row −3, and the side walls stop you at columns ±6
- A vehicle hit kills, with the right message
- Landing in the lagoon kills; landing on a canoe keeps you alive and carries you; drifting off the side kills
- A gutter plank holds you
- The train's warning, then the train passing, kills
- Picking up a coin adds ₦ and the HUD updates
- Standing still gets you caught by the camera ("Agbero catch you")
- An 80-hop run: rows ahead are built and old ones dropped (about 39 rows kept), with no errors
- Phone layout: menu, HUD and game over fit at 390 px wide

**start.ng flow, against a stand-in connect page on `start.localhost:5173` with the game at `gidi-hop.start.localhost:8787` (all passed)**
- Signed out: both buttons show, and the chip says "Not signed in"
- Play as guest uses start.ng's guest look
- Guest game over: an invitation to sign in, plus the leaderboard
- Sign in: `return_to` is exactly origin + path; `#startng_session` is removed when you come back
- Back in the game: "Welcome, Runner Tee!" with `@Hamzat`, and the character in the player's style (purple top, green trousers, braids, crown, earrings)
- Signed-in game over: the run is saved with exactly `{ hops, coins }`, the rank shows, and the player's row is highlighted
- Sign out on start.ng in another tab, come back: the game notices and shows the signed-out menu
- `?guest` skips the sign-in question
- start.ng not answering: the game gives up after about 3.1 s and offers both buttons with a note; a recheck with no answer does **not** sign the player out

**Not tested**
- The real start.ng connect page and leaderboard (they only answer games served from `*.start.ng`, so real sign-in, saving scores and the live board can only be checked once the game is live)
- The full local start.ng stack (front end, back end and Worker)
- Real phones and Safari (only Chrome with a phone-sized viewport and touch emulation)
- How the sound actually sounds (headless Chrome has no audio output; the code runs without errors)
- Long sessions beyond about 80 hops and the hardest difficulty (row 250+)
