import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, validDate } from '../src/tasks/model.ts';

test('local calendar day follows Auckland midnight and DST rather than UTC date slicing', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Pacific/Auckland';
  try {
    assert.equal(localDay(new Date('2026-11-03T11:30:00Z')), '2026-11-04');
    assert.equal(localDay(new Date('2026-09-26T13:30:00Z')), '2026-09-27');
    assert.equal(localDay(new Date('2026-09-26T14:30:00Z')), '2026-09-27');
    assert.equal(validDate('2028-02-29'), true); assert.equal(validDate('2026-02-29'), false);
    assert.equal(validDate('0000-01-01'), false); assert.equal(validDate('2026-13-01'), false);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
