/* Shared test harness. No dependencies — Node built-ins only.

   The app is a single <script> inside index.html; there is no separate
   engine module. This harness extracts that script and evaluates it in a
   node:vm context against ~60 lines of hand-rolled browser stubs, then
   hands back a `run(code)` escape hatch into the context. Top-level
   `function` declarations (strokesOnHole, computeSkinsState, ...) land on
   the context's globalThis, and module-level `let state` is reachable by
   evaluating `state` inside the context.

   This is a SIMPLIFIED browser: it proves math, sequencing, and no-crash
   properties — not pixels, and not event wiring (attach*Events listeners
   are wired onto inert stubs). Anything visual or tap-driven still gets
   checked in a real browser.                                            */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appSrc = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

/** Boot a fresh app instance against stubs. `storage` seeds localStorage
    (values must be strings, e.g. a pre-serialized tbd_scoring_v2). */
function makeApp({ storage = {} } = {}) {
  const store = new Map(Object.entries(storage));
  const els = new Map();
  const el = id => {
    if (!els.has(id)) els.set(id, {
      id, innerHTML: '', value: '', textContent: '', style: {}, dataset: {},
      scrollTop: 0, className: '',
      setAttribute() {}, getAttribute() { return null; },
      focus() {}, remove() {}, appendChild() {}, insertAdjacentHTML() {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener() {}
    });
    return els.get(id);
  };
  const sandbox = {
    console,
    document: {
      getElementById: el,
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement: () => el('__created-' + Math.random()),
      body: { appendChild() {} },
      documentElement: el('__root'),
      activeElement: null
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    window: { addEventListener() {}, location: { reload() {} } },
    navigator: {},                       // no 'serviceWorker' key → SW branch skipped
    alert() {}, confirm() { return true; },
    // unref'd so pending app timers (toast removal, transitions) never hold the runner open
    setTimeout(fn, ms) { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout,
    Date, Math, JSON
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(appSrc, ctx);          // evaluates all functions, then runs the real boot render()
  const run = code => vm.runInContext(code, ctx);
  /** Replace the whole state object and re-render (transition skipped). */
  const setState = obj => { run(`state = ${JSON.stringify(obj)}; render(true);`); };
  const appHTML = () => run('document.getElementById("app").innerHTML');
  return { run, setState, appHTML, store, html };
}

/** Assert helper: values of an object sum to ~0 (money must be zero-sum). */
function sumValues(obj) {
  return Object.values(obj).reduce((s, v) => s + v, 0);
}

module.exports = { makeApp, sumValues, html };
