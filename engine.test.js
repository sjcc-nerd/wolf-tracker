/* Math/engine tests. Every function that decides money gets locked here:
   handicap allocation, Wolf pots, Nassau matches + auto-press, all three
   skins variants (incl. carryover and totalpot cents), and every 9pt/16pt
   tie shape. Run: node --test                                            */
const test = require('node:test');
const assert = require('node:assert');
const { makeApp, sumValues } = require('./test-harness.js');

// One app per file is fine — each test that touches `state` seeds it fully.
const app = makeApp();
const run = app.run;
const call = (expr) => run(expr);

/* ---------------- strokesOnHole ---------------- */

test('strokesOnHole: scratch and plus-handicaps get 0', () => {
  assert.equal(call('strokesOnHole(0, 1)'), 0);
  assert.equal(call('strokesOnHole(-3, 1)'), 0);
});

test('strokesOnHole: 1-17 gets a stroke on low stroke-index holes only', () => {
  assert.equal(call('strokesOnHole(10, 10)'), 1);
  assert.equal(call('strokesOnHole(10, 11)'), 0);
  assert.equal(call('strokesOnHole(1, 1)'), 1);
  assert.equal(call('strokesOnHole(1, 2)'), 0);
});

test('strokesOnHole: 18 gets exactly 1 everywhere, 36 exactly 2', () => {
  for (let h = 1; h <= 18; h++) {
    assert.equal(call(`strokesOnHole(18, ${h})`), 1, `hcp18 hole ${h}`);
    assert.equal(call(`strokesOnHole(36, ${h})`), 2, `hcp36 hole ${h}`);
  }
});

test('strokesOnHole: 20 = 2 strokes on index 1-2, else 1', () => {
  assert.equal(call('strokesOnHole(20, 2)'), 2);
  assert.equal(call('strokesOnHole(20, 3)'), 1);
});

test('strokesOnHole: above 36 allocates 3 strokes (regression — used to cap at 2)', () => {
  assert.equal(call('strokesOnHole(40, 4)'), 3);
  assert.equal(call('strokesOnHole(40, 5)'), 2);
  assert.equal(call('strokesOnHole(54, 18)'), 3);
});

test('strokesOnHole: hcpPct scales then rounds; pct 0 means no strokes', () => {
  assert.equal(call('strokesOnHole(10, 5, 50)'), 1);   // adj 5
  assert.equal(call('strokesOnHole(10, 6, 50)'), 0);
  assert.equal(call('strokesOnHole(30, 18, 0)'), 0);    // 0% is a real choice, not "default"
});

test('any handicap/pct combo allocates total strokes == adjusted handicap', () => {
  for (const hcp of [0, 1, 7, 17, 18, 19, 25, 36, 37, 45, 54]) {
    for (const pct of [0, 50, 100]) {
      const adj = Math.round(hcp * pct / 100);
      let total = 0;
      for (let h = 1; h <= 18; h++) total += call(`strokesOnHole(${hcp}, ${h}, ${pct})`);
      assert.equal(total, Math.max(0, adj), `hcp ${hcp} pct ${pct}`);
    }
  }
});

/* ---------------- numOr / fmt ---------------- */

test('numOr: 0 and negatives parse as themselves; garbage falls back', () => {
  assert.equal(call('numOr("0", 100)'), 0);            // the hcpPct-0 regression
  assert.equal(call('numOr("-5", 1)'), -5);
  assert.equal(call('numOr("", 7)'), 7);
  assert.equal(call('numOr("abc", 7)'), 7);
  assert.equal(call('numOr("2.5", 7)'), 2.5);
});

test('fmt strips whole-number decimals, keeps cents', () => {
  assert.equal(call('fmt(5)'), 5);
  assert.equal(call('fmt(2.5)'), '2.50');
});

/* ---------------- Wolf ---------------- */

/* Wolf payout rule: every winner collects AT LEAST the full hole value and
   every loser pays AT LEAST the full hole value; the smaller side absorbs
   the difference (transfer = max(W, L) x bet, split evenly per side). */

test('wolfHoleResult: 1 winner, N losers — winner collects from every loser', () => {
  const r = call(`wolfHoleResult(5, {A:'winner',B:'loser',C:'loser',D:'push'}, ['A','B','C','D'])`);
  assert.deepEqual(r, { A: 10, B: -5, C: -5, D: 0 });
});

