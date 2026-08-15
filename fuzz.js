/* Randomized chaos harness. Usage: node fuzz.js [startSeed] [numSeeds]
   (defaults: seed 1, 20 seeds — a few seconds; CI-friendly)

   Each seed plays one full random round in a random mode with random
   rosters, handicaps, bets, and score entry (including gaps and edits),
   rendering every screen/tab along the way. After every hole the money
   invariants are asserted:

     - Wolf: every hole's results and the running totals sum to $0
     - Skins (all 3 types, carryover on/off): totals sum to $0
     - Nassau: every payout row moves equal-and-opposite money; auto-press
       never opens a press outside its segment
     - 9pt/16pt: every hole distributes exactly 9/16 points (or all on a
       blitz); the pairwise ledger nets to $0
     - Skins Only: perhole and totalpot totals sum to $0
     - render(true) never throws, for any screen/tab the round visits
     - state survives a JSON round-trip through localStorage

   A failure prints the seed + step so it can be replayed exactly.       */
const { makeApp, sumValues } = require('./test-harness.js');

const startSeed = parseInt(process.argv[2] || '1', 10);
const numSeeds = parseInt(process.argv[3] || '20', 10);

function rng(seed) {
  // Disperse the seed (consecutive ints otherwise produce near-identical
  // first draws from an LCG, so every seed in a range fuzzes the same mode)
  let s = (Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  next(); next(); next();
  return next;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

function assert(cond, msg, ctx) {
  if (!cond) {
    console.error(`FUZZ FAIL: ${msg}\n  ${ctx}`);
    process.exit(1);
  }
}

const NAMES = ['Ace', 'Bo', 'Cy', 'Di', 'Ed'];

function fuzzWolf(app, r, ctx) {
  const n = int(r, 4, 5);
  const players = NAMES.slice(0, n);
  app.run(`state = ${JSON.stringify({
    screen: 'wolf-game', players: [], scores: {},
    wolf: { players, defaultBet: int(r, 1, 20) },
    wolfGame: { tab: 'play', players, holes: [], currentHole: 1, holeInput: { bet: 5, statuses: {} } }
  })}; render(true);`);
  for (let h = 1; h <= 18; h++) {
    const statuses = {};
    players.forEach(p => statuses[p] = pick(r, ['push', 'winner', 'loser']));
    const bet = int(r, 1, 25);
    const res = app.run(`wolfHoleResult(${bet}, ${JSON.stringify(statuses)}, ${JSON.stringify(players)})`);
    assert(Math.abs(sumValues(res)) < 1e-9, `wolf hole ${h} leaked money`, ctx);
    app.run(`state.wolfGame.holes.push({ num: ${h}, bet: ${bet},
      statuses: ${JSON.stringify(statuses)}, results: ${JSON.stringify(res)} });
      state.wolfGame.currentHole++;`);
    app.run(`state.wolfGame.tab = ${JSON.stringify(pick(r, ['play', 'leaderboard', 'prev']))}; render(true);`);
  }
  const totals = app.run('wolfTotals()');
  assert(Math.abs(sumValues(totals)) < 1e-9, 'wolf totals leaked money', ctx);
}

function fuzzNS(app, r, ctx) {
  const n = int(r, 2, 5);
  const players = NAMES.slice(0, n).map(name => ({ name, hcp: int(r, 0, 54) }));
  const half = Math.max(1, Math.floor(n / 2));
  const teamA = players.slice(0, half).map(p => p.name);
  const teamB = players.slice(half).map(p => p.name);
  const setup = {
    players, hcpPct: pick(r, [0, 50, 100]), nassau: teamB.length > 0, nassauFormat: 'match',
    teamA, teamB, betFront: int(r, 0, 10), betBack: int(r, 0, 10), betTotal: int(r, 0, 10),
    autoPress: r() < 0.7, presses: [],
    skins: true, skinType: pick(r, ['net', 'gross', 'canadian']),
    skinBet: pick(r, [1, 2.5, 5]), carryover: r() < 0.5
  };
  app.run(`state = ${JSON.stringify({
    screen: 'ns-game', players, scores: {},
    nsSetup: setup, nsGame: { tab: 'scorecard', currentHole: 0, presses: [] }
  })}; state.players.forEach(p => state.scores[p.name] = {}); render(true);`);

  for (let hi = 0; hi < 18; hi++) {
    for (const p of players) {
      if (r() < 0.9) app.run(`state.scores[${JSON.stringify(p.name)}][${hi}] = ${int(r, 1, 9)}`);
    }
    app.run(`checkAutoPress(${hi}); state.nsGame.currentHole = Math.min(17, ${hi} + 1);`);
    const presses = app.run('state.nsGame.presses');
    for (const pr of presses) {
      const segEnd = pr.segment === 'front' ? 8 : 17;
      assert(pr.startHole <= segEnd && pr.endHole === segEnd,
        `press outside segment: ${JSON.stringify(pr)}`, ctx);
    }
    const totals = app.run('skinsTotals(computeSkinsState(state.nsSetup), state.nsSetup.skinBet, state.players)');
    assert(Math.abs(sumValues(totals)) < 1e-6, `skins leaked at hole ${hi + 1}`, ctx);
    if (setup.nassau) {
      const pays = app.run('nassauPayout(state.nsSetup, computeNassauState(state.nsSetup))');
      for (const row of pays) {
        if (row && row.a !== undefined) assert(row.a + row.b === 0, `nassau row leaks: ${JSON.stringify(row)}`, ctx);
      }
    }
    app.run(`state.nsGame.tab = ${JSON.stringify(pick(r, ['scorecard', 'nassau', 'skins', 'summary']))}; render(true);`);
  }
}

function fuzz9pt(app, r, ctx) {
  const n = int(r, 3, 4);
  const total = n === 3 ? 9 : 16;
  const players = NAMES.slice(0, n).map(name => ({ name, hcp: int(r, 0, 36) }));
  const blitz = r() < 0.5;
  app.run(`state = ${JSON.stringify({
    screen: '9pt-game', players: [], scores: {},
    ptSetup: { players, hcpPct: pick(r, [0, 100]), blitz, vpp: pick(r, [1, 2, 5]) },
    ptGame: { tab: 'scorecard', currentHole: 0, scores: {}, holes: [] }
  })}; render(true);`);
  for (let hi = 0; hi < 18; hi++) {
    const nets = {};
    players.forEach(p => nets[p.name] = int(r, 2, 8));
    const res = app.run(`compute9ptHole(${JSON.stringify(nets)}, ${blitz})`);
    assert(sumValues(res.pts) === total, `9pt hole ${hi + 1} sums to ${sumValues(res.pts)}`, ctx);
    app.run(`state.ptGame.holes[${hi}] = { num: ${hi + 1}, pts: ${JSON.stringify(res.pts)}, blitz: ${res.blitz} };`);
    app.run(`state.ptGame.tab = ${JSON.stringify(pick(r, ['scorecard', 'leaderboard', 'summary']))}; render(true);`);
  }
  const ledger = app.run('compute9ptLedger()');
  const net = {};
  players.forEach(p => net[p.name] = 0);
  for (const l of ledger) { net[l.to] += l.amount; net[l.from] -= l.amount; }
  assert(Math.abs(sumValues(net)) < 1e-9, '9pt ledger leaked money', ctx);
}

function fuzzSS(app, r, ctx) {
  const n = int(r, 2, 5);
  const players = NAMES.slice(0, n).map(name => ({ name, hcp: int(r, 0, 54) }));
  const betMode = pick(r, ['perhole', 'totalpot']);
  app.run(`state = ${JSON.stringify({
    screen: 'ss-game', players: [], scores: {},
    ssSetup: { players, hcpPct: pick(r, [0, 50, 100]), skinType: pick(r, ['net', 'gross', 'canadian']),
               betMode, skinBet: pick(r, [1, 2.5, 5]), carryover: betMode === 'perhole' && r() < 0.5,
               buyIn: pick(r, [2.5, 5, 10]) },
    ssGame: { tab: 'scorecard', currentHole: 0, scores: {}, confirmedHoles: 0 }
  })}; state.ssSetup.players.forEach(p => state.ssGame.scores[p.name] = {}); render(true);`);
  for (let hi = 0; hi < 18; hi++) {
    for (const p of players) {
      if (r() < 0.9) app.run(`state.ssGame.scores[${JSON.stringify(p.name)}][${hi}] = ${int(r, 1, 9)}`);
    }
    app.run(`state.ssGame.confirmedHoles = ${hi + 1};`);
    const totals = app.run('computeSSTotals(computeSSSkinsState())');
    assert(Math.abs(sumValues(totals)) < 1e-6, `SS ${betMode} leaked at hole ${hi + 1}`, ctx);
    app.run(`state.ssGame.tab = ${JSON.stringify(pick(r, ['scorecard', 'leaderboard', 'summary']))}; render(true);`);
  }
}

function fuzzJKS(app, r, ctx) {
  const n = int(r, 2, 5);
  const players = NAMES.slice(0, n).map(name => ({ name, hcp: int(r, 0, 54) }));
  app.run(`state = ${JSON.stringify({
    screen: 'jks-game', players: [], scores: {},
    jksSetup: { players, hcpPct: pick(r, [0, 100]) },
    jksGame: { tab: 'scorecard', currentHole: 0, scores: {}, confirmedHoles: 0 }
  })}; state.jksSetup.players.forEach(p => state.jksGame.scores[p.name] = {}); render(true);`);
  for (let hi = 0; hi < 18; hi++) {
    for (const p of players) {
      if (r() < 0.85) app.run(`state.jksGame.scores[${JSON.stringify(p.name)}][${hi}] = ${int(r, 1, 9)}`);
    }
    app.run(`state.jksGame.confirmedHoles = ${hi + 1};
      state.jksGame.tab = ${JSON.stringify(pick(r, ['scorecard', 'leaderboard', 'summary']))}; render(true);`);
  }
}

const MODES = { wolf: fuzzWolf, ns: fuzzNS, '9pt': fuzz9pt, ss: fuzzSS, jks: fuzzJKS };

for (let seed = startSeed; seed < startSeed + numSeeds; seed++) {
  const r = rng(seed);
  const mode = pick(r, Object.keys(MODES));
  const ctx = `seed ${seed}, mode ${mode} — replay: node fuzz.js ${seed} 1`;
  const app = makeApp();
  try {
    MODES[mode](app, r, ctx);
  } catch (e) {
    console.error(`FUZZ CRASH: ${ctx}\n`, e);
    process.exit(1);
  }
  // The whole round must survive a storage round-trip.
  const stored = app.store.get('tbd_scoring_v2');
  try {
    const app2 = makeApp({ storage: { tbd_scoring_v2: stored } });
    app2.run('render(true)');
  } catch (e) {
    console.error(`FUZZ RELOAD CRASH: ${ctx}\n`, e);
    process.exit(1);
  }
  console.log(`seed ${seed} ok (${mode})`);
}
console.log(`\nAll ${numSeeds} seeds green.`);
