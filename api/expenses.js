const express = require('express');
const db = require('./_lib/database');
const { notDeleted } = require('./_lib/softDelete');
const { logActivity, diffFields, asDateString, ACTIONS, EXPENSE_FIELDS } = require('./_lib/activityLog');
const { verifyToken, checkRole } = require('./_lib/expressAuth');
const {
  AMOUNT_COLUMNS,
  resolveExpenseLines,
  amountColumnValues,
} = require('./_lib/expenseTaxonomy');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Adding a record is the collector's whole job and the phone is the only
// channel for it, so creating stays open to `user`. Editing and deleting are
// desktop-only corrections and remain restricted.
const canCreate = checkRole(['user', 'admin', 'super_admin']);
const canMutate = checkRole(['admin', 'super_admin']);

const summarise = (verb, row) =>
  `${verb} expense ${asDateString(row.date)} for ${Number(row.total_amount || 0).toFixed(2)}`;

// GET /api/expenses
app.get('/api/expenses', verifyToken, async (req, res) => {
  const { month, year, dateFrom, dateTo } = req.query;
  let query = 'SELECT * FROM expenses';
  let params = [];
  let whereConditions = [];
  let paramIndex = 1;

  if (dateFrom && dateTo) {
    whereConditions.push(`date BETWEEN $${paramIndex++} AND $${paramIndex++}`);
    params.push(dateFrom, dateTo);
  } else if (month && year) {
    whereConditions.push(`to_char(date, 'YYYY-MM') = $${paramIndex++}`);
    params.push(`${year}-${month.padStart(2, '0')}`);
  }

  whereConditions.push(notDeleted());

  if (whereConditions.length > 0) {
    query += ' WHERE ' + whereConditions.join(' AND ');
  }
  query += ' ORDER BY date DESC';

  try {
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses
//
// An expense is one line item. A body carrying several amounts is one voucher
// covering several lines, so it becomes one row per amount — all sharing the
// voucher's date, particular, forms number and cheque number, the way the
// church's own ledger records a cheque that pays for several things.
app.post('/api/expenses', verifyToken, canCreate, async (req, res) => {
  const { date, particular, forms_number, cheque_number, budget_amount, percentage_allocation } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const { lines, unknown, reason } = resolveExpenseLines(req.body);

  if (reason === 'unknown-amount-field') {
    return res.status(400).json({
      error: `Unknown expense amount field: ${unknown.join(', ')}. It is not a budget subcategory, so the amount would not be recorded anywhere.`,
    });
  }
  if (reason === 'unclassified-category') {
    return res.status(400).json({
      error: 'Category must name a budget category or subcategory',
    });
  }
  if (!lines.length) {
    return res.status(400).json({
      error: 'Either total_amount or individual expense amounts must be provided',
    });
  }

  // Duplicate detection, per line: a re-submitted voucher repeats a line's
  // amount on the same date, which is exactly what this should catch.
  if (!req.body.force) {
    for (const line of lines) {
      const dup = await db.get(
        `SELECT id, created_by, date FROM expenses WHERE date = ? AND total_amount = ? AND ${notDeleted()}`,
        [date, line.amount]
      );
      if (dup) {
        return res.status(409).json({
          error: 'Duplicate entry detected',
          conflict: {
            id: dup.id, submitted_by: dup.created_by,
            date: dup.date, total_amount: line.amount,
          },
        });
      }
    }
  }

  const insertSql = `INSERT INTO expenses (
      date, particular, forms_number, cheque_number, category, subcategory,
      total_amount, budget_amount, percentage_allocation, fund_source,
      ${AMOUNT_COLUMNS.join(', ')}, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${AMOUNT_COLUMNS.map(() => '?').join(', ')}, ?)`;

  try {
    const ids = [];

    await db.withTransaction(async (tx) => {
      for (const line of lines) {
        const amounts = amountColumnValues(line);
        const result = await tx.run(insertSql, [
          date, particular || 'Expense Entry', forms_number, cheque_number,
          line.category, line.subcategory, line.amount,
          budget_amount || 0, percentage_allocation || 0, line.fundSource,
          ...AMOUNT_COLUMNS.map((column) => amounts[column]),
          req.user.email,
        ]);
        ids.push(result.lastID);

        await logActivity(tx, {
          actor: req.user,
          action: ACTIONS.RECORD_CREATE,
          entityType: 'expense',
          entityId: result.lastID,
          summary: summarise('Created', { date, total_amount: line.amount }),
        });
      }
    });

    res.json({ id: ids[0], ids, message: 'Expense added successfully' });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expenses/:id
app.get('/api/expenses/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await db.get(
      `SELECT * FROM expenses WHERE id = $1 AND ${notDeleted()}`,
      [id]
    );
    if (!row) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id
//
// One row is one line item, so an edit resolves exactly like a create but never
// fans out: a voucher line cannot become two lines by being edited. Add the
// second line as its own record instead.
app.put('/api/expenses/:id', verifyToken, canMutate, async (req, res) => {
  const { id } = req.params;
  const { date, particular, forms_number, cheque_number } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const { lines, unknown, reason } = resolveExpenseLines(req.body);

  if (reason === 'unknown-amount-field') {
    return res.status(400).json({
      error: `Unknown expense amount field: ${unknown.join(', ')}. It is not a budget subcategory, so the amount would not be recorded anywhere.`,
    });
  }
  if (reason === 'unclassified-category') {
    return res.status(400).json({
      error: 'Category must name a budget category or subcategory',
    });
  }
  if (!lines.length) {
    return res.status(400).json({
      error: 'Either total_amount or individual expense amounts must be provided',
    });
  }
  if (lines.length > 1) {
    return res.status(400).json({
      error: 'An expense edit must address a single line item. Record the other amounts as their own entries.',
    });
  }

  const [line] = lines;
  const amounts = amountColumnValues(line);

  const before = await db.get(
    `SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`,
    [id]
  );
  if (!before) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  const updateSql = `UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?,
      category = ?, subcategory = ?, fund_source = ?, total_amount = ?,
      ${AMOUNT_COLUMNS.map((column) => `${column} = ?`).join(', ')},
      updated_at = now(), updated_by = ?
    WHERE id = ? AND ${notDeleted()}`;

  try {
    // Diff against the resolved values, not the raw body: the body says
    // `utilities: 250`, while what changed is the subcategory and two columns.
    const changes = diffFields(before, {
      ...req.body,
      category: line.category,
      subcategory: line.subcategory,
      fund_source: line.fundSource,
      total_amount: line.amount,
      ...amounts,
    }, EXPENSE_FIELDS);

    await db.withTransaction(async (tx) => {
      const result = await tx.run(updateSql, [
        date, particular || 'Expense Entry', forms_number, cheque_number,
        line.category, line.subcategory, line.fundSource, line.amount,
        ...AMOUNT_COLUMNS.map((column) => amounts[column]),
        req.user.email, id,
      ]);

      if (result.changes === 0) {
        const err = new Error('Expense not found');
        err.notFound = true;
        throw err;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_UPDATE,
        entityType: 'expense',
        entityId: parseInt(id, 10),
        summary: summarise('Updated', { date, total_amount: line.amount }),
        changes,
      });
    });

    res.json({ message: 'Expense updated successfully' });
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id — soft delete; the row is preserved.
app.delete('/api/expenses/:id', verifyToken, canMutate, async (req, res) => {
  const { id } = req.params;
  try {
    const before = await db.get(
      `SELECT id, date, total_amount FROM expenses WHERE id = $1 AND ${notDeleted()}`,
      [id]
    );
    if (!before) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        `UPDATE expenses SET deleted_at = now(), deleted_by = $1
         WHERE id = $2 AND ${notDeleted()}`,
        [req.user.email, id]
      );

      if (result.changes === 0) {
        const err = new Error('Expense not found');
        err.notFound = true;
        throw err;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_DELETE,
        entityType: 'expense',
        entityId: parseInt(id, 10),
        summary: summarise('Deleted', before),
      });
    });

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
