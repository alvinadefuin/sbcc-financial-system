const { logActivity, diffFields, asDateString, ACTIONS, COLLECTION_FIELDS } = require('./activityLog');

const runner = () => ({ run: jest.fn(async () => ({ changes: 1 })) });

describe('logActivity', () => {
  test('inserts one row carrying actor, action, entity and summary', async () => {
    const tx = runner();

    await logActivity(tx, {
      actor: { email: 'admin@sbcc.church', role: 'admin' },
      action: ACTIONS.RECORD_CREATE,
      entityType: 'collection',
      entityId: 7,
      summary: 'Created collection 2026-08-15 for 5,000.00',
    });

    expect(tx.run).toHaveBeenCalledTimes(1);
    const [sql, params] = tx.run.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO activity_log/i);
    expect(params).toEqual([
      'admin@sbcc.church',
      'admin',
      'record.create',
      'collection',
      7,
      'Created collection 2026-08-15 for 5,000.00',
      null,
    ]);
  });

  test('serialises changes to JSON', async () => {
    const tx = runner();

    await logActivity(tx, {
      actor: { email: 'a@b.c', role: 'admin' },
      action: ACTIONS.RECORD_UPDATE,
      entityType: 'expense',
      entityId: 3,
      changes: { supplies: { from: 100, to: 250 } },
    });

    const params = tx.run.mock.calls[0][1];
    expect(JSON.parse(params[6])).toEqual({ supplies: { from: 100, to: 250 } });
  });

  test('accepts a null actor, for a failed login with an unknown email', async () => {
    const tx = runner();

    await logActivity(tx, { actor: null, action: ACTIONS.LOGIN_FAILED, summary: 'nobody@example.com' });

    const params = tx.run.mock.calls[0][1];
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
  });

  test('refuses an action outside the whitelist', async () => {
    const tx = runner();

    await expect(
      logActivity(tx, { actor: null, action: 'record.frobnicate' })
    ).rejects.toThrow(/unknown activity action/i);
    expect(tx.run).not.toHaveBeenCalled();
  });
});

describe('diffFields', () => {
  test('reports only fields that actually changed', () => {
    const before = { date: '2026-08-15', particular: 'Sunday Service', total_amount: '100.00' };
    const after = { date: '2026-08-15', particular: 'Sunday Worship', total_amount: 100 };

    expect(diffFields(before, after, ['date', 'particular', 'total_amount'])).toEqual({
      particular: { from: 'Sunday Service', to: 'Sunday Worship' },
    });
  });

  test('treats a numeric string and its number as equal', () => {
    const diff = diffFields({ total_amount: '2500.00' }, { total_amount: 2500 }, ['total_amount']);
    expect(diff).toBeNull();
  });

  test('treats a Date column and its YYYY-MM-DD string as equal', () => {
    // pg returns `date` columns as local-midnight Date objects.
    const stored = new Date(2026, 7, 15);
    expect(diffFields({ date: stored }, { date: '2026-08-15' }, ['date'])).toBeNull();
  });

  test('treats null, undefined and empty string as the same absence', () => {
    expect(diffFields({ particular: null }, { particular: '' }, ['particular'])).toBeNull();
  });

  test('ignores fields the update did not supply', () => {
    const diff = diffFields({ particular: 'a', youth: '5.00' }, { particular: 'b' }, ['particular', 'youth']);
    expect(diff).toEqual({ particular: { from: 'a', to: 'b' } });
  });

  test('never records password material', () => {
    const diff = diffFields(
      { name: 'Alvin', password_hash: '$2a$old' },
      { name: 'Alvin B', password_hash: '$2a$new', password: 'hunter2' },
      ['name', 'password_hash', 'password']
    );
    expect(diff).toEqual({ name: { from: 'Alvin', to: 'Alvin B' } });
    expect(JSON.stringify(diff)).not.toMatch(/hunter2|\$2a\$/);
  });

  test('returns null rather than an empty object when nothing changed', () => {
    expect(diffFields({ a: 1 }, { a: 1 }, ['a'])).toBeNull();
  });

  test('exports the editable collection fields it diffs', () => {
    expect(COLLECTION_FIELDS).toContain('general_tithes_offering');
    expect(COLLECTION_FIELDS).not.toContain('created_by');
  });
});

describe('asDateString', () => {
  test('renders the Date object pg returns for a date column as YYYY-MM-DD', () => {
    // String(new Date(...)).slice(0, 10) gives "Sat Aug 15" — the bug this guards.
    expect(asDateString(new Date(2026, 7, 15))).toBe('2026-08-15');
  });

  test('passes a request-body date string through', () => {
    expect(asDateString('2026-08-15')).toBe('2026-08-15');
  });

  test('trims a full timestamp string to its date', () => {
    expect(asDateString('2026-08-15T04:00:00.000Z')).toBe('2026-08-15');
  });

  test('renders an absent date as empty rather than throwing', () => {
    expect(asDateString(null)).toBe('');
    expect(asDateString(undefined)).toBe('');
  });
});

describe('EXPENSE_FIELDS matches the schema', () => {
  const { AMOUNT_COLUMNS } = require('./expenseTaxonomy');
  const { EXPENSE_FIELDS } = require('./activityLog');

  test('every amount column is audited', () => {
    for (const column of AMOUNT_COLUMNS) {
      expect(EXPENSE_FIELDS).toContain(column);
    }
  });

  test('the classifying fields are audited', () => {
    expect(EXPENSE_FIELDS).toContain('category');
    expect(EXPENSE_FIELDS).toContain('subcategory');
    expect(EXPENSE_FIELDS).toContain('fund_source');
  });

  test('no audited field is absent from the schema', () => {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(
      path.join(__dirname, '../../backend/config/database-pg.js'), 'utf8'
    );
    // The schema block for expenses, so a name from another table cannot pass.
    const expenses = schema.slice(
      schema.indexOf('CREATE TABLE IF NOT EXISTS expenses'),
      schema.indexOf('CREATE TABLE IF NOT EXISTS custom_fields')
    );
    for (const field of EXPENSE_FIELDS) {
      expect(expenses).toContain(field);
    }
  });
});
