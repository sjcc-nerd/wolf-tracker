# SJCC Scoring — Golf Gambling Tracker

A mobile-first single-file web app for tracking golf gambling games. No framework, no backend, no install — just a URL you bookmark on your phone.

**Live app:** `https://sjcc-nerd.github.io/wolf-tracker`
**Repo:** `https://github.com/sjcc-nerd/wolf-tracker`

---

## Stack

- Vanilla HTML/CSS/JS — no frameworks, no build step, no dependencies
- Two files: `index.html` + `sw.js` (service worker)
- State persisted to `localStorage`
- Hosted on GitHub Pages (free, static)
- Service worker handles automatic cache invalidation — no manual cache clearing needed after deploys

---

## Architecture

### State Management
All app state lives in a single `state` object, saved to localStorage on every render via `saveState()` under key `tbd_scoring_v2`. The UI re-renders by calling `render()`, which sets `innerHTML` on the root `#app` div based on `state.screen`.

```
state.screen          — current screen (home | wolf-setup | wolf-game | ns-setup | ns-game)
state.players         — array of { name, hcp } — shared across Nassau/Skins
state.scores          — { [playerName]: { [holeIndex]: grossScore } } — 0-indexed holes
state.wolf            — Wolf setup config { players[], defaultBet }
state.wolfGame        — Wolf game state { holes[], currentHole, holeInput, tab, editingHole }
state.nsSetup         — Nassau/Skins config (see below)
state.nsGame          — Nassau/Skins game state { currentHole, presses[], tab }
state.wolfSaved       — boolean, shows Resume button on home screen
state.nsSaved         — boolean, shows Resume button on home screen
```

### nsSetup Object
```
players[]             — array of { name, hcp }
hcpPct                — handicap percentage used (default 100)
nassau                — boolean toggle
nassauFormat          — 'match' | 'stroke'
teamA[]               — player names on Team A
teamB[]               — player names on Team B
betFront              — $ bet for front 9
betBack               — $ bet for back 9
betTotal              — $ bet for overall 18
autoPress             — boolean, triggers press at 2-down
presses[]             — press objects { id, parentPressId, startHole, endHole, segment, bet, auto, hasSpawned }
skins                 — boolean toggle
skinType              — 'net' | 'gross' | 'canadian'
skinBet               — $ per skin
carryover             — boolean
```

### Render Flow
```
render()
  → saves scroll position
  → sets app.innerHTML based on state.screen
  → calls attachEvents()
  → calls saveState()
  → restores scroll position
```

### Key Patterns
- Name inputs: save state on `input`, re-render on `blur` only (prevents focus loss)
- Scroll position saved/restored on every render (prevents jumping to top)
- Toast utility `showToast(msg)` for ephemeral confirmations (auto-dismisses after 2.5s)
- `touch-action: manipulation` on all interactive elements (prevents iOS double-tap zoom)

---

## Course Data

SJCC (San Jose Country Club, par 70) is hardcoded as the default course. 18 holes, each with `{ num, par, hcp, yds }` where `hcp` is the stroke index (1–18) used for handicap allocation.

Handicap strokes per hole allocated via `strokesOnHole(playerHcp, holeHcp, hcpPct)`:
- Returns 0, 1, or 2 strokes depending on player handicap vs hole stroke index
- Supports partial handicap via `hcpPct` (e.g. 85%)

---

## Games

### Wolf
Hole-by-hole gambling game. One scorer tracks all players.

- 4–5 players
- Each hole: tap each player to cycle PUSH → WIN → LOSS → PUSH (defaults to PUSH)
- $ per hole is editable (default set at start, adjustable per hole with +/− or direct input)
- Confirm is always enabled — all-push is a valid outcome
- **Math:** losers fund the pot, winners split equally
- Tabs: Play / Leaderboard / Previous Holes (with edit)
- localStorage preserves round through refresh

### Nassau + Skins
Scorecard-based. Played simultaneously from a shared scorecard.