test('wolfHoleResult: winners outnumber losers — losers pay extra so each winner gets the full bet', () => {
  // The 3W vs 2L case: winners must NOT be diluted to $3.33.
  const r = call(`wolfHoleResult(5, {A:'winner',B:'winner',C:'winner',D:'loser',E:'loser'}, ['A','B','C','D','E'])`);
  assert.deepEqual(r, { A: 5, B: 5, C: 5, D: -7.5, E: -7.5 });
});

test('wolfHoleResult: 2 winners vs 1 loser — lone loser covers both winners', () => {
  const r = call(`wolfHoleResult(5, {A:'winner',B:'winner',C:'loser',D:'push'}, ['A','B','C','D'])`);
  assert.deepEqual(r, { A: 5, B: 5, C: -10, D: 0 });
});

test('wolfHoleResult: everyone always moves at least the full bet', () => {
  const S = ['push', 'winner', 'loser'];
  for (const a of S) for (const b of S) for (const c of S) for (const d of S) {
    const st = { A: a, B: b, C: c, D: d };
    const hasW = Object.values(st).includes('winner'), hasL = Object.values(st).includes('loser');
    if (!hasW || !hasL) continue;
    const r = call(`wolfHoleResult(5, ${JSON.stringify(st)}, ['A','B','C','D'])`);
    for (const [p, s] of Object.entries(st)) {
      if (s === 'winner') assert.ok(r[p] >= 5, `winner ${p} got $${r[p]} in ${JSON.stringify(st)}`);
      if (s === 'loser') assert.ok(r[p] <= -5, `loser ${p} paid $${-r[p]} in ${JSON.stringify(st)}`);
    }
  }
});

test('wolfHoleResult: no winners (or no losers) moves no money', () => {
  const r1 = call(`wolfHoleResult(5, {A:'loser',B:'push',C:'push',D:'push'}, ['A','B','C','D'])`);
  assert.equal(sumValues(r1), 0);
  assert.deepEqual(r1, { A: 0, B: 0, C: 0, D: 0 });
  const r2 = call(`wolfHoleResult(5, {A:'winner',B:'push',C:'push',D:'push'}, ['A','B','C','D'])`);
  assert.deepEqual(r2, { A: 0, B: 0, C: 0, D: 0 });
});

test('wolfHoleResult: zero-sum across ALL 81 status combinations', () => {
  const S = ['push', 'winner', 'loser'];
  for (const a of S) for (const b of S) for (const c of S) for (const d of S) {
    const r = call(`wolfHoleResult(7, ${JSON.stringify({ A: a, B: b, C: c, D: d })}, ['A','B','C','D'])`);
    assert.ok(Math.abs(sumValues(r)) < 1e-9, `${a},${b},${c},${d} leaked money`);
  }
});

test('wolfTotals aggregates per-hole results against the game roster snapshot', () => {
  run(`state = { screen:'wolf-game',
    wolf: { players:['A','B'], defaultBet:5 },
    wolfGame: { players:['A','B'], holes:[
      { num:1, bet:5, statuses:{}, results:{A:5,B:-5} },
      { num:2, bet:5, statuses:{}, results:{A:-3,B:3} } ] } }`);
  assert.deepEqual(call('wolfTotals()'), { A: 2, B: -2 });
});

/* ---------------- 9pt / 16pt ---------------- */

function pts9(nets, blitz = false) {
  return call(`compute9ptHole(${JSON.stringify(nets)}, ${blitz})`);
}

test('9pt: every 3-player tie shape sums to 9 and matches the house table', () => {
  assert.deepEqual(pts9({ A: 3, B: 4, C: 5 }).pts, { A: 5, B: 3, C: 1 });   // distinct 5-3-1
  assert.deepEqual(pts9({ A: 3, B: 3, C: 5 }).pts, { A: 4, B: 4, C: 1 });   // tie 1st 4-4-1
  assert.deepEqual(pts9({ A: 3, B: 5, C: 5 }).pts, { A: 5, B: 2, C: 2 });   // tie 2nd 5-2-2
  assert.deepEqual(pts9({ A: 4, B: 4, C: 4 }).pts, { A: 3, B: 3, C: 3 });   // all tie 3-3-3
});

