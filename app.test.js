/* App-layer tests. engine.test.js covers the math; THIS file covers what
   the math can't see: boot against empty/corrupt storage, every screen
   rendering against hostile state without throwing, the display
   regressions found in the 2026-08 stress test (missing minus signs,
   malformed checked attribute, Hole 19 of 18), and the mobile invariants
   that only show up on a real phone. Run: node --test                   */
const test = require('node:test');
const assert = require('node:assert');
const { makeApp, html } = require('./test-harness.js');

/* ---------------- boot ---------------- */

test('boots to home against empty storage', () => {
  const app = makeApp();
  assert.ok(app.appHTML().includes('Select Game'));
  assert.ok(app.appHTML().includes('<h3>Wolf</h3>'));
  assert.equal(app.run('state.screen'), 'home');
});

test('boots clean when localStorage holds corrupt JSON', () => {
  const app = makeApp({ storage: { tbd_scoring_v2: '{not json!!' } });
  assert.equal(app.run('state.screen'), 'home');
});

test('resumes a saved game from storage', () => {
  const saved = JSON.stringify({
    screen: 'wolf-game', players: [], scores: {},
    wolf: { players: ['A', 'B', 'C', 'D'], defaultBet: 5 },
    wolfGame: { tab: 'play', players: ['A', 'B', 'C', 'D'], holes: [], currentHole: 7,
                holeInput: { bet: 5, statuses: { A: 'push', B: 'push', C: 'push', D: 'push' } } },
    wolfSaved: true
  });
  const app = makeApp({ storage: { tbd_scoring_v2: saved } });
  assert.ok(app.appHTML().includes('Hole 7'));
});

test('state survives a save/load round-trip through storage', () => {
  const app = makeApp();
  app.run('state.screen = "ns-setup"; render(true);');
  const stored = app.store.get('tbd_scoring_v2');
  const app2 = makeApp({ storage: { tbd_scoring_v2: stored } });
  assert.equal(app2.run('state.screen'), 'ns-setup');
});

/* ---------------- every screen renders against hostile state ---------------- */

// Minimal-but-plausible states: sparse scores, empty rosters where the UI
// allows reaching the screen, missing optional fields.
const screens = {
  'home': {},
  'wolf-setup': { wolf: { players: ['', '', '', ''], defaultBet: 5 } },
  'wolf-game': {
    wolf: { players: ['A', 'B', 'C', 'D'], defaultBet: 5 },
    wolfGame: { tab: 'play', players: ['A', 'B', 'C', 'D'], holes: [], currentHole: 1,
                holeInput: { bet: 5, statuses: {} } }
  },
  'ns-setup': {},
  'ns-game': {
    players: [{ name: 'A', hcp: 0 }, { name: 'B', hcp: 54 }],
    scores: { A: { 0: 4 } },                       // B never scored; sparse is normal
    nsSetup: { players: [{ name: 'A', hcp: 0 }, { name: 'B', hcp: 54 }], hcpPct: 100,
               nassau: true, nassauFormat: 'match', teamA: ['A'], teamB: ['B'],
               betFront: 5, betBack: 5, betTotal: 5, autoPress: true, presses: [],
               skins: true, skinType: 'net', skinBet: 5, carryover: false },
    nsGame: { tab: 'scorecard', currentHole: 0, presses: [] }
  },
  '9pt-setup': {},
  '9pt-game': {
    ptSetup: { players: [{ name: 'A', hcp: 0 }, { name: 'B', hcp: 0 }, { name: 'C', hcp: 0 }],
               hcpPct: 100, blitz: true, vpp: 1 },
    ptGame: { tab: 'scorecard', currentHole: 0, scores: {}, holes: [] }
  },
  'ss-setup': {},
  'ss-game': {
    ssSetup: { players: [{ name: 'A', hcp: 0 }, { name: 'B', hcp: 0 }], hcpPct: 100,
               skinType: 'canadian', betMode: 'totalpot', skinBet: 5, carryover: false, buyIn: 10 },
    ssGame: { tab: 'scorecard', currentHole: 0, scores: {}, confirmedHoles: 0 }
  },
  'jks-setup': {},
  'jks-game': {
    jksSetup: { players: [{ name: 'A', hcp: 9 }], hcpPct: 100 },
    jksGame: { tab: 'scorecard', currentHole: 0, scores: {}, confirmedHoles: 0 }
  }
};

