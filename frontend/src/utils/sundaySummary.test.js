import {
  toDateKey,
  formatDateHeading,
  collectionDatesInMonth,
  buildSummary,
  formatSummaryText,
  formatPeso,
  nextSelection,
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

  test('renders a range across two dates', () => {
    expect(formatDateHeading('2026-08-02', '2026-08-23')).toBe('AUGUST 02 - AUGUST 23, 2026');
  });

  test('an end key equal to the start renders as a single date', () => {
    expect(formatDateHeading('2026-08-02', '2026-08-02')).toBe('AUGUST 02, 2026');
  });

  test('a missing end key renders as a single date', () => {
    expect(formatDateHeading('2026-08-02', null)).toBe('AUGUST 02, 2026');
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

describe('buildSummary — total and unattributed', () => {
  test('total is the sum of the rendered lines', () => {
    const records = [
      cash({ general_tithes_offering: 18100, sunday_school: 166, total_amount: 18266 }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').total).toBe(20266);
  });

  test('total ignores a stale stored total_amount', () => {
    const records = [cash({ general_tithes_offering: 3000, total_amount: 5000 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').total).toBe(3000);
  });

  test('unattributed reports money the lines do not account for', () => {
    // Legacy record 7: total 5000 includes 2000 of retired gcash.
    const records = [cash({ general_tithes_offering: 3000, total_amount: 5000 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').unattributed).toBe(2000);
  });

  test('unattributed is negative when the stored total understates the lines', () => {
    const records = [cash({ general_tithes_offering: 3000, total_amount: 0 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').unattributed).toBe(-3000);
  });

  test('a date with no records is empty, not an error', () => {
    const summary = buildSummary([], FIELD_DEFS, '2026-08-02');
    expect(summary).toEqual({
      startKey: '2026-08-02', endKey: '2026-08-02',
      lines: [], total: 0, unattributed: 0,
    });
  });
});

describe('formatPeso', () => {
  test('groups thousands and always shows two decimals', () => {
    expect(formatPeso(18100)).toBe('18,100.00');
    expect(formatPeso(166)).toBe('166.00');
    expect(formatPeso(0)).toBe('0.00');
    expect(formatPeso(1234.5)).toBe('1,234.50');
  });
});

describe('formatSummaryText', () => {
  test('renders the exact message the treasurer pastes', () => {
    const records = [
      cash({
        general_tithes_offering: 18100, sisterhood_san_juan: 350, sunday_school: 166,
        total_amount: 18616,
      }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    const summary = buildSummary(records, FIELD_DEFS, '2026-08-02');

    expect(formatSummaryText(summary)).toBe(
      'SBCC SUNDAY COLLECTION\n' +
      'Date : AUGUST 02, 2026\n' +
      '\n' +
      'Tithes & Offering - Php 18,100.00\n' +
      '\n' +
      'Sisterhood San Juan - Php 350.00\n' +
      '\n' +
      'Sunday School - Php 166.00\n' +
      '\n' +
      'Gcash - Php 2,000.00\n' +
      '\n' +
      'Total Collection: Php 20,616.00\n' +
      '\n' +
      'Papuri po sa Panginoon sa inyong pakikiisa sa pagdalo at pagtatapat sa pagkakaloob!'
    );
  });

  test('still renders heading, total and closing when there are no lines', () => {
    const text = formatSummaryText(buildSummary([], FIELD_DEFS, '2026-08-02'));
    expect(text).toContain('SBCC SUNDAY COLLECTION');
    expect(text).toContain('Total Collection: Php 0.00');
    expect(text).toContain('Papuri po sa Panginoon');
  });
});

describe('buildSummary — date ranges', () => {
  const spread = [
    cash({ date: '2026-08-02', general_tithes_offering: 18100, total_amount: 18100 }),
    cash({ date: '2026-08-09', general_tithes_offering: 500, sunday_school: 166, total_amount: 666 }),
    cash({ date: '2026-08-16', general_tithes_offering: 300, total_amount: 300 }),
    cash({ date: '2026-08-23', general_tithes_offering: 999, total_amount: 999 }),
  ];

  test('sums a field across every date in the range', () => {
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16').lines)
      .toEqual([
        { label: 'Tithes & Offering', amount: 18900 },
        { label: 'Sunday School', amount: 166 },
      ]);
  });

  test('excludes dates past the end of the range', () => {
    const total = buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16').total;
    expect(total).toBe(19066);
  });

  test('includes records on both endpoints', () => {
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-02').total).toBe(18100);
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-23', '2026-08-23').total).toBe(999);
  });

  test('omitting the end key reports the single start date', () => {
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-09').lines)
      .toEqual([
        { label: 'Tithes & Offering', amount: 500 },
        { label: 'Sunday School', amount: 166 },
      ]);
  });

  test('reports the range it was asked for', () => {
    const summary = buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16');
    expect(summary.startKey).toBe('2026-08-02');
    expect(summary.endKey).toBe('2026-08-16');
  });

  test('a single date reports the same key at both ends', () => {
    const summary = buildSummary(spread, FIELD_DEFS, '2026-08-09');
    expect(summary.startKey).toBe('2026-08-09');
    expect(summary.endKey).toBe('2026-08-09');
  });

  test('GCash records across the range sum into one line', () => {
    const records = [
      gcash({ date: '2026-08-02', general_tithes_offering: 2000, total_amount: 2000 }),
      gcash({ date: '2026-08-09', general_tithes_offering: 500, total_amount: 500 }),
      gcash({ date: '2026-08-23', general_tithes_offering: 99, total_amount: 99 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02', '2026-08-16').lines)
      .toEqual([{ label: 'Gcash', amount: 2500 }]);
  });

  test('a range with no records is empty, not an error', () => {
    const summary = buildSummary([], FIELD_DEFS, '2026-08-02', '2026-08-16');
    expect(summary).toEqual({
      startKey: '2026-08-02', endKey: '2026-08-16',
      lines: [], total: 0, unattributed: 0,
    });
  });

  test('the message heading shows the range', () => {
    const text = formatSummaryText(buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16'));
    expect(text).toContain('Date : AUGUST 02 - AUGUST 16, 2026');
    expect(text).toContain('Total Collection: Php 19,066.00');
  });
});

describe('nextSelection', () => {
  test('the first click starts a pending selection', () => {
    expect(nextSelection(null, '2026-08-02')).toEqual({ start: '2026-08-02', end: null });
  });

  test('a later second click closes the range', () => {
    expect(nextSelection({ start: '2026-08-02', end: null }, '2026-08-23'))
      .toEqual({ start: '2026-08-02', end: '2026-08-23' });
  });

  test('an earlier second click restarts from that date', () => {
    expect(nextSelection({ start: '2026-08-23', end: null }, '2026-08-02'))
      .toEqual({ start: '2026-08-02', end: null });
  });

  test('clicking the pending start again keeps it one date', () => {
    expect(nextSelection({ start: '2026-08-02', end: null }, '2026-08-02'))
      .toEqual({ start: '2026-08-02', end: '2026-08-02' });
  });

  test('clicking after a finished range starts over', () => {
    expect(nextSelection({ start: '2026-08-02', end: '2026-08-23' }, '2026-08-09'))
      .toEqual({ start: '2026-08-09', end: null });
  });
});
