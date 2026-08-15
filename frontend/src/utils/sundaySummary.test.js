import { toDateKey, formatDateHeading, collectionDatesInMonth } from './sundaySummary';

describe('toDateKey', () => {
  test('takes the date part of an ISO string', () => {
    expect(toDateKey('2026-08-02')).toBe('2026-08-02');
    expect(toDateKey('2026-08-02T00:00:00.000Z')).toBe('2026-08-02');
  });

  test('reads a Date in local time, not UTC', () => {
    expect(toDateKey(new Date(2026, 7, 2))).toBe('2026-08-02');
  });

  test('returns an empty string for missing values', () => {
    expect(toDateKey(null)).toBe('');
    expect(toDateKey(undefined)).toBe('');
  });
});

describe('formatDateHeading', () => {
  test('renders the message heading format', () => {
    expect(formatDateHeading('2026-08-02')).toBe('AUGUST 02, 2026');
  });

  test('does not shift the day backwards in a UTC+8 timezone', () => {
    // new Date('2026-01-01') would render as December 31 in Manila.
    expect(formatDateHeading('2026-01-01')).toBe('JANUARY 01, 2026');
  });
});

describe('collectionDatesInMonth', () => {
  test('collects one key per distinct date', () => {
    const records = [
      { date: '2026-08-02' },
      { date: '2026-08-02T00:00:00.000Z' },
      { date: '2026-08-09' },
    ];
    expect([...collectionDatesInMonth(records)].sort()).toEqual(['2026-08-02', '2026-08-09']);
  });

  test('returns an empty set for no records', () => {
    expect(collectionDatesInMonth([]).size).toBe(0);
    expect(collectionDatesInMonth(undefined).size).toBe(0);
  });
});