for (const [screen, extra] of Object.entries(screens)) {
  test(`renders '${screen}' without throwing`, () => {
    const app = makeApp();
    app.setState({ screen, players: [], scores: {}, ...extra });
    assert.ok(app.appHTML().length > 100, 'rendered something substantial');
  });
}

test('every game screen renders every tab without throwing', () => {
  const tabsByScreen = {
    'wolf-game': ['play', 'leaderboard', 'prev'],
    'ns-game': ['scorecard', 'nassau', 'skins', 'summary'],
    '9pt-game': ['scorecard', 'leaderboard', 'summary'],
    'ss-game': ['scorecard', 'leaderboard', 'summary'],
    'jks-game': ['scorecard', 'leaderboard', 'summary']
  };
  const gameKey = { 'wolf-game': 'wolfGame', 'ns-game': 'nsGame', '9pt-game': 'ptGame',
                    'ss-game': 'ssGame', 'jks-game': 'jksGame' };
  for (const [screen, tabs] of Object.entries(tabsByScreen)) {
    const app = makeApp();
    for (const tab of tabs) {
      const st = JSON.parse(JSON.stringify({ screen, players: [], scores: {}, ...screens[screen] }));
      st[gameKey[screen]].tab = tab;
      app.setState(st);
      assert.ok(app.appHTML().length > 100, `${screen}/${tab}`);
    }
  }
});

/* ---------------- stress-test regressions (display layer) ---------------- */

test('REGRESSION: Wolf past hole 18 shows Round Complete, not "Hole 19 of 18"', () => {
  const app = makeApp();
  const st = JSON.parse(JSON.stringify(screens['wolf-game']));
  st.wolfGame.currentHole = 19;
  app.setState({ screen: 'wolf-game', players: [], scores: {}, ...st });
  assert.ok(app.appHTML().includes('Round Complete'));
  assert.ok(!app.appHTML().includes('Hole 19'));
});

test('REGRESSION: negative money renders with an explicit minus sign everywhere', () => {
  // NS summary: A sweeps skins, B pays. B's row must carry a − sign.
  const app = makeApp();
  const st = JSON.parse(JSON.stringify(screens['ns-game']));
  st.scores = { A: { 0: 3 }, B: { 0: 5 } };
  st.nsSetup.nassau = false;
  st.nsGame.tab = 'summary';
  app.setState({ screen: 'ns-game', ...st });
  assert.ok(app.appHTML().includes('−$5'), 'NS summary shows −$5 for the loser');

  // 9pt summary standings: last place must show −$
  const app2 = makeApp();
  const pt = JSON.parse(JSON.stringify(screens['9pt-game']));
  pt.ptGame.tab = 'summary';
  pt.ptGame.holes = [{ num: 1, pts: { A: 5, B: 3, C: 1 } }];
  app2.setState({ screen: '9pt-game', players: [], scores: {}, ...pt });
  assert.ok(app2.appHTML().includes('−$'), '9pt summary shows − for money owed');
});

test('REGRESSION: Skins Only carryover toggle renders a well-formed checked attribute', () => {
  const app = makeApp();
  app.setState({
    screen: 'ss-setup', players: [], scores: {},
    ssSetup: { players: [{ name: '', hcp: 0 }, { name: '', hcp: 0 }], hcpPct: 100,
               skinType: 'net', betMode: 'perhole', skinBet: 5, carryover: true, buyIn: 10 }
  });
  assert.ok(app.appHTML().includes('id="ss-carryover" checked/>'), 'checked attr present');
  assert.ok(!app.appHTML().includes('checked"'), 'no malformed checked" attribute');
});

