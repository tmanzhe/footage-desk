import assert from 'node:assert/strict';
import { moveTrimHandle } from './trim.js';

assert.deepEqual(moveTrimHandle(10, 2, 8, 'in', -5), { in: 0, out: 8 });
assert.deepEqual(moveTrimHandle(10, 2, 8, 'out', 15), { in: 2, out: 10 });
assert.deepEqual(moveTrimHandle(10, 2, 8, 'in', 9), { in: 7.9, out: 8 });
assert.deepEqual(moveTrimHandle(10, 2, 8, 'out', 1), { in: 2, out: 2.1 });
for (const duration of [.05, .3, 2.968756, 120]) {
  for (const edge of ['in', 'out']) {
    for (const value of [-100, 0, duration / 2, duration, duration + 100]) {
      const selection = moveTrimHandle(duration, 0, duration, edge, value);
      assert.ok(selection.in >= 0);
      assert.ok(selection.out <= duration + 1e-9);
      assert.ok(selection.out - selection.in >= Math.min(.1, duration) - 1e-9);
    }
  }
}
console.log('Trim handles stay inside the clip and cannot cross.');
