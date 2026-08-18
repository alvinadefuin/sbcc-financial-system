const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { notDeleted } = require('../../api/_lib/softDelete');
const { logActivity, diffFields, asDateString, ACTIONS, EXPENSE_FIELDS } = require('../../api/_lib/activityLog');
const { authenticateToken, requireRole, checkRole, JWT_SECRET } = require("../middleware/auth");
const {
  AMOUNT_COLUMNS,
  resolveExpenseLines,
  amountColumnValues,
} = require('../../api/_lib/expenseTaxonomy');

// Auth middleware
// Adding a record is the collector's whole job and the phone is the only
// channel for it, so creating stays open to `user`. Editing and deleting are
// desktop-only corrections and remain restricted.
const canCreate = checkRole(['user', 'admin', 'super_admin']);
const canMutate = checkRole(['admin', 'super_admin']);

// Get all expenses
router.get("/", authenticateToken, (req, res) => {
  const { month, year, dateFrom, dateTo } = req.query;
  let query = "SELECT * FROM expenses";
  let params = [];
  let whereConditions = [];

  // Date range filtering (priority over month/year)
  if (dateFrom && dateTo) {
    whereConditions.push("date BETWEEN ? AND ?");
    params.push(dateFrom, dateTo);
  } else if (month && year) {
    whereConditions.push('strftime("%Y-%m", date) = ?');
    params.push(`${year}-${month.padStart(2, "0")}`);
  }

  whereConditions.push(notDeleted());

  if (whereConditions.length > 0) {
    query += " WHERE " + whereConditions.join(" AND ");
  }

  query += " ORDER BY date DESC";

  req.db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add new expense
//
// An expense is one line item. A body carrying several amounts is one voucher
// covering several lines, so it becomes one row per amount — all sharing the
// voucher's date, particular, forms number and cheque number, the way the
// church's own ledger records a cheque that pays for several things.
router.post("/", authenticateToken, canCreate, async (req, res) => {
  const { date, particular, forms_number, cheque_number, budget_amount, percentage_allocation } = req.body;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
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

  const findDuplicate = (amount) => new Promise((resolve, reject) => {
    req.db.get(
      `SELECT id, created_by, date FROM expenses WHERE date = ? AND total_amount = ? AND ${notDeleted()}`,
      [date, amount],
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });

  if (!req.body.force) {
    for (const line of lines) {
      const dup = await findDuplicate(line.amount);
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

    await req.db.withTransaction(async (tx) => {
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
          summary: `Created expense ${asDateString(date)} for ${Number(line.amount || 0).toFixed(2)}`,
        });
      }
    });

    res.json({ id: ids[0], ids, message: "Expense added successfully" });
  } catch (err) {
    console.error("Database error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Get expense by ID
router.get("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  req.db.get(`SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Expense not found" });
    }
    res.json(row);
  });
});

// Update expense
//
// One row is one line item, so an edit resolves exactly like a create but never
// fans out: a voucher line cannot become two lines by being edited. Add the
// second line as its own record instead.
router.put("/:id", authenticateToken, canMutate, async (req, res) => {
  const { id } = req.params;
  const { date, particular, forms_number, cheque_number } = req.body;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
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

  const before = await new Promise((resolve, reject) => {
    req.db.get(
      `SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`,
      [id],
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });
  if (!before) {
    return res.status(404).json({ error: "Expense not found" });
  }

  const updateSql = `UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?,
      category = ?, subcategory = ?, fund_source = ?, total_amount = ?,
      ${AMOUNT_COLUMNS.map((column) => `${column} = ?`).join(', ')},
      updated_at = now(), updated_by = ?
    WHERE id = ? AND ${notDeleted()}`;

  try {
    const changes = diffFields(before, {
      ...req.body,
      category: line.category,
      subcategory: line.subcategory,
      fund_source: line.fundSource,
      total_amount: line.amount,
      ...amounts,
    }, EXPENSE_FIELDS);

    await req.db.withTransaction(async (tx) => {
      const result = await tx.run(updateSql, [
        date, particular || 'Expense Entry', forms_number, cheque_number,
        line.category, line.subcategory, line.fundSource, line.amount,
        ...AMOUNT_COLUMNS.map((column) => amounts[column]),
        req.user.email, id,
      ]);

      if (result.changes === 0) {
        const notFound = new Error("Expense not found");
        notFound.notFound = true;
        throw notFound;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_UPDATE,
        entityType: 'expense',
        entityId: parseInt(id, 10),
        summary: `Updated expense ${asDateString(date)} for ${Number(line.amount || 0).toFixed(2)}`,
        changes,
      });
    });

    res.json({ message: "Expense updated successfully" });
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: "Expense not found" });
    }
    console.error("Database error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Soft delete: the row is preserved.
router.delete("/:id", authenticateToken, canMutate, (req, res) => {
  const { id } = req.params;

  req.db.get(
    `SELECT id, date, total_amount FROM expenses WHERE id = ? AND ${notDeleted()}`,
    [id],
    async (err, before) => {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (!before) {
        return res.status(404).json({ error: "Expense not found" });
      }

      try {
        await req.db.withTransaction(async (tx) => {
          const result = await tx.run(
            `UPDATE expenses SET deleted_at = now(), deleted_by = ? WHERE id = ? AND ${notDeleted()}`,
            [req.user.email, id]
          );
          if (result.changes === 0) {
            const notFound = new Error("Expense not found");
            notFound.notFound = true;
            throw notFound;
          }

          await logActivity(tx, {
            actor: req.user,
            action: ACTIONS.RECORD_DELETE,
            entityType: 'expense',
            entityId: parseInt(id, 10),
            summary: `Deleted expense ${asDateString(before.date)} for ${Number(before.total_amount || 0).toFixed(2)}`,
          });
        });

        res.json({ message: "Expense deleted successfully" });
      } catch (txErr) {
        if (txErr.notFound) {
          return res.status(404).json({ error: "Expense not found" });
        }
        console.error("Database error:", txErr.message);
        res.status(500).json({ error: txErr.message });
      }
    }
  );
});

module.exports = router;