test('16pt: every 4-player tie shape sums to 16 and matches the house table', () => {
  assert.deepEqual(pts9({ A: 1, B: 2, C: 3, D: 4 }).pts, { A: 7, B: 5, C: 3, D: 1 }); // 7-5-3-1
  assert.deepEqual(pts9({ A: 1, B: 1, C: 2, D: 3 }).pts, { A: 6, B: 6, C: 3, D: 1 }); // 6-6-3-1
  assert.deepEqual(pts9({ A: 1, B: 2, C: 2, D: 3 }).pts, { A: 7, B: 4, C: 4, D: 1 }); // 7-4-4-1
  assert.deepEqual(pts9({ A: 1, B: 2, C: 3, D: 3 }).pts, { A: 7, B: 5, C: 2, D: 2 }); // 7-5-2-2
  assert.deepEqual(pts9({ A: 1, B: 1, C: 2, D: 2 }).pts, { A: 6, B: 6, C: 2, D: 2 }); // 6-6-2-2
  assert.deepEqual(pts9({ A: 1, B: 1, C: 1, D: 2 }).pts, { A: 5, B: 5, C: 5, D: 1 }); // 5-5-5-1
  assert.deepEqual(pts9({ A: 1, B: 2, C: 2, D: 2 }).pts, { A: 7, B: 3, C: 3, D: 3 }); // 7-3-3-3
  assert.deepEqual(pts9({ A: 2, B: 2, C: 2, D: 2 }).pts, { A: 4, B: 4, C: 4, D: 4 }); // 4-4-4-4
});

test('9pt/16pt exhaustive sweep: points always sum to 9/16, ties equal, better never fewer', () => {
  const sweep = (names, total) => {
    const vals = [3, 4, 5, 6];
    const combos = (i, acc) => {
      if (i === names.length) {
        const nets = {}; names.forEach((n, k) => nets[n] = acc[k]);
        const { pts, blitz } = pts9(nets);
        assert.equal(sumValues(pts), total, JSON.stringify(nets));
        assert.equal(blitz, false);
        for (const x of names) for (const y of names) {
          if (nets[x] === nets[y]) assert.equal(pts[x], pts[y], `tied nets, unequal pts: ${JSON.stringify(nets)}`);
          if (nets[x] < nets[y]) assert.ok(pts[x] >= pts[y], `worse net outscored better: ${JSON.stringify(nets)}`);
        }
        return;
      }
      for (const v of vals) combos(i + 1, [...acc, v]);
    };
    combos(0, []);
  };
  sweep(['A', 'B', 'C'], 9);
  sweep(['A', 'B', 'C', 'D'], 16);
});

test('blitz: win by 2+ net takes every point; margin 1 does not', () => {
  assert.deepEqual(pts9({ A: 3, B: 5, C: 6 }, true), { pts: { A: 9, B: 0, C: 0 }, blitz: true });
  assert.deepEqual(pts9({ A: 3, B: 5, C: 5, D: 6 }, true).pts, { A: 16, B: 0, C: 0, D: 0 });
  assert.equal(pts9({ A: 3, B: 4, C: 6 }, true).blitz, false);
  assert.equal(sumValues(pts9({ A: 3, B: 4, C: 6 }, true).pts), 9);
});

test('9pt ledger is pairwise and matches the leaderboard formula n*(pts-avg)*vpp', () => {
  run(`state = { screen:'9pt-game',
    ptSetup: { players:[{name:'A',hcp:0},{name:'B',hcp:0},{name:'C',hcp:0}], hcpPct:100, blitz:false, vpp:2 },
    ptGame: { holes:[ { num:1, pts:{A:5,B:3,C:1} }, { num:2, pts:{A:4,B:4,C:1} } ] } }`);
  const totals = call('compute9ptTotals()');
  assert.deepEqual(totals, { A: 9, B: 7, C: 2 });
  const ledger = call('compute9ptLedger()');
  // pairwise: B->A (9-7)*2=4, C->A (9-2)*2=14, C->B (7-2)*2=10
  assert.deepEqual(ledger, [
    { from: 'B', to: 'A', amount: 4 },
    { from: 'C', to: 'A', amount: 14 },
    { from: 'C', to: 'B', amount: 10 }
  ]);
  // leaderboard formula equivalence (the 1/n display bug regression)
  const n = 3, vpp = 2, totalPts = 18;
  for (const p of ['A', 'B', 'C']) {
    const formula = (totals[p] - totalPts / n) * vpp * n;
    const fromLedger = ledger.filter(l => l.to === p).reduce((s, l) => s + l.amount, 0)
                     - ledger.filter(l => l.from === p).reduce((s, l) => s + l.amount, 0);
    assert.equal(formula, fromLedger, p);
  }
});

/* ---------------- Skins (Nassau+Skins engine) ---------------- */