#### Scorecard
- Enter gross scores per player per hole using +/− buttons
- App calculates net scores automatically based on handicap and hole stroke index
- Stroke badges show how many strokes each player receives on each hole
- Live Nassau match status shown inline
- Prev/Next for navigation only — no side effects
- **Confirm Hole** button advances to the next hole and triggers auto-press check
- **Finish Round** replaces Confirm on hole 18, triggers auto-press then goes to Summary
- Manual Press button available per hole

#### Nassau
- 2 players (1v1) or 4 players (2v2)
- 2v2 uses **best ball** (lowest net score on team wins the hole)
- Match play default, stroke play option
- Three independent bets: Front 9, Back 9, Overall
- **2-down auto press:** triggers at start of next hole when a team goes 2-down; each bet (original or press) can spawn exactly one child press via `hasSpawned` tracking; cascades indefinitely
- **Manual press:** add at any time, toast confirmation shown; does not interfere with auto-press
- Presses always close at end of their segment (front closes after 9, back closes after 18)
- Presses are editable (bet amount) and removable from the Nassau tab
- **Payout:** each player on winning team receives full bet amount; each player on losing team pays full bet amount (no division by team size)
- Live status updates hole by hole once all players have scores for that hole

#### Skins
- 2–5 players, every man for himself
- **Net skins (default):** lowest net score wins
- **Gross skins:** lowest gross score wins
- **Canadian skins:** gross birdie or better always beats net birdie; tiebreaker is net; push if still tied
- Carryover optional (off by default)
- **Math:** losers fund pot, winners split equally
- Live leaderboard updates as scores entered

---

## Key Functions

| Function | Description |
|---|---|
| `render()` | Main render loop, rebuilds DOM from state |
| `attachEvents()` | Wires all event listeners after render |
| `saveState()` / `loadState()` | localStorage persistence (key: `tbd_scoring_v2`) |
| `strokesOnHole(playerHcp, holeHcp, hcpPct)` | Returns strokes a player receives on a hole |
| `netScore(gross, playerHcp, holeHcp, hcpPct)` | Returns net score |
| `computeNassauState(ns)` | Returns live match state for front/back/overall + presses |
| `nassauPayout(ns, nassauResult)` | Returns dollar result per bet segment |
| `computeSkinsState(ss)` | Returns per-hole skins results |
| `skinsTotals(skinsState, skinBet, players)` | Returns net $ per player for skins |
| `wolfHoleResult(bet, statuses, players)` | Returns $ delta per player for a Wolf hole |
| `checkAutoPress(holeIdx)` | Fires on Confirm Hole only; spawns press if 2-down and parent hasn't spawned |
| `showToast(msg)` | Shows a dismissing notification at bottom of screen |
| `fmt(n)` | Formats a number, strips unnecessary decimals |

---

## Known Issues / Backlog

- [ ] Nassau stroke play mode — logic scaffolded but not fully implemented
- [ ] No score editing after advancing holes in Nassau/Skins (edit only in Wolf via Previous Holes tab)
- [ ] Auto press edge cases at end of front/back 9 not fully stress-tested
- [ ] No confirmation screen before ending a round
- [ ] No multi-course support — SJCC hardcoded
- [ ] Repo/app name mismatch — repo is `wolf-tracker`, app is branded `SJCC SCORING`
- [ ] No PWA manifest (service worker in place but no `manifest.json` for home screen install)

---

## Deploying Changes

1. Edit `index.html` (and `sw.js` if needed) directly in GitHub or locally
2. Commit to `main` branch
3. GitHub Pages auto-deploys in ~60 seconds
4. Service worker delivers the update to all devices automatically on next page load or refresh

**To force-bust all caches:** bump `CACHE_NAME` in `sw.js` from `sjcc-scoring-v1` to `v2` and redeploy both files.

**If repo is renamed:** update the SW registration path in `index.html` and the ASSETS array in `sw.js` to match the new repo name.

---

## Design Principles

- **Two files max.** No build step, no node_modules, drag-and-drop deployable anywhere.
- **Mobile first.** Large tap targets, `touch-action: manipulation` everywhere, works one-handed on a fairway.
- **No server.** All logic runs in the browser. localStorage is the database.
- **Stateless renders.** Every render rebuilds from `state`. No partial updates.