test('REGRESSION: SS totalpot summary shows net P&L and per-winner pot collection', () => {
  const app = makeApp();
  const st = JSON.parse(JSON.stringify(screens['ss-game']));
  st.ssGame.tab = 'summary';
  st.ssGame.scores = { A: { 0: 3 }, B: { 0: 4 } };
  st.ssGame.confirmedHoles = 1;
  app.setState({ screen: 'ss-game', players: [], scores: {}, ...st });
  const out = app.appHTML();
  assert.ok(out.includes('+$10'), 'A net +10 (collects 20 pot minus 10 buy-in)');
  assert.ok(out.includes('−$10'), 'B net −10 with minus sign');
  assert.ok(out.includes('collects'), 'payout card labels pot collection');
});

test('REGRESSION: 9pt leaderboard dollars equal the pairwise ledger, not 1/n of it', () => {
  const app = makeApp();
  const pt = JSON.parse(JSON.stringify(screens['9pt-game']));
  pt.ptGame.tab = 'leaderboard';
  pt.ptGame.holes = [{ num: 1, pts: { A: 5, B: 3, C: 1 } }];
  app.setState({ screen: '9pt-game', players: [], scores: {}, ...pt });
  // pairwise: A nets (5-3)+(5-1) = +6, not +2
  assert.ok(app.appHTML().includes('+$6'), 'leaderboard shows the real settlement');
});

test('REGRESSION: JKS leaderboard scores each player against their own scored holes', () => {
  const app = makeApp();
  app.setState({
    screen: 'jks-game', players: [], scores: {},
    jksSetup: { players: [{ name: 'A', hcp: 0 }, { name: 'B', hcp: 0 }], hcpPct: 100 },
    jksGame: { tab: 'leaderboard', currentHole: 2, confirmedHoles: 2,
               scores: { A: { 0: 4, 1: 4 }, B: { 0: 4 } } }   // B missed hole 2 (par 4)
  });
  const out = app.appHTML();
  // A: 8 vs par 8 -> E. B: 4 vs par 4 (their own holes) -> E, NOT -4.
  assert.ok(!out.includes('-4'), 'B must not look 4 under from a missing hole');
});

test('transition overlay: a throwing render cannot leave the overlay stuck', () => {
  const app = makeApp();
  // Run the transition's timers synchronously, capturing the doRender throw.
  app.run('globalThis.setTimeout = fn => { try { fn(); } catch (e) { globalThis.__timerErr = e; } return 0; }');
  app.run('state = { screen: "wolf-game" }');      // wolfGame undefined -> doRender throws
  app.run('render()');                             // screen change -> transition path
  assert.ok(app.run('globalThis.__timerErr'), 'the bad render really did throw');
  // The try/finally must still have run the fade-out chain:
  assert.equal(app.run('_transitioning'), false);
});

/* ---------------- mobile invariants (each one has bitten on a real phone) ---------------- */

test('mobile invariants: meta tags, touch handling, safe areas, thumb targets', () => {
  assert.ok(html.includes('viewport-fit=cover'), 'safe-area insets need viewport-fit=cover');
  assert.ok(html.includes('name="theme-color"'), 'browser chrome matches the dark theme');
  assert.ok(html.includes('apple-mobile-web-app-capable'), 'iOS standalone meta');
  assert.ok(html.includes('touch-action: manipulation'), 'no 300ms tap delay / double-tap zoom');
  assert.ok(html.includes('env(safe-area-inset-bottom'), 'content clears the home indicator');
  assert.ok(/\.sc-btn\s*\{[^}]*width:\s*42px/.test(html), 'score buttons stay thumb-sized');
  assert.ok(html.includes('-webkit-tap-highlight-color: transparent'), 'no gray tap flash');
});

test('service worker paths are scope-relative (work locally AND on GitHub Pages)', () => {
  assert.ok(html.includes("register('sw.js')"), 'registration is relative');
  const sw = require('node:fs').readFileSync(require('node:path').join(__dirname, 'sw.js'), 'utf8');
  assert.ok(!/'\/wolf-tracker\//.test(sw), 'no hardcoded repo mount path in sw.js');
});