// Seed a Nassau/Skins state. scoresByHole: { name: [h1, h2, ...] } gross scores.
function seedNS(scoresByHole, setup = {}) {
  const names = Object.keys(scoresByHole);
  const players = names.map(n => ({ name: n, hcp: (setup.hcps || {})[n] || 0 }));
  const scores = {};
  names.forEach(n => {
    scores[n] = {};
    scoresByHole[n].forEach((g, i) => { if (g != null) scores[n][i] = g; });
  });
  run(`state = ${JSON.stringify({
    screen: 'ns-game',
    players, scores,
    nsSetup: {
      players, hcpPct: setup.hcpPct ?? 100,
      nassau: setup.nassau ?? false, nassauFormat: 'match',
      teamA: setup.teamA || [], teamB: setup.teamB || [],
      betFront: 5, betBack: 5, betTotal: 5, autoPress: setup.autoPress ?? true, presses: [],
      skins: true, skinType: setup.skinType || 'net', skinBet: setup.skinBet ?? 5,
      carryover: setup.carryover ?? false
    },
    nsGame: { tab: 'scorecard', currentHole: 0, presses: [] }
  })}`);
}

test('net skins: unique low net wins, ties push', () => {
  seedNS({ A: [3, 4], B: [4, 4] });
  const sk = call('computeSkinsState(state.nsSetup)');
  assert.equal(sk[0].winner, 'A');
  assert.equal(sk[1].winner, null);
  assert.ok(sk[1].push);
});

test('net skins: handicap strokes decide (SJCC hole 1 is stroke-index 14)', () => {
  seedNS({ A: [4], B: [4] }, { hcps: { B: 14 } });   // B nets 3
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, 'B');
});

test('gross skins ignore handicaps', () => {
  seedNS({ A: [4], B: [4] }, { hcps: { B: 18 }, skinType: 'gross' });
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, null);
});

test('canadian: lone gross birdie beats a lower net non-birdie', () => {
  // hole 1 par 4. B gross 3 (birdie). A gross 4 with stroke -> net 3. Birdie wins.
  seedNS({ A: [4], B: [3] }, { hcps: { A: 14 }, skinType: 'canadian' });
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, 'B');
});

test('canadian REGRESSION: gross eagle beats strokes-aided gross birdie outright', () => {
  // Both are gross-birdie-or-better; A eagle 2 (net 2), B birdie 3 with stroke (net 2).
  // Equal nets — the old code pushed here. Best GROSS must win.
  seedNS({ A: [2], B: [3] }, { hcps: { B: 14 }, skinType: 'canadian' });
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, 'A');
});

test('canadian: equal gross birdies fall back to net, then push', () => {
  seedNS({ A: [3], B: [3] }, { hcps: { B: 14 }, skinType: 'canadian' });
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, 'B');  // net tiebreak
  seedNS({ A: [3], B: [3] }, { skinType: 'canadian' });
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, null); // full tie -> push
});

test('canadian: no gross birdie -> best net wins', () => {
  seedNS({ A: [5], B: [4] }, { skinType: 'canadian' });
  assert.equal(call('computeSkinsState(state.nsSetup)')[0].winner, 'B');
});

test('carryover: pushed pots accumulate onto the next win', () => {
  seedNS({ A: [4, 4, 3], B: [4, 4, 4] }, { carryover: true });
  const sk = call('computeSkinsState(state.nsSetup)');
  assert.equal(sk[2].winner, 'A');
  assert.equal(sk[2].pot, 3);                    // 2 pushes carried + own
  const totals = call('skinsTotals(computeSkinsState(state.nsSetup), 5, state.players)');
  assert.deepEqual(totals, { A: 15, B: -15 });   // 3 units x $5
});

test('missing scores mark the hole pending, never award a skin', () => {
  seedNS({ A: [4, null], B: [5, 4] });
  const sk = call('computeSkinsState(state.nsSetup)');
  assert.equal(sk[0].winner, 'A');
  assert.ok(sk[1].pending);
  assert.equal(sk[1].winner, null);
});

test('skinsTotals is zero-sum for any winner layout', () => {
  seedNS({ A: [3, 5, 4], B: [4, 3, 4], C: [5, 5, 4] });
  const totals = call('skinsTotals(computeSkinsState(state.nsSetup), 5, state.players)');
  assert.equal(sumValues(totals), 0);
  assert.deepEqual(totals, { A: 5, B: 5, C: -10 });
});

/* ---------------- Nassau match + payout ---------------- */

