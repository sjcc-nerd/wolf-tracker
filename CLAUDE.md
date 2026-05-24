# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development & Deploy

No build step, no dependencies, no package manager. The entire app is `index.html`.

**To develop:** Open `index.html` in a browser (or serve with any static file server). Changes are visible immediately on reload.

**To deploy:** Commit to `main`. GitHub Pages auto-deploys to `https://sjcc-nerd.github.io/tbd-scoring` in ~60 seconds. To bust Safari cache on iPhone, hard-refresh or use a different browser.

## Architecture

Single-file vanilla JS app. All state lives in one `state` object, persisted to `localStorage` on every render under the key `tbd_scoring_v1`.

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
| `saveState()` / `loadState()` | localStorage persistence |
| `strokesOnHole(playerHcp, holeHcp, hcpPct)` | Returns 0, 1, or 2 strokes; supports partial hcp via pct |
| `netScore(gross, playerHcp, holeHcp, hcpPct)` | Gross minus strokes |
| `computeNassauState(ns)` | Returns live match state for front/back/overall + all presses |
| `nassauPayout(ns, nassauResult)` | Returns dollar result per bet segment |
| `computeSkinsState(ss)` | Returns per-hole skins results (net/gross/canadian) |
| `skinsTotals(skinsState, skinBet, players)` | Returns net $ per player for skins |
| `wolfHoleResult(bet, statuses, players)` | Returns $ delta per player for one Wolf hole |
| `wolfTotals()` | Aggregates cumulative Wolf totals across all holes |
| `checkAutoPress(holeIdx)` | Fires auto-press when a team goes 2-down |
| `showToast(msg)` | Dismissing notification — auto-removes after 2.5s |
| `fmt(n)` | Formats a number — strips unnecessary decimals |

## Course Data

SJCC (San Jose Country Club, par 70) is hardcoded as the only course. Each hole: `{ num, par, hcp, yds }` where `hcp` is the stroke index (1–18) used for handicap allocation.

## Input Handling Pattern

Name `<input>` fields follow a specific pattern to avoid focus loss on re-render:
- Save state on `input` event
- Trigger `render()` only on `blur`

Numeric inputs (scores, bets) call `render()` immediately on change.

## Known Issues / Backlog

- Nassau stroke play mode — logic scaffolded but not implemented
- No score editing after advancing holes in Nassau/Skins (edit only available in Wolf via Previous Holes tab)
- Auto press edge cases at end of front/back 9 not fully stress-tested
- Summary tab net totals need validation with real round data
- No confirmation screen before ending a round
- No multi-course support — SJCC is hardcoded
- App name is placeholder "TBD Scoring"
- No PWA manifest
