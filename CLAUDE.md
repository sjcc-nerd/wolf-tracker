# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development & Deploy

No build step, no dependencies, no package manager. The entire app is `index.html` plus `sw.js`.

**To develop:** Open `index.html` in a browser (or serve with any static file server). Changes are visible immediately on reload.

**To deploy:** Commit to `main`. GitHub Pages auto-deploys to `https://sjcc-nerd.github.io/wolf-tracker` in ~60 seconds. A service worker handles cache invalidation automatically — users get the new version on next page load or browser refresh without manual cache clearing.

**Service worker:** `sw.js` uses a network-first strategy. When you deploy a new version, it is picked up automatically. If you need to force-bust all caches (e.g. after a major restructure), bump `CACHE_NAME` in `sw.js` from `sjcc-scoring-v1` to `v2` and redeploy both files. The SW registration path is `/wolf-tracker/sw.js` — update this if the repo is ever renamed.

## Architecture

Single-file vanilla JS app. All state lives in one `state` object, persisted to `localStorage` on every render under the key `tbd_scoring_v2`.

### Render Pattern

Every user action mutates `state`, then calls `render()`. There are no partial DOM updates.

```
render()
  → saves scroll position
  → sets app.innerHTML based on state.screen
  → calls attachEvents()
  → calls saveState()
  → restores scroll position
```

`attachEvents()` re-wires all event listeners from scratch after every render. Screen-specific listeners are split into `attachHomeEvents()`, `attachWolfSetupEvents()`, `attachWolfGameEvents()`, `attachNSSetupEvents()`, `attachNSGameEvents()`.

### State Shape

```
state.screen       — 'home' | 'wolf-setup' | 'wolf-game' | 'ns-setup' | 'ns-game'
state.players      — [{ name, hcp }] — shared across Nassau + Skins
state.scores       — { [playerName]: { [holeIndex]: grossScore } } — 0-indexed
state.wolf         — Wolf setup: { players[], defaultBet }
state.wolfGame     — Wolf runtime: { holes[], currentHole, holeInput, tab, editingHole }
state.nsSetup      — Nassau/Skins config (see below)
state.nsGame       — Nassau/Skins runtime: { currentHole, presses[], tab }
state.wolfSaved    — boolean — shows Resume button on home
state.nsSaved      — boolean — shows Resume button on home
```

`nsSetup` contains all config for both Nassau and Skins games:
- `players[]`, `hcpPct`, `nassau`, `nassauFormat` ('match'|'stroke'), `teamA[]`, `teamB[]`
- `betFront`, `betBack`, `betTotal`, `autoPress`, `presses[]`
- `skins`, `skinType` ('net'|'gross'|'canadian'), `skinBet`, `carryover`

### Key Functions

| Function | Description |
|---|---|
| `render()` | Main render loop — rebuilds full DOM from state |
| `attachEvents()` | Wires all event listeners post-render |
| `saveState()` / `loadState()` | localStorage persistence (key: `tbd_scoring_v2`) |
| `strokesOnHole(playerHcp, holeHcp, hcpPct)` | Returns 0, 1, or 2 strokes; supports partial hcp via pct |
| `netScore(gross, playerHcp, holeHcp, hcpPct)` | Gross minus strokes |
| `computeNassauState(ns)` | Returns live match state for front/back/overall + all presses |
| `nassauPayout(ns, nassauResult)` | Returns dollar result per bet segment |
| `computeSkinsState(ss)` | Returns per-hole skins results (net/gross/canadian) |
| `skinsTotals(skinsState, skinBet, players)` | Returns net $ per player for skins |
| `wolfHoleResult(bet, statuses, players)` | Returns $ delta per player for one Wolf hole |
| `wolfTotals()` | Aggregates cumulative Wolf totals across all holes |
| `checkAutoPress(holeIdx)` | Fires auto-press when a team goes 2-down; called on Confirm Hole only |
| `showToast(msg)` | Dismissing notification — auto-removes after 2.5s |
| `fmt(n)` | Formats a number — strips unnecessary decimals |

## Course Data

SJCC (San Jose Country Club, par 70) is hardcoded as the only course. Each hole: `{ num, par, hcp, yds }` where `hcp` is the stroke index (1–18) used for handicap allocation.

## Input Handling Pattern

Name `<input>` fields follow a specific pattern to avoid focus loss on re-render:
- Save state on `input` event
- Trigger `render()` only on `blur`

Numeric inputs (scores, bets) call `render()` immediately on change.

## Scorecard Flow (Nassau/Skins)

- Scores are entered per hole using +/− buttons on the Scorecard tab
- `state.scores[playerName][holeIndex]` stores gross scores (0-indexed holes)
- Nassau and Skins update live as scores are entered — no confirm needed to see results
- **Confirm Hole** button advances to the next hole AND triggers `checkAutoPress()`
- Auto-press only fires on Confirm, never on individual score +/− taps
- **Finish Round** replaces Confirm on hole 18, triggers auto-press then navigates to Summary

## Press Logic

- Every bet (original front/back match or any press) can spawn exactly one auto-press if it goes 2-down
- Tracked via `hasSpawned` boolean on each press object
- Each press has: `{ id, parentPressId, startHole, endHole, segment, bet, auto, hasSpawned }`
- `endHole` is fixed at segment end (index 8 for front, index 17 for back) — presses never cross the turn
- Manual presses do not block auto-press from firing (separate tracking)
- Presses are editable (bet amount) and removable from the Nassau tab
- Removing a press resets `hasSpawned` on its parent so auto-press can re-trigger if needed

## Nassau Payout

- In 2v2, each player on the winning team receives the full bet amount; each player on the losing team pays the full bet amount — no division by team size
- Presses pay out independently from the original bet

## Wolf Game

- 4–5 players, hole by hole
- Each player defaults to PUSH; tap to cycle PUSH → WIN → LOSS → PUSH
- Confirm is always enabled (all-push is a valid outcome)
- Previous Holes tab allows editing any past hole
- `state.wolf.players[]` is a flat array of name strings (not objects)

## Known Issues / Backlog

- Nassau stroke play mode — logic scaffolded but not implemented
- Auto press edge cases at end of front/back 9 not fully stress-tested
- No confirmation screen before ending a round
- No multi-course support — SJCC is hardcoded
- App name / repo name may change (currently `wolf-tracker`, app branded as `SJCC SCORING`)
- No PWA manifest (service worker is in place but no manifest.json for home screen install)
