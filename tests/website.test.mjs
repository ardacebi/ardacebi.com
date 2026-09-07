import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { instrument, recorder, report } from './mcdc.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decisions = [];
for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  assert.match(match[1], /^https?:\/\//, 'Add local external scripts to the coverage harness before using them');
}
// Event attributes are included in the decision inventory, so new untested
// decisions in an inline handler also fail the gate.
for (const match of html.matchAll(/\bon[a-z]+=("([^"]*)"|'([^']*)')/gi)) {
  instrument(match[2] ?? match[3], 'index.html (event handler)', decisions);
}
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1])).map(m => {
  const prefix = html.slice(0, m.index + m[0].indexOf('>') + 1);
  return instrument('\n'.repeat(prefix.split('\n').length - 1) + m[2], 'index.html', decisions);
});
assert.equal(scripts.length, 2, 'Review coverage scope when adding scripts');

function element(textContent = '') {
  const listeners = new Map(), classes = new Set();
  return { textContent, offsetHeight: 1, classes,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    listenerCount(type) { return listeners.get(type)?.size || 0; }
  };
}
function page({ selection = 'present', dataLayer } = {}) {
  const egg = element('CEO of Computer Networks'), content = element();
  let cleared = 0;
  const context = createContext({ document: { getElementById: id => { assert.equal(id, 'easteregg'); return egg; }, querySelector: selector => { assert.equal(selector, '.content'); return content; } },
    getSelection: () => selection === 'present' ? { removeAllRanges() { cleared++; } } : selection === 'null' ? null : undefined,
    __mcdc: recorder(decisions), ...(dataLayer ? { dataLayer } : {}) });
  context.window = context;
  scripts.forEach(script => runInContext(script, context));
  return { egg, content, context, cleared: () => cleared, click: () => content.dispatch('click') };
}

test('analytics initializes a queue and preserves an existing queue', () => {
  for (const existing of [undefined, [['existing']]]) {
    const p = page({ dataLayer: existing });
    if (existing) assert.equal(p.context.dataLayer, existing);
    const queue = p.context.dataLayer;
    assert.equal(queue.length, existing ? 3 : 2);
    assert.equal(queue.at(-2)[0], 'js');
    assert.equal(queue.at(-1)[0], 'config');
    assert.equal(queue.at(-1)[1], 'G-HT3XXHTMJC');
  }
});

test('click boundaries reveal and swap the Easter egg only at 10 and 20', () => {
  const p = page();
  for (let i = 1; i <= 9; i++) p.click();
  assert.equal(p.egg.classes.size, 0);
  p.click();
  assert.deepEqual([...p.egg.classes].sort(), ['animate-in', 'visible']);
  for (let i = 11; i <= 19; i++) p.click();
  assert.equal(p.egg.classes.has('animate-out'), false);
  p.click();
  assert.equal(p.egg.classes.has('animate-out'), true);
  assert.equal(p.egg.classes.has('animate-in'), false);
  assert.equal(p.egg.textContent, 'CEO of Computer Networks');
  p.egg.dispatch('animationend', { animationName: 'easteregg-in' });
  assert.equal(p.egg.listenerCount('animationend'), 1);
  assert.equal(p.egg.textContent, 'CEO of Computer Networks');
  p.egg.dispatch('animationend', { animationName: 'easteregg-out' });
  assert.equal(p.egg.textContent, 'CEO of VLSM Subnetting, FLSM, Symmetric Asymmetric cryptography, Security protocols, DHCP, MAC table, TCP/UDP, NAT, Socket programming');
  assert.deepEqual([...p.egg.classes].sort(), ['animate-in', 'visible']);
  assert.equal(p.egg.listenerCount('animationend'), 0);
  p.click();
  assert.equal(p.egg.listenerCount('animationend'), 0);
  assert.equal(p.cleared(), 21);
});

test('selection can be present, null or undefined; mousedown prevents default', () => {
  for (const selection of ['present', 'null', 'undefined']) {
    const p = page({ selection });
    p.click();
    assert.equal(p.cleared(), selection === 'present' ? 1 : 0);
    let prevented = false;
    p.content.dispatch('mousedown', { preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
});

after(() => {
  const results = report(decisions);
  assert.ok(results.length > 0, 'No decisions found');
  const total = results.reduce((n, d) => n + d.conditions.length, 0);
  const covered = results.reduce((n, d) => n + d.pairs.filter(Boolean).length, 0);
  mkdirSync(new URL('../coverage/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../coverage/mcdc.json', import.meta.url), JSON.stringify({ covered, total, percent: covered / total * 100, decisions: results }, null, 2) + '\n');
  for (const d of results) console.log(`${d.filename}:${d.line} ${d.pairs.filter(Boolean).length}/${d.conditions.length} ${d.expression}`);
  console.log(`MC/DC: ${covered}/${total} conditions (${covered / total * 100}%)`);
  assert.equal(covered, total, 'MC/DC must be 100%; inspect coverage/mcdc.json for missing independence pairs');
});