test('nassau: best-ball net decides holes; diff/status track A-B', () => {
  seedNS({ A: [3, 4], B: [5, 4], C: [4, 3], D: [5, 5] },
         { nassau: true, teamA: ['A', 'B'], teamB: ['C', 'D'] });
  const nr = call('computeNassauState(state.nsSetup)');
  assert.equal(nr.front.holesPlayed, 2);
  assert.equal(nr.front.diff, 0);                 // A wins h1 (3v4), B team... C wins h2 (3v4)
  assert.equal(nr.front.status, 'AS');
});

test('nassau: a missing score freezes the match at that hole (documented limitation)', () => {
  seedNS({ A: [3, 3, 3], B: [5, null, 5], C: [4, 4, 4], D: [5, 5, 5] },
         { nassau: true, teamA: ['A', 'B'], teamB: ['C', 'D'] });
  const nr = call('computeNassauState(state.nsSetup)');
  assert.equal(nr.front.holesPlayed, 1);          // stops at the gap even though h3 is scored
});

test('nassau: stroke format currently computes identically to match (locked until implemented)', () => {
  for (const format of ['match', 'stroke']) {
    seedNS({ A: [3], B: [5], C: [4], D: [5] }, { nassau: true, teamA: ['A', 'B'], teamB: ['C', 'D'] });
    run(`state.nsSetup.nassauFormat = '${format}'`);
    const nr = call('computeNassauState(state.nsSetup)');
    assert.equal(nr.front.diff, 1, format);       // regression: `format` used to destructure undefined
  }
});

test('nassauPayout: each segment pays the winning team, presses pay their own bet', () => {
  seedNS({ A: [3, 3], B: [5, 5], C: [4, 4], D: [5, 5] },
         { nassau: true, teamA: ['A', 'B'], teamB: ['C', 'D'] });
  run(`state.nsGame.presses = [{ id:'p1', parentPressId:null, startHole:1, endHole:8, segment:'front', bet:10, auto:true, hasSpawned:false }]`);
  const pays = call('nassauPayout(state.nsSetup, computeNassauState(state.nsSetup))');
  const front = pays.find(p => p.name === 'Front 9');
  assert.deepEqual({ a: front.a, b: front.b }, { a: 5, b: -5 });
  const press = pays.find(p => p.name.startsWith('Press 1'));
  assert.deepEqual({ a: press.a, b: press.b }, { a: 10, b: -10 });   // press won h2 only, at $10
});

/* ---------------- auto-press ---------------- */

// A-team win = A scores 3, everyone else 4. Tie = everyone 4.
function seedPress(pattern) {   // pattern: array of 'A'|'T' per hole (A wins / tie)
  const mk = w => pattern.map(p => (p === w ? 3 : 4));
  seedNS({ A: mk('A'), B: pattern.map(() => 4), C: pattern.map(() => 4), D: pattern.map(() => 4) },
         { nassau: true, teamA: ['A', 'B'], teamB: ['C', 'D'], autoPress: true });
}

test('auto-press: spawns once at 2-down, starting the next hole', () => {
  seedPress(['A', 'A']);
  run('checkAutoPress(1)');
  const presses = call('state.nsGame.presses');
  assert.equal(presses.length, 1);
  assert.equal(presses[0].startHole, 2);
  assert.equal(presses[0].endHole, 8);
  run('checkAutoPress(1)');                       // idempotent — one root per segment
  assert.equal(call('state.nsGame.presses.length'), 1);
});

test('auto-press: cascades when the press itself goes 2-down', () => {
  // Scores must arrive hole by hole — the press match reads whatever is
  // entered, so pre-seeding future holes would cascade early.
  seedPress(['A', 'A']);
  run('checkAutoPress(1)');
  run(`['A','B','C','D'].forEach(n => { state.scores[n][2] = n==='A' ? 3 : 4; })`);
  run('checkAutoPress(2)');
  assert.equal(call('state.nsGame.presses.length'), 1);   // press only 1-down after h3
  run(`['A','B','C','D'].forEach(n => { state.scores[n][3] = n==='A' ? 3 : 4; })`);
  run('checkAutoPress(3)');
  const presses = call('state.nsGame.presses');
  assert.equal(presses.length, 2);
  assert.equal(presses[1].startHole, 4);
  assert.equal(presses[1].parentPressId, presses[0].id);
  assert.equal(presses[0].hasSpawned, true);
});

