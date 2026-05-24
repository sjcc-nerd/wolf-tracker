# TBD Scoring — Golf Gambling Tracker

A mobile-first single-file web app for tracking golf gambling games. No framework, no backend, no install — just a URL you bookmark on your phone.

**Live app:** `https://sjcc-nerd.github.io/tbd-scoring`
**Repo:** `https://github.com/sjcc-nerd/tbd-scoring`

---

## Stack

- Vanilla HTML/CSS/JS — no frameworks, no build step, no dependencies
- Single file: `index.html`
- State persisted to `localStorage`
- Hosted on GitHub Pages (free, static)

---

## Architecture

### State Management
All app state lives in a single `state` object, saved to localStorage on every render via `saveState()`. The UI re-renders by calling `render()`, which sets `innerHTML` on the root `#app` div based on `state.screen`.

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
presses[]             — array of press objects { startHole, segment, bet, manual, auto }
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

### Key Render Bug Fixes In Place
- Name inputs: save state on `input`, re-render on `blur` only (prevents focus loss)
- Scroll position saved/restored on every render (prevents jumping to top)
- Toast utility `showToast(msg)` for ephemeral confirmations (auto-dismisses after 2.5s)

---

## Course Data

SJCC (San Jose Country Club) is pre-loaded as the default course. Par 70, 18 holes.

```js
const SJCC = {
  name: 'San Jose Country Club',
  holes: [
    // { num, par, hcp, yds }
    // hcp = stroke index (1-18), used for handicap allocation
  ]
}
```

Handicap strokes per hole are allocated via `strokesOnHole(playerHcp, holeHcp, hcpPct)`:
- Returns 0, 1, or 2 strokes depending on player handicap vs hole stroke index
- Supports partial handicap via `hcpPct` (e.g. 85% of handicap)

---

## Games

### Wolf
Hole-by-hole gambling game. One scorer tracks all players.

- 4–5 players
- Each hole: tap each player to cycle PUSH → WIN → LOSS → PUSH
- $ per hole is editable (default set at start, adjustable per hole)
- **Math:** losers fund the pot, winners split equally
- Tabs: Play / Leaderboard / Previous Holes (with edit)
- localStorage preserves round through refresh

### Nassau + Skins
Scorecard-based. Played simultaneously from a shared scorecard.

#### Scorecard
- Enter gross scores per player per hole using +/− buttons
- App calculates net scores automatically
- Stroke badges show how many handicap strokes each player receives on each hole
- Live Nassau match status shown inline (updates as scores entered)
- Prev/Next hole navigation
- Manual Press button available per hole

#### Nassau
- 2 or 4 players (1v1 or 2v2)
- 2v2 uses **best ball** (lowest net score on team wins the hole)
- Match play default, stroke play option
- Three independent bets: Front 9, Back 9, Overall
- **2-down auto press:** triggers at start of next hole after going 2-down
- **Manual press:** add at any time, toast confirmation shown
- Presses are independent bets — pay out separately from original
- Live status updates hole by hole once all players on both teams have scores for that hole

#### Skins
- 2–5 players, every man for himself
- **Net skins (default):** lowest net score wins
- **Gross skins:** lowest gross score wins
- **Canadian skins:** gross birdie or better always beats net birdie; tiebreaker is net; push if still tied at net
- Carryover optional (off by default) — tied holes carry pot to next hole
- **Math:** losers fund pot, winners split equally
- Live leaderboard updates as scores entered

---

## Key Functions

| Function | Description |
|---|---|
| `render()` | Main render loop, rebuilds DOM from state |
| `attachEvents()` | Wires all event listeners after render |
| `saveState()` / `loadState()` | localStorage persistence |
| `strokesOnHole(playerHcp, holeHcp, hcpPct)` | Returns strokes a player receives on a hole |
| `netScore(gross, playerHcp, holeHcp, hcpPct)` | Returns net score |
| `computeNassauState(ns)` | Returns live match state for front/back/overall + presses |
| `nassauPayout(ns, nassauResult)` | Returns dollar result per bet segment |
| `computeSkinsState(ss)` | Returns per-hole skins results |
| `skinsTotals(skinsState, skinBet, players)` | Returns net $ per player for skins |
| `wolfHoleResult(bet, statuses, players)` | Returns $ delta per player for a Wolf hole |
| `showToast(msg)` | Shows a dismissing notification at bottom of screen |
| `fmt(n)` | Formats a number, strips unnecessary decimals |

---

## Known Issues / Backlog

- [ ] Nassau stroke play mode — logic scaffolded but not fully implemented
- [ ] No way to edit a hole's scores after advancing in Nassau/Skins (Previous Holes tab only exists in Wolf)
- [ ] Auto press edge cases at end of 9 not fully stress-tested
- [ ] Summary tab net totals need validation with real round data
- [ ] No confirmation screen before ending a round
- [ ] App name is placeholder "TBD Scoring"
- [ ] No multi-course support — SJCC hardcoded (future: course selector)
- [ ] No PWA manifest — could be added for true home screen install experience

---

## Deploying Changes

1. Edit `index.html` locally or directly in GitHub
2. Commit to `main` branch
3. GitHub Pages auto-deploys in ~60 seconds
4. Hard refresh on iPhone (clear Safari cache or use a different browser) to bust cache

---

## Design Principles

- **One file.** No build step, no node_modules, drag-and-drop deployable anywhere.
- **Mobile first.** Large tap targets, thumb-friendly layout, works one-handed on a fairway.
- **No server.** All logic runs in the browser. localStorage is the database.
- **Stateless renders.** Every render rebuilds from `state`. No partial updates.
