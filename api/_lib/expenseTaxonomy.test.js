const fs = require('fs');
const path = require('path');
const {
  FUNDS,
  AMOUNT_COLUMNS,
  resolveAmountKey,
  normalizeSubcategory,
  resolveExpenseTarget,
  resolveExpenseLines,
} = require('./expenseTaxonomy');

// The eleven values MobileSubmitForm.js:5 offers as `category`. Ten are amount
// column keys; `workers_share` is not a column at all and needs the alias.
const MOBILE_LEGACY_CATEGORIES = [
  'workers_share', 'supplies', 'utilities', 'building_maintenance',
  'vehicle_maintenance', 'transportation_gas', 'honorarium',
  'fellowship_events', 'abccop_national', 'cbcc_share', 'kabalikat_share',
];

describe('the taxonomy itself', () => {
  test('three funds, each with its fund_source', () => {
    expect(FUNDS.map((f) => [f.category, f.fundSource])).toEqual([
      ['PBCM Share/PDOT', 'pbcm_share'],
      ['Pastoral Team', 'pastoral_team'],
      ['Operational Fund', 'operational'],
    ]);
  });

  test('no subcategory label appears under two funds', () => {
    const labels = FUNDS.flatMap((f) => f.subcategories.map((s) => s.label.toLowerCase()));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('the seven ministries have no column', () => {
    const pastoral = FUNDS.find((f) => f.category === 'Pastoral Team');
    expect(pastoral.subcategories).toHaveLength(7);
    expect(pastoral.subcategories.every((s) => s.column === null)).toBe(true);
  });

  test('AMOUNT_COLUMNS is the 17 real amount columns', () => {
    expect(AMOUNT_COLUMNS).toHaveLength(17);
    expect(AMOUNT_COLUMNS[0]).toBe('pbcm_share_expense');
  });

  // This is the assertion that would have caught the PUT bug in the first place.
  test('every amount column exists in both schema files', () => {
    const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
    const sqlite = read('../../backend/config/database.js');
    const postgres = read('../../backend/config/database-pg.js');
    for (const col of AMOUNT_COLUMNS) {
      expect(sqlite).toContain(`${col} DECIMAL`);
      expect(postgres).toContain(`${col} DECIMAL`);
    }
  });
});

describe('resolving one value', () => {
  test('an amount column key resolves to its fund and label', () => {
    expect(resolveAmountKey('utilities')).toEqual({
      category: 'Operational Fund',
      subcategory: 'Utilities',
      fundSource: 'operational',
      column: 'utilities',
    });
  });

  test('an unknown amount key resolves to nothing', () => {
    expect(resolveAmountKey('kabisig_fund')).toBeNull();
  });

  test('normalizeSubcategory accepts a canonical label, any case', () => {
    expect(normalizeSubcategory('utilities')).toBe('Utilities');
    expect(normalizeSubcategory('  Building Maintenance ')).toBe('Building Maintenance');
  });

  test('normalizeSubcategory resolves every legacy mobile category', () => {
    for (const value of MOBILE_LEGACY_CATEGORIES) {
      expect(normalizeSubcategory(value)).not.toBeNull();
    }
    expect(normalizeSubcategory('workers_share')).toBe("Pastoral & Worker Support");
  });

  test('normalizeSubcategory rejects the unknown', () => {
    expect(normalizeSubcategory('kabisig_fund')).toBeNull();
    expect(normalizeSubcategory('')).toBeNull();
    expect(normalizeSubcategory(undefined)).toBeNull();
  });

  test('a ministry resolves to the pastoral fund with no column', () => {
    expect(resolveExpenseTarget('Pastoral Team', 'Benevolence')).toEqual({
      category: 'Pastoral Team',
      subcategory: 'Benevolence',
      fundSource: 'pastoral_team',
      column: null,
    });
  });

  test('the subcategory wins; a disagreeing category is ignored', () => {
    expect(resolveExpenseTarget('Operational Fund', 'Benevolence').fundSource).toBe('pastoral_team');
  });

  test('a legacy single category value still classifies', () => {
    expect(resolveExpenseTarget('supplies', undefined).subcategory).toBe('Supplies');
  });
});

describe('resolving a request body into lines', () => {
  test('one amount makes one line', () => {
    const { lines, reason } = resolveExpenseLines({ date: '2026-08-15', utilities: 500 });
    expect(reason).toBeNull();
    expect(lines).toEqual([
      {
        category: 'Operational Fund', subcategory: 'Utilities',
        fundSource: 'operational', column: 'utilities', amount: 500,
      },
    ]);
  });

  test('several amounts make several lines', () => {
    const { lines } = resolveExpenseLines({ date: '2026-08-15', utilities: 500, supplies: 120 });
    expect(lines.map((l) => [l.subcategory, l.amount])).toEqual([
      ['Utilities', 500],
      ['Supplies', 120],
    ]);
  });

  test('zero and blank amounts are not lines', () => {
    const { lines, reason } = resolveExpenseLines({
      date: '2026-08-15', utilities: 500, supplies: 0, honorarium: '', kabisig_fund: '',
    });
    expect(lines).toHaveLength(1);
    expect(reason).toBeNull();
  });

  test('an amount on an unknown field is refused, not dropped', () => {
    const { lines, unknown, reason } = resolveExpenseLines({ date: '2026-08-15', kabisig_fund: 400 });
    expect(reason).toBe('unknown-amount-field');
    expect(unknown).toEqual(['kabisig_fund']);
    expect(lines).toEqual([]);
  });

  test('total_amount plus a category is the fallback path', () => {
    const { lines } = resolveExpenseLines({
      date: '2026-08-15', category: 'Pastoral Team', subcategory: 'Benevolence', total_amount: 2000,
    });
    expect(lines).toEqual([
      {
        category: 'Pastoral Team', subcategory: 'Benevolence',
        fundSource: 'pastoral_team', column: null, amount: 2000,
      },
    ]);
  });

  test('total_amount with no usable category is unclassified', () => {
    expect(resolveExpenseLines({ date: '2026-08-15', total_amount: 100 }).reason)
      .toBe('unclassified-category');
  });

  test('no amount at all says so', () => {
    expect(resolveExpenseLines({ date: '2026-08-15', category: 'supplies' }).reason).toBe('no-amount');
  });
});
