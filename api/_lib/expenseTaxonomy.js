// The single source for what an expense may be filed against.
//
// An expense row is one line item: one category, one subcategory, one amount.
// The subcategory names an amount column and the column names the subcategory,
// so a write can be classified from either end. The seven pastoral ministries
// have no column of their own — those rows carry total_amount and are found by
// fund_source instead, which is what aggregateExpenses already sums.
//
// The labels are taken from reportService rather than restated, because they
// double as the budget_categories.subcategory lookup key that the Expenses tab
// uses to find each row's budget. A shared import makes drift impossible. The
// dependency runs one way only: reportService must never require this module,
// or its two mirrored copies would need different relative paths and
// reportService.parity.test.js would fail.
const { OPERATIONAL_EXPENSE_CATEGORIES, PASTORAL_MINISTRIES } = require('./reportService');

const PBCM_SUBCATEGORY = 'PBCM Share';
const PBCM_COLUMN = 'pbcm_share_expense';

const FUNDS = [
  {
    category: 'PBCM Share/PDOT',
    fundSource: 'pbcm_share',
    subcategories: [{ label: PBCM_SUBCATEGORY, column: PBCM_COLUMN }],
  },
  {
    category: 'Pastoral Team',
    fundSource: 'pastoral_team',
    subcategories: PASTORAL_MINISTRIES.map((m) => ({ label: m.label, column: null })),
  },
  {
    category: 'Operational Fund',
    fundSource: 'operational',
    subcategories: OPERATIONAL_EXPENSE_CATEGORIES.map((c) => ({ label: c.label, column: c.key })),
  },
];

const AMOUNT_COLUMNS = [PBCM_COLUMN, ...OPERATIONAL_EXPENSE_CATEGORIES.map((c) => c.key)];

// MobileSubmitForm.js:5 offers this as a category. It matches no column and no
// budget line; the church means pastoral and worker support by it.
const LEGACY_ALIASES = { workers_share: 'Pastoral & Worker Support' };

// Everything a request body may carry that is not an amount. Any other key
// holding a positive number is treated as an amount and must resolve, so money
// is never accepted and silently discarded.
const NON_AMOUNT_KEYS = new Set([
  'id', 'date', 'particular', 'forms_number', 'cheque_number',
  'category', 'subcategory', 'fund_source', 'total_amount',
  'budget_amount', 'percentage_allocation', 'force', 'submitted_via',
]);

const byLabel = new Map();
const byColumn = new Map();
for (const fund of FUNDS) {
  for (const sub of fund.subcategories) {
    const target = {
      category: fund.category,
      subcategory: sub.label,
      fundSource: fund.fundSource,
      column: sub.column,
    };
    byLabel.set(sub.label.toLowerCase(), target);
    if (sub.column) byColumn.set(sub.column, target);
  }
}

function resolveAmountKey(key) {
  return byColumn.get(key) || null;
}

function normalizeSubcategory(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = byLabel.get(raw.toLowerCase());
  if (direct) return direct.subcategory;
  if (LEGACY_ALIASES[raw]) return LEGACY_ALIASES[raw];

  const column = byColumn.get(raw);
  return column ? column.subcategory : null;
}

// The subcategory identifies the fund on its own, since no label is shared. The
// category is only consulted when no subcategory was sent — the shape mobile
// posts, and the shape a cascade client will post before it learns the split.
function resolveExpenseTarget(category, subcategory) {
  const label = normalizeSubcategory(subcategory) || normalizeSubcategory(category);
  if (!label) return null;
  return byLabel.get(label.toLowerCase()) || null;
}

// Classifies a whole request body. Returns { lines, unknown, reason }:
//   reason === null                    -> lines holds one entry per line item
//   reason === 'unknown-amount-field'  -> unknown names the offending keys
//   reason === 'unclassified-category' -> an amount, but nothing to file it under
//   reason === 'no-amount'             -> nothing to record
function resolveExpenseLines(body) {
  const src = body || {};
  const lines = [];
  const unknown = [];

  for (const [key, raw] of Object.entries(src)) {
    if (NON_AMOUNT_KEYS.has(key)) continue;
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const target = resolveAmountKey(key);
    if (target) lines.push({ ...target, amount });
    else unknown.push(key);
  }

  if (unknown.length) return { lines: [], unknown, reason: 'unknown-amount-field' };
  if (lines.length) return { lines, unknown: [], reason: null };

  const total = parseFloat(src.total_amount);
  if (Number.isFinite(total) && total > 0) {
    const target = resolveExpenseTarget(src.category, src.subcategory);
    if (target) return { lines: [{ ...target, amount: total }], unknown: [], reason: null };
    return { lines: [], unknown: [], reason: 'unclassified-category' };
  }

  return { lines: [], unknown: [], reason: 'no-amount' };
}

// Every amount column zeroed except the line's own. Callers spread this in
// AMOUNT_COLUMNS order so the column list and the parameters cannot drift apart.
function amountColumnValues(line) {
  const values = {};
  for (const column of AMOUNT_COLUMNS) values[column] = 0;
  if (line.column) values[line.column] = line.amount;
  return values;
}

module.exports = {
  FUNDS,
  AMOUNT_COLUMNS,
  LEGACY_ALIASES,
  resolveAmountKey,
  normalizeSubcategory,
  resolveExpenseTarget,
  resolveExpenseLines,
  amountColumnValues,
};
