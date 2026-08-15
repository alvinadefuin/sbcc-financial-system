const fs = require('fs');
const path = require('path');

// These four files each read collections/expenses for a financial surface. A
// missed filter here puts deleted money back into a report, so assert on the
// source directly: every SELECT touching either table must carry the predicate.
const FILES = ['reports.js', 'budget.js', 'webhooks.js', 'forms.js'];

// The predicate reaches the SQL through `${notDeleted()}`, so the literal
// `deleted_at IS NULL` is not what appears in the source. Accept either form —
// softDelete.test.js already proves what notDeleted() expands to.
const FILTERED = /deleted_at IS NULL|notDeleted\(/i;

// budget.js reaches expenses only through a LEFT JOIN, never a FROM.
const TOUCHES_RECORDS = /(?:FROM|JOIN)\s+(collections|expenses)\b/i;

const readSource = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe.each(FILES)('%s read surfaces', (file) => {
  test('every collections/expenses SELECT filters soft-deleted rows', () => {
    const source = readSource(file);

    // Split on statement boundaries so each SELECT is checked on its own.
    const selects = source
      .split(/db\.(?:get|all)\(/)
      .slice(1)
      .filter((chunk) => TOUCHES_RECORDS.test(chunk));

    expect(selects.length).toBeGreaterThan(0);

    for (const stmt of selects) {
      const head = stmt.slice(0, stmt.indexOf('`', stmt.indexOf('`') + 1) + 1);
      expect(head).toMatch(FILTERED);
    }
  });
});

describe('budget comparison', () => {
  test('places the filter in the LEFT JOIN ON clause, not the WHERE', () => {
    const source = readSource('budget.js');
    const joins = source.match(/LEFT JOIN expenses e ON[\s\S]*?(?=\n\s*(?:WHERE|GROUP|ORDER|`))/gi) || [];

    expect(joins.length).toBe(2);
    for (const join of joins) {
      expect(join).toMatch(/e\.deleted_at IS NULL|notDeleted\('e'\)/i);
    }
  });
});
