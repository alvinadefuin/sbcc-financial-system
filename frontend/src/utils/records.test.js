import { referenceOf, sortRecords, formatSubmittedAt } from './records';

const MANILA = { timeZone: 'Asia/Manila' };

const rec = (over = {}) => ({
  entryType: 'collection',
  control_number: '2026-001',
  created_at: '2026-08-16T04:41:33.270Z',
  date: '2026-08-16',
  ...over,
});

describe('referenceOf', () => {
  test('a collection uses control_number', () => {
    expect(referenceOf(rec())).toBe('2026-001');
  });

  test('an expense uses forms_number even when a control_number is present', () => {
    const e = rec({ entryType: 'expense', forms_number: 'F-01' });
    expect(referenceOf(e)).toBe('F-01');
  });

  test('an explicit type argument wins, for callers that track type separately', () => {
    // The desktop table knows the type from its active tab, not from the row.
    expect(referenceOf({ forms_number: 'F-02' }, 'expense')).toBe('F-02');
  });

  test('a record with no reference gives an empty string, never undefined', () => {
    expect(referenceOf({ entryType: 'collection' })).toBe('');
  });
});

describe('sortRecords by submitted time', () => {
  const early = rec({ control_number: '2026-001', created_at: '2026-08-16T04:41:00.000Z' });
  const mid = rec({ control_number: '2026-002', created_at: '2026-08-16T04:47:00.000Z' });
  const late = rec({ control_number: '2026-003', created_at: '2026-08-16T04:50:00.000Z' });

  test('defaults to newest first', () => {
    const out = sortRecords([early, late, mid], {});
    expect(out.map((r) => r.control_number)).toEqual(['2026-003', '2026-002', '2026-001']);
  });

  test('ascending reverses it', () => {
    const out = sortRecords([late, early, mid], { key: 'submitted', direction: 'asc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-001', '2026-002', '2026-003']);
  });

  test('does not mutate the input array', () => {
    const input = [late, early];
    sortRecords(input, {});
    expect(input[0]).toBe(late);
  });

  test('identical timestamps break the tie on reference, ascending', () => {
    const a = rec({ control_number: '2026-009', created_at: '2026-08-16T04:41:00.000Z' });
    const b = rec({ control_number: '2026-004', created_at: '2026-08-16T04:41:00.000Z' });
    expect(sortRecords([a, b], {}).map((r) => r.control_number)).toEqual(['2026-004', '2026-009']);
  });

  test('the tie-break stays ascending when the direction flips, so equal rows never reshuffle', () => {
    const a = rec({ control_number: '2026-009', created_at: '2026-08-16T04:41:00.000Z' });
    const b = rec({ control_number: '2026-004', created_at: '2026-08-16T04:41:00.000Z' });
    const asc = sortRecords([a, b], { direction: 'asc' }).map((r) => r.control_number);
    const desc = sortRecords([a, b], { direction: 'desc' }).map((r) => r.control_number);
    expect(asc).toEqual(desc);
  });

  test('a legacy row with no created_at falls back to its collection date', () => {
    const legacy = rec({ control_number: '2026-000', created_at: undefined, date: '2020-01-01' });
    const out = sortRecords([legacy, early], { direction: 'desc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-001', '2026-000']);
  });

  test('a row with neither timestamp sorts last in both directions', () => {
    const orphan = rec({ control_number: '2026-999', created_at: undefined, date: undefined });
    expect(sortRecords([orphan, early], { direction: 'desc' })[1]).toBe(orphan);
    expect(sortRecords([orphan, early], { direction: 'asc' })[1]).toBe(orphan);
  });
});

describe('sortRecords by reference', () => {
  test('zero padding makes a plain string compare correct past ten', () => {
    const two = rec({ control_number: '2026-002' });
    const ten = rec({ control_number: '2026-010' });
    const out = sortRecords([ten, two], { key: 'reference', direction: 'asc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-002', '2026-010']);
  });

  test('descending reverses it', () => {
    const two = rec({ control_number: '2026-002' });
    const ten = rec({ control_number: '2026-010' });
    const out = sortRecords([two, ten], { key: 'reference', direction: 'desc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-010', '2026-002']);
  });

  test('a missing reference sorts last in both directions', () => {
    const none = rec({ control_number: undefined, created_at: '2026-08-16T09:00:00.000Z' });
    const some = rec({ control_number: '2026-001' });
    expect(sortRecords([none, some], { key: 'reference', direction: 'asc' })[1]).toBe(none);
    expect(sortRecords([none, some], { key: 'reference', direction: 'desc' })[1]).toBe(none);
  });

  test('an explicit type sorts expenses on forms_number', () => {
    const a = { forms_number: 'F-02', created_at: '2026-08-16T04:00:00.000Z' };
    const b = { forms_number: 'F-01', created_at: '2026-08-16T05:00:00.000Z' };
    const out = sortRecords([a, b], { key: 'reference', direction: 'asc', type: 'expense' });
    expect(out.map((r) => r.forms_number)).toEqual(['F-01', 'F-02']);
  });
});

describe('formatSubmittedAt', () => {
  // created_at is `timestamp without time zone`. The pg driver parses it in the
  // Node process's zone (UTC on Vercel), so the client gets a UTC instant. If
  // that ever changes, Manila renders eight hours out and this test catches it.
  test('a UTC instant reads as Manila local time', () => {
    expect(formatSubmittedAt(rec(), MANILA)).toBe('Aug 16, 2026 · 12:41 PM');
  });

  test('falls back to the collection date, with no time, when created_at is absent', () => {
    expect(formatSubmittedAt(rec({ created_at: undefined }), MANILA)).toBe('Aug 16, 2026');
  });

  test('an unparseable value gives a dash rather than "Invalid Date"', () => {
    expect(formatSubmittedAt({ created_at: 'not-a-date', date: undefined }, MANILA)).toBe('—');
  });

  test('a null entry gives a dash', () => {
    expect(formatSubmittedAt(null, MANILA)).toBe('—');
  });
});
