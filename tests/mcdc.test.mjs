import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { instrument, recorder, report } from './mcdc.mjs';

function measure(expression, vectors) {
  const decisions = [];
  const source = instrument(`if (${expression}) result = true`, 'fixture.js', decisions);
  for (const [a, b, c] of vectors) runInNewContext(source, { a, b, c, __mcdc: recorder(decisions) });
  return report(decisions)[0];
}
test('branch coverage alone does not establish independence', () => {
  assert.deepEqual(measure('a && b', [[false, false], [true, true]]).pairs.map(Boolean), [true, false]);
});
test('short-circuit AND and OR independence pairs', () => {
  for (const expression of ['a && b', 'a || b']) {
    const vectors = expression.includes('&&') ? [[false, true], [true, false], [true, true]] : [[false, false], [false, true], [true, false]];
    assert.deepEqual(measure(expression, vectors).pairs.map(Boolean), [true, true]);
  }
});
test('nested decisions and negation retain independent conditions', () => {
  assert.deepEqual(measure('!(a && b) || c', [[false, true, false], [true, false, false], [true, true, false], [true, true, true]]).pairs.map(Boolean), [true, true, true]);
});
test('instrumentation preserves short circuit and operand evaluation count', () => {
  const decisions = [];
  const source = instrument('if (a() && b()) result = true', 'fixture.js', decisions);
  let calls = 0;
  runInNewContext(source, { a: () => { calls++; return false; }, b: () => { throw Error('must be skipped'); }, __mcdc: recorder(decisions) });
  assert.equal(calls, 1);
  assert.deepEqual(decisions[0].vectors[0].conditions, [false, null]);
});
test('unexecuted and single-outcome decisions fail coverage', () => {
  assert.deepEqual(measure('a', []).pairs, [null]);
  assert.deepEqual(measure('a', [[true]]).pairs, [null]);
});
