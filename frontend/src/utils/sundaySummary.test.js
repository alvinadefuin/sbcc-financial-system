import {
  toDateKey,
  formatDateHeading,
  collectionDatesInMonth,
  buildSummary,
} from './sundaySummary';

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

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_label: 'Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  { field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 },
  { field_name: 'sisterhood_san_juan', field_label: 'Sisterhood San Juan', field_type: 'decimal', display_order: 2, is_active: 1 },
  { field_name: 'payment_reference', field_label: 'Payment Reference', field_type: 'text', display_order: 10, is_active: 1 },
];

const cash = (over = {}) => ({
  date: '2026-08-02', payment_method: 'Cash', total_amount: 0,
  general_tithes_offering: 0, sunday_school: 0, sisterhood_san_juan: 0,
  custom_fields: {}, ...over,
});

const gcash = (over = {}) => cash({ payment_method: 'GCash', ...over });

describe('buildSummary — category lines', () => {
  test('sums a field across every record for the date', () => {
    const records = [
      cash({ general_tithes_offering: 18000, total_amount: 18000 }),
      cash({ general_tithes_offering: 100, total_amount: 100 }),
    ];
    const summary = buildSummary(records, FIELD_DEFS, '2026-08-02');
    expect(summary.lines).toEqual([{ label: 'Tithes & Offering', amount: 18100 }]);
  });

  test('ignores records from other dates', () => {
    const records = [
      cash({ general_tithes_offering: 18100, total_amount: 18100 }),
      cash({ date: '2026-08-09', general_tithes_offering: 999, total_amount: 999 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 18100 }]);
  });

  test('omits fields that sum to zero', () => {
    const records = [cash({ general_tithes_offering: 18100, total_amount: 18100 })];
    const labels = buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label);
    expect(labels).not.toContain('Sunday School');
  });

  test('orders lines by display_order, not definition order', () => {
    const records = [cash({
      general_tithes_offering: 18100, sisterhood_san_juan: 350, sunday_school: 166,
      total_amount: 18616,
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label))
      .toEqual(['Tithes & Offering', 'Sisterhood San Juan', 'Sunday School']);
  });

  test('prefers the column over the nested custom field value', () => {
    // Desktop-created records write the column but no custom_field_values row.
    const records = [cash({
      general_tithes_offering: 3000, total_amount: 3000,
      custom_fields: { general_tithes_offering: 0 },
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 3000 }]);
  });

  test('falls back to the nested value when there is no column', () => {
    const defs = [...FIELD_DEFS, {
      field_name: 'building_fund', field_label: 'Building Fund',
      field_type: 'decimal', display_order: 9, is_active: 1,
    }];
    const records = [cash({ total_amount: 500, custom_fields: { building_fund: 500 } })];
    expect(buildSummary(records, defs, '2026-08-02').lines)
      .toEqual([{ label: 'Building Fund', amount: 500 }]);
  });

  test('ignores non-decimal field definitions', () => {
    const records = [cash({
      general_tithes_offering: 100, total_amount: 100,
      custom_fields: { payment_reference: 'REF-123' },
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 100 }]);
  });
});

describe('buildSummary — the Gcash line', () => {
  test('a GCash record reports on the Gcash line, not its category', () => {
    const records = [
      cash({ general_tithes_offering: 18100, total_amount: 18100 }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines).toEqual([
      { label: 'Tithes & Offering', amount: 18100 },
      { label: 'Gcash', amount: 2000 },
    ]);
  });

  test('the Gcash line is last, after every category', () => {
    const records = [
      cash({ general_tithes_offering: 18100, sunday_school: 166, total_amount: 18266 }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label))
      .toEqual(['Tithes & Offering', 'Sunday School', 'Gcash']);
  });

  test('several GCash records sum into one line', () => {
    const records = [
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
      gcash({ general_tithes_offering: 500, total_amount: 500 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 2500 }]);
  });

  test('a legacy GCash record with mixed categories reports its whole amount', () => {
    const records = [gcash({
      general_tithes_offering: 2000, sunday_school: 100, total_amount: 2100,
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 2100 }]);
  });

  test('a GCash record with no breakdown falls back to total_amount', () => {
    const records = [gcash({ total_amount: 1500 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 1500 }]);
  });

  test('matches the payment method case-insensitively', () => {
    const records = [gcash({ payment_method: ' gcash ', general_tithes_offering: 2000, total_amount: 2000 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 2000 }]);
  });

  test('omits the Gcash line when no GCash money came in', () => {
    const records = [cash({ general_tithes_offering: 18100, total_amount: 18100 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label))
      .not.toContain('Gcash');
  });

  test('a stored gcash field value is ignored, even if the field is still active', () => {
    // Legacy Cash records carry gcash values; the field is retired, so the
    // money must not appear as a category line or a second Gcash line.
    const defs = [...FIELD_DEFS, {
      field_name: 'gcash', field_label: 'GCash',
      field_type: 'decimal', display_order: 9, is_active: 1,
    }];
    const records = [cash({
      general_tithes_offering: 3000, total_amount: 5000,
      custom_fields: { gcash: 2000 },
    })];
    expect(buildSummary(records, defs, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 3000 }]);
  });
});