test('auto-press: never opens past the segment end', () => {
  seedPress(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'A', 'A']);   // 2-down only after hole 9
  run('checkAutoPress(8)');                       // nextHole 9 > segEnd 8
  assert.equal(call('state.nsGame.presses.length'), 0);
});

test('auto-press: skips a closed-out (mathematically decided) match', () => {
  seedPress(['T', 'T', 'T', 'T', 'T', 'T', 'A', 'A']);        // 2-down, 1 hole left in front
  run('checkAutoPress(7)');                       // diff 2 > remaining 1 -> closed
  assert.equal(call('state.nsGame.presses.length'), 0);
});

test('auto-press: waits until every player has scored the hole', () => {
  seedPress(['A', 'A']);
  run('delete state.scores.D[1]');
  run('checkAutoPress(1)');
  assert.equal(call('state.nsGame.presses.length'), 0);
});

test('auto-press: respects the toggle', () => {
  seedPress(['A', 'A']);
  run('state.nsSetup.autoPress = false');
  run('checkAutoPress(1)');
  assert.equal(call('state.nsGame.presses.length'), 0);
});

/* ---------------- Skins Only ---------------- */

function seedSS(scoresByHole, setup = {}) {
  const names = Object.keys(scoresByHole);
  const players = names.map(n => ({ name: n, hcp: (setup.hcps || {})[n] || 0 }));
  const scores = {};
  names.forEach(n => {
    scores[n] = {};
    scoresByHole[n].forEach((g, i) => { if (g != null) scores[n][i] = g; });
  });
  run(`state = ${JSON.stringify({
    screen: 'ss-game',
    players: [], scores: {},
    ssSetup: {
      players, hcpPct: setup.hcpPct ?? 100, skinType: setup.skinType || 'net',
      betMode: setup.betMode || 'perhole', skinBet: setup.skinBet ?? 5,
      carryover: setup.carryover ?? false, buyIn: setup.buyIn ?? 10
    },
    ssGame: { tab: 'scorecard', currentHole: 0, scores, confirmedHoles: setup.confirmed ?? 18 }
  })}`);
}

test('SS perhole: winners collect from every loser; zero-sum with cents', () => {
  seedSS({ A: [3], B: [4], C: [4] }, { skinBet: 2.5 });
  const totals = call('computeSSTotals(computeSSSkinsState())');
  assert.deepEqual(totals, { A: 5, B: -2.5, C: -2.5 });
  assert.equal(sumValues(totals), 0);
});

test('SS perhole carryover: pushed pots ride onto the next skin', () => {
  seedSS({ A: [4, 3], B: [4, 4] }, { carryover: true });
  const sk = call('computeSSSkinsState()');
  assert.equal(sk[1].pot, 2);
  const totals = call('computeSSTotals(computeSSSkinsState())');
  assert.deepEqual(totals, { A: 10, B: -10 });
});

test('SS totalpot REGRESSION: totals are net P&L (buy-in subtracted), zero-sum', () => {
  // Pot $30. A wins the only 2 skins -> collects 30, net +20; B and C net -10 each.
  seedSS({ A: [3, 3], B: [4, 4], C: [4, 4] }, { betMode: 'totalpot', buyIn: 10 });
  const totals = call('computeSSTotals(computeSSSkinsState())');
  assert.deepEqual(totals, { A: 20, B: -10, C: -10 });
  assert.equal(sumValues(totals), 0);
});

test('SS totalpot: remainder cents go to the player with most skins', () => {
  // Pot $10 (2 x $5), 3 skins won -> 333c each, remainder 1c to A (2 skins vs 1).
  seedSS({ A: [3, 3, 4], B: [4, 4, 3] }, { betMode: 'totalpot', buyIn: 5 });
  const totals = call('computeSSTotals(computeSSSkinsState())');
  assert.equal(totals.A, 1.67);                   // 667c - 500c buy-in
  assert.equal(totals.B, -1.67);                  // 333c - 500c
  assert.equal(sumValues(totals), 0);
});

test('SS totalpot: no skins won yet -> nobody up or down', () => {
  seedSS({ A: [4], B: [4] }, { betMode: 'totalpot', buyIn: 10 });
  assert.deepEqual(call('computeSSTotals(computeSSSkinsState())'), { A: 0, B: 0 });
});

test('SS: pending holes are excluded from totals', () => {
  seedSS({ A: [3, null], B: [4, 4] });
  const totals = call('computeSSTotals(computeSSSkinsState())');
  assert.deepEqual(totals, { A: 5, B: -5 });
});
