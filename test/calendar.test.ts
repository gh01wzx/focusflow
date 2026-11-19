import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, daysBetween, localDay, nextOccurrence, validDate } from '../src/shared/calendar.ts';

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

test('month-based dates keep their day and fall on the last day of shorter months', () => {
  assert.equal(nextOccurrence('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextOccurrence('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(nextOccurrence('2028-01-31', 'monthly'), '2028-02-29');
  assert.equal(nextOccurrence('2026-11-30', 'quarterly'), '2027-02-28');
  assert.equal(nextOccurrence('2028-02-29', 'yearly'), '2029-02-28');
  assert.equal(nextOccurrence('2031-02-28', 'yearly', 29), '2032-02-29');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(nextOccurrence('9999-12-01', 'monthly'), null);
});

test('date offsets cross month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-11-16', -14), '2026-11-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(daysBetween('2026-08-01', '2026-11-16'), 107);
  assert.equal(daysBetween('2026-11-16', '2026-11-16'), 0);
});
