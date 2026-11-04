import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, nextOccurrence, validDate } from '../src/shared/calendar.ts';

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

test('calendar recurrence handles leap days, year boundaries and the final supported date', () => {
  assert.equal(nextOccurrence('2028-02-28', 'daily'), '2028-02-29');
  assert.equal(nextOccurrence('2028-02-29', 'daily'), '2028-03-01');
  assert.equal(nextOccurrence('2026-12-28', 'weekly'), '2027-01-04');
  assert.equal(nextOccurrence('0099-12-31', 'daily'), '0100-01-01');
  assert.equal(nextOccurrence('9999-12-31', 'daily'), null);
  assert.equal(nextOccurrence('9999-12-28', 'weekly'), null);
});
