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

describe('the seed agrees with the taxonomy', () => {
  const fs = require('fs');
  const path = require('path');
  const seed = fs.readFileSync(
    path.join(__dirname, '../../backend/config/database.js'), 'utf8'
  );

  test('every operational subcategory has a seeded budget row', () => {
    const operational = FUNDS.find((f) => f.category === 'Operational Fund');
    for (const sub of operational.subcategories) {
      expect(seed).toContain(`subcategory: '${sub.label}'`);
    }
  });

  test('every ministry has a seeded budget row', () => {
    const pastoral = FUNDS.find((f) => f.category === 'Pastoral Team');
    for (const sub of pastoral.subcategories) {
      expect(seed).toContain(`subcategory: '${sub.label}'`);
    }
  });

  test('the seeded budget_categories rows are unique per plan', () => {
    const pg = fs.readFileSync(
      path.join(__dirname, '../../backend/config/database-pg.js'), 'utf8'
    );
    for (const source of [seed, pg]) {
      expect(source).toMatch(/budget_categories_plan_cat_subcat/);
    }
  });
});

// The workbook derives the target offering from the operational lines
// (BD Per Revised!E1 = (E13/4)*5, which is E13 / 0.80) and then splits it
// 10/10/80. The PBCM and pastoral seed rows must therefore be 10% of that
// derived target. They were originally seeded from the workbook's `SAMPLE`
// column — 10% of a hypothetical 95,000 — which made every pastoral budget
// 13.6% too low. These assertions are what would have caught that.
describe('the seeded budget derives from the target offering', () => {
  const fs = require('fs');
  const path = require('path');
  const { PASTORAL_MINISTRIES } = require('./reportService');

  const seed = fs.readFileSync(
    path.join(__dirname, '../../backend/config/database.js'), 'utf8'
  );

  // Pull `{ category, subcategory, ..., amount }` straight out of the seed array.
  const seeded = {};
  const rowRe = /\{ category: '([^']+)', subcategory: '([^']+)', percentage: [^,]+, amount: ([\d.]+) \}/g;
  for (let m; (m = rowRe.exec(seed)); ) {
    seeded[`${m[1]}|${m[2]}`] = parseFloat(m[3]);
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const OPERATIONAL_SHARE = 0.8;

  const operationalTotal = () =>
    Object.entries(seeded)
      .filter(([k]) => k.startsWith('Operational Fund|'))
      .reduce((sum, [, v]) => sum + v, 0);

  test('the seed parsed', () => {
    expect(Object.keys(seeded).length).toBe(25);
  });

  test('the operational lines still total the workbook figure', () => {
    // 87,933.34 rather than the workbook's 87,933.3333: three lines are stored
    // to the centavo. The difference rounds away in the target.
    expect(round2(operationalTotal())).toBe(87933.34);
  });

  test('PBCM Share is 10% of the derived target, not of the 95,000 sample', () => {
    const target = operationalTotal() / OPERATIONAL_SHARE;
    expect(seeded['PBCM Share/PDOT|PBCM Share']).toBe(round2(target * 0.10));
    expect(seeded['PBCM Share/PDOT|PBCM Share']).not.toBe(9500.00);
  });

  test('the Pastoral Team parent is 10% of the derived target', () => {
    const target = operationalTotal() / OPERATIONAL_SHARE;
    expect(seeded['Pastoral Team|Pastoral Team']).toBe(round2(target * 0.10));
  });

  test('the seven ministries sum to the pastoral parent exactly', () => {
    const parent = seeded['Pastoral Team|Pastoral Team'];
    const children = PASTORAL_MINISTRIES.map((m) => seeded[`Pastoral Team|${m.label}`]);
    expect(children.every((c) => typeof c === 'number')).toBe(true);
    expect(round2(children.reduce((a, b) => a + b, 0))).toBe(parent);
  });

  test('each ministry is its own share of the parent, to the centavo', () => {
    const parent = seeded['Pastoral Team|Pastoral Team'];
    for (const m of PASTORAL_MINISTRIES) {
      // One line absorbs the rounding residual so the children still sum to the
      // parent, so allow a centavo of slack here but nowhere else.
      expect(Math.abs(seeded[`Pastoral Team|${m.label}`] - parent * m.pct)).toBeLessThanOrEqual(0.01);
    }
  });
});
